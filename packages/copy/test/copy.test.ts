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
    ).toEqual({ description: COPY_TEMPLATES.unavailable });
  });
  it('includes paired sample size, interval and optional width explanation', () => {
    const result: CorrelationResult = {
      ...metadata,
      status: 'computed',
      method: 'pearson',
      coefficient: 0.25,
      confidenceInterval: { lower: -0.6, upper: 0.8, confidenceLevel: 0.95 },
      intervalWide: true,
    };
    const copy = resolveCorrelationCopy(result);
    expect(copy.description).toContain('7 paired days');
    expect(copy.interval).toBe('The 95% interval runs from -0.6 to 0.8.');
    expect(copy.width).toBe(COPY_TEMPLATES.wide);
    expect(
      resolveCorrelationCopy({ ...result, intervalWide: false }),
    ).not.toHaveProperty('width');
  });
  it.each(['meal-awakenings', 'caffeine-awakenings'] as const)(
    'labels binary counts and signed difference unambiguously for %s',
    (pair) => {
      const copy = resolveCorrelationCopy({
        ...metadata,
        pair,
        status: 'computed',
        method: 'point-biserial',
        coefficient: 0.1,
        difference: -0.5,
        groupSizes: [5, 6],
        medianCutoffMinute: 1000,
        groupMeans: [3, 2.5],
        confidenceInterval: { lower: -2, upper: 1, confidenceLevel: 0.95 },
        intervalWide: false,
      });
      expect(copy.description).toContain('later-cutoff minus earlier-cutoff');
      expect(copy.description).toContain('contains 5 nights');
      expect(copy.description).toContain('contains 6 nights');
      expect(copy.description).not.toMatch(/\{[a-z]+\}/);
    },
  );
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
