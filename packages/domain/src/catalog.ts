import type { HealthRecordType } from './model.js';

/** Catalog version changes when supported types or normalized unit mappings change. */
export const HEALTH_CATALOG_VERSION = 1;

/** The stable SDK artifact used to enumerate concrete health Record classes. */
export const HEALTH_CONNECT_SDK_VERSION = '1.1.0';

/** Consent categories are machine identifiers; visible names belong to `@sleeby/copy`. */
export type HealthCategory =
  | 'sleep'
  | 'heart'
  | 'respiratory-oxygen'
  | 'activity'
  | 'body'
  | 'nutrition'
  | 'reproductive'
  | 'mindfulness';

/** Canonical units apply only to normalized projections; rawPayload retains native units. */
export type HealthUnit =
  | 'kilocalories'
  | 'celsius'
  | 'celsius-delta'
  | 'watts'
  | 'millimoles-per-liter'
  | 'millimeters-mercury'
  | 'percent'
  | 'kilograms'
  | 'meters'
  | 'revolutions-per-minute'
  | 'floors'
  | 'beats-per-minute'
  | 'milliseconds'
  | 'liters'
  | 'grams'
  | 'breaths-per-minute'
  | 'meters-per-second'
  | 'steps-per-minute'
  | 'count'
  | 'milliliters-per-minute-kilogram'
  | 'platform-code'
  | 'utc-interval';

/** An implementable raw view contract, independent of chart or UI libraries. */
export type RawView =
  | 'series'
  | 'interval'
  | 'stage-timeline'
  | 'event'
  | 'multi-field'
  | 'exercise'
  | 'planned-exercise';

/** Catalog descriptor links a native record to its typed payload, view, and export path. */
export interface HealthCatalogEntry {
  readonly platformRecord: string;
  readonly category: HealthCategory;
  readonly temporalShape: 'instant' | 'interval' | 'series';
  readonly units: readonly HealthUnit[];
  readonly rawView: RawView;
  readonly exportMapping: Readonly<{
    version: 1;
    jsonPath: 'payload';
    csvPayloadColumn: 'payload_json';
    csvSampleRowKind: 'sample';
    format: 'sleeby-long-form-v1';
  }>;
  readonly feature?: 'skin-temperature' | 'mindfulness' | 'planned-exercise';
}

const exportMapping = Object.freeze({
  version: 1,
  jsonPath: 'payload',
  csvPayloadColumn: 'payload_json',
  csvSampleRowKind: 'sample',
  format: 'sleeby-long-form-v1',
} as const);

function entry(
  platformRecord: string,
  category: HealthCategory,
  temporalShape: HealthCatalogEntry['temporalShape'],
  units: readonly HealthUnit[],
  rawView: RawView,
  feature?: HealthCatalogEntry['feature'],
): HealthCatalogEntry {
  return Object.freeze({
    platformRecord,
    category,
    temporalShape,
    units: Object.freeze([...units]),
    rawView,
    exportMapping,
    ...(feature === undefined ? {} : { feature }),
  });
}

