import type { Interval } from './intervals.js';
import type { KeyAssignment, Timestamp, TimeReference } from './time.js';

/** Platform offsets may be absent. Local keys require an explicit fallback reference. */
export interface RecordedTimestamp {
  readonly utc: string;
  readonly reference: TimeReference | null;
}

/** JSON-compatible immutable original platform data, retained without projection. */
export type JsonValue =
  | null
  | boolean
  | number
  | string
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

/** Platform provenance, distinct from the application that originally wrote a record. */
export type HealthPlatform = 'health-connect' | 'healthkit' | 'manual';

/** Recording intent preserved from platform metadata. */
export type RecordingMethod = 'unknown' | 'automatic' | 'active' | 'manual';

/** Device metadata, never used to assign a sleep score or infer a diagnosis. */
export interface DeviceMetadata {
  readonly manufacturer: string | null;
  readonly model: string | null;
  readonly type: number;
  readonly identifier: string | null;
}

/** A normalized sample retains its own instant and the entry-time reference. */
export interface MetricSample {
  readonly timestamp: RecordedTimestamp;
  readonly value: number;
}

/** Platform numeric enumerations are preserved, including future unknown values. */
export type PlatformCode = number;

/** Every Health Connect 1.1.0 stage, retained individually in raw records. */
export type SleepStageType =
  | 'UNKNOWN'
  | 'AWAKE'
  | 'SLEEPING'
  | 'OUT_OF_BED'
  | 'LIGHT'
  | 'DEEP'
  | 'REM'
  | 'AWAKE_IN_BED';

/** A device-estimated stage with UTC boundaries. */
export interface SleepStage extends Interval {
  readonly stage: SleepStageType;
}

/** Immutable sleep payload, with no derived or reconciled fields. */
export interface SleepPayload {
  readonly stages: readonly SleepStage[];
  readonly title?: string;
  readonly notes?: string;
}

/** Optional free text remains available in raw mode and is omitted in anonymized mode. */
export interface RecordText {
  readonly title?: string;
  readonly notes?: string;
}

/** A route sample, retained for raw export and excluded from anonymized output. */
export interface ExerciseLocation {
  readonly timestamp: RecordedTimestamp;
  readonly latitude: number;
  readonly longitude: number;
  readonly horizontalAccuracyMeters?: number;
  readonly verticalAccuracyMeters?: number;
  readonly altitudeMeters?: number;
}

/** A native exercise segment with its platform activity code. */
export interface ExerciseSegment extends Interval {
  readonly segmentType: PlatformCode;
  readonly repetitions: number;
}

/** Native exercise lap boundaries and optional measured length. */
export interface ExerciseLap extends Interval {
  readonly lengthMeters?: number;
}

/** Stable Health Connect exercise data, including separately consented routes. */
export interface ExercisePayload extends RecordText {
  readonly exerciseType: PlatformCode;
  readonly segments: readonly ExerciseSegment[];
  readonly laps: readonly ExerciseLap[];
  readonly route:
    | Readonly<{ status: 'available'; locations: readonly ExerciseLocation[] }>
    | Readonly<{ status: 'no-data' | 'consent-required' }>;
  readonly plannedExerciseSessionId?: string;
}

/** Typed completion goal, using canonical units without discarding native raw values. */
export type ExerciseCompletionGoal =
  | Readonly<{ kind: 'distance'; meters: number }>
  | Readonly<{
      kind: 'distance-duration';
      meters: number;
      milliseconds: number;
    }>
  | Readonly<{ kind: 'duration'; milliseconds: number }>
  | Readonly<{ kind: 'steps' | 'repetitions'; count: number }>
  | Readonly<{
      kind: 'total-calories' | 'active-calories';
      kilocalories: number;
    }>
  | Readonly<{ kind: 'unknown' | 'manual-completion' }>;

/** Typed performance constraint from the stable planned-exercise API. */
export type ExercisePerformanceTarget =
  | Readonly<{
      kind: 'power' | 'speed' | 'cadence' | 'heart-rate';
      minimum: number;
      maximum: number;
    }>
  | Readonly<{ kind: 'weight'; kilograms: number }>
  | Readonly<{ kind: 'perceived-exertion'; rating: number }>
  | Readonly<{ kind: 'unknown' | 'amrap' }>;

/** Planned exercise step retaining platform exercise and phase codes. */
export interface PlannedExerciseStep {
  readonly exerciseType: PlatformCode;
  readonly exercisePhase: PlatformCode;
  readonly completionGoal: ExerciseCompletionGoal;
  readonly performanceTargets: readonly ExercisePerformanceTarget[];
  readonly description?: string;
}

