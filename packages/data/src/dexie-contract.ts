import type {
  HabitEntry,
  HealthPlatform,
  HealthRecordType,
  JsonValue,
  Night,
  RawRecord,
  SubjectiveReport,
  TrackingSettings,
} from '@sleeby/domain';
import type {
  SourceTombstone,
  StoredRevision,
  StoredSelection,
} from './repository.js';
import { storageUtcIndex } from './storage-time.js';

/** Mirror version shared with the private browser adapter, which supplies its own Dexie dependency. */
export const DEXIE_SCHEMA_VERSION = 2;

/** IndexedDB store and index names mirror SQLite semantics; JSON objects remain structured values. */
export const DEXIE_STORES = Object.freeze({
  rawRecords:
    'id,[startUtc+id],[origin+type+startUtc],[source+origin+externalId+lastModifiedUtc],[dayKey+type]',
  habitEntries: 'id,[dayKey+timestampUtc],supersedesId',
  nights: 'id,nightKey,supersedesId',
  subjectiveReports: 'id,[nightKey+timestampUtc],supersedesId',
  sourceTombstones: 'id,[source+origin+externalId]',
  recordSelections: 'recordId,logicalSessionId,supersededBy',
  derivedCache: 'key',
  importCursors: 'source',
  trackingSettings: 'id,supersedesId',
});

/** Flattened index columns surround the unchanged immutable native envelope. */
export interface DexieRawRecordRow {
  readonly id: string;
  readonly type: HealthRecordType;
  readonly source: HealthPlatform;
  readonly origin: string;
  readonly externalId?: string;
  readonly lastModifiedUtc: string;
  readonly startUtc: string;
  readonly endUtc: string;
  readonly dayKey?: string;
  readonly boundaryMinutes?: number;
  readonly data: RawRecord;
}

/** Habit index fields accompany immutable data and optional revision ancestry. */
export interface DexieHabitRow {
  readonly id: string;
  readonly timestampUtc: string;
  readonly dayKey: string;
  readonly boundaryMinutes: number;
  readonly supersedesId?: string;
  readonly data: HabitEntry;
}

/** Explicit night assignment fields mirror SQLite without recomputing historical keys. */
export interface DexieNightRow {
  readonly id: string;
  readonly nightKey: string;
  readonly boundaryMinutes: number;
  readonly supersedesId?: string;
  readonly data: Night;
}

/** Report indexes use declared night keys rather than logging-date inference. */
export interface DexieSubjectiveReportRow {
  readonly id: string;
  readonly timestampUtc: string;
  readonly nightKey: string;
  readonly boundaryMinutes: number;
  readonly supersedesId?: string;
  readonly data: SubjectiveReport;
}

/** Tombstone index timestamps are fixed-width while original observations remain in data. */
export interface DexieTombstoneRow extends SourceTombstone {
  readonly data: SourceTombstone;
}

/** Mutable selection indexes omit absent supersession references instead of storing null keys. */
export interface DexieSelectionRow {
  readonly recordId: string;
  readonly logicalSessionId: string;
  readonly status: StoredSelection['status'];
  readonly reason: StoredSelection['reason'];
  readonly supersededBy?: string;
  readonly selectedAtUtc: string;
  readonly data: StoredSelection;
}

/** Disposable browser cache has the same algorithm and input validity checks as SQLite. */
export interface DexieDerivedCacheRow {
  readonly key: string;
  readonly algorithmVersion: number;
  readonly inputFingerprint: string;
  readonly data: JsonValue;
}

/** Browser import checkpoints advance atomically with successful immutable page inserts. */
export interface DexieImportCursorRow {
  readonly source: string;
  readonly cursor: string | null;
  readonly updatedAtUtc: string;
}

/** Exact structured row contract for every declared IndexedDB store. */
export interface DexieStoreRows {
  readonly rawRecords: DexieRawRecordRow;
  readonly habitEntries: DexieHabitRow;
  readonly nights: DexieNightRow;
  readonly subjectiveReports: DexieSubjectiveReportRow;
  readonly sourceTombstones: DexieTombstoneRow;
  readonly recordSelections: DexieSelectionRow;
  readonly derivedCache: DexieDerivedCacheRow;
  readonly importCursors: DexieImportCursorRow;
  readonly trackingSettings: DexieTrackingSettingsRow;
}

/** Typed source values supplied to flattening mappers by a browser storage adapter. */
export interface DexieStoreInputs {
  readonly rawRecords: RawRecord;
  readonly habitEntries: StoredRevision<HabitEntry>;
  readonly nights: StoredRevision<Night>;
  readonly subjectiveReports: StoredRevision<SubjectiveReport>;
  readonly sourceTombstones: SourceTombstone;
  readonly recordSelections: StoredSelection;
  readonly derivedCache: DexieDerivedCacheRow;
  readonly importCursors: DexieImportCursorRow;
  readonly trackingSettings: StoredRevision<TrackingSettings>;
}

