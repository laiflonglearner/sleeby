/** Public catalog operations and constants. */
export {
  HEALTH_CATALOG_VERSION,
  HEALTH_CONNECT_SDK_VERSION,
  HEALTH_CATALOG,
  HEALTH_RECORD_TYPES,
} from './catalog.js';

/** Public catalog contracts. */
export type {
  HealthCategory,
  HealthUnit,
  RawView,
  HealthCatalogEntry,
} from './catalog.js';

/** Public constants operations and constants. */
export {
  MILLISECONDS_PER_MINUTE,
  MINUTES_PER_DAY,
  PLOT_ANCHOR_MINUTES,
  DEFAULT_DAY_BOUNDARY_MINUTES,
  MINIMUM_BINARY_GROUP_DAYS,
  MINIMUM_CONTINUOUS_DAYS,
  DUPLICATE_OVERLAP_FRACTION,
  MAXIMUM_STITCH_GAP_MS,
  DEFAULT_AWAKENING_THRESHOLD_MS,
  DEFAULT_NAP_THRESHOLD_MS,
  CORRELATION_WINDOWS,
  PRIMARY_SESSION_HISTORY_LIMIT,
} from './constants.js';

/** Public correlation operations and constants. */
export {
  CORRELATION_PAIRS,
  DEFAULT_WIDE_AWAKENING_INTERVAL_WIDTH,
  DEFAULT_WIDE_PEARSON_INTERVAL_WIDTH,
  outcomeFromReport,
  analyzeCorrelations,
} from './correlation.js';

/** Public correlation contracts. */
export type {
  CorrelationPairId,
  NightOutcome,
  CorrelationOptions,
  CorrelationMetadata,
  CorrelationResult,
} from './correlation.js';

/** Public downsampling operations and constants. */
export { downsampleLttb } from './downsampling.js';

/** Public downsampling contracts. */
export type { SeriesPoint } from './downsampling.js';

/** Public exporters operations and constants. */
export { EXPORT_SCHEMA_VERSION, dataExporter } from './exporters.js';

/** Public exporters contracts. */
export type {
  ExportEntry,
  RevisionLink,
  RecordSelectionTarget,
  RecordSelection,
  ExportEntries,
  RawExportOptions,
  AnonymizedExportOptions,
  ExportOptions,
  ExportObject,
  DataExporter,
} from './exporters.js';

/** Public intervals operations and constants. */
export {
  unionIntervals,
  unionDurationMilliseconds,
  overlapMilliseconds,
} from './intervals.js';

/** Public intervals contracts. */
export type { Interval } from './intervals.js';

/** Public metrics operations and constants. */
export {
  sleepStageState,
  asleepIntervals,
  deriveSleepMetrics,
  totalSleepMilliseconds,
  typicalBedtimeMinutes,
  detectNaps,
} from './metrics.js';

/** Public metrics contracts. */
export type {
  DerivedSleepState,
  SleepMetricsOptions,
  SleepMetrics,
  NapDetectionOptions,
  NapInterval,
  NapDetectionResult,
} from './metrics.js';

/** Public model contracts. */
export type {
  RecordedTimestamp,
  JsonValue,
  HealthPlatform,
  RecordingMethod,
  DeviceMetadata,
  MetricSample,
  PlatformCode,
  SleepStageType,
  SleepStage,
  SleepPayload,
  RecordText,
  ExerciseLocation,
  ExerciseSegment,
  ExerciseLap,
  ExercisePayload,
  ExerciseCompletionGoal,
  ExercisePerformanceTarget,
  PlannedExerciseStep,
  PlannedExerciseBlock,
  Nutrient,
  HealthPayloadMap,
  HealthRecordType,
  RawRecordBase,
  RawRecord,
  SleepRecord,
  SleepSession,
  Night,
  HabitEntry,
  SubjectiveReport,
  HealthReadRequest,
  HealthReadPage,
  SourceTombstone,
  HealthChange,
  HealthChangesPage,
  HealthSource,
} from './model.js';

/** Public reconciliation operations and constants. */
export {
  reconstructSleepSessions,
  reconcileSleepRecords,
  reconcileDenseSamples,
  reconcileAdditiveRecords,
} from './reconciliation.js';

/** Public reconciliation contracts. */
export type {
  OtherMetricCoverage,
  SleepSelection,
  ReconciliationOptions,
  OriginSample,
  DenseSampleSelection,
  OriginInterval,
  AdditiveSelection,
} from './reconciliation.js';

/** Public statistics operations and constants. */
export {
  CORRELATION_CONFIDENCE_LEVEL,
  pearsonCorrelation,
  pointBiserialCorrelation,
  fisherZConfidenceInterval,
  welchMeanDifference,
} from './statistics.js';

/** Public statistics contracts. */
export type {
  ConfidenceInterval,
  StatisticalUnavailableReason,
  StatisticalResult,
  WelchMeanDifference,
} from './statistics.js';

/** Public time operations and constants. */
export {
  instantNanoseconds,
  instantMilliseconds,
  normalizeUtcInstant,
  normalizeTimestamp,
  toRelativeSleepMinutes,
  localClockMinutes,
  dayBoundaryMinutes,
  assignDayKey,
  assignNightKey,
  assignNapKey,
  durationMilliseconds,
  durationMinutes,
} from './time.js';

/** Public time contracts. */
export type {
  TimeReference,
  Timestamp,
  KeyAssignment,
  ScheduleTarget,
} from './time.js';
