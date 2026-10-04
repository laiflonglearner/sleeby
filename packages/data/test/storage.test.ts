import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { getTableConfig } from 'drizzle-orm/sqlite-core';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import { describe, expect, it } from 'vitest';
import type {
  HabitEntry,
  Night,
  RawRecord,
  SubjectiveReport,
} from '@sleeby/domain';
import {
  DEXIE_STORES,
  MAX_STORAGE_PAGE_RECORDS,
  SleebyRepository,
  STORAGE_CONTRACT,
  type SourceTombstone,
} from '../src/index.js';
import * as schema from '../src/schema.js';

function database(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON; PRAGMA recursive_triggers = ON;');
  const migrations = readMigrationFiles({
    migrationsFolder: fileURLToPath(new URL('../migrations', import.meta.url)),
  });
  for (const migration of migrations) db.exec(migration.sql.join('\n'));
  return db;
}

function record(id: string): RawRecord<'heartRate'> {
  return {
    id,
    type: 'heartRate',
    source: 'health-connect',
    origin: 'original.app',
    device: {
      manufacturer: 'manufacturer',
      model: 'model',
      type: 1,
      identifier: null,
    },
    recordingMethod: 'automatic',
    externalId: id,
    lastModifiedUtc: '2025-03-09T09:00:00.000Z',
    start: {
      utc: '2025-03-09T06:00:00.000Z',
      reference: { kind: 'offset', offsetSeconds: -18_000 },
    },
    end: {
      utc: '2025-03-09T08:00:00.000Z',
      reference: { kind: 'offset', offsetSeconds: -14_400 },
    },
    keyAssignment: { key: '2025-03-08', boundaryMinutes: 240 },
    rawPayload: {
      startZoneOffset: '-05:00',
      endZoneOffset: '-04:00',
      samples: [{ time: '2025-03-09T07:00:00Z', beatsPerMinute: 61 }],
      nativeExtra: { untouched: true },
    },
    payload: {
      samples: [
        {
          timestamp: { utc: '2025-03-09T07:00:00.000Z', reference: null },
          value: 61,
        },
      ],
    },
  };
}

describe('committed Drizzle migrations', () => {
  it('matches every declared table, column, foreign key and index in real SQLite', () => {
    const db = database();
    try {
      for (const table of Object.values(schema)) {
        const config = getTableConfig(table);
        const columns = db.prepare(`PRAGMA table_info("${config.name}")`).all();
        expect(columns.map((column) => column['name'])).toEqual(
          config.columns.map((column) => column.name),
        );
        const indexes = db.prepare(`PRAGMA index_list("${config.name}")`).all();
        for (const declared of config.indexes) {
          expect(
            indexes.some((entry) => entry['name'] === declared.config.name),
          ).toBe(true);
          const actual = db
            .prepare(`PRAGMA index_info("${declared.config.name}")`)
            .all();
          expect(actual.map((column) => column['name'])).toEqual(
            declared.config.columns.map((column) =>
              'name' in column ? column.name : undefined,
            ),
          );
        }
        expect(
          db.prepare(`PRAGMA foreign_key_list("${config.name}")`).all(),
        ).toHaveLength(config.foreignKeys.length);
      }
    } finally {
      db.close();
    }
  });

  it('blocks UPDATE, DELETE and replacement of raw history but permits reversible selections', () => {
    const db = database();
    try {
      const repository = new SleebyRepository(db);
      repository.appendRawRecords([record('a'), record('b')]);
      expect(() =>
        db.exec("UPDATE raw_records SET origin='changed' WHERE id='a'"),
      ).toThrow('immutable-raw-record');
      expect(() => db.exec("DELETE FROM raw_records WHERE id='a'")).toThrow(
        'immutable-raw-record',
      );
      expect(() =>
        db.exec(
          "INSERT OR REPLACE INTO raw_records SELECT * FROM raw_records WHERE id='a'",
        ),
      ).toThrow('immutable-raw-record');
      db.exec('PRAGMA recursive_triggers = OFF');
      expect(() =>
        db.exec(
          "INSERT OR REPLACE INTO raw_records SELECT * FROM raw_records WHERE id='a'",
        ),
      ).toThrow('immutable-raw-record');
      expect(() =>
        db.exec(
          "INSERT INTO raw_records SELECT 'invalid-key',type,source,origin,external_id,last_modified_utc,start_utc,end_utc,'2025-03-08',NULL,data_json FROM raw_records WHERE id='a'",
        ),
      ).toThrow('raw_records_boundary_check');
      repository.saveSelections([
        {
          recordId: 'a',
          logicalSessionId: 'a',
          selectedAtUtc: '2025-03-09T10:00:00.000Z',
          status: 'primary',
          reason: 'unique',
          supersededBy: null,
        },
        {
          recordId: 'b',
          logicalSessionId: 'b',
          selectedAtUtc: '2025-03-09T10:00:00.000Z',
          status: 'suppressed',
          reason: 'duplicate',
          supersededBy: 'a',
        },
      ]);
      repository.saveSelections([
        {
          recordId: 'b',
          logicalSessionId: 'b',
          selectedAtUtc: '2025-03-09T11:00:00.000Z',
          status: 'primary',
          reason: 'user-selection',
          supersededBy: null,
        },
      ]);
      expect(
        db
          .prepare("SELECT status FROM record_selections WHERE record_id='b'")
          .get()?.['status'],
      ).toBe('primary');
      expect(
        repository
          .readSelections(['a', 'b'])
          .map((selection) => selection.status),
      ).toEqual(['primary', 'primary']);
      expect(repository.readRawPage(10).records).toEqual([
        record('a'),
        record('b'),
      ]);
      expect(() =>
        repository.saveSelections([
          {
            recordId: 'absent',
            logicalSessionId: 'absent',
            selectedAtUtc: '2025-03-09T11:00:00.000Z',
            status: 'primary',
            reason: 'unique',
            supersededBy: null,
          },
        ]),
      ).toThrow();
    } finally {
      db.close();
    }
  });
});

