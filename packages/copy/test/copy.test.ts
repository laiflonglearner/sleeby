import { describe, expect, it } from 'vitest';
import type { CorrelationResult } from '@sleeby/domain';
import {
  COPY_TEMPLATES,
  resolveCorrelationCopy,
  resolveTrendCopy,
} from '../src/index.js';

const metadata = {
  pair: 'screen-energy',
  windowDays: 14,
  startNightKey: '2026-10-01',
  endNightKey: '2026-10-14',
  sampleSize: 7,
} as const;
describe('reviewed template resolution', () => {
  it('keeps the accepted manual-entry words together', () => {
    expect(COPY_TEMPLATES.dayStartTitle).toBe('When should your day start?');
    expect(COPY_TEMPLATES.saveFailed).toBe(
      'Your changes could not be saved. They are still here. Try again.',
    );
    expect(COPY_TEMPLATES.mainSleepMissing).toBe('Main sleep not chosen yet');
    expect(COPY_TEMPLATES.caffeineFree).toBe('I had no caffeine');
  });
  it('covers insufficient and unavailable states', () => {
    expect(
      resolveCorrelationCopy({ ...metadata, status: 'insufficient-data' }),
    ).toEqual({ description: COPY_TEMPLATES.insufficient });
    expect(
      resolveCorrelationCopy({
        ...metadata,
        status: 'unavailable',
        reason: 'constant-variable',
      }),
    ).toEqual({ description: COPY_TEMPLATES.unavailableConstant });
    expect(
      resolveCorrelationCopy({
        ...metadata,
        status: 'unavailable',
        reason: 'numerical-failure',
      }),
    ).toEqual({ description: COPY_TEMPLATES.unavailable });
  });
  it('includes sample size, interval and optional width explanation', () => {
    const result: CorrelationResult = {
      ...metadata,
      status: 'computed',
      method: 'pearson',
      coefficient: 0.25,
      confidenceInterval: { lower: -0.6, upper: 0.8, confidenceLevel: 0.95 },
      intervalWide: true,
    };
    const copy = resolveCorrelationCopy(result);
    expect(copy.description).toContain('On 7 days with both measurements');
    expect(copy.description).toContain(
      'At -1, more screen-free time goes with lower energy.',
    );
    expect(copy.interval).toBe(
      'Your result is 0.25. Every day is a bit different, so it could be anywhere from -0.6 to 0.8 (95% range).',
    );
    expect(copy.width).toBe(COPY_TEMPLATES.wide);
    expect(
      resolveCorrelationCopy({ ...result, intervalWide: false }),
    ).not.toHaveProperty('width');
  });
  it.each(['meal-awakenings', 'caffeine-awakenings'] as const)(
    'labels hours-before-sleep groups, signed difference and the line for %s',
    (pair) => {
      const result = {
        ...metadata,
        pair,
        status: 'computed',
        method: 'point-biserial',
        coefficient: 0.1,
        difference: -0.5,
        groupSizes: [5, 6],
        hoursBeforeSleepLine: 3.5,
        lineSource: 'chosen',
        groupMeans: [3, 2.5],
        confidenceInterval: { lower: -2, upper: 1, confidenceLevel: 0.95 },
        intervalWide: false,
      } as const;
      const copy = resolveCorrelationCopy(result);
      expect(copy.description).toContain(
        `Average awakenings per night: 2.5 when your last ${pair === 'meal-awakenings' ? 'meal' : 'caffeine'} was 3.5+ hours before sleep (6 nights), 3 when it was closer to sleep (5 nights). Difference: -0.5.`,
      );
      expect(copy.description).toContain('You chose the 3.5 hour mark.');
      expect(copy.description).not.toMatch(/\{[a-z]+\}/);
      expect(
        resolveCorrelationCopy({ ...result, lineSource: 'median' }).description,
      ).toContain('The 3.5 hour mark is the middle of your nights.');
    },
  );
  it('describes the no-caffeine comparison without an hours line', () => {
    const copy = resolveCorrelationCopy({
      ...metadata,
      pair: 'no-caffeine-awakenings',
      status: 'computed',
      method: 'point-biserial',
      coefficient: 0.1,
      difference: 0.25,
      groupSizes: [6, 7],
      groupMeans: [2, 2.25],
      confidenceInterval: { lower: -2, upper: 1, confidenceLevel: 0.95 },
      intervalWide: false,
    });
    expect(copy.description).toBe(
      'Average awakenings per night: 2.25 on nights with caffeine (7 nights), 2 on nights with none (6 nights). Difference: 0.25.',
    );
  });
  it('covers every fixed trend state and label', () => {
    for (const metric of [
      'awakeningCount',
      'morningEnergy',
      'screenFreeMinutes',
      'sleepMinutes',
    ] as const) {
      for (const state of [
        'higher',
        'lower',
        'equal',
        'insufficient',
        'unavailable',
      ] as const)
        expect(resolveTrendCopy(metric, state)).not.toMatch(/\{|undefined/);
    }
  });
  it('contains no causal, diagnostic, score or judgment claims', () => {
    for (const template of Object.values(COPY_TEMPLATES)) {
      expect(template).not.toMatch(
        /causes?|improves?|worsens?|healthy|unhealthy|bad sleep|good sleep|recovery score|sleep score|should sleep|recommend/i,
      );
      expect(template).not.toContain(String.fromCharCode(0x2014));
    }
  });
});
