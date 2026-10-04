import { HEALTH_CATALOG_VERSION, HEALTH_RECORD_TYPES } from './catalog.js';
import { CORRELATION_PAIRS, type CorrelationResult } from './correlation.js';
import type {
  ExerciseCompletionGoal,
  ExercisePerformanceTarget,
  HabitEntry,
  HealthPayloadMap,
  HealthRecordType,
  JsonValue,
  MetricSample,
  Night,
  RawRecord,
  SourceTombstone,
  SubjectiveReport,
} from './model.js';
import type { SleepSelection } from './reconciliation.js';
import {
  instantMilliseconds,
  instantNanoseconds,
  toRelativeSleepMinutes,
  type KeyAssignment,
  type Timestamp,
} from './time.js';

/** Version of the JSON envelope and its reversible long-form CSV representation. */
export const EXPORT_SCHEMA_VERSION = 1 as const;

/** Immutable caller-owned entries; selections preserve suppressed history explicitly. */
export type ExportEntry =
  | Readonly<{ kind: 'record'; value: RawRecord }>
  | Readonly<{ kind: 'habit'; value: HabitEntry }>
  | Readonly<{ kind: 'night'; value: Night }>
  | Readonly<{ kind: 'report'; value: SubjectiveReport }>
  | Readonly<{ kind: 'selection'; value: SleepSelection }>
  | Readonly<{ kind: 'record-selection'; value: RecordSelection }>
  | Readonly<{ kind: 'tombstone'; value: SourceTombstone }>
  | Readonly<{ kind: 'revision'; value: RevisionLink }>
  | Readonly<{ kind: 'correlation'; value: CorrelationResult }>;

/** Immutable user-entry lineage accompanies all snapshots, preserving revision authority. */
export interface RevisionLink {
  readonly entity: 'habit' | 'night' | 'report';
  readonly id: string;
  readonly supersedesId: string | null;
}

/** Dense selections can address a sample; additive selections address a whole record. */
export interface RecordSelectionTarget {
  readonly recordId: string;
  readonly sampleField?: 'samples' | 'deltas';
  readonly sampleIndex?: number;
}

/** Reversible dense/additive flags retain their explicitly scoped UTC window. */
export type RecordSelection = Readonly<{
  target: RecordSelectionTarget;
  window: Readonly<{ startUtc: string; endUtc: string }>;
  reason:
    | 'unique'
    | 'density'
    | 'coverage'
    | 'identical-timestamp'
    | 'user-selection';
}> &
  (
    | Readonly<{ status: 'primary'; supersededBy: null }>
    | Readonly<{ status: 'suppressed'; supersededBy: RecordSelectionTarget }>
  );

/** A bounded cursor or page iterator, with no requirement to materialize history. */
export type ExportEntries = Iterable<ExportEntry> | AsyncIterable<ExportEntry>;

/** Raw output retains every supplied value, including original platform payloads. */
export interface RawExportOptions {
  readonly mode: 'raw';
  /** Maximum characters per JSON chunk or raw-payload CSV fragment, at least 64. */
  readonly chunkCharacters?: number;
}

/** Baselines are supplied by storage's metadata query and are never written to output. */
export interface AnonymizedExportOptions {
  readonly mode: 'anonymized';
  readonly baselineUtc: string;
  readonly baselineDayKey: string;
  readonly chunkCharacters?: number;
}

/** Export mode is explicit; anonymous output cannot accidentally use a default baseline. */
export type ExportOptions = RawExportOptions | AnonymizedExportOptions;

/** JSON-compatible allowlisted object, with no opaque native fields. */
export interface ExportObject {
  readonly [key: string]: JsonValue;
}

/** Versioned output contract; implementations perform no file or storage access. */
export interface DataExporter {
  json(entries: ExportEntries, options: ExportOptions): AsyncIterable<string>;
  csv(entries: ExportEntries, options: ExportOptions): AsyncIterable<string>;
}