describe('typed append-only repositories', () => {
  it('commits change-page upserts, tombstones and cursors atomically with safe exact retries', () => {
    const db = database();
    try {
      const repository = new SleebyRepository(db);
      const first: SourceTombstone = {
        id: 'tombstone-1',
        source: 'health-connect',
        origin: 'original.app',
        externalId: 'deleted-1',
        observedAtUtc: '2025-03-09T10:00:00.123000001Z',
      };
      const second: SourceTombstone = {
        ...first,
        id: 'tombstone-2',
        externalId: 'deleted-2',
      };
      repository.appendImportedPage(
        'changes:heart',
        [record('a')],
        'changes-1',
        '2025-03-09T10:00:00.000Z',
        [first],
      );
      expect(() =>
        repository.appendImportedPage(
          'changes:heart',
          [record('b')],
          'changes-2',
          '2025-03-09T11:00:00.000Z',
          [second, { ...first, origin: 'conflicting.app' }],
        ),
      ).toThrow('conflicting-source-tombstone-id');
      expect(repository.readImportCursor('changes:heart')).toBe('changes-1');
      expect(
        repository.readRawPage(10).records.map((entry) => entry.id),
      ).toEqual(['a']);
      expect(
        db
          .prepare('SELECT id FROM source_tombstones ORDER BY id')
          .all()
          .map((entry) => entry['id']),
      ).toEqual(['tombstone-1']);
      repository.appendImportedPage(
        'changes:heart',
        [record('b')],
        'changes-2',
        '2025-03-09T11:00:00.000Z',
        [second, first],
      );
      repository.appendImportedPage(
        'changes:heart',
        [record('b')],
        'changes-2',
        '2025-03-09T11:00:00.000Z',
        [second, first],
      );
      repository.appendTombstone(first);
      expect(repository.readImportCursor('changes:heart')).toBe('changes-2');
      expect(
        repository.readRawPage(10).records.map((entry) => entry.id),
      ).toEqual(['a', 'b']);
      expect(
        db
          .prepare('SELECT id FROM source_tombstones ORDER BY id')
          .all()
          .map((entry) => entry['id']),
      ).toEqual(['tombstone-1', 'tombstone-2']);
      expect(() =>
        repository.appendTombstone({
          ...first,
          observedAtUtc: '2025-03-09T10:00:00.123000002Z',
        }),
      ).toThrow('conflicting-source-tombstone-id');
      expect(() =>
        repository.appendImportedPage(
          'changes:heart',
          [record('c')],
          'changes-3',
          '2025-03-09T12:00:00.000Z',
          Array.from({ length: MAX_STORAGE_PAGE_RECORDS }, () => first),
        ),
      ).toThrow('raw-page-too-large');
      expect(repository.readImportCursor('changes:heart')).toBe('changes-2');
      expect(
        repository.readRawPage(10).records.map((entry) => entry.id),
      ).toEqual(['a', 'b']);
    } finally {
      db.close();
    }
  });

  it('round-trips raw native fields, DST endpoint offsets, samples and missing references', () => {
    const db = database();
    try {
      const repository = new SleebyRepository(db);
      const nullable = {
        ...record('unknown-reference'),
        start: { utc: '2025-03-09T06:00:00.000Z', reference: null },
        end: { utc: '2025-03-09T08:00:00.000Z', reference: null },
        keyAssignment: null,
      };
      repository.appendRawRecords([nullable]);
      expect(repository.readRawPage(1).records).toEqual([nullable]);
      repository.appendRawRecords([nullable]);
      expect(repository.readRawPage(2).records).toHaveLength(1);
      expect(() =>
        repository.appendRawRecords([{ ...nullable, origin: 'changed.app' }]),
      ).toThrow('conflicting-raw-record-id');
    } finally {
      db.close();
    }
  });

  it('pages equal-start records without omissions and advances checkpoints only after commit', () => {
    const db = database();
    try {
      const repository = new SleebyRepository(db);
      repository.appendImportedPage(
        'health-connect:heart',
        [record('a'), record('b')],
        'cursor-1',
        '2025-03-09T10:00:00.000Z',
      );
      const first = repository.readRawPage(1);
      expect(first.records.map((row) => row.id)).toEqual(['a']);
      expect(first.nextCursor).not.toBeNull();
      const second = repository.readRawPage(1, first.nextCursor!);
      expect(second.records.map((row) => row.id)).toEqual(['b']);
      expect(second.nextCursor).toBeNull();
      expect(() =>
        repository.appendImportedPage(
          'health-connect:heart',
          [record('c'), { ...record('a'), origin: 'conflict' }],
          'cursor-2',
          '2025-03-09T11:00:00.000Z',
        ),
      ).toThrow('conflicting-raw-record-id');
      expect(repository.readImportCursor('health-connect:heart')).toBe(
        'cursor-1',
      );
      expect(repository.readRawPage(10).records.map((row) => row.id)).toEqual([
        'a',
        'b',
      ]);
      expect(() => repository.readRawPage(0)).toThrow('invalid-page-size');
    } finally {
      db.close();
    }
  });

  it('preserves explicit historical bindings and report revisions', () => {
    const db = database();
    try {
      const repository = new SleebyRepository(db);
      const timestamp = {
        utc: '2025-03-10T12:00:00.000Z',
        reference: { kind: 'iana' as const, zone: 'America/New_York' },
      };
      const keyAssignment = { key: '2025-03-08', boundaryMinutes: 240 };
      const habit: HabitEntry = {
        id: 'habit-1',
        timestamp,
        keyAssignment,
        monitoring: 'tracked',
        screenFreeMinutes: 45,
      };
      const night: Night = {
        id: 'night-1',
        keyAssignment,
        primarySessionId: 'sleep-1',
        sessionIds: ['sleep-1'],
      };
      const report: SubjectiveReport = {
        id: 'report-1',
        timestamp,
        nightAssignment: keyAssignment,
        morningEnergy: 3,
      };
      repository.appendHabit(habit);
      repository.appendHabit(
        {
          ...habit,
          id: 'habit-2',
          keyAssignment: { key: '2025-03-08', boundaryMinutes: 300 },
        },
        'habit-1',
      );
      repository.appendNight(night);
      repository.appendSubjectiveReport(report);
      repository.appendSubjectiveReport(
        { ...report, id: 'report-2', morningEnergy: 4 },
        'report-1',
      );
      expect(
        repository
          .readHabits('2025-03-08')
          .map((row) => row.value.keyAssignment.boundaryMinutes),
      ).toEqual([240, 300]);
      expect(repository.readNights('2025-03-08')[0]?.value).toEqual(night);
      expect(
        repository
          .readSubjectiveReports('2025-03-08')
          .map((row) => row.supersedesId),
      ).toEqual([null, 'report-1']);
      repository.appendTombstone({
        id: 'deleted-native',
        source: 'health-connect',
        origin: 'original.app',
        externalId: 'missing-upstream',
        observedAtUtc: '2025-03-10T12:00:00.000Z',
      });
      for (const [table, id] of [
        ['habit_entries', 'habit-1'],
        ['nights', 'night-1'],
        ['subjective_reports', 'report-1'],
        ['source_tombstones', 'deleted-native'],
      ]) {
        expect(() =>
          db.prepare(`DELETE FROM ${table} WHERE id=?`).run(id!),
        ).toThrow('immutable');
        expect(() =>
          db.prepare(`UPDATE ${table} SET id=id WHERE id=?`).run(id!),
        ).toThrow('immutable');
        expect(() =>
          db
            .prepare(
              `INSERT OR REPLACE INTO ${table} SELECT * FROM ${table} WHERE id=?`,
            )
            .run(id!),
        ).toThrow('immutable');
      }
      expect(() =>
        repository.appendHabit({
          ...habit,
          id: 'invalid',
          keyAssignment: { key: '2025-02-30', boundaryMinutes: 240 },
        }),
      ).toThrow('invalid-instant');
    } finally {
      db.close();
    }
  });

  it('declares the same eight stores and immutable/derived separation for the Dexie mirror', () => {
    expect(Object.keys(DEXIE_STORES).sort()).toEqual(
      Object.keys(schema).sort(),
    );
    expect(STORAGE_CONTRACT.immutableStores).toEqual([
      'rawRecords',
      'habitEntries',
      'nights',
      'subjectiveReports',
      'sourceTombstones',
    ]);
    expect(STORAGE_CONTRACT.mutableStores).toEqual([
      'recordSelections',
      'derivedCache',
      'importCursors',
    ]);
  });
});
