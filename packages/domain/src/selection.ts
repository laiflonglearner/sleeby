import {
  DUPLICATE_OVERLAP_FRACTION,
  MAXIMUM_STITCH_GAP_MS,
} from './constants.js';
import {
  overlapMilliseconds,
  unionDurationMilliseconds,
  type Interval,
} from './intervals.js';
import type { SleepRecord, SleepSession } from './model.js';
import { instantNanoseconds } from './time.js';

const NANOSECONDS_PER_MILLISECOND = 1_000_000n;

function compareInstants(a: string, b: string): number {
  const left = instantNanoseconds(a);
  const right = instantNanoseconds(b);
  return left < right ? -1 : left > right ? 1 : 0;
}

function clipInterval(interval: Interval, window: Interval): Interval {
  return {
    startUtc:
      compareInstants(interval.startUtc, window.startUtc) < 0
        ? window.startUtc
        : interval.startUtc,
    endUtc:
      compareInstants(interval.endUtc, window.endUtc) > 0
        ? window.endUtc
        : interval.endUtc,
  };
}

/** Instantaneous or interval evidence from another metric, within a sleep session's window. */
export interface OtherMetricCoverage {
  readonly origin: string;
  readonly startUtc: string;
  readonly endUtc: string;
}

/** Derived selection only. Every raw record remains available in its logical session. */
export type SleepSelection =
  | Readonly<{
      session: SleepSession;
      status: 'primary';
      supersededBy: null;
      reason: 'unique' | 'information-richness' | 'user-selection';
    }>
  | Readonly<{
      session: SleepSession;
      status: 'suppressed';
      supersededBy: string;
      reason: 'duplicate' | 'user-selection';
    }>;

/** Optional independent metric evidence and explicit reversible primary overrides. */
export interface SleepSelectionOptions {
  readonly otherMetrics?: readonly OtherMetricCoverage[];
  readonly preferredSessionIds?: readonly string[];
}

function sessionInterval(session: SleepSession): Interval {
  return { startUtc: session.start.utc, endUtc: session.end.utc };
}

