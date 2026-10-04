import type {
  HabitEntry,
  Night,
  RawRecord,
  SubjectiveReport,
} from '@sleeby/domain';
import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  sqliteTable,
  text,
  type AnySQLiteColumn,
} from 'drizzle-orm/sqlite-core';

/** Immutable raw envelope. Dense native samples remain lossless inside its JSON payload. */
export const rawRecords = sqliteTable(
  'raw_records',
  {
    id: text('id').primaryKey(),
    type: text('type').notNull(),
    source: text('source').notNull(),
    origin: text('origin').notNull(),
    externalId: text('external_id'),
    lastModifiedUtc: text('last_modified_utc').notNull(),
    startUtc: text('start_utc').notNull(),
    endUtc: text('end_utc').notNull(),
    dayKey: text('day_key'),
    boundaryMinutes: integer('boundary_minutes'),
    data: text('data_json', { mode: 'json' }).$type<RawRecord>().notNull(),
  },
  (table) => [
    index('raw_records_time_idx').on(table.startUtc, table.id),
    index('raw_records_origin_type_idx').on(
      table.origin,
      table.type,
      table.startUtc,
    ),
    index('raw_records_external_idx').on(
      table.source,
      table.origin,
      table.externalId,
      table.lastModifiedUtc,
    ),
    index('raw_records_day_idx').on(table.dayKey, table.type),
    check(
      'raw_records_boundary_check',
      sql`(${table.dayKey} IS NULL AND ${table.boundaryMinutes} IS NULL) OR (${table.dayKey} IS NOT NULL AND ${table.boundaryMinutes} IS NOT NULL AND ${table.boundaryMinutes} BETWEEN 0 AND 1439)`,
    ),
    check('raw_records_json_check', sql`json_valid(${table.data})`),
  ],
);

/** Append-only habit revisions preserve the original day key and boundary. */
export const habitEntries = sqliteTable(
  'habit_entries',
  {
    id: text('id').primaryKey(),
    timestampUtc: text('timestamp_utc').notNull(),
    dayKey: text('day_key').notNull(),
    boundaryMinutes: integer('boundary_minutes').notNull(),
    supersedesId: text('supersedes_id').references(
      (): AnySQLiteColumn => habitEntries.id,
    ),
    data: text('data_json', { mode: 'json' }).$type<HabitEntry>().notNull(),
  },
  (table) => [
    index('habit_entries_day_idx').on(table.dayKey, table.timestampUtc),
    check(
      'habit_entries_boundary_check',
      sql`${table.boundaryMinutes} BETWEEN 0 AND 1439`,
    ),
    check('habit_entries_json_check', sql`json_valid(${table.data})`),
  ],
);

/** Explicit night bindings are append-only, with user changes retained as revisions. */
export const nights = sqliteTable(
  'nights',
  {
    id: text('id').primaryKey(),
    nightKey: text('night_key').notNull(),
    boundaryMinutes: integer('boundary_minutes').notNull(),
    supersedesId: text('supersedes_id').references(
      (): AnySQLiteColumn => nights.id,
    ),
    data: text('data_json', { mode: 'json' }).$type<Night>().notNull(),
  },
  (table) => [
    index('nights_key_idx').on(table.nightKey),
    check(
      'nights_boundary_check',
      sql`${table.boundaryMinutes} BETWEEN 0 AND 1439`,
    ),
    check('nights_json_check', sql`json_valid(${table.data})`),
  ],
);

/** Reports store explicit night assignments and never infer a night from logging time. */
export const subjectiveReports = sqliteTable(
  'subjective_reports',
  {
    id: text('id').primaryKey(),
    timestampUtc: text('timestamp_utc').notNull(),
    nightKey: text('night_key').notNull(),
    boundaryMinutes: integer('boundary_minutes').notNull(),
    supersedesId: text('supersedes_id').references(
      (): AnySQLiteColumn => subjectiveReports.id,
    ),
    data: text('data_json', { mode: 'json' })
      .$type<SubjectiveReport>()
      .notNull(),
  },
  (table) => [
    index('subjective_reports_night_idx').on(
      table.nightKey,
      table.timestampUtc,
    ),
    check(
      'subjective_reports_boundary_check',
      sql`${table.boundaryMinutes} BETWEEN 0 AND 1439`,
    ),
    check('subjective_reports_json_check', sql`json_valid(${table.data})`),
  ],
);

/** Platform deletion observations retain provenance without deleting imported history. */
export const sourceTombstones = sqliteTable(
  'source_tombstones',
  {
    id: text('id').primaryKey(),
    source: text('source').notNull(),
    origin: text('origin').notNull(),
    externalId: text('external_id').notNull(),
    observedAtUtc: text('observed_at_utc').notNull(),
  },
  (table) => [
    index('source_tombstones_external_idx').on(
      table.source,
      table.origin,
      table.externalId,
    ),
  ],
);

/** Reversible selection flags are mutable derived state, separate from the raw store. */
export const recordSelections = sqliteTable(
  'record_selections',
  {
    recordId: text('record_id')
      .primaryKey()
      .references(() => rawRecords.id),
    logicalSessionId: text('logical_session_id').notNull(),
    status: text('status', { enum: ['primary', 'suppressed'] }).notNull(),
    reason: text('reason').notNull(),
    supersededBy: text('superseded_by').references(() => rawRecords.id),
    selectedAtUtc: text('selected_at_utc').notNull(),
  },
  (table) => [
    index('record_selections_session_idx').on(table.logicalSessionId),
    check(
      'record_selections_status_check',
      sql`(${table.status} = 'primary' AND ${table.supersededBy} IS NULL) OR (${table.status} = 'suppressed' AND ${table.supersededBy} IS NOT NULL)`,
    ),
  ],
);

/** Disposable computations carry an algorithm version and input fingerprint. */
export const derivedCache = sqliteTable(
  'derived_cache',
  {
    key: text('key').primaryKey(),
    algorithmVersion: integer('algorithm_version').notNull(),
    inputFingerprint: text('input_fingerprint').notNull(),
    data: text('data_json').notNull(),
  },
  (table) => [
    check('derived_cache_json_check', sql`json_valid(${table.data})`),
  ],
);

/** A checkpoint advances in the same transaction as its successfully appended page. */
export const importCursors = sqliteTable('import_cursors', {
  source: text('source').notNull().primaryKey(),
  cursor: text('cursor'),
  updatedAtUtc: text('updated_at_utc').notNull(),
});
