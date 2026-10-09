/// <reference types="node" />
import { act, renderHook } from '@testing-library/react-native';
import {
  habitTime,
  moreNights,
  nextDate,
  sleepTimes,
  useSaveOperation,
  validDate,
} from './state';
import {
  durationMinutes,
  dataExporter,
  type ExportEntry,
  type Night,
  type SleepRecord,
} from '@sleeby/domain';
import { SleebyRepository } from '@sleeby/data';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';

jest.mock('expo-router', () => ({ useNavigation: jest.fn() }));

it('reopens synthetic sleep edits and explicit choices with their original history and export values', async () => {
  // Jest does not list the newer SQLite built-in; Node loads the native test driver.
  const { DatabaseSync } = createRequire(__filename)(
    'node:sqlite',
  ) as typeof import('node:sqlite');
  const folder = mkdtempSync(join(tmpdir(), 'sleeby-step3-'));
  let database: InstanceType<typeof DatabaseSync> | undefined;
  try {
    const path = join(folder, 'synthetic.db');
    database = new DatabaseSync(path);
    for (const file of [
      '0000_overrated_cargill.sql',
      '0001_immutable_history.sql',
      '0002_manual_tracking.sql',
    ]) {
      database.exec(
        readFileSync(
          resolve(__dirname, '../../../../packages/data/migrations', file),
          'utf8',
        ),
      );
    }
    let repo = new SleebyRepository(database);
    const timestamp = {
      utc: '2026-10-08T16:00:00.000Z',
      reference: { kind: 'iana', zone: 'Asia/Jakarta' },
    } as const;
    const keyAssignment = { key: '2026-10-08', boundaryMinutes: 240 };
    repo.saveTrackingSettings(
      {
        id: 'settings',
        timestamp,
        target: null,
        dayBoundaryMinutes: 240,
        privacyNoteAcknowledged: true,
        strongerContrast: false,
      },
      null,
    );
    repo.saveManualHabit(
      {
        id: 'habit',
        timestamp,
        keyAssignment,
        monitoring: 'tracked',
        caffeineFree: false,
        movementCompleted: false,
        morningSunlightMinutes: 0,
      },
      null,
    );
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
      payload: { stages: [] },
      rawPayload: null,
    });
    const night = (
      id: string,
      sessionIds: readonly string[],
      primarySessionId: string | null,
    ): Night => ({
      id,
      keyAssignment,
      target: null,
      sessionIds,
      primarySessionId,
    });
    const original = night('original', ['first'], null);
    repo.saveManualSleep(sleep('first'), original, null);
    repo.saveMainSleepChoice(night('chosen', ['first'], 'first'), 'original');
    repo.saveManualSleep(
      sleep('second'),
      night('added', ['first', 'second'], 'first'),
      'chosen',
    );
    repo.saveTrackingSettings(
      {
        id: 'settings-next',
        timestamp,
        target: { bedtimeMinutes: 1387, wakeMinutes: 427 },
        dayBoundaryMinutes: 360,
        privacyNoteAcknowledged: true,
        strongerContrast: true,
      },
      'settings',
    );
    // Closing the question has no storage operation, including after a restart.
    database.close();
    database = new DatabaseSync(path);
    repo = new SleebyRepository(database);
    expect(
      repo.readCurrentNight(keyAssignment.key)?.value.primarySessionId,
    ).toBe('first');
    expect(repo.readCurrentTrackingSettings()?.value).toMatchObject({
      target: { bedtimeMinutes: 1387, wakeMinutes: 427 },
      dayBoundaryMinutes: 360,
      strongerContrast: true,
    });
    expect(repo.readCurrentNight(keyAssignment.key)?.value).toMatchObject({
      target: null,
      keyAssignment,
    });
    expect(repo.readCurrentHabit(keyAssignment.key)?.value).toMatchObject({
      caffeineFree: false,
      movementCompleted: false,
      morningSunlightMinutes: 0,
    });
    expect(repo.readCurrentHabit(keyAssignment.key)?.value).not.toHaveProperty(
      'screenFreeMinutes',
    );
    const edited = night('edited', ['edited-first', 'second'], 'edited-first');
    repo.saveManualSleep(sleep('edited-first'), edited, 'added', 'first');
    repo.saveMainSleepChoice(
      night('changed', edited.sessionIds, 'second'),
      'edited',
    );
    database.close();
    database = new DatabaseSync(path);
    repo = new SleebyRepository(database);
    const history = repo.readNightHistoryPage(keyAssignment.key, 10).revisions;
    expect(history[0]?.supersedesId).toBe('edited');
    expect(history.at(-1)?.value).toEqual(original);
    expect(repo.readSleepByIds(['first'])).toEqual([sleep('first')]);
    const entries: ExportEntry[] = [
      ...repo
        .readSleepByIds(['first', 'second', 'edited-first'])
        .map((value) => ({ kind: 'record' as const, value })),
      ...history.flatMap(({ value, supersedesId }) => [
        { kind: 'night' as const, value },
        {
          kind: 'revision' as const,
          value: { entity: 'night' as const, id: value.id, supersedesId },
        },
      ]),
    ];
    let json = '';
    for await (const chunk of dataExporter.json(entries, { mode: 'raw' }))
      json += chunk;
    expect(JSON.parse(json).entries).toEqual(
      expect.arrayContaining([
        { kind: 'record', value: sleep('first') },
        { kind: 'night', value: original },
        {
          kind: 'revision',
          value: { entity: 'night', id: 'changed', supersedesId: 'edited' },
        },
      ]),
    );
  } finally {
    database?.close();
    rmSync(folder, { recursive: true, force: true });
  }
});

