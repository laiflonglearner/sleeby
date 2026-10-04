import { readFileSync } from 'node:fs';
import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  fisherZConfidenceInterval,
  pearsonCorrelation,
  pointBiserialCorrelation,
  welchMeanDifference,
  type StatisticalResult,
} from '../src/statistics.js';

interface FixtureInterval {
  readonly lower: number;
  readonly upper: number;
}

interface ContinuousFixture {
  readonly name: string;
  readonly predictor: readonly number[];
  readonly outcome: readonly number[];
  readonly coefficient: number;
  readonly confidenceInterval: FixtureInterval;
}

interface BinaryFixture {
  readonly name: string;
  readonly groupZero: readonly number[];
  readonly groupOne: readonly number[];
  readonly coefficient: number;
  readonly groupZeroMean: number;
  readonly groupOneMean: number;
  readonly difference: number;
  readonly standardError: number;
  readonly degreesOfFreedom: number;
  readonly confidenceInterval: FixtureInterval;
}

interface ReferenceFixtures {
  readonly reference: {
    readonly implementation: string;
    readonly scipyVersion: string;
  };
  readonly continuous: readonly ContinuousFixture[];
  readonly binary: readonly BinaryFixture[];
}

const fixtures = JSON.parse(
  readFileSync(new URL('./fixtures/statistics.json', import.meta.url), 'utf8'),
) as ReferenceFixtures;

function computed<T>(result: StatisticalResult<T>): T {
  expect(result.status).toBe('computed');
  if (result.status !== 'computed')
    throw new Error(`Unexpected unavailable statistic: ${result.reason}`);
  return result.value;
}

describe('committed SciPy reference fixtures', () => {
  it('records reference provenance', () => {
    expect(fixtures.reference.implementation).toBe('SciPy');
    expect(fixtures.reference.scipyVersion).toMatch(/^\d+\.\d+\.\d+$/);
    expect(fixtures.continuous.length).toBeGreaterThan(10);
    expect(fixtures.binary.length).toBeGreaterThan(10);
  });

  for (const fixture of fixtures.continuous) {
    it(`matches Pearson and Fisher z for ${fixture.name}`, () => {
      const coefficient = computed(
        pearsonCorrelation(fixture.predictor, fixture.outcome),
      );
      expect(coefficient).toBeCloseTo(fixture.coefficient, 12);
      const interval = computed(
        fisherZConfidenceInterval(coefficient, fixture.predictor.length),
      );
      expect(interval.confidenceLevel).toBe(0.95);
      expect(interval.lower).toBeCloseTo(fixture.confidenceInterval.lower, 11);
      expect(interval.upper).toBeCloseTo(fixture.confidenceInterval.upper, 11);
    });
  }

  for (const fixture of fixtures.binary) {
    it(`matches point-biserial and Welch for ${fixture.name}`, () => {
      const predictor = [
        ...fixture.groupZero.map(() => 0),
        ...fixture.groupOne.map(() => 1),
      ];
      const outcome = [...fixture.groupZero, ...fixture.groupOne];
      const coefficient = computed(
        pointBiserialCorrelation(predictor, outcome),
      );
      expect(coefficient).toBeCloseTo(fixture.coefficient, 12);
      expect(coefficient).toBe(
        computed(pearsonCorrelation(predictor, outcome)),
      );
      const comparison = computed(
        welchMeanDifference(fixture.groupZero, fixture.groupOne),
      );
      expect(comparison.groupZeroMean).toBeCloseTo(fixture.groupZeroMean, 12);
      expect(comparison.groupOneMean).toBeCloseTo(fixture.groupOneMean, 12);
      expect(comparison.difference).toBeCloseTo(fixture.difference, 12);
      expect(comparison.standardError).toBeCloseTo(fixture.standardError, 12);
      expect(comparison.degreesOfFreedom).toBeCloseTo(
        fixture.degreesOfFreedom,
        11,
      );
      expect(comparison.confidenceInterval.confidenceLevel).toBe(0.95);
      expect(comparison.confidenceInterval.lower).toBeCloseTo(
        fixture.confidenceInterval.lower,
        10,
      );
      expect(comparison.confidenceInterval.upper).toBeCloseTo(
        fixture.confidenceInterval.upper,
        10,
      );
    });
  }
});

