import {
  DEFAULT_AWAKENING_THRESHOLD_MS,
  DEFAULT_NAP_THRESHOLD_MS,
  MILLISECONDS_PER_MINUTE,
  MINUTES_PER_DAY,
  PRIMARY_SESSION_HISTORY_LIMIT,
} from './constants.js';
import {
  unionDurationMilliseconds,
  unionIntervals,
  type Interval,
} from './intervals.js';
import type { SleepRecord, SleepSession, SleepStageType } from './model.js';
import {
  durationMilliseconds,
  instantNanoseconds,
  localClockMinutes,
  normalizeUtcInstant,
  type Timestamp,
} from './time.js';

function compareInstants(a: string, b: string): number {
  const left = instantNanoseconds(a);
  const right = instantNanoseconds(b);
  return left < right ? -1 : left > right ? 1 : 0;
}

function shiftUtcMilliseconds(utc: string, milliseconds: number): string {
  const canonical = normalizeUtcInstant(utc);
  const shifted = new Date(Date.parse(canonical) + milliseconds).toISOString();
  const fraction = /\.(\d+)Z$/.exec(canonical)?.[1] ?? '';
  return fraction.length > 3
    ? `${shifted.slice(0, -1)}${fraction.slice(3)}Z`
    : shifted;
}

/** Derived two-state mapping. Excluded stages remain present in raw exports. */
export type DerivedSleepState = 'asleep' | 'awake' | 'excluded';

/** Map native stages only for calculations, retaining every original segment. */
export function sleepStageState(stage: SleepStageType): DerivedSleepState {
  switch (stage) {
    case 'SLEEPING':
    case 'LIGHT':
    case 'DEEP':
    case 'REM':
      return 'asleep';
    case 'AWAKE':
    case 'AWAKE_IN_BED':
      return 'awake';
    case 'OUT_OF_BED':
    case 'UNKNOWN':
      return 'excluded';
  }
}

function clippedStage(record: SleepRecord, stage: Interval): Interval | null {
  const stageStart = instantNanoseconds(stage.startUtc);
  const stageEnd = instantNanoseconds(stage.endUtc);
  if (stageEnd <= stageStart) throw new RangeError('invalid-stage-interval');
  const startUtc =
    instantNanoseconds(record.start.utc) > stageStart
      ? record.start.utc
      : stage.startUtc;
  const endUtc =
    instantNanoseconds(record.end.utc) < stageEnd
      ? record.end.utc
      : stage.endUtc;
  return compareInstants(endUtc, startUtc) > 0
    ? {
        startUtc: normalizeUtcInstant(startUtc),
        endUtc: normalizeUtcInstant(endUtc),
      }
    : null;
}

/** UTC asleep union; unstaged raw fragments contribute their actual span, never stitch gaps. */
export function asleepIntervals(
  records: readonly SleepRecord[],
): readonly Interval[] {
  const intervals: Interval[] = [];
  for (const record of records) {
    if (record.payload.stages.length === 0) {
      intervals.push({ startUtc: record.start.utc, endUtc: record.end.utc });
      continue;
    }
    for (const stage of record.payload.stages) {
      if (sleepStageState(stage.stage) !== 'asleep') continue;
      const clipped = clippedStage(record, stage);
      if (clipped) intervals.push(clipped);
    }
  }
  return unionIntervals(intervals);
}

/** Configurable real elapsed threshold, requiring a segment strictly longer than it. */
export interface SleepMetricsOptions {
  readonly awakeningThresholdMilliseconds?: number;
}

/** Descriptive sleep measurements. No score or diagnostic interpretation is produced. */
export interface SleepMetrics {
  readonly spanMilliseconds: number;
  readonly asleepMilliseconds: number;
  readonly awakeningCount: number;
  readonly awakeningMilliseconds: number;
  readonly asleep: readonly Interval[];
  readonly awakenings: readonly Interval[];
}