/** Browser preferences retain their original value and predecessor. */
export interface DexieTrackingSettingsRow {
  readonly id: string;
  readonly timestampUtc: string;
  readonly supersedesId?: string;
  readonly data: TrackingSettings;
}

/** Flatten every indexed path, omitting missing values that IndexedDB cannot index. */
export const DEXIE_ROW_MAPPERS: Readonly<{
  [K in keyof DexieStoreRows]: (
    value: DexieStoreInputs[K],
  ) => DexieStoreRows[K];
}> = Object.freeze({
  trackingSettings: ({
    value,
    supersedesId,
  }: StoredRevision<TrackingSettings>): DexieTrackingSettingsRow => ({
    id: value.id,
    timestampUtc: storageUtcIndex(value.timestamp.utc),
    ...(supersedesId === null ? {} : { supersedesId }),
    data: value,
  }),
  rawRecords: (record: RawRecord): DexieRawRecordRow => ({
    id: record.id,
    type: record.type,
    source: record.source,
    origin: record.origin,
    ...(record.externalId === null ? {} : { externalId: record.externalId }),
    lastModifiedUtc: storageUtcIndex(record.lastModifiedUtc),
    startUtc: storageUtcIndex(record.start.utc),
    endUtc: storageUtcIndex(record.end.utc),
    ...(record.keyAssignment === null
      ? {}
      : {
          dayKey: record.keyAssignment.key,
          boundaryMinutes: record.keyAssignment.boundaryMinutes,
        }),
    data: record,
  }),
  habitEntries: ({
    value,
    supersedesId,
  }: StoredRevision<HabitEntry>): DexieHabitRow => ({
    id: value.id,
    timestampUtc: storageUtcIndex(value.timestamp.utc),
    dayKey: value.keyAssignment.key,
    boundaryMinutes: value.keyAssignment.boundaryMinutes,
    ...(supersedesId === null ? {} : { supersedesId }),
    data: value,
  }),
  nights: ({ value, supersedesId }: StoredRevision<Night>): DexieNightRow => ({
    id: value.id,
    nightKey: value.keyAssignment.key,
    boundaryMinutes: value.keyAssignment.boundaryMinutes,
    ...(supersedesId === null ? {} : { supersedesId }),
    data: value,
  }),
  subjectiveReports: ({
    value,
    supersedesId,
  }: StoredRevision<SubjectiveReport>): DexieSubjectiveReportRow => ({
    id: value.id,
    timestampUtc: storageUtcIndex(value.timestamp.utc),
    nightKey: value.nightAssignment.key,
    boundaryMinutes: value.nightAssignment.boundaryMinutes,
    ...(supersedesId === null ? {} : { supersedesId }),
    data: value,
  }),
  sourceTombstones: (value: SourceTombstone): DexieTombstoneRow => ({
    ...value,
    observedAtUtc: storageUtcIndex(value.observedAtUtc),
    data: value,
  }),
  recordSelections: (value: StoredSelection): DexieSelectionRow => ({
    recordId: value.recordId,
    logicalSessionId: value.logicalSessionId,
    status: value.status,
    reason: value.reason,
    ...(value.supersededBy === null
      ? {}
      : { supersededBy: value.supersededBy }),
    selectedAtUtc: storageUtcIndex(value.selectedAtUtc),
    data: value,
  }),
  derivedCache: (value: DexieDerivedCacheRow): DexieDerivedCacheRow => value,
  importCursors: (value: DexieImportCursorRow): DexieImportCursorRow => ({
    ...value,
    updatedAtUtc: storageUtcIndex(value.updatedAtUtc),
  }),
});

/** IndexedDB cannot use SQLite triggers. A mirror must provide these transaction guarantees. */
export const STORAGE_CONTRACT = Object.freeze({
  version: 2,
  upgrade: Object.freeze({
    from: 1,
    to: 2,
    addedStores: Object.freeze(['trackingSettings']),
    retainExistingValues: true,
  }),
  immutableStores: Object.freeze([
    'rawRecords',
    'habitEntries',
    'nights',
    'subjectiveReports',
    'sourceTombstones',
    'trackingSettings',
  ]),
  mutableStores: Object.freeze([
    'recordSelections',
    'derivedCache',
    'importCursors',
  ]),
  importAtomicity: 'append-page-and-advance-cursor',
  importObservationKinds: Object.freeze(['upsert', 'tombstone']),
  rawConflict: 'reject-conflicting-id',
  historicalKeyChanges: 'append-explicit-revision',
  deletionObservation: 'append-tombstone',
  indexedUtcFractionDigits: 9,
  missingIndexedValues: 'omit-property',
  rawValueProperty: 'data',
} as const);
