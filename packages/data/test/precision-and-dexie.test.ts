import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import { expect, it } from 'vitest';
import type {
  HabitEntry,
  Night,
  RawRecord,
  SubjectiveReport,
} from '@sleeby/domain';
import {
  DEXIE_ROW_MAPPERS,
  DEXIE_STORES,
  SleebyRepository,
  type DexieStoreRows,
} from '../src/index.js';

function record(
  id: string,
  startUtc: string,
  endUtc: string,
): RawRecord<'heartRate'> {
  return {
    id,
    type: 'heartRate',
    source: 'health-connect',
    origin: 'original.app',
    device: null,
    recordingMethod: 'automatic',
    externalId: id,
    lastModifiedUtc: '2025-03-09T09:00:00.000Z',
    start: { utc: startUtc, reference: null },
    end: { utc: endUtc, reference: null },
    keyAssignment: { key: '2025-03-08', boundaryMinutes: 240 },
    rawPayload: { startTime: startUtc, endTime: endUtc, notes: 'retained' },
    payload: { samples: [] },
  };
}

it('preserves nanoseconds and pages mixed fractional widths in exact UTC order', () => {
  const db = new DatabaseSync(':memory:');
  try {
    for (const migration of readMigrationFiles({
      migrationsFolder: fileURLToPath(
        new URL('../migrations', import.meta.url),
      ),
    }))
      db.exec(migration.sql.join('\n'));
    const repository = new SleebyRepository(db);
    const records = [
      record('z', '2025-03-09T06:00:00.123Z', '2025-03-09T06:00:00.123000001Z'),
      record(
        'a',
        '2025-03-09T06:00:00.123000001Z',
        '2025-03-09T06:00:00.123000002Z',
      ),
      record('b', '2025-03-09T06:00:00.123000002Z', '2025-03-09T06:00:00.124Z'),
    ];
    repository.appendImportedPage(
      'nanosecond-history',
      [records[2]!, records[0]!, records[1]!],
      'nano-cursor',
      '2025-03-09T10:00:00.123000001Z',
    );
    const first = repository.readRawPage(1);
    const second = repository.readRawPage(1, first.nextCursor!);
    const third = repository.readRawPage(1, second.nextCursor!);
    expect([...first.records, ...second.records, ...third.records]).toEqual(
      records,
    );
    expect(first.nextCursor?.startUtc).toBe('2025-03-09T06:00:00.123Z');
    expect(second.nextCursor?.startUtc).toBe('2025-03-09T06:00:00.123000001Z');
    expect(
      db
        .prepare('SELECT start_utc FROM raw_records ORDER BY start_utc,id')
        .all()
        .map((row) => row['start_utc']),
    ).toEqual([
      '2025-03-09T06:00:00.123000000Z',
      '2025-03-09T06:00:00.123000001Z',
      '2025-03-09T06:00:00.123000002Z',
    ]);
    expect(
      db
        .prepare(
          "SELECT updated_at_utc FROM import_cursors WHERE source='nanosecond-history'",
        )
        .get()?.['updated_at_utc'],
    ).toBe('2025-03-09T10:00:00.123000001Z');
    expect(() =>
      repository.appendRawRecords([
        record('negative', records[1]!.start.utc, records[0]!.start.utc),
      ]),
    ).toThrow('invalid-record-span');
    const instant: RawRecord<'oxygenSaturation'> = {
      ...record(
        'instant',
        '2025-03-09T06:00:00.123Z',
        '2025-03-09T06:00:00.123000000Z',
      ),
      type: 'oxygenSaturation',
      payload: { percent: 95 },
    };
    repository.appendRawRecords([instant]);
    expect(
      repository
        .readRawPage(10)
        .records.find((entry) => entry.id === 'instant'),
    ).toEqual(instant);
  } finally {
    db.close();
  }
});

