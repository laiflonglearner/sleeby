import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import { afterEach, describe, expect, it } from 'vitest';
import type {
  HabitEntry,
  Night,
  SleepRecord,
  TrackingSettings,
} from '@sleeby/domain';
import { SleebyRepository, type SQLiteDatabase } from '../src/index.js';

const timestamp = {
  utc: '2026-10-08T16:00:00.000Z',
  reference: { kind: 'iana', zone: 'Asia/Jakarta' },
} as const;
const keyAssignment = { key: '2026-10-08', boundaryMinutes: 240 };
const settings: TrackingSettings = {
  id: 'preferences-a',
  timestamp,
  target: null,
  dayBoundaryMinutes: 240,
  privacyNoteAcknowledged: true,
  strongerContrast: false,
};
const habit: HabitEntry = {
  id: 'habit-z',
  timestamp,
  keyAssignment,
  monitoring: 'tracked',
  lastMeal: { ...timestamp, utc: '2026-10-08T13:00:00.000Z' },
};
const sleep = (id: string): SleepRecord => ({
  id,
  type: 'sleepSession',
  source: 'manual',
  origin: 'org.sleeby.app',
  device: null,
  recordingMethod: 'manual',
  externalId: null,
  lastModifiedUtc: timestamp.utc,
  start: timestamp,
  end: { ...timestamp, utc: '2026-10-09T00:00:00.000Z' },
  keyAssignment,
  rawPayload: null,
  payload: { stages: [] },
});
const night = (
  id: string,
  sessionIds: readonly string[],
  primarySessionId: string | null = null,
): Night => ({ id, keyAssignment, target: null, sessionIds, primarySessionId });
const opened: DatabaseSync[] = [];
function database(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  opened.push(db);
  for (const migration of readMigrationFiles({
    migrationsFolder: fileURLToPath(new URL('../migrations', import.meta.url)),
  }))
    db.exec(migration.sql.join('\n'));
  return db;
}
afterEach(() => {
  for (const db of opened.splice(0)) db.close();
});