describe('undefined and invalid numerical states', () => {
  it('rejects unequal paired lengths', () => {
    expect(pearsonCorrelation([1, 2], [1])).toEqual({
      status: 'unavailable',
      reason: 'mismatched-observations',
    });
  });

  it('rejects insufficient observations', () => {
    expect(pearsonCorrelation([1], [2])).toEqual({
      status: 'unavailable',
      reason: 'insufficient-observations',
    });
    expect(welchMeanDifference([1], [1, 2])).toEqual({
      status: 'unavailable',
      reason: 'insufficient-observations',
    });
    expect(fisherZConfidenceInterval(0.5, 3)).toEqual({
      status: 'unavailable',
      reason: 'insufficient-observations',
    });
    expect(fisherZConfidenceInterval(0.5, 7.5)).toEqual({
      status: 'unavailable',
      reason: 'insufficient-observations',
    });
  });

  it('never treats non-finite observations as missing-at-random data', () => {
    for (const invalid of [NaN, Infinity, -Infinity]) {
      expect(pearsonCorrelation([1, invalid], [1, 2])).toEqual({
        status: 'unavailable',
        reason: 'non-finite-observation',
      });
      expect(welchMeanDifference([1, invalid], [1, 2])).toEqual({
        status: 'unavailable',
        reason: 'non-finite-observation',
      });
    }
  });

  it('rejects constant variables and an undefined zero-variance Welch interval', () => {
    expect(pearsonCorrelation([2, 2], [1, 2])).toEqual({
      status: 'unavailable',
      reason: 'constant-variable',
    });
    expect(pearsonCorrelation([1, 2], [2, 2])).toEqual({
      status: 'unavailable',
      reason: 'constant-variable',
    });
    expect(pointBiserialCorrelation([1, 1], [1, 2])).toEqual({
      status: 'unavailable',
      reason: 'constant-variable',
    });
    expect(welchMeanDifference([2, 2], [3, 3])).toEqual({
      status: 'unavailable',
      reason: 'constant-variable',
    });
  });

  it('requires explicit binary coding', () => {
    expect(pointBiserialCorrelation([0, 2], [1, 2])).toEqual({
      status: 'unavailable',
      reason: 'invalid-binary-predictor',
    });
  });

  it('rejects an invalid correlation before computing an interval', () => {
    for (const coefficient of [NaN, Infinity, -1.1, 1.1]) {
      expect(fisherZConfidenceInterval(coefficient, 7)).toEqual({
        status: 'unavailable',
        reason: 'invalid-correlation',
      });
    }
  });

  it('handles perfect correlation at the mathematical limit', () => {
    expect(computed(fisherZConfidenceInterval(1, 7))).toEqual({
      lower: 1,
      upper: 1,
      confidenceLevel: 0.95,
    });
    expect(computed(fisherZConfidenceInterval(-1, 7))).toEqual({
      lower: -1,
      upper: -1,
      confidenceLevel: 0.95,
    });
  });

  it('does not overflow Pearson products for finite large inputs', () => {
    expect(
      computed(
        pearsonCorrelation([1e300, 2e300, 3e300], [3e300, 2e300, 1e300]),
      ),
    ).toBeCloseTo(-1, 14);
  });

  it('does not overflow Pearson means for repeated maximum finite inputs', () => {
    expect(
      pearsonCorrelation([Number.MAX_VALUE, Number.MAX_VALUE], [1, 2]),
    ).toEqual({ status: 'unavailable', reason: 'constant-variable' });
  });

  it('retains finite tiny observations when one Welch group contains only zeros', () => {
    const ordinary = computed(
      welchMeanDifference([0, 0, 0, 0, 0], [1, 2, 3, 4, 5]),
    );
    const tiny = computed(
      welchMeanDifference(
        [0, 0, 0, 0, 0],
        [1e-300, 2e-300, 3e-300, 4e-300, 5e-300],
      ),
    );
    expect(tiny.difference / 1e-300).toBeCloseTo(ordinary.difference, 12);
    expect(tiny.confidenceInterval.lower / 1e-300).toBeCloseTo(
      ordinary.confidenceInterval.lower,
      12,
    );
    expect(tiny.confidenceInterval.upper / 1e-300).toBeCloseTo(
      ordinary.confidenceInterval.upper,
      12,
    );
  });
});

describe('statistical invariants', () => {
  const variedValues = fc
    .array(fc.integer({ min: -1000, max: 1000 }), {
      minLength: 5,
      maxLength: 30,
    })
    .filter((values) => new Set(values).size > 1);

  it('is invariant under positive affine transformations', () => {
    fc.assert(
      fc.property(
        variedValues,
        fc.integer({ min: 1, max: 100 }),
        fc.integer({ min: -100, max: 100 }),
        (values, scale, offset) => {
          expect(
            computed(
              pearsonCorrelation(
                values,
                values.map((value) => value * scale + offset),
              ),
            ),
          ).toBeCloseTo(1, 12);
        },
      ),
    );
  });

  it('reverses Welch orientation and interval endpoints when groups are exchanged', () => {
    fc.assert(
      fc.property(variedValues, variedValues, (zero, one) => {
        const forward = computed(welchMeanDifference(zero, one));
        const reversed = computed(welchMeanDifference(one, zero));
        expect(forward.difference).toBeCloseTo(-reversed.difference, 10);
        expect(forward.confidenceInterval.lower).toBeCloseTo(
          -reversed.confidenceInterval.upper,
          10,
        );
        expect(forward.confidenceInterval.upper).toBeCloseTo(
          -reversed.confidenceInterval.lower,
          10,
        );
      }),
    );
  });

  it('preserves every caller-owned observation array', () => {
    const zero = Object.freeze([0, 1, 2, 3, 4]);
    const one = Object.freeze([1, 2, 3, 4, 5]);
    computed(pearsonCorrelation(zero, one));
    computed(welchMeanDifference(zero, one));
    expect(zero).toEqual([0, 1, 2, 3, 4]);
    expect(one).toEqual([1, 2, 3, 4, 5]);
  });
});