interface Context {
  readonly options: ExportOptions;
  readonly baselineInstant: bigint;
  readonly baselineDay: number;
  readonly ordinals: Map<string, number>;
  readonly defined: Set<string>;
  readonly referenced: Set<string>;
  readonly recordSamples: Map<
    string,
    { readonly field: 'samples' | 'deltas'; readonly count: number } | null
  >;
  readonly requestedSamples: Map<
    string,
    {
      readonly recordId: string;
      readonly field: 'samples' | 'deltas';
      readonly maximumIndex: number;
    }
  >;
}

const DEFAULT_CHUNK_CHARACTERS = 16_384;
const MILLISECONDS_PER_CALENDAR_DAY = 86_400_000;
const STAGES = [
  'UNKNOWN',
  'AWAKE',
  'SLEEPING',
  'OUT_OF_BED',
  'LIGHT',
  'DEEP',
  'REM',
  'AWAKE_IN_BED',
] as const;
const NUTRIENTS = [
  'biotin',
  'caffeine',
  'calcium',
  'chloride',
  'cholesterol',
  'chromium',
  'copper',
  'dietaryFiber',
  'folate',
  'folicAcid',
  'iodine',
  'iron',
  'magnesium',
  'manganese',
  'molybdenum',
  'monounsaturatedFat',
  'niacin',
  'pantothenicAcid',
  'phosphorus',
  'polyunsaturatedFat',
  'potassium',
  'protein',
  'riboflavin',
  'saturatedFat',
  'selenium',
  'sodium',
  'sugar',
  'thiamin',
  'totalCarbohydrate',
  'totalFat',
  'transFat',
  'unsaturatedFat',
  'vitaminA',
  'vitaminB12',
  'vitaminB6',
  'vitaminC',
  'vitaminD',
  'vitaminE',
  'vitaminK',
  'zinc',
] as const satisfies readonly (keyof HealthPayloadMap['nutrition']['nutrientsGrams'])[];

// Each key is checked against its payload type; additions to the catalog require an explicit privacy projection.
const SCALAR_FIELDS = {
  activeCaloriesBurned: ['kilocalories'],
  basalBodyTemperature: ['celsius', 'measurementLocation'],
  basalMetabolicRate: ['watts'],
  bloodGlucose: [
    'millimolesPerLiter',
    'specimenSource',
    'mealType',
    'relationToMeal',
  ],
  bloodPressure: [
    'systolicMillimetersMercury',
    'diastolicMillimetersMercury',
    'bodyPosition',
    'measurementLocation',
  ],
  bodyFat: ['percent'],
  bodyTemperature: ['celsius', 'measurementLocation'],
  bodyWaterMass: ['kilograms'],
  boneMass: ['kilograms'],
  cervicalMucus: ['appearance', 'sensation'],
  cyclingPedalingCadence: [],
  distance: ['meters'],
  elevationGained: ['meters'],
  exerciseSession: ['exerciseType'],
  floorsClimbed: ['floors'],
  heartRate: [],
  heartRateVariabilityRmssd: ['milliseconds'],
  height: ['meters'],
  hydration: ['liters'],
  intermenstrualBleeding: ['present'],
  leanBodyMass: ['kilograms'],
  menstruationFlow: ['flow'],
  menstruationPeriod: ['present'],
  mindfulnessSession: ['mindfulnessSessionType'],
  nutrition: ['energyKilocalories', 'energyFromFatKilocalories', 'mealType'],
  ovulationTest: ['result'],
  oxygenSaturation: ['percent'],
  plannedExerciseSession: ['hasExplicitTime', 'exerciseType'],
  power: [],
  respiratoryRate: ['breathsPerMinute'],
  restingHeartRate: ['beatsPerMinute'],
  sexualActivity: ['protectionUsed'],
  skinTemperature: ['baselineCelsius', 'measurementLocation'],
  sleepSession: [],
  speed: [],
  stepsCadence: [],
  steps: ['count'],
  totalCaloriesBurned: ['kilocalories'],
  vo2Max: ['millilitersPerMinuteKilogram', 'measurementMethod'],
  weight: ['kilograms'],
  wheelchairPushes: ['count'],
} as const satisfies {
  readonly [K in HealthRecordType]: readonly (keyof HealthPayloadMap[K])[];
};

