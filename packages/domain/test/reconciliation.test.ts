import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import fixtures from './fixtures/reconciliation.json' with { type: 'json' };
import type {
  RecordingMethod,
  SleepRecord,
  SleepStageType,
} from '../src/model.js';
import {
  normalizeTimestamp,
  assignDayKey,
  instantMilliseconds,
} from '../src/time.js';
import {
  asleepIntervals,
  deriveSleepMetrics,
  detectNaps,
  sleepStageState,
  totalSleepMilliseconds,
  typicalBedtimeMinutes,
} from '../src/metrics.js';
import {
  reconstructSleepSessions,
  reconcileSleepRecords,
  reconcileDenseSamples,
  reconcileAdditiveRecords,
} from '../src/reconciliation.js';
import { unionDurationMilliseconds } from '../src/intervals.js';

interface FixtureRecord {
  id: string;
  origin: string;
  start: string;
  end: string;
  modified: string;
  method: string;
  stages: readonly string[];
  offsetSeconds?: number;
}

function record(input: FixtureRecord): SleepRecord {
  const reference = {
    kind: 'offset',
    offsetSeconds: input.offsetSeconds ?? 0,
  } as const;
  const start = normalizeTimestamp(input.start, reference);
  const end = normalizeTimestamp(input.end, reference);
  const span = instantMilliseconds(end.utc) - instantMilliseconds(start.utc);
  return Object.freeze({
    id: input.id,
    type: 'sleepSession',
    source: input.method === 'manual' ? 'manual' : 'health-connect',
    origin: input.origin,
    device: null,
    recordingMethod: input.method as RecordingMethod,
    externalId: input.id,
    lastModifiedUtc: input.modified,
    start,
    end,
    keyAssignment: assignDayKey(start),
    rawPayload: { originalId: input.id },
    payload: Object.freeze({
      stages: Object.freeze(
        input.stages.map((stage, index) =>
          Object.freeze({
            stage: stage as SleepStageType,
            startUtc: new Date(
              instantMilliseconds(start.utc) +
                (span * index) / input.stages.length,
            ).toISOString(),
            endUtc: new Date(
              instantMilliseconds(start.utc) +
                (span * (index + 1)) / input.stages.length,
            ).toISOString(),
          }),
        ),
      ),
    }),
  });
}

function simple(
  id: string,
  origin = id,
  start = '2026-10-03T22:00:00Z',
  end = '2026-10-04T06:00:00Z',
): SleepRecord {
  return record({
    id,
    origin,
    start,
    end,
    modified: '2026-10-04T06:00:00Z',
    method: 'automatic',
    stages: [],
  });
}

