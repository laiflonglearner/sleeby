import { expect, it } from 'vitest';
import fc from 'fast-check';
import {
  unionDurationMilliseconds,
  unionIntervals,
  overlapMilliseconds,
} from '../src/intervals.js';
import { downsampleLttb } from '../src/downsampling.js';

const interval = (start: number, end: number) => ({
  startUtc: new Date(start).toISOString(),
  endUtc: new Date(end).toISOString(),
});

it('retains sub-millisecond spans without quantizing or double-counting them', () => {
  const tiny = {
    startUtc: '2026-10-04T00:00:00.000000001Z',
    endUtc: '2026-10-04T00:00:00.000000002Z',
  };
  expect(unionIntervals([tiny, tiny])).toEqual([tiny]);
  expect(unionDurationMilliseconds([tiny, tiny])).toBe(0.000001);
  expect(overlapMilliseconds(tiny, tiny)).toBe(0.000001);
});

it('unions duplicate and overlapping intervals rather than adding them', () => {
  const input = [
    interval(0, 10_000),
    interval(5_000, 15_000),
    interval(0, 10_000),
  ];
  expect(unionDurationMilliseconds(input)).toBe(15_000);
  expect(unionIntervals(input)).toEqual([interval(0, 15_000)]);
  expect(overlapMilliseconds(input[0]!, input[1]!)).toBe(5_000);
  expect(input).toHaveLength(3);
});

it('duplicate count and order never change the interval-union total', () => {
  fc.assert(
    fc.property(
      fc.array(
        fc.tuple(
          fc.integer({ min: 0, max: 100_000 }),
          fc.integer({ min: 1, max: 10_000 }),
        ),
        { maxLength: 100 },
      ),
      (spans) => {
        const input = spans.map(([start, length]) =>
          interval(start, start + length),
        );
        const total = unionDurationMilliseconds(input);
        expect(unionDurationMilliseconds([...input, ...input].reverse())).toBe(
          total,
        );
        expect(total).toBeLessThanOrEqual(
          spans.reduce((sum, [, length]) => sum + length, 0),
        );
      },
    ),
    { numRuns: 500 },
  );
});

it('downsamples display data while retaining endpoints and raw point identity', () => {
  const points = Array.from({ length: 100 }, (_, x) =>
    Object.freeze({ x, y: Math.sin(x) }),
  );
  const before = JSON.stringify(points);
  const display = downsampleLttb(points, 10);
  expect(display).toHaveLength(10);
  expect(display[0]).toBe(points[0]);
  expect(display.at(-1)).toBe(points.at(-1));
  expect(JSON.stringify(points)).toBe(before);
  expect(() =>
    downsampleLttb(
      [
        { x: 1, y: 0 },
        { x: 1, y: 3 },
      ],
      3,
    ),
  ).toThrow();
});