function calendarDay(key: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key))
    throw new RangeError('invalid-export-day-key');
  return instantMilliseconds(`${key}T00:00:00Z`);
}

function context(options: ExportOptions): Context {
  knownCode(options.mode, ['raw', 'anonymized']);
  const characters = options.chunkCharacters ?? DEFAULT_CHUNK_CHARACTERS;
  if (!Number.isInteger(characters) || characters < 64)
    throw new RangeError('invalid-export-chunk-size');
  return {
    options,
    baselineInstant:
      options.mode === 'anonymized'
        ? instantNanoseconds(options.baselineUtc)
        : 0n,
    baselineDay:
      options.mode === 'anonymized' ? calendarDay(options.baselineDayKey) : 0,
    ordinals: new Map(),
    defined: new Set(),
    referenced: new Set(),
    recordSamples: new Map(),
    requestedSamples: new Map(),
  };
}

function ordinal(
  c: Context,
  namespace: string,
  id: string,
  definition = false,
): number {
  const key = `${namespace}:${id}`;
  if (definition) {
    if (c.defined.has(key)) throw new RangeError('duplicate-export-identifier');
    c.defined.add(key);
  } else c.referenced.add(key);
  let value = c.ordinals.get(key);
  if (value === undefined) {
    value = c.ordinals.size;
    c.ordinals.set(key, value);
  }
  return value;
}

function assertReferences(c: Context): void {
  for (const key of c.referenced)
    if (!c.defined.has(key))
      throw new RangeError('incomplete-export-reference');
  for (const request of c.requestedSamples.values()) {
    const samples = c.recordSamples.get(request.recordId);
    if (
      !samples ||
      samples.field !== request.field ||
      request.maximumIndex >= samples.count
    )
      throw new RangeError('invalid-export-sample-reference');
  }
}

function defineRecord(c: Context, record: RawRecord): number {
  const dense = series(record);
  c.recordSamples.set(
    record.id,
    dense === null ? null : { field: dense.field, count: dense.values.length },
  );
  return ordinal(c, 'record', record.id, true);
}

function anonymousNumber(value: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value))
    throw new RangeError('invalid-anonymized-number');
  return value;
}

function numericFields(
  value: object,
  fields: readonly string[],
): Record<string, JsonValue> {
  const source = value as Record<string, unknown>;
  const result: Record<string, JsonValue> = {};
  for (const key of fields) {
    const item = source[key];
    if (item === undefined) continue;
    if (typeof item !== 'number' && typeof item !== 'boolean')
      throw new RangeError('invalid-anonymized-numeric-field');
    result[key] = item;
  }
  return result;
}

function knownCode<T extends string>(value: string, allowed: readonly T[]): T {
  const code = allowed.find((item) => item === value);
  if (code === undefined) throw new RangeError('invalid-anonymized-code');
  return code;
}

function relativeTimestamp(
  c: Context,
  timestamp: {
    readonly utc: string;
    readonly reference: Timestamp['reference'] | null;
  },
): ExportObject {
  return {
    elapsedMilliseconds:
      Number(instantNanoseconds(timestamp.utc) - c.baselineInstant) / 1_000_000,
    localPlotMinutes:
      timestamp.reference === null
        ? null
        : toRelativeSleepMinutes({
            utc: timestamp.utc,
            reference: timestamp.reference,
          }),
  };
}

function relativeKey(
  c: Context,
  assignment: KeyAssignment | null,
): ExportObject | null {
  return assignment === null
    ? null
    : {
        dayOffset:
          (calendarDay(assignment.key) - c.baselineDay) /
          MILLISECONDS_PER_CALENDAR_DAY,
        boundaryMinutes: anonymousNumber(assignment.boundaryMinutes),
      };
}

function relativeInterval(
  c: Context,
  interval: { readonly startUtc: string; readonly endUtc: string },
): ExportObject {
  return {
    startElapsedMilliseconds:
      Number(instantNanoseconds(interval.startUtc) - c.baselineInstant) /
      1_000_000,
    endElapsedMilliseconds:
      Number(instantNanoseconds(interval.endUtc) - c.baselineInstant) /
      1_000_000,
  };
}