/** A repeating planned block, not a completed exercise measurement. */
export interface PlannedExerciseBlock {
  readonly repetitions: number;
  readonly steps: readonly PlannedExerciseStep[];
  readonly description?: string;
}

/** Stable SDK nutrient names. All nutrient masses are normalized to grams. */
export type Nutrient =
  | 'biotin'
  | 'caffeine'
  | 'calcium'
  | 'chloride'
  | 'cholesterol'
  | 'chromium'
  | 'copper'
  | 'dietaryFiber'
  | 'folate'
  | 'folicAcid'
  | 'iodine'
  | 'iron'
  | 'magnesium'
  | 'manganese'
  | 'molybdenum'
  | 'monounsaturatedFat'
  | 'niacin'
  | 'pantothenicAcid'
  | 'phosphorus'
  | 'polyunsaturatedFat'
  | 'potassium'
  | 'protein'
  | 'riboflavin'
  | 'saturatedFat'
  | 'selenium'
  | 'sodium'
  | 'sugar'
  | 'thiamin'
  | 'totalCarbohydrate'
  | 'totalFat'
  | 'transFat'
  | 'unsaturatedFat'
  | 'vitaminA'
  | 'vitaminB12'
  | 'vitaminB6'
  | 'vitaminC'
  | 'vitaminD'
  | 'vitaminE'
  | 'vitaminK'
  | 'zinc';

/** Typed payload for every concrete health Record in the stable SDK 1.1.0 artifact. */
export interface HealthPayloadMap {
  readonly activeCaloriesBurned: Readonly<{ kilocalories: number }>;
  readonly basalBodyTemperature: Readonly<{
    celsius: number;
    measurementLocation: PlatformCode;
  }>;
  readonly basalMetabolicRate: Readonly<{ watts: number }>;
  readonly bloodGlucose: Readonly<{
    millimolesPerLiter: number;
    specimenSource: PlatformCode;
    mealType: PlatformCode;
    relationToMeal: PlatformCode;
  }>;
  readonly bloodPressure: Readonly<{
    systolicMillimetersMercury: number;
    diastolicMillimetersMercury: number;
    bodyPosition: PlatformCode;
    measurementLocation: PlatformCode;
  }>;
  readonly bodyFat: Readonly<{ percent: number }>;
  readonly bodyTemperature: Readonly<{
    celsius: number;
    measurementLocation: PlatformCode;
  }>;
  readonly bodyWaterMass: Readonly<{ kilograms: number }>;
  readonly boneMass: Readonly<{ kilograms: number }>;
  readonly cervicalMucus: Readonly<{
    appearance: PlatformCode;
    sensation: PlatformCode;
  }>;
  readonly cyclingPedalingCadence: Readonly<{
    samples: readonly MetricSample[];
  }>;
  readonly distance: Readonly<{ meters: number }>;
  readonly elevationGained: Readonly<{ meters: number }>;
  readonly exerciseSession: ExercisePayload;
  readonly floorsClimbed: Readonly<{ floors: number }>;
  readonly heartRate: Readonly<{ samples: readonly MetricSample[] }>;
  readonly heartRateVariabilityRmssd: Readonly<{ milliseconds: number }>;
  readonly height: Readonly<{ meters: number }>;
  readonly hydration: Readonly<{ liters: number }>;
  readonly intermenstrualBleeding: Readonly<{ present: true }>;
  readonly leanBodyMass: Readonly<{ kilograms: number }>;
  readonly menstruationFlow: Readonly<{ flow: PlatformCode }>;
  readonly menstruationPeriod: Readonly<{ present: true }>;
  readonly mindfulnessSession: RecordText &
    Readonly<{ mindfulnessSessionType: PlatformCode }>;
  readonly nutrition: Readonly<{
    nutrientsGrams: Readonly<Partial<Record<Nutrient, number>>>;
    energyKilocalories?: number;
    energyFromFatKilocalories?: number;
    name?: string;
    mealType: PlatformCode;
  }>;
  readonly ovulationTest: Readonly<{ result: PlatformCode }>;
  readonly oxygenSaturation: Readonly<{ percent: number }>;
  readonly plannedExerciseSession: RecordText &
    Readonly<{
      hasExplicitTime: boolean;
      exerciseType: PlatformCode;
      completedExerciseSessionId?: string;
      blocks: readonly PlannedExerciseBlock[];
    }>;
  readonly power: Readonly<{ samples: readonly MetricSample[] }>;
  readonly respiratoryRate: Readonly<{ breathsPerMinute: number }>;
  readonly restingHeartRate: Readonly<{ beatsPerMinute: number }>;
  readonly sexualActivity: Readonly<{ protectionUsed: PlatformCode }>;
  readonly skinTemperature: Readonly<{
    baselineCelsius?: number;
    deltas: readonly MetricSample[];
    measurementLocation: PlatformCode;
  }>;
  readonly sleepSession: SleepPayload;
  readonly speed: Readonly<{ samples: readonly MetricSample[] }>;
  readonly stepsCadence: Readonly<{ samples: readonly MetricSample[] }>;
  readonly steps: Readonly<{ count: number }>;
  readonly totalCaloriesBurned: Readonly<{ kilocalories: number }>;
  readonly vo2Max: Readonly<{
    millilitersPerMinuteKilogram: number;
    measurementMethod: PlatformCode;
  }>;
  readonly weight: Readonly<{ kilograms: number }>;
  readonly wheelchairPushes: Readonly<{ count: number }>;
}