describe('immutable source reconciliation', () => {
  it.each(fixtures)('$name', (fixture) => {
    const raw = Object.freeze(fixture.records.map(record));
    const before = JSON.stringify(raw);
    const selection = reconcileSleepRecords(raw);
    expect(selection).toHaveLength(fixture.logicalCount);
    expect(
      selection
        .filter((item) => item.status === 'primary')
        .map((item) => item.session.id)
        .sort(),
    ).toEqual(fixture.primary);
    expect(totalSleepMilliseconds(raw) / 60_000).toBe(fixture.unionMinutes);
    expect(selection.flatMap((item) => item.session.records)).toHaveLength(
      raw.length,
    );
    expect(JSON.stringify(raw)).toBe(before);
    for (const item of selection.filter(
      (entry) => entry.status === 'suppressed',
    ))
      expect(fixture.primary).toContain(item.supersededBy);
  });

  it('allows reversible primary overrides without altering any raw record', () => {
    const records = fixtures[0]!.records.map(record);
    const primary = reconcileSleepRecords(records, {
      preferredSessionIds: ['mirror'],
    });
    expect(
      primary.find((entry) => entry.status === 'primary')!.session.id,
    ).toBe('mirror');
    expect(
      reconcileSleepRecords(records).find(
        (entry) => entry.status === 'primary',
      )!.session.id,
    ).toBe('original');
    expect(() =>
      reconcileSleepRecords(records, {
        preferredSessionIds: ['mirror', 'original'],
      }),
    ).toThrow('conflicting-preferred-sessions');
    expect(() =>
      reconcileSleepRecords(records, { preferredSessionIds: ['missing'] }),
    ).toThrow('unknown-preferred-session');
  });

  it('reconciles native records with unknown local references using UTC only', () => {
    const raw = fixtures[0]!.records.map(record).map((entry) => ({
      ...entry,
      start: { utc: entry.start.utc, reference: null },
      end: { utc: entry.end.utc, reference: null },
      keyAssignment: null,
    }));
    const selection = reconcileSleepRecords(raw);
    expect(
      selection.find((entry) => entry.status === 'primary')!.session.id,
    ).toBe('original');
    expect(totalSleepMilliseconds(raw)).toBe(480 * 60_000);
    expect(selection[0]!.session.start.reference).toBeNull();
    expect(selection[0]!.session.records[0]!.keyAssignment).toBeNull();
  });

  it('uses exact half-shorter overlap and transitive duplicate components', () => {
    const records = [
      simple('a', 'a', '2026-10-03T22:00:00Z', '2026-10-04T00:00:00Z'),
      simple('b', 'b', '2026-10-03T23:00:00Z', '2026-10-04T01:00:00Z'),
      simple('c', 'c', '2026-10-04T00:00:00Z', '2026-10-04T02:00:00Z'),
    ];
    expect(
      reconcileSleepRecords(records).filter(
        (entry) => entry.status === 'primary',
      ),
    ).toHaveLength(1);
    const below = [
      records[0]!,
      simple('b', 'b', '2026-10-03T23:00:00.001Z', '2026-10-04T01:00:00.001Z'),
    ];
    expect(
      reconcileSleepRecords(below).filter(
        (entry) => entry.status === 'primary',
      ),
    ).toHaveLength(2);
  });

  it('does not stitch fragments beyond one minute or across origins', () => {
    const first = simple(
      'a',
      'one',
      '2026-10-03T22:00:00Z',
      '2026-10-04T00:00:00Z',
    );
    const after = simple(
      'b',
      'one',
      '2026-10-04T00:01:00.001Z',
      '2026-10-04T06:00:00Z',
    );
    expect(reconstructSleepSessions([first, after])).toHaveLength(2);
    expect(
      reconstructSleepSessions([
        first,
        { ...first, id: 'different', origin: 'two' },
      ]),
    ).toHaveLength(2);
  });

  it('uses richness before recording method, and other metric evidence before timestamps', () => {
    const generic = simple('automatic');
    const rich = record({
      id: 'manual',
      origin: 'manual',
      start: generic.start.utc,
      end: generic.end.utc,
      modified: generic.lastModifiedUtc,
      method: 'manual',
      stages: ['LIGHT', 'DEEP'],
    });
    expect(
      reconcileSleepRecords([generic, rich]).find(
        (entry) => entry.status === 'primary',
      )!.session.id,
    ).toBe('manual');
    expect(
      reconcileSleepRecords([simple('a'), simple('b')], {
        otherMetrics: [
          { origin: 'b', startUtc: generic.start.utc, endUtc: generic.end.utc },
        ],
      }).find((entry) => entry.status === 'primary')!.session.id,
    ).toBe('b');
  });

  it('uses instantaneous other-metric evidence and excludes the sleep end boundary', () => {
    const raw = [simple('a'), simple('b')];
    const choose = (utc: string) =>
      reconcileSleepRecords(raw, {
        otherMetrics: [{ origin: 'b', startUtc: utc, endUtc: utc }],
      }).find((entry) => entry.status === 'primary')!.session.id;
    expect(choose('2026-10-03T22:00:00Z')).toBe('b');
    expect(choose('2026-10-04T02:00:00Z')).toBe('b');
    expect(choose('2026-10-04T06:00:00Z')).toBe('a');
  });

  it('preserves native nanoseconds in stitch, overlap, and last-modified decisions', () => {
    const first = simple(
      'first',
      'watch',
      '2026-10-03T22:00:00Z',
      '2026-10-04T00:00:00Z',
    );
    const touching = simple(
      'touching',
      'watch',
      '2026-10-04T00:01:00Z',
      '2026-10-04T06:00:00Z',
    );
    const separated = simple(
      'separated',
      'watch',
      '2026-10-04T00:01:00.000000001Z',
      '2026-10-04T06:00:00Z',
    );
    expect(reconstructSleepSessions([first, touching])).toHaveLength(1);
    expect(reconstructSleepSessions([first, separated])).toHaveLength(2);
    const halfBelow = simple(
      'second',
      'mirror',
      '2026-10-03T23:00:00.000000001Z',
      '2026-10-04T01:00:00.000000001Z',
    );
    expect(
      reconcileSleepRecords([first, halfBelow]).filter(
        (entry) => entry.status === 'primary',
      ),
    ).toHaveLength(2);
    const a = {
      ...simple('a'),
      lastModifiedUtc: '2026-10-04T06:00:00.000000002Z',
    };
    const b = {
      ...simple('b'),
      lastModifiedUtc: '2026-10-04T06:00:00.000000001Z',
    };
    expect(
      reconcileSleepRecords([a, b]).find((entry) => entry.status === 'primary')!
        .session.id,
    ).toBe('b');
  });

  it('retains distinct nanosecond samples and clips additive coverage without truncation', () => {
    const result = reconcileDenseSamples(
      [
        {
          id: 'a',
          origin: 'a',
          utc: '2026-10-03T22:00:00.000000001Z',
          value: 60,
        },
        {
          id: 'b1',
          origin: 'b',
          utc: '2026-10-03T22:00:00.000000001Z',
          value: 61,
        },
        {
          id: 'b2',
          origin: 'b',
          utc: '2026-10-03T22:00:00.000000002Z',
          value: 62,
        },
      ],
      {
        startUtc: '2026-10-03T22:00:00Z',
        endUtc: '2026-10-03T22:00:00.000000003Z',
      },
    );
    expect(result.primaryOrigin).toBe('b');
    expect(result.primary.map((sample) => sample.id)).toEqual(['b1', 'b2']);
    const coverage = reconcileAdditiveRecords(
      [
        {
          id: 'a',
          origin: 'a',
          value: 1,
          startUtc: '2026-10-03T22:00:00Z',
          endUtc: '2026-10-03T22:00:00.000000003Z',
        },
      ],
      {
        startUtc: '2026-10-03T22:00:00.000000001Z',
        endUtc: '2026-10-03T22:00:00.000000002Z',
      },
    );
    expect(coverage.coverageMilliseconds).toBe(0.000001);
  });

  it('prefers unique sample density, collapses equivalent UTC timestamps, and excludes window edges', () => {
    const samples = [
      { id: 'a1', origin: 'a', utc: '2026-10-03T22:00:00Z', value: 60 },
      { id: 'a2', origin: 'a', utc: '2026-10-03T22:00:00Z', value: 61 },
      { id: 'b2', origin: 'b', utc: '2026-10-03T22:00:00Z', value: 62 },
      { id: 'b1', origin: 'b', utc: '2026-10-04T05:00:00+07:00', value: 63 },
      { id: 'b3', origin: 'b', utc: '2026-10-03T23:00:00Z', value: 64 },
      { id: 'outside', origin: 'a', utc: '2026-10-04T06:00:00Z', value: 65 },
    ];
    const result = reconcileDenseSamples(samples, {
      startUtc: '2026-10-03T22:00:00Z',
      endUtc: '2026-10-04T06:00:00Z',
    });
    expect(result.primaryOrigin).toBe('b');
    expect(result.primary.map((sample) => sample.id)).toEqual(['b1', 'b3']);
    expect(result.suppressed.map((sample) => sample.id).sort()).toEqual([
      'a1',
      'a2',
      'b2',
    ]);
  });

  it('chooses additive coverage by union, clipped to the day, never by summed origin totals', () => {
    const window = {
      startUtc: '2026-10-04T00:00:00Z',
      endUtc: '2026-10-05T00:00:00Z',
    };
    const result = reconcileAdditiveRecords(
      [
        {
          id: 'a1',
          origin: 'a',
          value: 1_000,
          startUtc: window.startUtc,
          endUtc: '2026-10-04T06:00:00Z',
        },
        {
          id: 'a2',
          origin: 'a',
          value: 1_000,
          startUtc: window.startUtc,
          endUtc: '2026-10-04T06:00:00Z',
        },
        {
          id: 'b',
          origin: 'b',
          value: 500,
          startUtc: '2026-10-03T22:00:00Z',
          endUtc: '2026-10-04T08:00:00Z',
        },
      ],
      window,
    );
    expect(result.primaryOrigin).toBe('b');
    expect(result.coverageMilliseconds).toBe(8 * 60 * 60_000);
    expect(result.primary).toHaveLength(1);
    expect(result.suppressed).toHaveLength(2);
  });

  it('never inflates a UTC-union total when duplicates are added or reordered', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.tuple(
            fc.integer({ min: 0, max: 1_000 }),
            fc.integer({ min: 1, max: 500 }),
          ),
          { maxLength: 30 },
        ),
        (spans) => {
          const raw = spans.map(([start, duration], index) =>
            simple(
              `raw-${index}`,
              `origin-${index}`,
              new Date(Date.UTC(2026, 9, 3) + start * 60_000).toISOString(),
              new Date(
                Date.UTC(2026, 9, 3) + (start + duration) * 60_000,
              ).toISOString(),
            ),
          );
          const duplicate = raw.map((entry) => ({
            ...entry,
            id: `copy-${entry.id}`,
            origin: `copy-${entry.origin}`,
          }));
          const expected = unionDurationMilliseconds(
            raw.map((entry) => ({
              startUtc: entry.start.utc,
              endUtc: entry.end.utc,
            })),
          );
          expect(totalSleepMilliseconds([...raw, ...duplicate].reverse())).toBe(
            expected,
          );
          expect(
            totalSleepMilliseconds(
              reconcileSleepRecords([...raw, ...duplicate]).flatMap(
                (entry) => entry.session.records,
              ),
            ),
          ).toBe(expected);
        },
      ),
      { numRuns: 200 },
    );
  });
});

