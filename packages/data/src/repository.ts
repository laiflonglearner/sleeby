import {
  HEALTH_CATALOG,
  assignDayKey,
  instantNanoseconds,
  normalizeUtcInstant,
  type HabitEntry,
  type Night,
  type RawRecord,
  type SourceTombstone,
  type SubjectiveReport,
  type TrackingSettings,
  type SleepRecord,
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

/** Stable descending position for the saved-night list. */
export interface NightPageCursor {
  readonly key: string;
  readonly id: string;
}

/** Bounded saved-night list. */
export interface NightPage {
  readonly nights: readonly Night[];
  readonly nextCursor: NightPageCursor | null;
}

/** Bounded ancestry, starting with the current version. */
export interface NightHistoryPage {
  readonly revisions: readonly StoredRevision<Night>[];
  readonly nextCursor: string | null;
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

  private current<T>(
    table: 'habit_entries' | 'nights' | 'tracking_settings',
    key?: string,
  ): StoredRevision<T> | null {
    const column = table === 'habit_entries' ? 'day_key' : 'night_key';
    const clause = key === undefined ? '' : `AND p.${column} = ?`;
    const args = key === undefined ? [] : [key];
    const rows = this.statement(
      `SELECT p.* FROM ${table} p WHERE NOT EXISTS (SELECT 1 FROM ${table} c WHERE c.supersedes_id = p.id) ${clause} LIMIT 2`,
    ).all(...args);
    const total = this.statement(
      `SELECT COUNT(*) AS count FROM ${table} ${key === undefined ? '' : `WHERE ${column} = ?`}`,
    ).get(...args)?.['count'];
    if (total === 0) return null;
    if (rows.length !== 1) throw new RangeError('conflicting-entry-heads');
    const row = rows[0]!;
    const chain = this.statement(
      `WITH RECURSIVE chain AS (SELECT * FROM ${table} WHERE id = ? UNION ALL SELECT p.* FROM ${table} p JOIN chain c ON p.id = c.supersedes_id) SELECT COUNT(*) AS count ${key === undefined ? '' : `,SUM(CASE WHEN ${column} = ? AND boundary_minutes = ? THEN 0 ELSE 1 END) AS invalid`} FROM chain`,
    ).get(
      String(row['id']),
      ...(key === undefined ? [] : [key, Number(row['boundary_minutes'])]),
    );
    if (
      chain?.['count'] !== total ||
      (key !== undefined && chain?.['invalid'] !== 0)
    )
      throw new RangeError('conflicting-entry-ancestry');
    return {
      value: json<T>(row),
      supersedesId: row['supersedes_id'] as string | null,
    };
  }

  private retry(
    table: 'habit_entries' | 'nights' | 'tracking_settings',
    value: { readonly id: string },
    expected: string | null,
  ): boolean {
    if (!value.id || value.id === expected)
      throw new RangeError('invalid-entry-id');
    const row = this.statement(
      `SELECT data_json,supersedes_id FROM ${table} WHERE id = ?`,
    ).get(value.id);
    if (!row) return false;
    if (
      row['data_json'] !== JSON.stringify(value) ||
      row['supersedes_id'] !== expected
    )
      throw new RangeError('conflicting-entry-id');
    return true;
  }

  private predecessor<T extends { readonly id: string }>(
    current: StoredRevision<T> | null,
    expected: string | null,
  ): T | null {
    if ((current?.value.id ?? null) !== expected)
      throw new RangeError('stale-entry');
    return current?.value ?? null;
  }

  /** Read the daily head through its full ancestry. */
  readCurrentHabit(key: string): StoredRevision<HabitEntry> | null {
    keyValid(key, 0);
    return this.current<HabitEntry>('habit_entries', key);
  }

  /** Read the night head without choosing by time or ID. */
  readCurrentNight(key: string): StoredRevision<Night> | null {
    keyValid(key, 0);
    return this.current<Night>('nights', key);
  }

  /** Read the active explicit preferences. */
  readCurrentTrackingSettings(): StoredRevision<TrackingSettings> | null {
    return this.current<TrackingSettings>('tracking_settings');
  }

  private settingsValid(value: TrackingSettings): void {
    canonicalUtc(value.timestamp.utc);
    keyValid('2026-01-01', value.dayBoundaryMinutes);
    if (
      typeof value.privacyNoteAcknowledged !== 'boolean' ||
      typeof value.strongerContrast !== 'boolean'
    )
      throw new RangeError('invalid-preferences');
    if (value.target !== null) {
      keyValid('2026-01-01', value.target.bedtimeMinutes);
      keyValid('2026-01-01', value.target.wakeMinutes);
      if (value.target.bedtimeMinutes === value.target.wakeMinutes)
        throw new RangeError('empty-target-window');
    }
  }

  /** Append preferences atomically; exact retries keep the same version. */
  saveTrackingSettings(value: TrackingSettings, expected: string | null): void {
    this.settingsValid(value);
    this.transaction(() => {
      if (this.retry('tracking_settings', value, expected)) return;
      this.predecessor(this.readCurrentTrackingSettings(), expected);
      this.statement(
        'INSERT INTO tracking_settings (id,timestamp_utc,supersedes_id,data_json) VALUES (?,?,?,?)',
      ).run(
        value.id,
        storageUtcIndex(value.timestamp.utc),
        expected,
        JSON.stringify(value),
      );
    });
  }

  /** Append a complete daily snapshot after checking its saved predecessor. */
  saveManualHabit(value: HabitEntry, expected: string | null): void {
    canonicalUtc(value.timestamp.utc);
    keyValid(value.keyAssignment.key, value.keyAssignment.boundaryMinutes);
    if (!['tracked', 'rest', 'unmonitored'].includes(value.monitoring))
      throw new RangeError('invalid-monitoring');
    if (value.caffeineFree === true && value.lastCaffeine !== undefined)
      throw new RangeError('conflicting-caffeine');
    for (const field of [
      'morningSunlightMinutes',
      'afternoonSunlightMinutes',
      'movementMinutes',
      'screenFreeMinutes',
    ] as const) {
      const minutes = value[field];
      if (minutes !== undefined && (!Number.isInteger(minutes) || minutes < 0))
        throw new RangeError('invalid-minutes');
    }
    for (const field of ['caffeineFree', 'movementCompleted'] as const)
      if (value[field] !== undefined && typeof value[field] !== 'boolean')
        throw new RangeError('invalid-boolean');
    for (const stamp of [value.lastMeal, value.lastCaffeine]) {
      if (!stamp) continue;
      canonicalUtc(stamp.utc);
      if (
        assignDayKey(stamp, value.keyAssignment.boundaryMinutes).key !==
        value.keyAssignment.key
      )
        throw new RangeError('time-outside-day');
    }
    this.transaction(() => {
      if (this.retry('habit_entries', value, expected)) return;
      const old = this.predecessor(
        this.readCurrentHabit(value.keyAssignment.key),
        expected,
      );
      if (!old) {
        const settings = this.readCurrentTrackingSettings()?.value;
        if (
          !settings ||
          settings.dayBoundaryMinutes !== value.keyAssignment.boundaryMinutes
        )
          throw new RangeError('day-start-not-confirmed');
      } else if (
        old.keyAssignment.boundaryMinutes !==
        value.keyAssignment.boundaryMinutes
      )
        throw new RangeError('changed-historical-boundary');
      this.appendHabit(value, expected);
    });
  }

  private nightValid(value: Night, old: Night | null): void {
    keyValid(value.keyAssignment.key, value.keyAssignment.boundaryMinutes);
    if (
      new Set(value.sessionIds).size !== value.sessionIds.length ||
      value.sessionIds.length > MAX_STORAGE_PAGE_RECORDS ||
      (value.primarySessionId !== null &&
        !value.sessionIds.includes(value.primarySessionId))
    )
      throw new RangeError('invalid-main-sleep');
    if (old) {
      if (
        JSON.stringify(old.keyAssignment) !==
          JSON.stringify(value.keyAssignment) ||
        JSON.stringify(old.target) !== JSON.stringify(value.target)
      )
        throw new RangeError('changed-historical-night');
    } else {
      const settings = this.readCurrentTrackingSettings()?.value;
      if (
        !settings ||
        settings.dayBoundaryMinutes !== value.keyAssignment.boundaryMinutes ||
        JSON.stringify(settings.target) !== JSON.stringify(value.target)
      )
        throw new RangeError('day-start-not-confirmed');
    }
  }

  /** Save one manual interval and its night version in the same transaction. */
  saveManualSleep(
    sleep: SleepRecord,
    night: Night,
    expected: string | null,
    replacesId: string | null = null,
  ): void {
    this.transaction(() => {
      if (this.retry('nights', night, expected)) {
        const row = this.statement(
          'SELECT data_json FROM raw_records WHERE id = ?',
        ).get(sleep.id);
        if (row?.['data_json'] !== JSON.stringify(sleep))
          throw new RangeError('conflicting-sleep-id');
        return;
      }
      const old = this.predecessor(
        this.readCurrentNight(night.keyAssignment.key),
        expected,
      );
      this.nightValid(night, old);
      if (
        sleep.source !== 'manual' ||
        sleep.recordingMethod !== 'manual' ||
        sleep.origin !== 'org.sleeby.app' ||
        sleep.device !== null ||
        sleep.externalId !== null ||
        sleep.payload.stages.length !== 0 ||
        JSON.stringify(sleep.keyAssignment) !==
          JSON.stringify(night.keyAssignment)
      )
        throw new RangeError('invalid-manual-sleep');
      const ids = old?.sessionIds ?? [];
      if (replacesId !== null && !ids.includes(replacesId))
        throw new RangeError('missing-edited-sleep');
      const next =
        replacesId === null
          ? [...ids, sleep.id]
          : ids.map((id) => (id === replacesId ? sleep.id : id));
      if (JSON.stringify(next) !== JSON.stringify(night.sessionIds))
        throw new RangeError('changed-sleep-membership');
      const primary = old?.primarySessionId ?? null;
      if (
        old &&
        night.primarySessionId !==
          (replacesId !== null && primary === replacesId ? sleep.id : primary)
      )
        throw new RangeError('changed-main-choice');
      if (sleep.start.reference === null || sleep.end.reference === null)
        throw new RangeError('missing-time-reference');
      if (
        !old &&
        assignDayKey(
          { ...sleep.start, reference: sleep.start.reference },
          night.keyAssignment.boundaryMinutes,
        ).key !== night.keyAssignment.key
      )
        throw new RangeError('time-outside-night');
      if (
        this.statement('SELECT id FROM raw_records WHERE id = ?').get(sleep.id)
      )
        throw new RangeError('sleep-id-used');
      this.appendRaw(sleep);
      this.appendNight(night, expected);
    });
  }

  /** Append an explicit main choice without changing interval membership. */
  saveMainSleepChoice(night: Night, expected: string): void {
    this.transaction(() => {
      if (this.retry('nights', night, expected)) return;
      const old = this.predecessor(
        this.readCurrentNight(night.keyAssignment.key),
        expected,
      );
      if (!old) throw new RangeError('missing-night');
      this.nightValid(night, old);
      if (JSON.stringify(old.sessionIds) !== JSON.stringify(night.sessionIds))
        throw new RangeError('changed-sleep-membership');
      this.appendNight(night, expected);
    });
  }

  /** Fetch only the named intervals, preserving their requested order. */
  readSleepByIds(ids: readonly string[]): readonly SleepRecord[] {
    if (ids.length > MAX_STORAGE_PAGE_RECORDS)
      throw new RangeError('sleep-page-too-large');
    return ids.map((id) => {
      const row = this.statement(
        "SELECT data_json FROM raw_records WHERE id = ? AND type = 'sleepSession'",
      ).get(id);
      if (!row) throw new RangeError('missing-sleep');
      return json<SleepRecord>(row);
    });
  }

  /** Page current nights by their saved calendar key and ID. */
  readNightPage(limit = 30, cursor?: NightPageCursor): NightPage {
    if (!Number.isInteger(limit) || limit < 1 || limit > 30)
      throw new RangeError('invalid-page-size');
    if (cursor) keyValid(cursor.key, 0);
    const rows = this.statement(
      `SELECT p.* FROM nights p WHERE NOT EXISTS (SELECT 1 FROM nights c WHERE c.supersedes_id = p.id) ${cursor ? 'AND (night_key,id) < (?,?)' : ''} ORDER BY night_key DESC,id DESC LIMIT ?`,
    ).all(...(cursor ? [cursor.key, cursor.id] : []), limit + 1);
    const nights = rows.slice(0, limit).map((row) => {
      const value = json<Night>(row);
      this.readCurrentNight(value.keyAssignment.key);
      return value;
    });
    const last = nights.at(-1);
    return {
      nights,
      nextCursor:
        rows.length > limit && last
          ? { key: last.keyAssignment.key, id: last.id }
          : null,
    };
  }

  /** Follow actual predecessor links in bounded pages. */
  readNightHistoryPage(
    key: string,
    limit = 50,
    cursor?: string,
  ): NightHistoryPage {
    if (!Number.isInteger(limit) || limit < 1 || limit > 50)
      throw new RangeError('invalid-page-size');
    const head = this.readCurrentNight(key);
    if (!head) return { revisions: [], nextCursor: null };
    if (
      cursor &&
      !this.statement(
        'WITH RECURSIVE chain AS (SELECT id,supersedes_id FROM nights WHERE id = ? UNION ALL SELECT p.id,p.supersedes_id FROM nights p JOIN chain c ON p.id = c.supersedes_id) SELECT id FROM chain WHERE id = ?',
      ).get(head.value.id, cursor)
    )
      throw new RangeError('invalid-history-cursor');
    const rows = this.statement(
      'WITH RECURSIVE chain AS (SELECT *,0 AS depth FROM nights WHERE id = ? UNION ALL SELECT p.*,c.depth+1 FROM nights p JOIN chain c ON p.id = c.supersedes_id WHERE c.depth < ?) SELECT * FROM chain ORDER BY depth',
    ).all(cursor ?? head.value.id, limit);
    return {
      revisions: rows.slice(0, limit).map((row) => ({
        value: json<Night>(row),
        supersedesId: row['supersedes_id'] as string | null,
      })),
      nextCursor: rows.length > limit ? String(rows[limit]!['id']) : null,
    };
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
