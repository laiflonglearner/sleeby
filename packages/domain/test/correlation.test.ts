import { describe, expect, it } from 'vitest';
import {
  analyzeCorrelations,
  CORRELATION_PAIRS,
  outcomeFromReport,
} from '../src/correlation.js';
import type { NightOutcome } from '../src/correlation.js';
import type { HabitEntry } from '../src/model.js';
import { assignDayKey, normalizeTimestamp } from '../src/time.js';

const offset = { kind: 'offset', offsetSeconds: 0 } as const;
function dataset(count: number): {
  habits: HabitEntry[];
  outcomes: NightOutcome[];
} {
  const habits: HabitEntry[] = [];
  const outcomes: NightOutcome[] = [];
  for (let index = 0; index < count; index += 1) {
    const date = new Date(Date.UTC(2026, 9, index + 1));
    date.setUTCHours(18, index * 2);
    const timestamp = normalizeTimestamp(date.toISOString(), offset);
    const keyAssignment = assignDayKey(timestamp);
    habits.push({
      id: `habit-${index}`,
      timestamp,
      keyAssignment,
      monitoring: 'tracked',
      lastMeal: timestamp,
      lastCaffeine: timestamp,
      screenFreeMinutes: index * 10,
    });
    outcomes.push({
      nightAssignment: keyAssignment,
      awakeningCount: [1, 3, 2, 4, 2, 5, 3][index % 7]!,
      morningEnergy: (index % 5) + 1,
    });
  }
  return { habits, outcomes };
}