function anonymousTarget(
  c: Context,
  value: RecordSelectionTarget,
): ExportObject {
  if (
    value.sampleIndex !== undefined &&
    (!Number.isInteger(value.sampleIndex) || value.sampleIndex < 0)
  )
    throw new RangeError('invalid-export-sample-index');
  if ((value.sampleField === undefined) !== (value.sampleIndex === undefined))
    throw new RangeError('incomplete-export-sample-reference');
  if (value.sampleField !== undefined) {
    const field = knownCode(value.sampleField, ['samples', 'deltas']);
    const key = `${value.recordId}:${field}`;
    c.requestedSamples.set(key, {
      recordId: value.recordId,
      field,
      maximumIndex: Math.max(
        value.sampleIndex!,
        c.requestedSamples.get(key)?.maximumIndex ?? -1,
      ),
    });
  }
  return {
    recordOrdinal: ordinal(c, 'record', value.recordId),
    ...(value.sampleField === undefined
      ? {}
      : {
          sampleField: knownCode(value.sampleField, ['samples', 'deltas']),
          sampleIndex: value.sampleIndex!,
        }),
  };
}

function goal(value: ExerciseCompletionGoal): ExportObject {
  const kind = knownCode(value.kind, [
    'distance',
    'distance-duration',
    'duration',
    'steps',
    'repetitions',
    'total-calories',
    'active-calories',
    'unknown',
    'manual-completion',
  ] satisfies readonly ExerciseCompletionGoal['kind'][]);
  const fields =
    kind === 'distance'
      ? ['meters']
      : kind === 'distance-duration'
        ? ['meters', 'milliseconds']
        : kind === 'duration'
          ? ['milliseconds']
          : kind === 'steps' || kind === 'repetitions'
            ? ['count']
            : kind === 'total-calories' || kind === 'active-calories'
              ? ['kilocalories']
              : [];
  return { kind, ...numericFields(value, fields) };
}

function target(value: ExercisePerformanceTarget): ExportObject {
  const kind = knownCode(value.kind, [
    'power',
    'speed',
    'cadence',
    'heart-rate',
    'weight',
    'perceived-exertion',
    'unknown',
    'amrap',
  ]);
  const fields =
    kind === 'weight'
      ? ['kilograms']
      : kind === 'perceived-exertion'
        ? ['rating']
        : kind === 'unknown' || kind === 'amrap'
          ? []
          : ['minimum', 'maximum'];
  return { kind, ...numericFields(value, fields) };
}

function sample(c: Context, value: MetricSample): ExportObject {
  return {
    timestamp: relativeTimestamp(c, value.timestamp),
    value: anonymousNumber(value.value),
  };
}

function* mapped<T>(
  values: readonly T[],
  project: (value: T) => unknown,
): Generator<unknown> {
  for (const value of values) yield project(value);
}

function anonymousPayload(
  c: Context,
  record: RawRecord,
  includeSamples = true,
): Record<string, unknown> {
  const result: Record<string, unknown> = numericFields(
    record.payload,
    SCALAR_FIELDS[record.type],
  );
  switch (record.type) {
    case 'cyclingPedalingCadence':
    case 'heartRate':
    case 'power':
    case 'speed':
    case 'stepsCadence':
      if (includeSamples)
        result['samples'] = mapped(record.payload.samples, (value) =>
          sample(c, value),
        );
      break;
    case 'skinTemperature':
      if (includeSamples)
        result['deltas'] = mapped(record.payload.deltas, (value) =>
          sample(c, value),
        );
      break;
    case 'sleepSession':
      result['stages'] = record.payload.stages.map((value) => ({
        ...relativeInterval(c, value),
        stage: knownCode(value.stage, STAGES),
      }));
      break;
    case 'exerciseSession':
      result['segments'] = record.payload.segments.map((value) => ({
        ...relativeInterval(c, value),
        ...numericFields(value, ['segmentType', 'repetitions']),
      }));
      result['laps'] = record.payload.laps.map((value) => ({
        ...relativeInterval(c, value),
        ...numericFields(value, ['lengthMeters']),
      }));
      break;
    case 'plannedExerciseSession':
      result['blocks'] = record.payload.blocks.map((block) => ({
        repetitions: anonymousNumber(block.repetitions),
        steps: block.steps.map((step) => ({
          exerciseType: anonymousNumber(step.exerciseType),
          exercisePhase: anonymousNumber(step.exercisePhase),
          completionGoal: goal(step.completionGoal),
          performanceTargets: step.performanceTargets.map(target),
        })),
      }));
      break;
    case 'nutrition':
      result['nutrientsGrams'] = numericFields(
        record.payload.nutrientsGrams,
        NUTRIENTS,
      );
      break;
  }
  return result;
}