describe('descriptive sleep metrics and nap classification', () => {
  it('maps every stage and counts only AWAKE episodes strictly over three minutes', () => {
    expect(
      ['SLEEPING', 'LIGHT', 'DEEP', 'REM'].map((stage) =>
        sleepStageState(stage as SleepStageType),
      ),
    ).toEqual(['asleep', 'asleep', 'asleep', 'asleep']);
    expect(sleepStageState('AWAKE')).toBe('awake');
    expect(sleepStageState('AWAKE_IN_BED')).toBe('awake');
    expect(sleepStageState('UNKNOWN')).toBe('excluded');
    expect(sleepStageState('OUT_OF_BED')).toBe('excluded');
    const base = simple(
      'a',
      'a',
      '2026-10-03T22:00:00Z',
      '2026-10-03T23:00:00Z',
    );
    const input: SleepRecord = {
      ...base,
      payload: {
        stages: [
          {
            stage: 'LIGHT',
            startUtc: base.start.utc,
            endUtc: '2026-10-03T22:20:00Z',
          },
          {
            stage: 'AWAKE',
            startUtc: '2026-10-03T22:20:00Z',
            endUtc: '2026-10-03T22:23:00Z',
          },
          {
            stage: 'DEEP',
            startUtc: '2026-10-03T22:23:00Z',
            endUtc: '2026-10-03T22:40:00Z',
          },
          {
            stage: 'AWAKE',
            startUtc: '2026-10-03T22:40:00Z',
            endUtc: '2026-10-03T22:44:00Z',
          },
          {
            stage: 'AWAKE_IN_BED',
            startUtc: '2026-10-03T22:44:00Z',
            endUtc: base.end.utc,
          },
        ],
      },
    };
    const session = reconstructSleepSessions([input])[0]!;
    expect(deriveSleepMetrics(session)).toMatchObject({
      spanMilliseconds: 60 * 60_000,
      asleepMilliseconds: 37 * 60_000,
      awakeningCount: 1,
      awakeningMilliseconds: 4 * 60_000,
    });
    expect(
      deriveSleepMetrics(session, {
        awakeningThresholdMilliseconds: 2 * 60_000,
      }).awakeningCount,
    ).toBe(2);
    expect(asleepIntervals([input, input])).toHaveLength(2);
  });

  it.each([
    ['2026-03-08T00:00:00-05:00', '2026-03-08T08:00:00-04:00', 420],
    ['2026-11-01T00:00:00-04:00', '2026-11-01T08:00:00-05:00', 540],
  ])('uses UTC sleep durations across DST: %s', (start, end, minutes) => {
    expect(
      deriveSleepMetrics(
        reconstructSleepSessions([simple('dst', 'dst', start, end)])[0]!,
      ).asleepMilliseconds,
    ).toBe(minutes * 60_000);
  });

  it('keeps fragmented sleep inside the main session and finds only daytime intervals over ten minutes', () => {
    const base = simple('main');
    const main = {
      ...base,
      payload: {
        stages: [
          {
            stage: 'LIGHT' as const,
            startUtc: base.start.utc,
            endUtc: '2026-10-04T02:00:00Z',
          },
          {
            stage: 'AWAKE' as const,
            startUtc: '2026-10-04T02:00:00Z',
            endUtc: '2026-10-04T02:10:00Z',
          },
          {
            stage: 'DEEP' as const,
            startUtc: '2026-10-04T02:10:00Z',
            endUtc: base.end.utc,
          },
        ],
      },
    };
    const sessions = reconstructSleepSessions([
      main,
      simple('nap', 'nap', '2026-10-04T12:00:00Z', '2026-10-04T12:20:00Z'),
      simple('noise', 'noise', '2026-10-04T14:00:00Z', '2026-10-04T14:10:00Z'),
    ]);
    const result = detectNaps(sessions, {
      windowStart: normalizeTimestamp(base.start.utc, {
        kind: 'offset',
        offsetSeconds: 0,
      }),
      targetBedtimeMinutes: 1_320,
    });
    expect(result.status).toBe('classified');
    if (result.status !== 'classified')
      throw new Error('unexpected-unresolved');
    expect(result.primarySessionId).toBe('main');
    expect(result.primaryAsleepMilliseconds).toBe(470 * 60_000);
    expect(result.naps).toEqual([
      {
        startUtc: '2026-10-04T12:00:00.000Z',
        endUtc: '2026-10-04T12:20:00.000Z',
        durationMilliseconds: 20 * 60_000,
      },
    ]);
  });

  it('uses a circular historical median, requires an aligned explicit anchor, and returns typed unresolved states', () => {
    const timestamp = (iso: string) =>
      normalizeTimestamp(iso, { kind: 'offset', offsetSeconds: 0 });
    const history = [
      timestamp('2026-10-01T23:50:00Z'),
      timestamp('2026-10-02T00:10:00Z'),
      timestamp('2026-10-03T00:00:00Z'),
    ];
    expect(typicalBedtimeMinutes(history)).toBe(0);
    expect(
      detectNaps([], { windowStart: timestamp('2026-10-04T00:00:00Z') }),
    ).toEqual({ status: 'unresolved', reason: 'no-bedtime-reference' });
    expect(
      detectNaps([], {
        windowStart: timestamp('2026-10-04T00:00:00Z'),
        primarySessionHistory: history,
      }),
    ).toEqual({ status: 'unresolved', reason: 'no-sleep-in-window' });
    expect(() =>
      detectNaps([], {
        windowStart: timestamp('2026-10-04T01:00:00Z'),
        primarySessionHistory: history,
      }),
    ).toThrow('unaligned-bedtime-anchor');
  });

  it('allows explicit main-session selection and rejects overrides outside the bounded window', () => {
    const sessions = reconstructSleepSessions([
      simple('long'),
      simple(
        'chosen',
        'chosen',
        '2026-10-04T12:00:00Z',
        '2026-10-04T12:30:00Z',
      ),
    ]);
    const options = {
      windowStart: normalizeTimestamp('2026-10-03T22:00:00Z', {
        kind: 'offset',
        offsetSeconds: 0,
      }),
      targetBedtimeMinutes: 1_320,
    };
    const result = detectNaps(sessions, {
      ...options,
      preferredPrimarySessionId: 'chosen',
    });
    expect(result).toMatchObject({
      status: 'classified',
      primarySessionId: 'chosen',
      primaryWindow: {
        startUtc: '2026-10-04T12:00:00.000Z',
        endUtc: '2026-10-04T12:30:00.000Z',
      },
    });
    expect(() =>
      detectNaps(sessions, {
        ...options,
        preferredPrimarySessionId: 'missing',
      }),
    ).toThrow('unknown-primary-session-in-window');
  });

  it('clips stages and applies awakening thresholds without dropping nanosecond precision', () => {
    const base = simple(
      'precise',
      'precise',
      '2026-10-03T22:00:00.000000001Z',
      '2026-10-03T22:04:00Z',
    );
    const precise: SleepRecord = {
      ...base,
      payload: {
        stages: [
          {
            stage: 'LIGHT',
            startUtc: '2026-10-03T22:00:00Z',
            endUtc: '2026-10-03T22:00:00.000000002Z',
          },
          {
            stage: 'AWAKE',
            startUtc: '2026-10-03T22:00:00.000000002Z',
            endUtc: '2026-10-03T22:03:00.000000003Z',
          },
        ],
      },
    };
    const metrics = deriveSleepMetrics(reconstructSleepSessions([precise])[0]!);
    expect(metrics.asleepMilliseconds).toBe(0.000001);
    expect(metrics.asleep).toEqual([
      {
        startUtc: '2026-10-03T22:00:00.000000001Z',
        endUtc: '2026-10-03T22:00:00.000000002Z',
      },
    ]);
    expect(metrics.awakeningCount).toBe(1);
    expect(metrics.awakeningMilliseconds).toBe(180_000.000001);
  });
});