describe('manual transaction boundaries', () => {
  it('blocks health saves until an explicit day start exists', () => {
    const repo = new SleebyRepository(database());
    expect(() => repo.saveManualHabit(habit, null)).toThrow(
      'day-start-not-confirmed',
    );
    expect(() =>
      repo.saveManualSleep(sleep('s'), night('n', ['s']), null),
    ).toThrow('day-start-not-confirmed');
    expect(repo.readCurrentHabit(keyAssignment.key)).toBeNull();
  });
  it('uses ancestry rather than time or ID and keeps exact retries valid after later edits', () => {
    const repo = new SleebyRepository(database());
    repo.saveTrackingSettings(settings, null);
    repo.saveManualHabit(habit, null);
    const edit = {
      ...habit,
      id: 'habit-a',
      timestamp: { ...timestamp, utc: '2026-10-07T16:00:00.000Z' },
      screenFreeMinutes: 0,
      movementCompleted: false,
    };
    repo.saveManualHabit(edit, habit.id);
    repo.saveManualHabit(habit, null);
    expect(repo.readCurrentHabit(keyAssignment.key)?.value).toEqual(edit);
    expect(repo.readHabits(keyAssignment.key)).toHaveLength(2);
    expect(() =>
      repo.saveManualHabit({ ...edit, id: 'stale' }, habit.id),
    ).toThrow('stale-entry');
    expect(() =>
      repo.saveManualHabit({ ...edit, screenFreeMinutes: 1 }, habit.id),
    ).toThrow('conflicting-entry-id');
    expect(() =>
      repo.saveManualHabit(
        { ...edit, id: 'bad', caffeineFree: true, lastCaffeine: timestamp },
        edit.id,
      ),
    ).toThrow('conflicting-caffeine');
    expect(() =>
      repo.saveManualHabit(
        { ...edit, id: 'bad', screenFreeMinutes: -1 },
        edit.id,
      ),
    ).toThrow('invalid-minutes');
    expect(() =>
      repo.saveManualHabit(
        {
          ...edit,
          id: 'bad',
          lastMeal: { ...timestamp, utc: '2026-10-09T13:00:00.000Z' },
        },
        edit.id,
      ),
    ).toThrow('time-outside-day');
  });
  it('keeps old sleep, explicit main choice and historical target after an interval edit', () => {
    const repo = new SleebyRepository(database());
    repo.saveTrackingSettings(settings, null);
    repo.saveManualSleep(sleep('s1'), night('n-z', ['s1'], 's1'), null);
    repo.saveManualSleep(sleep('s2'), night('n-b', ['s1', 's2'], 's1'), 'n-z');
    repo.saveManualSleep(
      sleep('s3'),
      night('n-a', ['s3', 's2'], 's3'),
      'n-b',
      's1',
    );
    repo.saveManualSleep(
      sleep('s3'),
      night('n-a', ['s3', 's2'], 's3'),
      'n-b',
      's1',
    );
    repo.saveTrackingSettings(
      {
        ...settings,
        id: 'preferences-b',
        dayBoundaryMinutes: 360,
        target: { bedtimeMinutes: 1320, wakeMinutes: 360 },
      },
      settings.id,
    );
    expect(repo.readCurrentNight(keyAssignment.key)?.value).toEqual(
      night('n-a', ['s3', 's2'], 's3'),
    );
    expect(repo.readSleepByIds(['s1', 's2', 's3'])).toEqual(
      ['s1', 's2', 's3'].map(sleep),
    );
    const first = repo.readNightHistoryPage(keyAssignment.key, 2);
    expect(first.revisions.map((row) => row.value.id)).toEqual(['n-a', 'n-b']);
    expect(
      repo
        .readNightHistoryPage(keyAssignment.key, 2, first.nextCursor!)
        .revisions.map((row) => row.value.id),
    ).toEqual(['n-z']);
    expect(() =>
      repo.saveMainSleepChoice(night('invalid', ['s3', 's2'], 's1'), 'n-a'),
    ).toThrow('invalid-main-sleep');
    repo.saveMainSleepChoice(night('choice', ['s3', 's2'], 's2'), 'n-a');
    expect(
      repo.readCurrentNight(keyAssignment.key)?.value.primarySessionId,
    ).toBe('s2');
  });
  it('keeps an unanswered main choice null across saves and rejects changed membership', () => {
    const repo = new SleebyRepository(database());
    repo.saveTrackingSettings(settings, null);
    repo.saveManualSleep(sleep('s1'), night('n1', ['s1']), null);
    repo.saveManualSleep(sleep('s2'), night('n2', ['s1', 's2']), 'n1');
    expect(
      repo.readCurrentNight(keyAssignment.key)?.value.primarySessionId,
    ).toBeNull();
    expect(() =>
      repo.saveMainSleepChoice(night('bad', ['s2'], 's2'), 'n2'),
    ).toThrow('changed-sleep-membership');
  });
  it('rolls back the interval when appending its night fails', () => {
    const db = database();
    let failNight = false;
    const port: SQLiteDatabase = {
      exec: (sql) => db.exec(sql),
      prepare: (sql) => {
        const statement = db.prepare(sql);
        return {
          get: (...args) => statement.get(...args),
          all: (...args) => statement.all(...args),
          run: (...args) => {
            if (failNight && sql.startsWith('INSERT INTO nights'))
              throw new Error('synthetic-write-failure');
            return statement.run(...args);
          },
        };
      },
    };
    const repo = new SleebyRepository(port);
    repo.saveTrackingSettings(settings, null);
    failNight = true;
    expect(() =>
      repo.saveManualSleep(sleep('s1'), night('n1', ['s1']), null),
    ).toThrow('synthetic-write-failure');
    expect(repo.readRawPage(10).records).toHaveLength(0);
    expect(repo.readCurrentNight(keyAssignment.key)).toBeNull();
    failNight = false;
    repo.saveManualSleep(sleep('s1'), night('n1', ['s1']), null);
    expect(repo.readRawPage(10).records).toHaveLength(1);
  });
  it('rejects multiple heads instead of picking a timestamp winner', () => {
    const repo = new SleebyRepository(database());
    repo.appendHabit(habit);
    repo.appendHabit({ ...habit, id: 'other-head' });
    expect(() => repo.readCurrentHabit(keyAssignment.key)).toThrow(
      'conflicting-entry-heads',
    );
    repo.appendNight(night('n1', []));
    repo.appendNight(night('n2', []));
    expect(() => repo.readNightPage()).toThrow('conflicting-entry-heads');
  });
  it('pages equal-key-free night heads without skips', () => {
    const repo = new SleebyRepository(database());
    for (let day = 1; day <= 31; day++)
      repo.appendNight({
        ...night(`night-${day}`, []),
        keyAssignment: {
          key: `2026-10-${String(day).padStart(2, '0')}`,
          boundaryMinutes: 240,
        },
      });
    const page = repo.readNightPage();
    expect(page.nights).toHaveLength(30);
    expect(
      repo.readNightPage(30, page.nextCursor!).nights.map((value) => value.id),
    ).toEqual(['night-1']);
  });
});