function anonymize(
  c: Context,
  entry: ExportEntry,
  includeSamples = true,
): Record<string, unknown> {
  switch (entry.kind) {
    case 'tombstone': {
      const tombstone = entry.value;
      return {
        ordinal: ordinal(c, 'tombstone', tombstone.id, true),
        observedElapsedMilliseconds:
          Number(
            instantNanoseconds(tombstone.observedAtUtc) - c.baselineInstant,
          ) / 1_000_000,
      };
    }
    case 'revision': {
      const revision = entry.value;
      const entity = knownCode(revision.entity, ['habit', 'night', 'report']);
      return {
        entity,
        ordinal: ordinal(c, entity, revision.id),
        supersedesOrdinal:
          revision.supersedesId === null
            ? null
            : ordinal(c, entity, revision.supersedesId),
      };
    }
    case 'record': {
      const record = entry.value;
      if (!HEALTH_RECORD_TYPES.includes(record.type))
        throw new RangeError('unknown-export-record-type');
      return {
        ordinal: defineRecord(c, record),
        type: record.type,
        start: relativeTimestamp(c, record.start),
        end: relativeTimestamp(c, record.end),
        keyAssignment: relativeKey(c, record.keyAssignment),
        payload: anonymousPayload(c, record, includeSamples),
      };
    }
    case 'habit': {
      const habit = entry.value;
      return {
        ordinal: ordinal(c, 'habit', habit.id, true),
        timestamp: relativeTimestamp(c, habit.timestamp),
        keyAssignment: relativeKey(c, habit.keyAssignment),
        monitoring: knownCode(habit.monitoring, [
          'tracked',
          'rest',
          'unmonitored',
        ]),
        ...numericFields(habit, [
          'morningSunlightMinutes',
          'afternoonSunlightMinutes',
          'movementCompleted',
          'movementMinutes',
          'screenFreeMinutes',
        ]),
        ...(habit.lastMeal === undefined
          ? {}
          : { lastMeal: relativeTimestamp(c, habit.lastMeal) }),
        ...(habit.lastCaffeine === undefined
          ? {}
          : { lastCaffeine: relativeTimestamp(c, habit.lastCaffeine) }),
      };
    }
    case 'report': {
      const report = entry.value;
      return {
        ordinal: ordinal(c, 'report', report.id, true),
        timestamp: relativeTimestamp(c, report.timestamp),
        nightAssignment: relativeKey(c, report.nightAssignment),
        ...numericFields(report, [
          'morningEnergy',
          'mood',
          'restfulness',
          'awakeningCount',
        ]),
      };
    }
    case 'night': {
      const night = entry.value;
      return {
        ordinal: ordinal(c, 'night', night.id, true),
        keyAssignment: relativeKey(c, night.keyAssignment),
        primarySessionOrdinal: ordinal(c, 'session', night.primarySessionId),
        sessionOrdinals: night.sessionIds.map((id) =>
          ordinal(c, 'session', id),
        ),
      };
    }
    case 'selection': {
      const selection = entry.value;
      return {
        ordinal: ordinal(c, 'session', selection.session.id, true),
        start: relativeTimestamp(c, selection.session.start),
        end: relativeTimestamp(c, selection.session.end),
        recordOrdinals: selection.session.records.map((record) =>
          ordinal(c, 'record', record.id),
        ),
        status: knownCode(selection.status, ['primary', 'suppressed']),
        supersededByOrdinal:
          selection.supersededBy === null
            ? null
            : ordinal(c, 'session', selection.supersededBy),
        reason: knownCode(selection.reason, [
          'unique',
          'information-richness',
          'user-selection',
          'duplicate',
        ]),
        stages: selection.session.stages.map((stage) => ({
          ...relativeInterval(c, stage),
          stage: knownCode(stage.stage, STAGES),
        })),
      };
    }
    case 'correlation': {
      const correlation = entry.value;
      const metadata = {
        pair: knownCode(
          correlation.pair,
          CORRELATION_PAIRS.map((pair) => pair.id),
        ),
        startNightDayOffset:
          (calendarDay(correlation.startNightKey) - c.baselineDay) /
          MILLISECONDS_PER_CALENDAR_DAY,
        endNightDayOffset:
          (calendarDay(correlation.endNightKey) - c.baselineDay) /
          MILLISECONDS_PER_CALENDAR_DAY,
        ...numericFields(correlation, [
          'windowDays',
          'sampleSize',
          'medianCutoffMinute',
        ]),
        ...(correlation.groupSizes === undefined
          ? {}
          : { groupSizes: correlation.groupSizes.map(anonymousNumber) }),
      };
      if (correlation.status === 'insufficient-data')
        return { ...metadata, status: 'insufficient-data' };
      if (correlation.status === 'unavailable')
        return {
          ...metadata,
          status: 'unavailable',
          reason: knownCode(correlation.reason, [
            'insufficient-observations',
            'mismatched-observations',
            'non-finite-observation',
            'constant-variable',
            'invalid-binary-predictor',
            'invalid-correlation',
            'numerical-failure',
          ]),
          ...(correlation.method === 'point-biserial'
            ? {
                method: 'point-biserial',
                coefficient: anonymousNumber(correlation.coefficient),
              }
            : {}),
        };
      return {
        ...metadata,
        status: 'computed',
        method: knownCode(correlation.method, ['pearson', 'point-biserial']),
        ...numericFields(correlation, [
          'coefficient',
          'difference',
          'intervalWide',
        ]),
        confidenceInterval: numericFields(correlation.confidenceInterval, [
          'lower',
          'upper',
          'confidenceLevel',
        ]),
        ...(correlation.method === 'point-biserial'
          ? { groupMeans: correlation.groupMeans.map(anonymousNumber) }
          : {}),
      };
    }
    case 'record-selection': {
      const selection = entry.value;
      return {
        target: anonymousTarget(c, selection.target),
        window: relativeInterval(c, selection.window),
        status: knownCode(selection.status, ['primary', 'suppressed']),
        supersededBy:
          selection.supersededBy === null
            ? null
            : anonymousTarget(c, selection.supersededBy),
        reason: knownCode(selection.reason, [
          'unique',
          'density',
          'coverage',
          'identical-timestamp',
          'user-selection',
        ]),
      };
    }
  }
}