function compareIds(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Reconstruct same-origin fragments with at most the specified one-minute gap. */
export function reconstructSleepSessions(
  records: readonly SleepRecord[],
): readonly SleepSession[] {
  const ids = new Set<string>();
  const origins = new Map<string, SleepRecord[]>();
  for (const record of records) {
    if (ids.has(record.id)) throw new RangeError('duplicate-record-id');
    ids.add(record.id);
    if (
      instantNanoseconds(record.end.utc) <= instantNanoseconds(record.start.utc)
    ) {
      throw new RangeError('invalid-interval');
    }
    const group = origins.get(record.origin) ?? [];
    group.push(record);
    origins.set(record.origin, group);
  }
  const sessions: SleepSession[] = [];
  for (const [origin, group] of origins) {
    group.sort(
      (a, b) =>
        compareInstants(a.start.utc, b.start.utc) || compareIds(a.id, b.id),
    );
    let fragments: SleepRecord[] = [];
    let latest: SleepRecord | undefined;
    const finish = (): void => {
      const first = fragments[0];
      if (!first || !latest) return;
      sessions.push(
        Object.freeze({
          id: fragments.map((record) => record.id).sort(compareIds)[0]!,
          origin,
          start: first.start,
          end: latest.end,
          records: Object.freeze([...fragments]),
          stages: Object.freeze(
            fragments.flatMap((record) => record.payload.stages),
          ),
        }),
      );
    };
    for (const record of group) {
      if (
        latest &&
        instantNanoseconds(record.start.utc) -
          instantNanoseconds(latest.end.utc) >
          BigInt(MAXIMUM_STITCH_GAP_MS) * NANOSECONDS_PER_MILLISECOND
      ) {
        finish();
        fragments = [];
        latest = undefined;
      }
      fragments.push(record);
      if (
        !latest ||
        instantNanoseconds(record.end.utc) > instantNanoseconds(latest.end.utc)
      )
        latest = record;
    }
    finish();
  }
  return Object.freeze(
    sessions.sort(
      (a, b) =>
        compareInstants(a.start.utc, b.start.utc) || compareIds(a.id, b.id),
    ),
  );
}

function richness(
  session: SleepSession,
  evidence: readonly OtherMetricCoverage[],
): readonly (number | bigint)[] {
  const automatic = session.records.some(
    (record) =>
      record.recordingMethod === 'automatic' ||
      record.recordingMethod === 'active',
  );
  return [
    new Set(session.stages.map((segment) => segment.stage)).size,
    session.stages.length,
    Number(
      evidence.some(
        (metric) =>
          metric.origin === session.origin &&
          metricInWindow(metric, sessionInterval(session)),
      ),
    ),
    Number(automatic),
    -session.records.reduce((earliest, record) => {
      const modified = instantNanoseconds(record.lastModifiedUtc);
      return modified < earliest ? modified : earliest;
    }, instantNanoseconds(session.records[0]!.lastModifiedUtc)),
  ];
}

function metricInWindow(
  metric: OtherMetricCoverage,
  window: Interval,
): boolean {
  const start = instantNanoseconds(metric.startUtc);
  const end = instantNanoseconds(metric.endUtc);
  if (end < start) throw new RangeError('invalid-metric-interval');
  if (end === start) {
    // Native HRV and oxygen records are instants, with no positive duration to intersect.
    return (
      start >= instantNanoseconds(window.startUtc) &&
      start < instantNanoseconds(window.endUtc)
    );
  }
  return overlapMilliseconds(metric, window) > 0;
}

/** Detect cross-origin duplicate components, then apply the documented richness order. */
export function selectSleepRecords(
  records: readonly SleepRecord[],
  options: SleepSelectionOptions = {},
): readonly SleepSelection[] {
  const sessions = reconstructSleepSessions(records);
  const parents = sessions.map((_, index) => index);
  const find = (index: number): number => {
    let root = index;
    while (parents[root] !== root) root = parents[root]!;
    while (index !== root) {
      const next = parents[index]!;
      parents[index] = root;
      index = next;
    }
    return root;
  };
  for (let i = 0; i < sessions.length; i += 1) {
    const left = sessions[i]!;
    const leftEnd = instantNanoseconds(left.end.utc);
    for (let j = i + 1; j < sessions.length; j += 1) {
      const right = sessions[j]!;
      if (instantNanoseconds(right.start.utc) >= leftEnd) break;
      if (left.origin === right.origin) continue;
      const leftDuration = leftEnd - instantNanoseconds(left.start.utc);
      const rightDuration =
        instantNanoseconds(right.end.utc) - instantNanoseconds(right.start.utc);
      const shorter =
        leftDuration < rightDuration ? leftDuration : rightDuration;
      const overlapStart = instantNanoseconds(right.start.utc);
      const rightEnd = instantNanoseconds(right.end.utc);
      const overlapEnd = leftEnd < rightEnd ? leftEnd : rightEnd;
      const overlap = overlapEnd - overlapStart;
      // The specified half-overlap is compared as an exact ratio, even at native nanosecond edges.
      const overlapDenominator = BigInt(1 / DUPLICATE_OVERLAP_FRACTION);
      if (overlap * overlapDenominator >= shorter) {
        parents[find(j)] = find(i);
      }
    }
  }
  const groups = new Map<number, SleepSession[]>();
  sessions.forEach((session, index) => {
    const root = find(index);
    const group = groups.get(root) ?? [];
    group.push(session);
    groups.set(root, group);
  });
  const preferred = new Set(options.preferredSessionIds ?? []);
  for (const id of preferred) {
    if (!sessions.some((session) => session.id === id))
      throw new RangeError('unknown-preferred-session');
  }
  const scores = new Map(
    sessions.map((session) => [
      session.id,
      richness(session, options.otherMetrics ?? []),
    ]),
  );
  const selections = new Map<string, SleepSelection>();
  for (const group of groups.values()) {
    const overrides = group.filter((session) => preferred.has(session.id));
    if (overrides.length > 1)
      throw new RangeError('conflicting-preferred-sessions');
    const ranked = [...group].sort((a, b) => {
      const aScore = scores.get(a.id)!;
      const bScore = scores.get(b.id)!;
      for (let index = 0; index < aScore.length; index += 1) {
        if (bScore[index]! > aScore[index]!) return 1;
        if (bScore[index]! < aScore[index]!) return -1;
      }
      return compareIds(a.id, b.id);
    });
    const primary = overrides[0] ?? ranked[0]!;
    for (const session of group) {
      selections.set(
        session.id,
        session.id === primary.id
          ? Object.freeze({
              session,
              status: 'primary',
              supersededBy: null,
              reason: overrides.length
                ? 'user-selection'
                : group.length === 1
                  ? 'unique'
                  : 'information-richness',
            })
          : Object.freeze({
              session,
              status: 'suppressed',
              supersededBy: primary.id,
              reason: overrides.length ? 'user-selection' : 'duplicate',
            }),
      );
    }
  }
  return Object.freeze(sessions.map((session) => selections.get(session.id)!));
}

/** One normalized sample, retaining its immutable raw provenance via the generic value. */
export interface OriginSample<T> {
  readonly id: string;
  readonly origin: string;
  readonly utc: string;
  readonly value: T;
}

/** Selected samples and all unused originals, suitable for exporting selection flags. */
export interface DenseSampleSelection<T> {
  readonly primaryOrigin: string | null;
  readonly primary: readonly OriginSample<T>[];
  readonly suppressed: readonly OriginSample<T>[];
}

/** Prefer the greatest unique-timestamp density within a half-open metric window. */
export function selectDenseSamples<T>(
  samples: readonly OriginSample<T>[],
  window: Interval,
): DenseSampleSelection<T> {
  const start = instantNanoseconds(window.startUtc);
  const end = instantNanoseconds(window.endUtc);
  if (end <= start) throw new RangeError('invalid-interval');
  const groups = new Map<string, OriginSample<T>[]>();
  for (const sample of samples) {
    const timestamp = instantNanoseconds(sample.utc);
    if (timestamp < start || timestamp >= end) continue;
    const group = groups.get(sample.origin) ?? [];
    group.push(sample);
    groups.set(sample.origin, group);
  }
  const ranked = [...groups]
    .map(([origin, group]) => ({
      origin,
      group,
      count: new Set(group.map((sample) => instantNanoseconds(sample.utc)))
        .size,
    }))
    .sort((a, b) => b.count - a.count || compareIds(a.origin, b.origin));
  const primaryOrigin = ranked[0]?.origin ?? null;
  const selected = [...(ranked[0]?.group ?? [])].sort(
    (a, b) => compareInstants(a.utc, b.utc) || compareIds(a.id, b.id),
  );
  const seen = new Set<bigint>();
  const primary = selected.filter((sample) => {
    const timestamp = instantNanoseconds(sample.utc);
    if (seen.has(timestamp)) return false;
    seen.add(timestamp);
    return true;
  });
  const used = new Set(primary);
  return Object.freeze({
    primaryOrigin,
    primary: Object.freeze(primary),
    suppressed: Object.freeze(
      [...groups.values()].flat().filter((sample) => !used.has(sample)),
    ),
  });
}

/** Additive record evidence; values remain raw and are never summed across origins. */
export interface OriginInterval<T> extends Interval {
  readonly id: string;
  readonly origin: string;
  readonly value: T;
}

/** One winning additive origin and its UTC union coverage for a declared day window. */
export interface AdditiveSelection<T> {
  readonly primaryOrigin: string | null;
  readonly coverageMilliseconds: number;
  readonly primary: readonly OriginInterval<T>[];
  readonly suppressed: readonly OriginInterval<T>[];
}

/** Choose one additive origin per explicit local-day UTC window, by union coverage. */
export function selectAdditiveRecords<T>(
  records: readonly OriginInterval<T>[],
  dayWindow: Interval,
): AdditiveSelection<T> {
  const start = instantNanoseconds(dayWindow.startUtc);
  const end = instantNanoseconds(dayWindow.endUtc);
  if (end <= start) throw new RangeError('invalid-interval');
  const groups = new Map<string, OriginInterval<T>[]>();
  for (const record of records) {
    if (overlapMilliseconds(record, dayWindow) === 0) continue;
    const group = groups.get(record.origin) ?? [];
    group.push(record);
    groups.set(record.origin, group);
  }
  const coverage = (group: readonly OriginInterval<T>[]): number =>
    unionDurationMilliseconds(
      group.map((record) => clipInterval(record, dayWindow)),
    );
  const ranked = [...groups]
    .map(([origin, group]) => ({ origin, group, coverage: coverage(group) }))
    .sort((a, b) => b.coverage - a.coverage || compareIds(a.origin, b.origin));
  const chosen = ranked[0];
  return Object.freeze({
    primaryOrigin: chosen?.origin ?? null,
    coverageMilliseconds: chosen?.coverage ?? 0,
    primary: Object.freeze([...(chosen?.group ?? [])]),
    suppressed: Object.freeze(ranked.slice(1).flatMap((entry) => entry.group)),
  });
}
