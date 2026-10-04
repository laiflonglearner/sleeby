/** Private SQLite table declarations, with mutable derived state kept separate. */
export {
  derivedCache,
  habitEntries,
  importCursors,
  nights,
  rawRecords,
  recordSelections,
  sourceTombstones,
  subjectiveReports,
} from './schema.js';
/** Browser mirror contracts, without importing Dexie into the native storage package. */
export {
  DEXIE_SCHEMA_VERSION,
  DEXIE_STORES,
  DEXIE_ROW_MAPPERS,
  STORAGE_CONTRACT,
} from './dexie-contract.js';
/** Structured browser row types for every store in the mirror contract. */
export type {
  DexieDerivedCacheRow,
  DexieHabitRow,
  DexieImportCursorRow,
  DexieNightRow,
  DexieRawRecordRow,
  DexieSelectionRow,
  DexieStoreInputs,
  DexieStoreRows,
  DexieSubjectiveReportRow,
  DexieTombstoneRow,
} from './dexie-contract.js';
/** Bounded append-only repository implementation and its page limit. */
export { MAX_STORAGE_PAGE_RECORDS, SleebyRepository } from './repository.js';
/** Public private-package contracts for adapters, revisions and reversible selections. */
export type {
  RawPageCursor,
  RawRecordPage,
  SourceTombstone,
  SQLiteDatabase,
  SQLiteStatement,
  SQLiteValue,
  StoredRevision,
  StoredSelection,
} from './repository.js';
