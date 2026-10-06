import {
  CORRELATION_WINDOWS,
  MINIMUM_BINARY_GROUP_DAYS,
  MINIMUM_CONTINUOUS_DAYS,
} from './constants.js';
import type { HabitEntry, SubjectiveReport } from './model.js';
import { instantNanoseconds } from './time.js';
import type { KeyAssignment, Timestamp } from './time.js';
import {
  fisherZConfidenceInterval,
  pearsonCorrelation,
  pointBiserialCorrelation,
  welchMeanDifference,
} from './statistics.js';
import type {
  ConfidenceInterval,
  StatisticalUnavailableReason,
} from './statistics.js';

/** Versioned, fixed pair identifiers. Wearable metrics never enter this registry. */
export type CorrelationPairId =
  | 'meal-awakenings'
  | 'caffeine-awakenings'
  | 'no-caffeine-awakenings'
  | 'screen-energy';

/** Exact v1 predictor definitions, exported for reproducible consumers and exports. */
export const CORRELATION_PAIRS = [
  {
    id: 'meal-awakenings',
    predictor: 'lastMeal',
    outcome: 'awakeningCount',
    method: 'point-biserial',
    definition: 'utc-hours-from-last-meal-to-sleep-start-at-or-above-line',
  },
  {
    id: 'caffeine-awakenings',
    predictor: 'lastCaffeine',
    outcome: 'awakeningCount',
    method: 'point-biserial',
    definition: 'utc-hours-from-last-caffeine-to-sleep-start-at-or-above-line',
  },
  {
    id: 'no-caffeine-awakenings',
    predictor: 'caffeineFree',
    outcome: 'awakeningCount',
    method: 'point-biserial',
    definition: 'nights-with-no-caffeine-versus-nights-with-caffeine',
  },
  {
    id: 'screen-energy',
    predictor: 'screenFreeMinutes',
    outcome: 'morningEnergy',
    method: 'pearson',
    definition: 'paired-reported-numeric-values',
  },
] as const;

/** Authoritative, already-selected night outcome, never inferred from logging time. */
export interface NightOutcome {
  readonly nightAssignment: KeyAssignment;
  /** Start of the primary sleep session already chosen for this night. Never inferred from logging time. */
  readonly sleepStart?: Timestamp;
  readonly awakeningCount?: number;
  readonly morningEnergy?: number;
}

/** An inclusive rolling calendar-key window ending on a declared night. */
export interface CorrelationOptions {
  readonly endNightKey: string;
  readonly windowDays: (typeof CORRELATION_WINDOWS)[number];
  readonly wideAwakeningIntervalWidth?: number;
  readonly widePearsonIntervalWidth?: number;
  /** Dividing line in hours before sleep for the last meal. Absent means the window median. */
  readonly mealHoursBeforeSleepLine?: number;
  /** Dividing line in hours before sleep for the last caffeine. Absent means the window median. */
  readonly caffeineHoursBeforeSleepLine?: number;
}

/** Whether the dividing line came from the caller or from the window median. */
export type HoursLineSource = 'chosen' | 'median';

/** Presentation width policy, two awakenings. This is not a medical threshold. */
export const DEFAULT_WIDE_AWAKENING_INTERVAL_WIDTH = 2;
/** Presentation width policy, half the entire possible Pearson coefficient range. */
export const DEFAULT_WIDE_PEARSON_INTERVAL_WIDTH = 1;

/** Common metadata remains available even when a comparison cannot be surfaced. */
export interface CorrelationMetadata {
  readonly pair: CorrelationPairId;
  readonly windowDays: (typeof CORRELATION_WINDOWS)[number];
  readonly startNightKey: string;
  readonly endNightKey: string;
  readonly sampleSize: number;
  readonly groupSizes?: readonly [number, number];
  readonly hoursBeforeSleepLine?: number;
  readonly lineSource?: HoursLineSource;
}

/** Machine states resolved to reviewed templates only by the copy package. A valid binary coefficient remains exportable when its Welch interval is undefined. */
export type CorrelationResult = CorrelationMetadata &
  (
    | Readonly<{ status: 'insufficient-data' }>
    | (Readonly<{
        status: 'unavailable';
        reason: StatisticalUnavailableReason;
      }> &
        (
          | Readonly<{ method?: never; coefficient?: never }>
          | Readonly<{
              method: 'point-biserial';
              coefficient: number;
              groupSizes: readonly [number, number];
              hoursBeforeSleepLine?: number;
              lineSource?: HoursLineSource;
            }>
        ))
    | Readonly<{
        status: 'computed';
        method: 'pearson';
        coefficient: number;
        confidenceInterval: ConfidenceInterval;
        intervalWide: boolean;
      }>
    | Readonly<{
        status: 'computed';
        method: 'point-biserial';
        coefficient: number;
        difference: number;
        groupSizes: readonly [number, number];
        hoursBeforeSleepLine?: number;
        lineSource?: HoursLineSource;
        groupMeans: readonly [number, number];
        confidenceInterval: ConfidenceInterval;
        intervalWide: boolean;
      }>
  );