/** Derive UTC-union sleep and merged AWAKE episodes, excluding AWAKE_IN_BED from the counter. */
export function deriveSleepMetrics(
  session: SleepSession,
  options: SleepMetricsOptions = {},
): SleepMetrics {
  const threshold =
    options.awakeningThresholdMilliseconds ?? DEFAULT_AWAKENING_THRESHOLD_MS;
  if (!Number.isFinite(threshold) || threshold < 0)
    throw new RangeError('invalid-awakening-threshold');
  const spanMilliseconds = durationMilliseconds(
    session.start.utc,
    session.end.utc,
  );
  const awake: Interval[] = [];
  for (const record of session.records) {
    for (const stage of record.payload.stages) {
      if (stage.stage !== 'AWAKE') continue;
      const clipped = clippedStage(record, stage);
      if (clipped) awake.push(clipped);
    }
  }
  const awakenings = unionIntervals(awake).filter(
    (interval) =>
      durationMilliseconds(interval.startUtc, interval.endUtc) > threshold,
  );
  const asleep = asleepIntervals(session.records);
  return Object.freeze({
    spanMilliseconds,
    asleepMilliseconds: unionDurationMilliseconds(asleep),
    awakeningCount: awakenings.length,
    awakeningMilliseconds: unionDurationMilliseconds(awakenings),
    asleep,
    awakenings: Object.freeze(awakenings),
  });
}

/** Night total remains a UTC interval union even when a duplicate escapes detection. */
export function totalSleepMilliseconds(
  records: readonly SleepRecord[],
): number {
  return unionDurationMilliseconds(asleepIntervals(records));
}

/** Explicit resolved bedtime anchor avoids silently choosing an instant in a DST gap or fold. */
export interface NapDetectionOptions {
  readonly windowStart: Timestamp;
  readonly targetBedtimeMinutes?: number;
  readonly primarySessionHistory?: readonly Timestamp[];
  readonly napThresholdMilliseconds?: number;
  readonly preferredPrimarySessionId?: string;
}

/** A derived nap interval, independent of nights and retained raw records. */
export interface NapInterval extends Interval {
  readonly durationMilliseconds: number;
}

/** Classification remains unresolved until the bedtime reference is available. */
export type NapDetectionResult =
  | Readonly<{
      status: 'unresolved';
      reason: 'no-bedtime-reference' | 'no-sleep-in-window';
    }>
  | Readonly<{
      status: 'classified';
      typicalBedtimeMinutes: number;
      bedtimeSource: 'target' | 'history';
      primarySessionId: string;
      primaryWindow: Interval;
      primaryAsleepMilliseconds: number;
      naps: readonly NapInterval[];
    }>;

/** Circular L1 median of the latest fourteen primary starts, choosing the lowest observed minute on ties. */
export function typicalBedtimeMinutes(
  history: readonly Timestamp[],
): number | null {
  const recent = [...history]
    .sort((a, b) => compareInstants(b.utc, a.utc))
    .slice(0, PRIMARY_SESSION_HISTORY_LIMIT);
  if (recent.length === 0) return null;
  const minutes = recent.map(localClockMinutes);
  const score = (candidate: number): number =>
    minutes.reduce((total, minute) => {
      const difference = Math.abs(candidate - minute);
      return total + Math.min(difference, MINUTES_PER_DAY - difference);
    }, 0);
  return [...new Set(minutes)]
    .map((minute) => ({ minute, score: score(minute) }))
    .sort((a, b) => a.score - b.score || a.minute - b.minute)[0]!.minute;
}

function clipIntervals(
  intervals: readonly Interval[],
  window: Interval,
): readonly Interval[] {
  const windowStart = instantNanoseconds(window.startUtc);
  const windowEnd = instantNanoseconds(window.endUtc);
  return intervals.flatMap((interval) => {
    const startUtc =
      windowStart > instantNanoseconds(interval.startUtc)
        ? window.startUtc
        : interval.startUtc;
    const endUtc =
      windowEnd < instantNanoseconds(interval.endUtc)
        ? window.endUtc
        : interval.endUtc;
    return compareInstants(endUtc, startUtc) > 0
      ? [
          {
            startUtc,
            endUtc,
          },
        ]
      : [];
  });
}