it('materializes every declared Dexie index path and preserves original source values', () => {
  const timestamp = {
    utc: '2025-03-09T06:00:00.123Z',
    reference: { kind: 'offset' as const, offsetSeconds: -18_000 },
  };
  const keyAssignment = { key: '2025-03-08', boundaryMinutes: 240 };
  const raw = record('dexie-raw', timestamp.utc, '2025-03-09T07:00:00.123Z');
  const habit: HabitEntry = {
    id: 'habit',
    timestamp,
    keyAssignment,
    monitoring: 'tracked',
  };
  const night: Night = {
    id: 'night',
    keyAssignment,
    primarySessionId: 'dexie-raw',
    sessionIds: ['dexie-raw'],
  };
  const report: SubjectiveReport = {
    id: 'report',
    timestamp,
    nightAssignment: keyAssignment,
    morningEnergy: 3,
  };
  const selection = {
    recordId: 'dexie-raw',
    logicalSessionId: 'dexie-raw',
    status: 'suppressed' as const,
    reason: 'duplicate' as const,
    supersededBy: 'other',
    selectedAtUtc: timestamp.utc,
  };
  const tombstone = {
    id: 'tombstone',
    source: 'health-connect' as const,
    origin: 'original.app',
    externalId: 'external',
    observedAtUtc: timestamp.utc,
  };
  const rows: DexieStoreRows = {
    trackingSettings: DEXIE_ROW_MAPPERS.trackingSettings({
      value: {
        id: 'settings',
        timestamp,
        target: null,
        dayBoundaryMinutes: 240,
        privacyNoteAcknowledged: true,
        strongerContrast: false,
      },
      supersedesId: 'previous-settings',
    }),
    rawRecords: DEXIE_ROW_MAPPERS.rawRecords(raw),
    habitEntries: DEXIE_ROW_MAPPERS.habitEntries({
      value: habit,
      supersedesId: 'previous-habit',
    }),
    nights: DEXIE_ROW_MAPPERS.nights({
      value: night,
      supersedesId: 'previous-night',
    }),
    subjectiveReports: DEXIE_ROW_MAPPERS.subjectiveReports({
      value: report,
      supersedesId: 'previous-report',
    }),
    sourceTombstones: DEXIE_ROW_MAPPERS.sourceTombstones(tombstone),
    recordSelections: DEXIE_ROW_MAPPERS.recordSelections(selection),
    derivedCache: DEXIE_ROW_MAPPERS.derivedCache({
      key: 'cache',
      algorithmVersion: 1,
      inputFingerprint: 'inputs',
      data: { total: 123 },
    }),
    importCursors: DEXIE_ROW_MAPPERS.importCursors({
      source: 'health-connect:heart',
      cursor: 'cursor',
      updatedAtUtc: timestamp.utc,
    }),
  };
  for (const store of Object.keys(DEXIE_STORES) as (keyof DexieStoreRows)[]) {
    for (const indexed of DEXIE_STORES[store].split(',')) {
      const paths = indexed.startsWith('[') ? indexed.slice(1, -1) : indexed;
      for (const path of paths.split('+'))
        expect(Object.hasOwn(rows[store], path), `${store}.${path}`).toBe(true);
    }
  }
  expect(rows.rawRecords.data).toBe(raw);
  expect(rows.rawRecords.startUtc).toBe('2025-03-09T06:00:00.123000000Z');
  expect(rows.rawRecords.data.start.utc).toBe('2025-03-09T06:00:00.123Z');
  expect(rows.sourceTombstones.data.observedAtUtc).toBe(timestamp.utc);
  expect(rows.habitEntries.data).toBe(habit);
  expect(rows.nights.data).toBe(night);
  expect(rows.subjectiveReports.data).toBe(report);
  const nullable = DEXIE_ROW_MAPPERS.rawRecords({
    ...raw,
    externalId: null,
    keyAssignment: null,
  });
  expect(Object.hasOwn(nullable, 'externalId')).toBe(false);
  expect(Object.hasOwn(nullable, 'dayKey')).toBe(false);
  expect(Object.hasOwn(nullable, 'boundaryMinutes')).toBe(false);
  expect(
    Object.hasOwn(
      DEXIE_ROW_MAPPERS.habitEntries({ value: habit, supersedesId: null }),
      'supersedesId',
    ),
  ).toBe(false);
  expect(
    Object.hasOwn(
      DEXIE_ROW_MAPPERS.recordSelections({
        ...selection,
        status: 'primary',
        reason: 'user-selection',
        supersededBy: null,
      }),
      'supersededBy',
    ),
  ).toBe(false);
});