const NANOSECONDS_PER_HOUR = 3_600_000_000_000;

function calendarEpoch(key: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key))
    throw new RangeError('invalid-calendar-key');
  const date = Date.parse(`${key}T00:00:00Z`);
  if (
    !Number.isFinite(date) ||
    new Date(date).toISOString().slice(0, 10) !== key
  )
    throw new RangeError('invalid-calendar-key');
  return date;
}

function onePerKey<T>(
  values: readonly T[],
  keyOf: (value: T) => string,
): Map<string, T> {
  const entries = new Map<string, T>();
  for (const value of values) {
    const key = keyOf(value);
    calendarEpoch(key);
    if (entries.has(key)) throw new RangeError('ambiguous-authoritative-day');
    entries.set(key, value);
  }
  return entries;
}

function widthPolicy(value: number): number {
  if (!Number.isFinite(value) || value <= 0)
    throw new RangeError('invalid-interval-width-policy');
  return value;
}

/** Adapt a report without altering its explicit night assignment or inventing missing values. */
export function outcomeFromReport(report: SubjectiveReport): NightOutcome {
  return {
    nightAssignment: report.nightAssignment,
    ...(report.awakeningCount === undefined
      ? {}
      : { awakeningCount: report.awakeningCount }),
    ...(report.morningEnergy === undefined
      ? {}
      : { morningEnergy: report.morningEnergy }),
  };
}

/**
 * Analyze only the registered day-D/night-D pairs, using complete tracked days.
 *
 * @remarks Callers select one authoritative habit row and outcome per key. Duplicate keys are rejected rather than silently choosing a revision. Meal and caffeine are measured in hours before sleep: elapsed UTC hours from the last meal or caffeine to the night's `sleepStart`, which the caller supplies. A night with a missing meal, caffeine, or sleep start is missing data, never zero hours, and a meal or caffeine after sleep start is rejected as an invalid predictor. Nights are split at the caller's dividing line, or at the window median when none is given: zero is fewer hours before sleep, one is at or above the line, and ties go to one. The five-per-side gate is checked after splitting. The no-caffeine pair compares nights marked `caffeineFree` (zero) with nights that have a last caffeine time (one); a night marked caffeine free that also has a caffeine time is rejected. Missing caffeine without that mark is missing data. Windows include their final night and use calendar keys, independently of UTC day length.
 */