/** Choose the main logical session by asleep union, keeping its awakenings inside the main window. */
export function detectNaps(
  primarySessions: readonly SleepSession[],
  options: NapDetectionOptions,
): NapDetectionResult {
  const threshold =
    options.napThresholdMilliseconds ?? DEFAULT_NAP_THRESHOLD_MS;
  if (!Number.isFinite(threshold) || threshold < 0)
    throw new RangeError('invalid-nap-threshold');
  const target = options.targetBedtimeMinutes;
  if (
    target !== undefined &&
    (!Number.isInteger(target) || target < 0 || target >= MINUTES_PER_DAY)
  )
    throw new RangeError('invalid-bedtime');
  const anchor = instantNanoseconds(options.windowStart.utc);
  const history = (options.primarySessionHistory ?? []).filter(
    (timestamp) => instantNanoseconds(timestamp.utc) < anchor,
  );
  const bedtime = target ?? typicalBedtimeMinutes(history);
  if (bedtime === null)
    return Object.freeze({
      status: 'unresolved',
      reason: 'no-bedtime-reference',
    });
  if (localClockMinutes(options.windowStart) !== bedtime)
    throw new RangeError('unaligned-bedtime-anchor');
  const window: Interval = {
    startUtc: options.windowStart.utc,
    endUtc: shiftUtcMilliseconds(
      options.windowStart.utc,
      MINUTES_PER_DAY * MILLISECONDS_PER_MINUTE,
    ),
  };
  const candidates = primarySessions
    .map((session) => ({
      session,
      asleep: clipIntervals(asleepIntervals(session.records), window),
    }))
    .map((entry) => ({
      ...entry,
      duration: unionDurationMilliseconds(entry.asleep),
    }))
    .filter((entry) => entry.duration > 0)
    .sort(
      (a, b) =>
        b.duration - a.duration ||
        compareInstants(a.session.start.utc, b.session.start.utc) ||
        (a.session.id < b.session.id
          ? -1
          : a.session.id > b.session.id
            ? 1
            : 0),
    );
  const preferred = options.preferredPrimarySessionId;
  const primary =
    preferred === undefined
      ? candidates[0]
      : candidates.find((entry) => entry.session.id === preferred);
  if (!primary) {
    if (preferred !== undefined)
      throw new RangeError('unknown-primary-session-in-window');
    return Object.freeze({
      status: 'unresolved',
      reason: 'no-sleep-in-window',
    });
  }
  const primaryStart = instantNanoseconds(primary.session.start.utc);
  const primaryEnd = instantNanoseconds(primary.session.end.utc);
  // A main night's interrupted sleep remains one night, rather than becoming daytime naps.
  const outside = candidates
    .filter((entry) => entry.session.id !== primary.session.id)
    .flatMap((entry) =>
      entry.asleep.flatMap((interval) => {
        const start = instantNanoseconds(interval.startUtc);
        const end = instantNanoseconds(interval.endUtc);
        const pieces: Interval[] = [];
        if (start < primaryStart)
          pieces.push({
            startUtc: interval.startUtc,
            endUtc:
              end < primaryStart ? interval.endUtc : primary.session.start.utc,
          });
        if (end > primaryEnd)
          pieces.push({
            startUtc:
              start > primaryEnd ? interval.startUtc : primary.session.end.utc,
            endUtc: interval.endUtc,
          });
        return pieces;
      }),
    );
  const naps = unionIntervals(outside)
    .map((interval) => ({
      ...interval,
      durationMilliseconds: durationMilliseconds(
        interval.startUtc,
        interval.endUtc,
      ),
    }))
    .filter((interval) => interval.durationMilliseconds > threshold)
    .map((interval) => Object.freeze(interval));
  return Object.freeze({
    status: 'classified',
    typicalBedtimeMinutes: bedtime,
    bedtimeSource: target === undefined ? 'history' : 'target',
    primarySessionId: primary.session.id,
    primaryWindow: Object.freeze({
      startUtc: primary.session.start.utc,
      endUtc: primary.session.end.utc,
    }),
    primaryAsleepMilliseconds: primary.duration,
    naps: Object.freeze(naps),
  });
}