/** Machine discriminant for a cataloged immutable health record. */
export type HealthRecordType = keyof HealthPayloadMap;

/** Raw record provenance and stored time/key assignment, shared by every payload. */
export interface RawRecordBase {
  readonly id: string;
  readonly source: HealthPlatform;
  readonly origin: string;
  readonly device: DeviceMetadata | null;
  readonly recordingMethod: RecordingMethod;
  readonly externalId: string | null;
  readonly lastModifiedUtc: string;
  readonly start: RecordedTimestamp;
  readonly end: RecordedTimestamp;
  readonly keyAssignment: KeyAssignment | null;
  readonly rawPayload: JsonValue;
}

/** Immutable discriminated record; instantaneous records have identical start and end. */
export type RawRecord<T extends HealthRecordType = HealthRecordType> = {
  [K in T]: RawRecordBase & Readonly<{ type: K; payload: HealthPayloadMap[K] }>;
}[T];

/** Raw sleep fragment before stitching and primary selection. */
export type SleepRecord = RawRecord<'sleepSession'>;

/** Reconstructed logical session retaining every original raw fragment. */
export interface SleepSession {
  readonly id: string;
  readonly origin: string;
  readonly start: RecordedTimestamp;
  readonly end: RecordedTimestamp;
  readonly records: readonly SleepRecord[];
  readonly stages: readonly SleepStage[];
}

/** Explicit night D, independent of when its outcomes were logged. */
export interface Night {
  readonly id: string;
  readonly keyAssignment: KeyAssignment;
  readonly primarySessionId: string;
  readonly sessionIds: readonly string[];
}

/** Pre-sleep fields join to night D through their stored day assignment. */
export interface HabitEntry {
  readonly id: string;
  readonly timestamp: Timestamp;
  readonly keyAssignment: KeyAssignment;
  readonly monitoring: 'tracked' | 'rest' | 'unmonitored';
  readonly lastMeal?: Timestamp;
  readonly lastCaffeine?: Timestamp;
  readonly morningSunlightMinutes?: number;
  readonly afternoonSunlightMinutes?: number;
  readonly movementCompleted?: boolean;
  readonly movementMinutes?: number;
  readonly screenFreeMinutes?: number;
  readonly notes?: string;
}

/** User-authoritative ratings and awakening count, attached to a night explicitly. */
export interface SubjectiveReport {
  readonly id: string;
  readonly timestamp: Timestamp;
  readonly nightAssignment: KeyAssignment;
  readonly morningEnergy?: number;
  readonly mood?: number;
  readonly restfulness?: number;
  readonly awakeningCount?: number;
  readonly notes?: string;
}

/** Bounded resumable import request; adapters own platform permissions and I/O. */
export interface HealthReadRequest extends Interval {
  readonly types: readonly HealthRecordType[];
  readonly cursor?: string;
  readonly pageSize: number;
}

/** One bounded page, safe for dense histories without whole-history materialization. */
export interface HealthReadPage {
  readonly records: readonly RawRecord[];
  readonly nextCursor: string | null;
}

/** Native delta deletion is a retained tombstone, never permission to delete raw history. */
export type HealthChange =
  | Readonly<{ kind: 'upsert'; record: RawRecord }>
  | Readonly<{
      kind: 'tombstone';
      externalId: string;
      origin: string;
      observedAtUtc: string;
    }>;

/** Bounded changes page whose token is advanced only after storage succeeds. */
export interface HealthChangesPage {
  readonly changes: readonly HealthChange[];
  readonly nextCursor: string;
  readonly hasMore: boolean;
  readonly expired: boolean;
}

/** Framework-free health adapter port. Implementations live in future native apps. */
export interface HealthSource {
  readonly platform: HealthPlatform;
  readPage(request: HealthReadRequest): Promise<HealthReadPage>;
  createChangesCursor(types: readonly HealthRecordType[]): Promise<string>;
  readChanges(cursor: string): Promise<HealthChangesPage>;
}