function* jsonTokens(value: unknown): Generator<string> {
  if (value === null) {
    yield 'null';
    return;
  }
  if (typeof value === 'number' && !Number.isFinite(value))
    throw new RangeError('non-finite-export-value');
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    yield JSON.stringify(value);
    return;
  }
  if (
    Array.isArray(value) ||
    (typeof value === 'object' && Symbol.iterator in value)
  ) {
    yield '[';
    let first = true;
    for (const item of value as Iterable<unknown>) {
      if (!first) yield ',';
      first = false;
      yield* jsonTokens(item);
    }
    yield ']';
    return;
  }
  if (typeof value === 'object') {
    yield '{';
    let first = true;
    for (const [key, item] of Object.entries(value)) {
      if (item === undefined) continue;
      if (!first) yield ',';
      first = false;
      yield JSON.stringify(key);
      yield ':';
      yield* jsonTokens(item);
    }
    yield '}';
    return;
  }
  throw new RangeError('invalid-export-json-value');
}

function* chunks(tokens: Iterable<string>, maximum: number): Generator<string> {
  let pending = '';
  for (const token of tokens) {
    let offset = 0;
    while (offset < token.length) {
      const remaining = maximum - pending.length;
      let end = Math.min(offset + remaining, token.length);
      // Each chunk must survive UTF-8 encoding without splitting a surrogate pair.
      const last = token.charCodeAt(end - 1);
      const next = token.charCodeAt(end);
      if (last >= 0xd800 && last <= 0xdbff && next >= 0xdc00 && next <= 0xdfff)
        end -= 1;
      pending += token.slice(offset, end);
      offset = end;
      if (pending.length === maximum || end < token.length) {
        yield pending;
        pending = '';
      }
    }
  }
  if (pending) yield pending;
}

