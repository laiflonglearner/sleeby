import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import { expect, it } from 'vitest';
import type { SleepRecord } from '@sleeby/domain';
import {
  DEXIE_SCHEMA_VERSION,
  DEXIE_STORES,
  STORAGE_CONTRACT,
  SleebyRepository,
} from '../src/index.js';

it('opens a disposable 0001 database with unchanged history after 0002 and restart', () => {
  const folder = mkdtempSync(join(tmpdir(), 'sleeby-synthetic-'));
  let db: DatabaseSync | undefined;
  try {
    const path = join(folder, 'synthetic.db');
    db = new DatabaseSync(path);
    const migrations = readMigrationFiles({
      migrationsFolder: fileURLToPath(
        new URL('../migrations', import.meta.url),
      ),
    });
    for (const migration of migrations.slice(0, 2))
      db.exec(migration.sql.join('\n'));
    const repo = new SleebyRepository(db);
    const timestamp = {
      utc: '2026-10-08T16:00:00.123456789Z',
      reference: { kind: 'iana', zone: 'Asia/Jakarta' },
    } as const;
    const keyAssignment = { key: '2026-10-08', boundaryMinutes: 240 };
    const oldSleep: SleepRecord = {
      id: 'old-sleep',
      type: 'sleepSession',
      source: 'manual',
      origin: 'org.sleeby.app',
      device: null,
      recordingMethod: 'manual',
      externalId: null,
      lastModifiedUtc: timestamp.utc,
      start: timestamp,
      end: { ...timestamp, utc: '2026-10-09T00:00:00.123456789Z' },
      keyAssignment,
      rawPayload: null,
      payload: { stages: [] },
    };
    repo.appendRawRecords([oldSleep]);
    repo.saveSelections([
      {
        recordId: oldSleep.id,
        logicalSessionId: oldSleep.id,
        status: 'primary',
        reason: 'user-selection',
        supersededBy: null,
        selectedAtUtc: timestamp.utc,
      },
    ]);
    repo.appendTombstone({
      id: 'old-deletion',
      source: 'health-connect',
      origin: 'synthetic.app',
      externalId: 'deleted',
      observedAtUtc: timestamp.utc,
    });
    db.exec(
      "INSERT INTO derived_cache VALUES ('old-cache',1,'synthetic','{}'); INSERT INTO import_cursors VALUES ('synthetic','cursor','2026-10-08T16:00:00.123456789Z');",
    );
    repo.appendHabit({
      id: 'old-habit',
      timestamp,
      keyAssignment,
      monitoring: 'tracked',
      screenFreeMinutes: 45,
    });
    repo.appendNight({
      id: 'old-night',
      keyAssignment,
      primarySessionId: 'old-sleep',
      sessionIds: ['old-sleep'],
    });
    repo.appendSubjectiveReport({
      id: 'old-report',
      timestamp,
      nightAssignment: keyAssignment,
      morningEnergy: 3,
    });
    const tables = [
      'raw_records',
      'habit_entries',
      'nights',
      'subjective_reports',
      'record_selections',
      'source_tombstones',
      'derived_cache',
      'import_cursors',
    ];
    const before = tables.map((table) =>
      db!.prepare(`SELECT * FROM ${table}`).all(),
    );
    db.exec(migrations[2]!.sql.join('\n'));
    repo.saveTrackingSettings(
      {
        id: 'confirmed',
        timestamp,
        target: null,
        dayBoundaryMinutes: 360,
        privacyNoteAcknowledged: true,
        strongerContrast: false,
      },
      null,
    );
    db.close();
    db = new DatabaseSync(path);
    const reopened = new SleebyRepository(db);
    expect(
      tables.map((table) => db!.prepare(`SELECT * FROM ${table}`).all()),
    ).toEqual(before);
    expect(
      reopened.readCurrentHabit(keyAssignment.key)?.value.screenFreeMinutes,
    ).toBe(45);
    expect(reopened.readSleepByIds([oldSleep.id])).toEqual([oldSleep]);
    expect(
      reopened.readCurrentTrackingSettings()?.value.dayBoundaryMinutes,
    ).toBe(360);
    expect(
      reopened.readCurrentNight(keyAssignment.key)?.value,
    ).not.toHaveProperty('target');
    db.exec('PRAGMA recursive_triggers = OFF');
    for (const table of [
      'habit_entries',
      'nights',
      'subjective_reports',
      'tracking_settings',
    ]) {
      expect(() => db!.exec(`UPDATE ${table} SET id=id`)).toThrow('immutable');
      expect(() => db!.exec(`DELETE FROM ${table}`)).toThrow('immutable');
      expect(() =>
        db!.exec(`INSERT OR REPLACE INTO ${table} SELECT * FROM ${table}`),
      ).toThrow('immutable');
      expect(
        db
          .prepare('PRAGMA table_list')
          .all()
          .find((row) => row['name'] === table)?.['wr'],
      ).toBe(1);
    }
  } finally {
    db?.close();
    rmSync(folder, { recursive: true, force: true });
  }
});

it('adds only preferences to the v1 browser store inventory without transforming old values', () => {
  expect(DEXIE_SCHEMA_VERSION).toBe(2);
  expect(STORAGE_CONTRACT.upgrade).toEqual({
    from: 1,
    to: 2,
    addedStores: ['trackingSettings'],
    retainExistingValues: true,
  });
  expect(
    Object.keys(DEXIE_STORES).filter((name) => name !== 'trackingSettings'),
  ).toEqual([
    'rawRecords',
    'habitEntries',
    'nights',
    'subjectiveReports',
    'sourceTombstones',
    'recordSelections',
    'derivedCache',
    'importCursors',
  ]);
});
