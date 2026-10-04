import { instantNanoseconds, normalizeUtcInstant } from './time.js';

/** Positive half-open UTC interval, with the end excluded. */
export interface Interval {
  readonly startUtc: string;
  readonly endUtc: string;
}

function epochInterval(interval: Interval): [bigint, bigint, string, string] {
  const start = instantNanoseconds(interval.startUtc);
  const end = instantNanoseconds(interval.endUtc);
  if (end <= start) throw new RangeError('invalid-interval');
  return [
    start,
    end,
    normalizeUtcInstant(interval.startUtc),
    normalizeUtcInstant(interval.endUtc),
  ];
}

/** Merge touching or overlapping intervals without changing any input record. */
export function unionIntervals(
  intervals: readonly Interval[],
): readonly Interval[] {
  const ordered = intervals
    .map(epochInterval)
    .sort((a, b) =>
      a[0] < b[0]
        ? -1
        : a[0] > b[0]
          ? 1
          : a[1] < b[1]
            ? -1
            : a[1] > b[1]
              ? 1
              : 0,
    );
  const union: [bigint, bigint, string, string][] = [];
  for (const interval of ordered) {
    const [start, end] = interval;
    const previous = union.at(-1);
    if (previous && start <= previous[1]) {
      if (end > previous[1]) {
        previous[1] = end;
        previous[3] = interval[3];
      }
    } else union.push([...interval]);
  }
  return union.map(([, , startUtc, endUtc]) =>
    Object.freeze({
      startUtc,
      endUtc,
    }),
  );
}

/** Night totals are the measure of the union, independent of duplicate selection. */
export function unionDurationMilliseconds(
  intervals: readonly Interval[],
): number {
  return (
    Number(
      unionIntervals(intervals).reduce(
        (total, interval) =>
          total +
          instantNanoseconds(interval.endUtc) -
          instantNanoseconds(interval.startUtc),
        0n,
      ),
    ) / 1_000_000
  );
}

/** Real elapsed intersection used for duplicate detection and bounded coverage. */
export function overlapMilliseconds(a: Interval, b: Interval): number {
  const [aStart, aEnd] = epochInterval(a);
  const [bStart, bEnd] = epochInterval(b);
  const end = aEnd < bEnd ? aEnd : bEnd;
  const start = aStart > bStart ? aStart : bStart;
  return end > start ? Number(end - start) / 1_000_000 : 0;
}