const options = { windowDays: 14, endNightKey: '2026-10-14' } as const;
describe('registered comparisons and gates', () => {
  it('registers only the requested pairs and methods', () => {
    expect(CORRELATION_PAIRS.map(({ id, method }) => [id, method])).toEqual([
      ['meal-awakenings', 'point-biserial'],
      ['caffeine-awakenings', 'point-biserial'],
      ['screen-energy', 'pearson'],
    ]);
  });
  it('suppresses binary comparisons at four-versus-five, computes at five-versus-five', () => {
    const nine = dataset(9);
    expect(
      analyzeCorrelations(nine.habits, nine.outcomes, options)[0],
    ).toMatchObject({
      status: 'insufficient-data',
      sampleSize: 9,
      groupSizes: [4, 5],
    });
    const ten = dataset(10);
    expect(
      analyzeCorrelations(ten.habits, ten.outcomes, options)[0],
    ).toMatchObject({
      status: 'computed',
      method: 'point-biserial',
      sampleSize: 10,
      groupSizes: [5, 5],
    });
  });
  it('suppresses Pearson with six pairs and computes with seven including an interval', () => {
    const six = dataset(6);
    expect(
      analyzeCorrelations(six.habits, six.outcomes, options)[2],
    ).toMatchObject({ status: 'insufficient-data', sampleSize: 6 });
    const seven = dataset(7);
    expect(
      analyzeCorrelations(seven.habits, seven.outcomes, options)[2],
    ).toMatchObject({
      status: 'computed',
      method: 'pearson',
      confidenceInterval: { confidenceLevel: 0.95 },
      sampleSize: 7,
    });
  });
  it('keeps median ties together, without manufacturing balanced groups', () => {
    const input = dataset(14);
    const sameClock = input.habits.map((habit) => ({
      ...habit,
      lastMeal: normalizeTimestamp(
        `${habit.keyAssignment.key}T22:00:00Z`,
        offset,
      ),
    }));
    expect(
      analyzeCorrelations(sameClock, input.outcomes, options)[0],
    ).toMatchObject({ status: 'insufficient-data', groupSizes: [0, 14] });
  });
  it('pairs day D with night D and excludes missing, rest and unmonitored days', () => {
    const input = dataset(10);
    input.habits[0] = { ...input.habits[0]!, monitoring: 'rest' };
    input.habits[1] = { ...input.habits[1]!, monitoring: 'unmonitored' };
    const withoutMeal = input.habits.map(({ lastMeal, ...habit }) => {
      void lastMeal;
      return habit;
    });
    expect(
      analyzeCorrelations(withoutMeal, input.outcomes, options)[0],
    ).toMatchObject({ status: 'insufficient-data', sampleSize: 0 });
    expect(
      analyzeCorrelations(input.habits, input.outcomes, options)[2]!.sampleSize,
    ).toBe(8);
    const shifted = input.outcomes.map((outcome) => ({
      ...outcome,
      nightAssignment: { ...outcome.nightAssignment, key: '2026-09-01' },
    }));
    expect(() => analyzeCorrelations(input.habits, shifted, options)).toThrow(
      'ambiguous-authoritative-day',
    );
    expect(
      analyzeCorrelations(
        input.habits,
        [
          {
            ...input.outcomes[0]!,
            nightAssignment: { key: '2026-09-01', boundaryMinutes: 240 },
          },
        ],
        options,
      )[2]!.sampleSize,
    ).toBe(0);
  });
  it('uses inclusive calendar windows and preserves cross-midnight cutoff positions', () => {
    const input = dataset(30);
    const thirty = analyzeCorrelations(input.habits, input.outcomes, {
      windowDays: 30,
      endNightKey: '2026-10-30',
    });
    const fourteen = analyzeCorrelations(input.habits, input.outcomes, {
      windowDays: 14,
      endNightKey: '2026-10-30',
    });
    expect(thirty[2]!.sampleSize).toBe(30);
    expect(fourteen[2]!.sampleSize).toBe(14);
    expect(fourteen[2]!.startNightKey).toBe('2026-10-17');
    const midnight = input.habits.slice(0, 10).map((habit, index) => ({
      ...habit,
      lastMeal: normalizeTimestamp(
        `${habit.keyAssignment.key}T${index < 5 ? '23:00' : '01:00'}:00Z`,
        offset,
      ),
    }));
    expect(
      analyzeCorrelations(midnight, input.outcomes, options)[0],
    ).toMatchObject({ medianCutoffMinute: 1200, groupSizes: [5, 5] });
  });
  it('reports undefined constant statistics and rejects ambiguous or invalid input', () => {
    const input = dataset(10);
    const constant = input.outcomes.map((outcome) => ({
      ...outcome,
      morningEnergy: 3,
    }));
    expect(
      analyzeCorrelations(input.habits, constant, options)[2],
    ).toMatchObject({ status: 'unavailable', reason: 'constant-variable' });
    expect(() =>
      analyzeCorrelations(
        [...input.habits, input.habits[0]!],
        input.outcomes,
        options,
      ),
    ).toThrow();
    expect(() =>
      analyzeCorrelations(input.habits, input.outcomes, {
        ...options,
        widePearsonIntervalWidth: 0,
      }),
    ).toThrow();
    expect(() =>
      analyzeCorrelations(
        input.habits,
        [
          {
            nightAssignment: input.outcomes[0]!.nightAssignment,
            awakeningCount: -1,
          },
        ],
        options,
      ),
    ).toThrow();
  });
  it('retains a valid point-biserial coefficient for export when Welch is undefined', () => {
    const input = dataset(10);
    const outcomes = input.outcomes.map((outcome, index) => ({
      ...outcome,
      awakeningCount: index < 5 ? 0 : 2,
    }));
    const result = analyzeCorrelations(input.habits, outcomes, options)[0]!;
    expect(result).toMatchObject({
      status: 'unavailable',
      reason: 'constant-variable',
      method: 'point-biserial',
      sampleSize: 10,
      groupSizes: [5, 5],
    });
    if (result.status !== 'unavailable' || result.method !== 'point-biserial') {
      throw new Error('expected-unavailable-welch');
    }
    expect(result.coefficient).toBeCloseTo(1, 14);
    expect(result).not.toHaveProperty('confidenceInterval');
  });
  it('adapts explicit morning reports without looking at the logging day', () => {
    const timestamp = normalizeTimestamp('2026-10-05T10:00:00Z', offset);
    expect(
      outcomeFromReport({
        id: 'report',
        timestamp,
        nightAssignment: { key: '2026-10-03', boundaryMinutes: 240 },
        morningEnergy: 4,
      }),
    ).toEqual({
      nightAssignment: { key: '2026-10-03', boundaryMinutes: 240 },
      morningEnergy: 4,
    });
  });
});
