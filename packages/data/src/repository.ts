import {
  HEALTH_CATALOG,
  instantNanoseconds,
  normalizeUtcInstant,
  type HabitEntry,
  type Night,
  type RawRecord,
  type SourceTombstone,
  type SubjectiveReport,
} from '@sleeby/domain';
import { storageUtcIndex } from './storage-time.js';

/** Bound raw pages and combined import observations, preventing unbounded history reads. */
export const MAX_STORAGE_PAGE_RECORDS = 1_000;

/** Portable SQLite parameter values required by these repositories. */
export type SQLiteValue = string | number | null;

/** Prepared statement port, implementable by expo-sqlite or the Node test driver. */
export interface SQLiteStatement {
  run(...parameters: SQLiteValue[]): unknown;
  get(...parameters: SQLiteValue[]): Record<string, unknown> | undefined;
  all(...parameters: SQLiteValue[]): Record<string, unknown>[];
}

/** Synchronous transactional database port; encryption initialization belongs to the app. */
export interface SQLiteDatabase {
  exec(sql: string): void;
  prepare(sql: string): SQLiteStatement;
}

/** Resume marker uses a total UTC/id ordering, so equal timestamps cannot skip rows. */
export interface RawPageCursor {
  readonly startUtc: string;
  readonly id: string;
}

/** One bounded raw page, with immutable records and a resumable position. */
export interface RawRecordPage {
  readonly records: readonly RawRecord[];
  readonly nextCursor: RawPageCursor | null;
}

/** Revision lineage accompanies original user data rather than overwriting it. */
export interface StoredRevision<T> {
  readonly value: T;
  readonly supersedesId: string | null;
}

/** Stored reversible primary/suppressed state for each raw fragment. */
export type StoredSelection = Readonly<{
  recordId: string;
  logicalSessionId: string;
  selectedAtUtc: string;
}> &
  (
    | Readonly<{
        status: 'primary';
        reason: 'unique' | 'information-richness' | 'user-selection';
        supersededBy: null;
      }>
    | Readonly<{
        status: 'suppressed';
        reason: 'duplicate' | 'user-selection';
        supersededBy: string;
      }>
  );

/** A platform deletion observation remains an immutable record of its own. */
export type { SourceTombstone } from '@sleeby/domain';

function canonicalUtc(utc: string): void {
  if (normalizeUtcInstant(utc) !== utc)
    throw new RangeError('noncanonical-utc');
}

function keyValid(key: string, boundary: number): void {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(key) ||
    !Number.isInteger(boundary) ||
    boundary < 0 ||
    boundary >= 24 * 60
  )
    throw new RangeError('invalid-stored-key');
  canonicalUtc(`${key}T00:00:00.000Z`);
}

function json<T>(row: Record<string, unknown>): T {
  if (typeof row['data_json'] !== 'string')
    throw new TypeError('invalid-storage-json');
  return JSON.parse(row['data_json']) as T;
}

/** Typed append-only repositories with separate derived selections and import checkpoints. */
export class SleebyRepository {
  private readonly statements = new Map<string, SQLiteStatement>();

  /** Require callers to apply an encryption key before constructing a production repository. */
  constructor(private readonly database: SQLiteDatabase) {
    database.exec('PRAGMA foreign_keys = ON; PRAGMA recursive_triggers = ON;');
  }

  private statement(sql: string): SQLiteStatement {
    let prepared = this.statements.get(sql);
    if (!prepared) {
      prepared = this.database.prepare(sql);
      this.statements.set(sql, prepared);
    }
    return prepared;
  }