it('shows the next wake date and calculates elapsed UTC minutes', () => {
  const times = sleepTimes('2026-10-08', 1380, 420, 'Asia/Jakarta');
  expect(times.endDate).toBe('2026-10-09');
  expect(
    durationMinutes(
      times.start.candidates[0]!.utc,
      times.end.candidates[0]!.utc,
    ),
  ).toBe(480);
  expect(sleepTimes('2026-10-08', 420, 420, 'Asia/Jakarta').equalClocks).toBe(
    true,
  );
});

it('keeps a late habit time inside the selected day under its saved boundary', () => {
  const value = habitTime(
    { key: '2026-10-08', boundaryMinutes: 240 },
    30,
    'Asia/Jakarta',
  );
  expect(value.date).toBe('2026-10-09');
  expect(value.candidates[0]?.utc).toBe('2026-10-08T17:30:00.000Z');
  expect(nextDate('2026-12-31')).toBe('2027-01-01');
  expect(validDate('2026-02-30')).toBe(false);
});

it('uses the same operation on a failed-write retry and on double taps', async () => {
  const write = jest.fn().mockImplementationOnce(() => {
    throw new Error('synthetic');
  });
  const read = jest.fn();
  const build = jest.fn(() => ({ id: 'fixed-attempt' }));
  const hook = await renderHook(() => useSaveOperation(write, read));
  await act(async () => {
    hook.result.current.save(build);
  });
  expect(hook.result.current.status).toBe('write-failed');
  await act(async () => {
    hook.result.current.save(build);
    hook.result.current.save(build);
  });
  expect(build).toHaveBeenCalledTimes(1);
  expect(write).toHaveBeenCalledTimes(2);
  expect(write.mock.calls[0]?.[0]).toBe(write.mock.calls[1]?.[0]);
  expect(hook.result.current.status).toBe('saved');
});

it('retries only the read after commit and keeps a stale conflict closed', async () => {
  const write = jest.fn();
  const read = jest.fn().mockImplementationOnce(() => {
    throw new Error('synthetic-read');
  });
  const hook = await renderHook(() => useSaveOperation(write, read));
  await act(async () => {
    hook.result.current.save(() => 'original');
  });
  expect(hook.result.current.status).toBe('read-failed');
  await act(async () => {
    hook.result.current.change();
    hook.result.current.save(() => 'different');
  });
  expect(write).toHaveBeenCalledTimes(1);
  expect(hook.result.current.status).toBe('saved');
  const conflict = jest.fn(() => {
    throw new RangeError('stale-entry');
  });
  const stale = await renderHook(() => useSaveOperation(conflict, read));
  await act(async () => {
    stale.result.current.save(() => 'old');
  });
  expect(stale.result.current.status).toBe('conflict');
  await act(async () => {
    stale.result.current.save(() => 'new');
  });
  expect(conflict).toHaveBeenCalledTimes(1);
});

it('loads Nights only in bounded cursor pages and keeps the prior page when a read fails', () => {
  const cursor = { key: '2026-10-08', id: 'night-30' };
  const page = { nights: [] as Night[], nextCursor: cursor };
  const readNightPage = jest.fn(() => ({ nights: [], nextCursor: null }));
  const repository = { readNightPage } as unknown as SleebyRepository;
  expect(moreNights(repository, page)).toEqual({
    nights: [],
    nextCursor: null,
  });
  expect(readNightPage).toHaveBeenCalledWith(30, cursor);
  readNightPage.mockImplementation(() => {
    throw new Error('synthetic-read-failure');
  });
  expect(() => moreNights(repository, page)).toThrow();
  expect(page.nextCursor).toBe(cursor);
  expect(moreNights(repository, { nights: [], nextCursor: null })).toEqual({
    nights: [],
    nextCursor: null,
  });
});