function validateEntryKind(entry: ExportEntry): void {
  knownCode(entry.kind, [
    'record',
    'habit',
    'night',
    'report',
    'selection',
    'record-selection',
    'correlation',
    'tombstone',
    'revision',
  ]);
}

function trackLineageReferences(c: Context, entry: ExportEntry): void {
  switch (entry.kind) {
    case 'tombstone':
      ordinal(c, 'tombstone', entry.value.id, true);
      break;
    case 'habit':
    case 'night':
    case 'report':
      ordinal(c, entry.kind, entry.value.id, true);
      break;
    case 'revision': {
      const entity = knownCode(entry.value.entity, [
        'habit',
        'night',
        'report',
      ]);
      ordinal(c, entity, entry.value.id);
      if (entry.value.supersedesId !== null)
        ordinal(c, entity, entry.value.supersedesId);
      break;
    }
  }
}

function trackCsvReferences(c: Context, entry: ExportEntry): void {
  trackLineageReferences(c, entry);
  switch (entry.kind) {
    case 'record':
      defineRecord(c, entry.value);
      break;
    case 'selection':
      ordinal(c, 'session', entry.value.session.id, true);
      for (const record of entry.value.session.records)
        ordinal(c, 'record', record.id);
      if (entry.value.supersededBy !== null)
        ordinal(c, 'session', entry.value.supersededBy);
      break;
    case 'night':
      ordinal(c, 'session', entry.value.primarySessionId);
      for (const id of entry.value.sessionIds) ordinal(c, 'session', id);
      break;
    case 'record-selection':
      anonymousTarget(c, entry.value.target);
      if (entry.value.supersededBy !== null)
        anonymousTarget(c, entry.value.supersededBy);
      break;
  }
}

/**
 * Streams a versioned JSON envelope while retaining every supplied raw entry.
 *
 * @remarks Memory is bounded by the caller's current entry, the largest encoded scalar, and the chunk size. Anonymized reference bookkeeping retains only identifiers and ordinals, not records or samples. Consumers must discard incomplete output if iteration rejects. Anonymous baselines come from a metadata query, so this function never reads history twice. No re-identification resistance beyond the documented removals is claimed.
 */
export async function* exportJson(
  entries: ExportEntries,
  options: ExportOptions,
): AsyncGenerator<string> {
  const c = context(options);
  const maximum = options.chunkCharacters ?? DEFAULT_CHUNK_CHARACTERS;
  yield* chunks(
    [
      `{"schemaVersion":${EXPORT_SCHEMA_VERSION},"catalogVersion":${HEALTH_CATALOG_VERSION},"mode":"${options.mode}","pairDefinitions":${JSON.stringify(CORRELATION_PAIRS)},"entries":[`,
    ],
    maximum,
  );
  let first = true;
  for await (const entry of entries) {
    validateEntryKind(entry);
    if (options.mode === 'raw') trackLineageReferences(c, entry);
    if (!first) yield ',';
    first = false;
    const value = options.mode === 'raw' ? entry.value : anonymize(c, entry);
    yield* chunks(jsonTokens({ kind: entry.kind, value }), maximum);
  }
  assertReferences(c);
  yield ']}';
}