export function analyzeCorrelations(
  habits: readonly HabitEntry[],
  outcomes: readonly NightOutcome[],
  options: CorrelationOptions,
): readonly CorrelationResult[] {
  if (!CORRELATION_WINDOWS.includes(options.windowDays))
    throw new RangeError('invalid-correlation-window');
  const endEpoch = calendarEpoch(options.endNightKey);
  const startDate = new Date(endEpoch);
  startDate.setUTCDate(startDate.getUTCDate() - options.windowDays + 1);
  const startNightKey = startDate.toISOString().slice(0, 10);
  const byHabit = onePerKey(habits, (habit) => habit.keyAssignment.key);
  const byNight = onePerKey(outcomes, (outcome) => outcome.nightAssignment.key);
  const binaryWidth = widthPolicy(
    options.wideAwakeningIntervalWidth ?? DEFAULT_WIDE_AWAKENING_INTERVAL_WIDTH,
  );
  const pearsonWidth = widthPolicy(
    options.widePearsonIntervalWidth ?? DEFAULT_WIDE_PEARSON_INTERVAL_WIDTH,
  );
  return CORRELATION_PAIRS.map((pair): CorrelationResult => {
    const predictor: number[] = [];
    const response: number[] = [];
    for (const [key, habit] of byHabit) {
      if (
        key < startNightKey ||
        key > options.endNightKey ||
        habit.monitoring !== 'tracked'
      )
        continue;
      const night = byNight.get(key);
      const y = night?.[pair.outcome];
      if (y === undefined) continue;
      if (
        !Number.isFinite(y) ||
        (pair.outcome === 'awakeningCount' && (!Number.isInteger(y) || y < 0))
      )
        throw new RangeError('invalid-outcome');
      let x: number | undefined;
      if (pair.predictor === 'screenFreeMinutes') x = habit.screenFreeMinutes;
      else if (pair.predictor === 'caffeineFree') {
        if (habit.caffeineFree && habit.lastCaffeine)
          throw new RangeError('invalid-predictor');
        if (habit.caffeineFree) x = 0;
        else if (habit.lastCaffeine) x = 1;
      } else {
        const last = habit[pair.predictor];
        if (last && night?.sleepStart) {
          const elapsed =
            instantNanoseconds(night.sleepStart.utc) -
            instantNanoseconds(last.utc);
          if (elapsed < 0n) throw new RangeError('invalid-predictor');
          x = Number(elapsed) / NANOSECONDS_PER_HOUR;
        }
      }
      if (x === undefined) continue;
      if (!Number.isFinite(x) || x < 0)
        throw new RangeError('invalid-predictor');
      predictor.push(x);
      response.push(y);
    }
    const metadata: CorrelationMetadata = {
      pair: pair.id,
      windowDays: options.windowDays,
      startNightKey,
      endNightKey: options.endNightKey,
      sampleSize: predictor.length,
    };
    if (pair.method === 'pearson') {
      if (predictor.length < MINIMUM_CONTINUOUS_DAYS)
        return { ...metadata, status: 'insufficient-data' };
      const correlation = pearsonCorrelation(predictor, response);
      if (correlation.status === 'unavailable')
        return { ...metadata, ...correlation };
      const interval = fisherZConfidenceInterval(
        correlation.value,
        predictor.length,
      );
      if (interval.status === 'unavailable')
        return { ...metadata, ...interval };
      return {
        ...metadata,
        status: 'computed',
        method: 'pearson',
        coefficient: correlation.value,
        confidenceInterval: interval.value,
        intervalWide:
          interval.value.upper - interval.value.lower > pearsonWidth,
      };
    }
    const chosen =
      pair.predictor === 'lastMeal'
        ? options.mealHoursBeforeSleepLine
        : pair.predictor === 'lastCaffeine'
          ? options.caffeineHoursBeforeSleepLine
          : undefined;
    if (chosen !== undefined && (!Number.isFinite(chosen) || chosen < 0))
      throw new RangeError('invalid-hours-before-sleep-line');
    const ordered = predictor.slice().sort((a, b) => a - b);
    const midpoint = Math.floor(ordered.length / 2);
    const median =
      ordered.length === 0
        ? undefined
        : ordered.length % 2
          ? ordered[midpoint]!
          : (ordered[midpoint - 1]! + ordered[midpoint]!) / 2;
    const hoursPair = pair.predictor !== 'caffeineFree';
    const line = hoursPair ? (chosen ?? median) : undefined;
    const binary = hoursPair
      ? predictor.map((x) => (x < line! ? 0 : 1))
      : predictor;
    const lineFields =
      line === undefined
        ? {}
        : {
            hoursBeforeSleepLine: line,
            lineSource: (chosen === undefined
              ? 'median'
              : 'chosen') as HoursLineSource,
          };
    const zero = response.filter((_, index) => binary[index] === 0);
    const one = response.filter((_, index) => binary[index] === 1);
    const binaryMetadata = {
      ...metadata,
      groupSizes: [zero.length, one.length] as const,
      ...lineFields,
    };
    if (
      zero.length < MINIMUM_BINARY_GROUP_DAYS ||
      one.length < MINIMUM_BINARY_GROUP_DAYS
    )
      return { ...binaryMetadata, status: 'insufficient-data' };
    const correlation = pointBiserialCorrelation(binary, response);
    if (correlation.status === 'unavailable')
      return { ...binaryMetadata, ...correlation };
    const comparison = welchMeanDifference(zero, one);
    if (comparison.status === 'unavailable')
      return {
        ...binaryMetadata,
        ...comparison,
        method: 'point-biserial',
        coefficient: correlation.value,
        ...lineFields,
      };
    const value = comparison.value;
    return {
      ...binaryMetadata,
      status: 'computed',
      method: 'point-biserial',
      ...lineFields,
      coefficient: correlation.value,
      difference: value.difference,
      groupMeans: [value.groupZeroMean, value.groupOneMean],
      confidenceInterval: value.confidenceInterval,
      intervalWide:
        value.confidenceInterval.upper - value.confidenceInterval.lower >
        binaryWidth,
    };
  });
}