/** All 41 concrete Records from stable Health Connect SDK 1.1.0, with feature gates retained. */
export const HEALTH_CATALOG = Object.freeze({
  activeCaloriesBurned: entry(
    'ActiveCaloriesBurnedRecord',
    'activity',
    'interval',
    ['kilocalories'],
    'interval',
  ),
  basalBodyTemperature: entry(
    'BasalBodyTemperatureRecord',
    'reproductive',
    'instant',
    ['celsius', 'platform-code'],
    'multi-field',
  ),
  basalMetabolicRate: entry(
    'BasalMetabolicRateRecord',
    'body',
    'instant',
    ['watts'],
    'series',
  ),
  bloodGlucose: entry(
    'BloodGlucoseRecord',
    'body',
    'instant',
    ['millimoles-per-liter', 'platform-code'],
    'multi-field',
  ),
  bloodPressure: entry(
    'BloodPressureRecord',
    'heart',
    'instant',
    ['millimeters-mercury', 'platform-code'],
    'multi-field',
  ),
  bodyFat: entry('BodyFatRecord', 'body', 'instant', ['percent'], 'series'),
  bodyTemperature: entry(
    'BodyTemperatureRecord',
    'body',
    'instant',
    ['celsius', 'platform-code'],
    'multi-field',
  ),
  bodyWaterMass: entry(
    'BodyWaterMassRecord',
    'body',
    'instant',
    ['kilograms'],
    'series',
  ),
  boneMass: entry('BoneMassRecord', 'body', 'instant', ['kilograms'], 'series'),
  cervicalMucus: entry(
    'CervicalMucusRecord',
    'reproductive',
    'instant',
    ['platform-code'],
    'event',
  ),
  cyclingPedalingCadence: entry(
    'CyclingPedalingCadenceRecord',
    'activity',
    'series',
    ['revolutions-per-minute'],
    'series',
  ),
  distance: entry(
    'DistanceRecord',
    'activity',
    'interval',
    ['meters'],
    'interval',
  ),
  elevationGained: entry(
    'ElevationGainedRecord',
    'activity',
    'interval',
    ['meters'],
    'interval',
  ),
  exerciseSession: entry(
    'ExerciseSessionRecord',
    'activity',
    'interval',
    ['utc-interval', 'meters', 'count', 'platform-code'],
    'exercise',
  ),
  floorsClimbed: entry(
    'FloorsClimbedRecord',
    'activity',
    'interval',
    ['floors'],
    'interval',
  ),
  heartRate: entry(
    'HeartRateRecord',
    'heart',
    'series',
    ['beats-per-minute'],
    'series',
  ),
  heartRateVariabilityRmssd: entry(
    'HeartRateVariabilityRmssdRecord',
    'heart',
    'instant',
    ['milliseconds'],
    'series',
  ),
  height: entry('HeightRecord', 'body', 'instant', ['meters'], 'series'),
  hydration: entry(
    'HydrationRecord',
    'nutrition',
    'interval',
    ['liters'],
    'interval',
  ),
  intermenstrualBleeding: entry(
    'IntermenstrualBleedingRecord',
    'reproductive',
    'instant',
    ['platform-code'],
    'event',
  ),
  leanBodyMass: entry(
    'LeanBodyMassRecord',
    'body',
    'instant',
    ['kilograms'],
    'series',
  ),
  menstruationFlow: entry(
    'MenstruationFlowRecord',
    'reproductive',
    'instant',
    ['platform-code'],
    'event',
  ),
  menstruationPeriod: entry(
    'MenstruationPeriodRecord',
    'reproductive',
    'interval',
    ['utc-interval'],
    'interval',
  ),
  mindfulnessSession: entry(
    'MindfulnessSessionRecord',
    'mindfulness',
    'interval',
    ['utc-interval', 'platform-code'],
    'interval',
    'mindfulness',
  ),
  nutrition: entry(
    'NutritionRecord',
    'nutrition',
    'interval',
    ['grams', 'kilocalories', 'platform-code'],
    'multi-field',
  ),
  ovulationTest: entry(
    'OvulationTestRecord',
    'reproductive',
    'instant',
    ['platform-code'],
    'event',
  ),
  oxygenSaturation: entry(
    'OxygenSaturationRecord',
    'respiratory-oxygen',
    'instant',
    ['percent'],
    'series',
  ),
  plannedExerciseSession: entry(
    'PlannedExerciseSessionRecord',
    'activity',
    'interval',
    [
      'utc-interval',
      'meters',
      'milliseconds',
      'count',
      'kilocalories',
      'watts',
      'meters-per-second',
      'kilograms',
      'platform-code',
    ],
    'planned-exercise',
    'planned-exercise',
  ),
  power: entry('PowerRecord', 'activity', 'series', ['watts'], 'series'),
  respiratoryRate: entry(
    'RespiratoryRateRecord',
    'respiratory-oxygen',
    'instant',
    ['breaths-per-minute'],
    'series',
  ),
  restingHeartRate: entry(
    'RestingHeartRateRecord',
    'heart',
    'instant',
    ['beats-per-minute'],
    'series',
  ),
  sexualActivity: entry(
    'SexualActivityRecord',
    'reproductive',
    'instant',
    ['platform-code'],
    'event',
  ),
  skinTemperature: entry(
    'SkinTemperatureRecord',
    'body',
    'series',
    ['celsius', 'celsius-delta', 'platform-code'],
    'series',
    'skin-temperature',
  ),
  sleepSession: entry(
    'SleepSessionRecord',
    'sleep',
    'interval',
    ['utc-interval', 'platform-code'],
    'stage-timeline',
  ),
  speed: entry(
    'SpeedRecord',
    'activity',
    'series',
    ['meters-per-second'],
    'series',
  ),
  stepsCadence: entry(
    'StepsCadenceRecord',
    'activity',
    'series',
    ['steps-per-minute'],
    'series',
  ),
  steps: entry('StepsRecord', 'activity', 'interval', ['count'], 'interval'),
  totalCaloriesBurned: entry(
    'TotalCaloriesBurnedRecord',
    'activity',
    'interval',
    ['kilocalories'],
    'interval',
  ),
  vo2Max: entry(
    'Vo2MaxRecord',
    'respiratory-oxygen',
    'instant',
    ['milliliters-per-minute-kilogram', 'platform-code'],
    'multi-field',
  ),
  weight: entry('WeightRecord', 'body', 'instant', ['kilograms'], 'series'),
  wheelchairPushes: entry(
    'WheelchairPushesRecord',
    'activity',
    'interval',
    ['count'],
    'interval',
  ),
} satisfies Readonly<Record<HealthRecordType, HealthCatalogEntry>>);

/** Frozen enumeration of the approved catalog for permission, view, and export adapters. */
export const HEALTH_RECORD_TYPES: readonly HealthRecordType[] = Object.freeze(
  Object.keys(HEALTH_CATALOG) as HealthRecordType[],
);