function csvRow(
  mode: ExportOptions['mode'],
  kind: string,
  value: unknown,
): string {
  // Arbitrary text stays inside an object cell starting with '{', never a formula-leading cell.
  let payload = '';
  for (const token of jsonTokens(value)) payload += token;
  return `${EXPORT_SCHEMA_VERSION},${mode},${kind},"${payload.replaceAll('"', '""')}"\r\n`;
}

function series(
  record: RawRecord,
): { field: 'samples' | 'deltas'; values: readonly MetricSample[] } | null {
  switch (record.type) {
    case 'cyclingPedalingCadence':
    case 'heartRate':
    case 'power':
    case 'speed':
    case 'stepsCadence':
      return { field: 'samples', values: record.payload.samples };
    case 'skinTemperature':
      return { field: 'deltas', values: record.payload.deltas };
    default:
      return null;
  }
}

/**
 * Streams RFC 4180 CSV with columns schema_version,mode,kind,payload_json.
 *
 * @remarks The manifest fixes catalog and format versions. Raw record rows omit rawPayload and normalized sample arrays, describing their reconstruction with rawPayloadEncoding and sampleField/sampleCount. Concatenate ordered raw-payload fragments per record to restore rawPayload, and append sample rows in index order to restore its normalized sample field. Other entry kinds preserve their JSON value exactly. Raw selections reference their supplied record IDs instead of repeating complete raw records. Every untrusted scalar is nested inside a JSON object cell, preventing spreadsheet formula injection without changing the original value. Anonymous CSV entries use the same allowlist and reference ordinals as JSON.
 */
export async function* exportCsv(
  entries: ExportEntries,
  options: ExportOptions,
): AsyncGenerator<string> {
  const c = context(options);
  yield 'schema_version,mode,kind,payload_json\r\n';
  yield csvRow(options.mode, 'manifest', {
    catalogVersion: HEALTH_CATALOG_VERSION,
    format: 'sleeby-long-form-v1',
    pairDefinitions: CORRELATION_PAIRS,
  });
  for await (const entry of entries) {
    validateEntryKind(entry);
    if (options.mode === 'anonymized') {
      const value = anonymize(c, entry, false);
      const dense = entry.kind === 'record' ? series(entry.value) : null;
      yield csvRow(options.mode, entry.kind, {
        ...value,
        ...(dense === null
          ? {}
          : { sampleField: dense.field, sampleCount: dense.values.length }),
      });
      if (dense)
        for (const [index, item] of dense.values.entries())
          yield csvRow(options.mode, 'sample', {
            recordOrdinal: value['ordinal'],
            field: dense.field,
            index,
            value: sample(c, item),
          });
      continue;
    }
    trackCsvReferences(c, entry);
    if (entry.kind === 'record') {
      const record = entry.value;
      const dense = series(record);
      const { rawPayload, payload, ...metadata } = record;
      const projected = Object.fromEntries(
        Object.entries(payload).filter(([field]) => field !== dense?.field),
      );
      yield csvRow('raw', 'record', {
        ...metadata,
        payload: projected,
        rawPayloadEncoding: 'json-fragments',
        ...(dense === null
          ? {}
          : { sampleField: dense.field, sampleCount: dense.values.length }),
      });
      let index = 0;
      for (const fragment of chunks(
        jsonTokens(rawPayload),
        options.chunkCharacters ?? DEFAULT_CHUNK_CHARACTERS,
      )) {
        yield csvRow('raw', 'raw-payload', {
          recordId: record.id,
          index,
          fragment,
        });
        index += 1;
      }
      if (dense)
        for (const [sampleIndex, item] of dense.values.entries())
          yield csvRow('raw', 'sample', {
            recordId: record.id,
            field: dense.field,
            index: sampleIndex,
            value: item,
          });
    } else if (entry.kind === 'selection') {
      const { records, ...session } = entry.value.session;
      yield csvRow('raw', 'selection', {
        ...entry.value,
        session: { ...session, recordIds: records.map((record) => record.id) },
      });
    } else yield csvRow('raw', entry.kind, entry.value);
  }
  assertReferences(c);
}

/** Frozen storage-free implementation of both export formats. */
export const dataExporter: DataExporter = Object.freeze({
  json: exportJson,
  csv: exportCsv,
});