  private transaction<T>(operation: () => T): T {
    this.database.exec('BEGIN IMMEDIATE');
    try {
      const result = operation();
      this.database.exec('COMMIT');
      return result;
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
  }

  private appendRaw(record: RawRecord): void {
    canonicalUtc(record.start.utc);
    canonicalUtc(record.end.utc);
    canonicalUtc(record.lastModifiedUtc);
    const shape = HEALTH_CATALOG[record.type].temporalShape;
    const span =
      instantNanoseconds(record.end.utc) - instantNanoseconds(record.start.utc);
    if (
      span < 0n ||
      (shape === 'instant' && span !== 0n) ||
      (shape !== 'instant' && span === 0n)
    )
      throw new RangeError('invalid-record-span');
    if (record.keyAssignment)
      keyValid(record.keyAssignment.key, record.keyAssignment.boundaryMinutes);
    const encoded = JSON.stringify(record);
    const existing = this.statement(
      'SELECT data_json FROM raw_records WHERE id = ?',
    ).get(record.id);
    if (existing) {
      if (existing['data_json'] !== encoded)
        throw new RangeError('conflicting-raw-record-id');
      return;
    }
    this.statement(
      'INSERT INTO raw_records (id,type,source,origin,external_id,last_modified_utc,start_utc,end_utc,day_key,boundary_minutes,data_json) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
    ).run(
      record.id,
      record.type,
      record.source,
      record.origin,
      record.externalId,
      storageUtcIndex(record.lastModifiedUtc),
      storageUtcIndex(record.start.utc),
      storageUtcIndex(record.end.utc),
      record.keyAssignment?.key ?? null,
      record.keyAssignment?.boundaryMinutes ?? null,
      encoded,
    );
  }

  /** Append a bounded raw batch atomically. Exact retries are idempotent; conflicting ids fail. */
  appendRawRecords(records: readonly RawRecord[]): void {
    if (records.length > MAX_STORAGE_PAGE_RECORDS)
      throw new RangeError('raw-page-too-large');
    this.transaction(() => {
      for (const record of records) this.appendRaw(record);
    });
  }

  /** Append upserts and deletion observations with their checkpoint atomically. Exact retries preserve every original. */
  appendImportedPage(
    source: string,
    records: readonly RawRecord[],
    nextCursor: string | null,
    updatedAtUtc: string,
    tombstones: readonly SourceTombstone[] = [],
  ): void {
    canonicalUtc(updatedAtUtc);
    if (records.length + tombstones.length > MAX_STORAGE_PAGE_RECORDS)
      throw new RangeError('raw-page-too-large');
    this.transaction(() => {
      for (const record of records) this.appendRaw(record);
      for (const tombstone of tombstones) this.appendSourceTombstone(tombstone);
      this.statement(
        'INSERT INTO import_cursors (source,cursor,updated_at_utc) VALUES (?,?,?) ON CONFLICT(source) DO UPDATE SET cursor=excluded.cursor,updated_at_utc=excluded.updated_at_utc',
      ).run(source, nextCursor, storageUtcIndex(updatedAtUtc));
    });
  }

  /** Read a bounded page in stable UTC/id order, including suppressed records. */
  readRawPage(limit: number, cursor?: RawPageCursor): RawRecordPage {
    if (
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > MAX_STORAGE_PAGE_RECORDS
    )
      throw new RangeError('invalid-page-size');
    if (cursor) canonicalUtc(cursor.startUtc);
    const rows = cursor
      ? this.statement(
          'SELECT data_json FROM raw_records WHERE (start_utc,id) > (?,?) ORDER BY start_utc,id LIMIT ?',
        ).all(storageUtcIndex(cursor.startUtc), cursor.id, limit + 1)
      : this.statement(
          'SELECT data_json FROM raw_records ORDER BY start_utc,id LIMIT ?',
        ).all(limit + 1);
    const hasMore = rows.length > limit;
    const records = rows.slice(0, limit).map((row) => json<RawRecord>(row));
    const last = records.at(-1);
    return {
      records,
      nextCursor:
        hasMore && last ? { startUtc: last.start.utc, id: last.id } : null,
    };
  }

  /** Inspect a checkpoint without loading any raw records. */
  readImportCursor(source: string): string | null | undefined {
    const row = this.statement(
      'SELECT cursor FROM import_cursors WHERE source = ?',
    ).get(source);
    return row ? (row['cursor'] as string | null) : undefined;
  }

  /** Append a habit or explicit replacement revision, preserving historical keys. */
  appendHabit(entry: HabitEntry, supersedesId: string | null = null): void {
    if (supersedesId === entry.id)
      throw new RangeError('self-referencing-revision');
    canonicalUtc(entry.timestamp.utc);
    keyValid(entry.keyAssignment.key, entry.keyAssignment.boundaryMinutes);
    this.statement(
      'INSERT INTO habit_entries (id,timestamp_utc,day_key,boundary_minutes,supersedes_id,data_json) VALUES (?,?,?,?,?,?)',
    ).run(
      entry.id,
      storageUtcIndex(entry.timestamp.utc),
      entry.keyAssignment.key,
      entry.keyAssignment.boundaryMinutes,
      supersedesId,
      JSON.stringify(entry),
    );
  }

  /** Append an explicit night binding or revision. */
  appendNight(night: Night, supersedesId: string | null = null): void {
    if (supersedesId === night.id)
      throw new RangeError('self-referencing-revision');
    keyValid(night.keyAssignment.key, night.keyAssignment.boundaryMinutes);
    this.statement(
      'INSERT INTO nights (id,night_key,boundary_minutes,supersedes_id,data_json) VALUES (?,?,?,?,?)',
    ).run(
      night.id,
      night.keyAssignment.key,
      night.keyAssignment.boundaryMinutes,
      supersedesId,
      JSON.stringify(night),
    );
  }

  /** Append a report with its declared night binding, independent of logging time. */
  appendSubjectiveReport(
    report: SubjectiveReport,
    supersedesId: string | null = null,
  ): void {
    if (supersedesId === report.id)
      throw new RangeError('self-referencing-revision');
    canonicalUtc(report.timestamp.utc);
    keyValid(
      report.nightAssignment.key,
      report.nightAssignment.boundaryMinutes,
    );
    this.statement(
      'INSERT INTO subjective_reports (id,timestamp_utc,night_key,boundary_minutes,supersedes_id,data_json) VALUES (?,?,?,?,?,?)',
    ).run(
      report.id,
      storageUtcIndex(report.timestamp.utc),
      report.nightAssignment.key,
      report.nightAssignment.boundaryMinutes,
      supersedesId,
      JSON.stringify(report),
    );
  }

  /** Read every habit revision for an explicit day, leaving current-revision policy to callers. */
  readHabits(dayKey: string): readonly StoredRevision<HabitEntry>[] {
    return this.statement(
      'SELECT data_json,supersedes_id FROM habit_entries WHERE day_key = ? ORDER BY timestamp_utc,id',
    )
      .all(dayKey)
      .map((row) => ({
        value: json<HabitEntry>(row),
        supersedesId: row['supersedes_id'] as string | null,
      }));
  }

  /** Read all night revisions without silently reassigning history. */
  readNights(nightKey: string): readonly StoredRevision<Night>[] {
    return this.statement(
      'SELECT data_json,supersedes_id FROM nights WHERE night_key = ? ORDER BY id',
    )
      .all(nightKey)
      .map((row) => ({
        value: json<Night>(row),
        supersedesId: row['supersedes_id'] as string | null,
      }));
  }

  /** Read reports by their explicit night assignment. */
  readSubjectiveReports(
    nightKey: string,
  ): readonly StoredRevision<SubjectiveReport>[] {
    return this.statement(
      'SELECT data_json,supersedes_id FROM subjective_reports WHERE night_key = ? ORDER BY timestamp_utc,id',
    )
      .all(nightKey)
      .map((row) => ({
        value: json<SubjectiveReport>(row),
        supersedesId: row['supersedes_id'] as string | null,
      }));
  }

  private appendSourceTombstone(tombstone: SourceTombstone): void {
    const observedAtUtc = storageUtcIndex(tombstone.observedAtUtc);
    const existing = this.statement(
      'SELECT source,origin,external_id,observed_at_utc FROM source_tombstones WHERE id = ?',
    ).get(tombstone.id);
    if (existing) {
      if (
        existing['source'] !== tombstone.source ||
        existing['origin'] !== tombstone.origin ||
        existing['external_id'] !== tombstone.externalId ||
        existing['observed_at_utc'] !== observedAtUtc
      )
        throw new RangeError('conflicting-source-tombstone-id');
      return;
    }
    this.statement(
      'INSERT INTO source_tombstones (id,source,origin,external_id,observed_at_utc) VALUES (?,?,?,?,?)',
    ).run(
      tombstone.id,
      tombstone.source,
      tombstone.origin,
      tombstone.externalId,
      observedAtUtc,
    );
  }

  /** Append an immutable deletion observation. Exact retries succeed; conflicting ids fail. */
  appendTombstone(tombstone: SourceTombstone): void {
    this.transaction(() => this.appendSourceTombstone(tombstone));
  }

  /** Replace selection flags atomically; raw records are never updated or deleted. */
  saveSelections(selections: readonly StoredSelection[]): void {
    this.transaction(() => {
      for (const selection of selections) {
        canonicalUtc(selection.selectedAtUtc);
        this.statement(
          'INSERT INTO record_selections (record_id,logical_session_id,status,reason,superseded_by,selected_at_utc) VALUES (?,?,?,?,?,?) ON CONFLICT(record_id) DO UPDATE SET logical_session_id=excluded.logical_session_id,status=excluded.status,reason=excluded.reason,superseded_by=excluded.superseded_by,selected_at_utc=excluded.selected_at_utc',
        ).run(
          selection.recordId,
          selection.logicalSessionId,
          selection.status,
          selection.reason,
          selection.supersededBy,
          storageUtcIndex(selection.selectedAtUtc),
        );
      }
    });
  }

  /** Read flags for a bounded record page, so exports can retain all suppressed originals. */
  readSelections(recordIds: readonly string[]): readonly StoredSelection[] {
    if (recordIds.length > MAX_STORAGE_PAGE_RECORDS)
      throw new RangeError('selection-page-too-large');
    const rows = this.statement(
      'SELECT * FROM record_selections WHERE record_id IN (SELECT value FROM json_each(?)) ORDER BY record_id',
    ).all(JSON.stringify(recordIds));
    return rows.map(
      (row) =>
        ({
          recordId: row['record_id'],
          logicalSessionId: row['logical_session_id'],
          status: row['status'],
          reason: row['reason'],
          supersededBy: row['superseded_by'],
          selectedAtUtc: row['selected_at_utc'],
        }) as StoredSelection,
    );
  }
}
