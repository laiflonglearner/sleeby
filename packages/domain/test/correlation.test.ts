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
      sleepStart: normalizeTimestamp(`${keyAssignment.key}T23:00:00Z`, offset),
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
      ['no-caffeine-awakenings', 'point-biserial'],
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
      analyzeCorrelations(six.habits, six.outcomes, options)[3],
    ).toMatchObject({ status: 'insufficient-data', sampleSize: 6 });
    const seven = dataset(7);
    expect(
      analyzeCorrelations(seven.habits, seven.outcomes, options)[3],
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
      analyzeCorrelations(input.habits, input.outcomes, options)[3]!.sampleSize,
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
      )[3]!.sampleSize,
    ).toBe(0);
  });
  it('uses inclusive calendar windows and counts the actual elapsed hours across midnight', () => {
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
  });
  it('measures hours before sleep from UTC instants, including across midnight and offsets', () => {
    const input = dataset(10);
    const habits = input.habits.map((habit, index) => ({
      ...habit,
      // Day key D at 20:00 UTC (23:00 at +03:00 is the same instant) for some, 22:00 for others.
      lastMeal:
        index < 5
          ? normalizeTimestamp(`${habit.keyAssignment.key}T23:00:00+03:00`, {
              kind: 'offset',
              offsetSeconds: 10800,
            })
          : normalizeTimestamp(`${habit.keyAssignment.key}T22:00:00Z`, offset),
    }));
    // Sleep start is 01:00 UTC the next day: 5 hours after the first group, 3 after the second.
    const outcomes = input.outcomes.map((outcome) => {
      const next = new Date(
        Date.parse(`${outcome.nightAssignment.key}T00:00:00Z`) + 86_400_000,
      )
        .toISOString()
        .slice(0, 10);
      return {
        ...outcome,
        sleepStart: normalizeTimestamp(`${next}T01:00:00Z`, offset),
      };
    });
    expect(analyzeCorrelations(habits, outcomes, options)[0]).toMatchObject({
      groupSizes: [5, 5],
      hoursBeforeSleepLine: 4,
      lineSource: 'median',
    });
  });
  it('uses a caller-chosen line, sends ties at the line to the higher group, and names the line', () => {
    const input = dataset(10);
    // Hours before sleep run 5, 4.97, 4.93, 4.9 and so on; the night at exactly 4.9 is a tie and goes to the higher group.
    const result = analyzeCorrelations(input.habits, input.outcomes, {
      ...options,
      mealHoursBeforeSleepLine: 4.9,
    })[0]!;
    expect(result).toMatchObject({
      hoursBeforeSleepLine: 4.9,
      lineSource: 'chosen',
      groupSizes: [6, 4],
    });
    // A line exactly at 5 hours puts the 5.0 night in the at-or-above group.
    expect(
      analyzeCorrelations(input.habits, input.outcomes, {
        ...options,
        mealHoursBeforeSleepLine: 5,
      })[0],
    ).toMatchObject({ groupSizes: [9, 1], status: 'insufficient-data' });
    // The caffeine line is independent of the meal line.
    expect(
      analyzeCorrelations(input.habits, input.outcomes, {
        ...options,
        mealHoursBeforeSleepLine: 4.9,
      })[1],
    ).toMatchObject({ lineSource: 'median' });
    expect(() =>
      analyzeCorrelations(input.habits, input.outcomes, {
        ...options,
        caffeineHoursBeforeSleepLine: -1,
      }),
    ).toThrow('invalid-hours-before-sleep-line');
  });
  it('rejects a meal after sleep start and skips missing sleep start, meal and caffeine', () => {
    const input = dataset(10);
    const after = input.outcomes.map((outcome, index) =>
      index === 0
        ? {
            ...outcome,
            sleepStart: normalizeTimestamp(
              `${outcome.nightAssignment.key}T10:00:00Z`,
              offset,
            ),
          }
        : outcome,
    );
    expect(() => analyzeCorrelations(input.habits, after, options)).toThrow(
      'invalid-predictor',
    );
    const noStart = input.outcomes.map((outcome, index) => {
      if (index > 0) return outcome;
      const { sleepStart, ...rest } = outcome;
      void sleepStart;
      return rest;
    });
    expect(
      analyzeCorrelations(input.habits, noStart, options)[0],
    ).toMatchObject({ sampleSize: 9 });
    const noCaffeine = input.habits.map((habit, index) => {
      if (index > 0) return habit;
      const { lastCaffeine, ...rest } = habit;
      void lastCaffeine;
      return rest;
    });
    expect(
      analyzeCorrelations(noCaffeine, input.outcomes, options)[1],
    ).toMatchObject({ sampleSize: 9 });
    // A zero-hour meal at sleep start is data, not missing.
    expect(
      analyzeCorrelations(
        input.habits.map((habit) => ({
          ...habit,
          lastMeal: normalizeTimestamp(
            `${habit.keyAssignment.key}T23:00:00Z`,
            offset,
          ),
        })),
        input.outcomes,
        options,
      )[0],
    ).toMatchObject({ sampleSize: 10, hoursBeforeSleepLine: 0 });
  });
  it('compares caffeine-free nights with nights that have caffeine', () => {
    const input = dataset(12);
    const habits = input.habits.map((habit, index) => {
      if (index >= 6) return habit;
      const { lastCaffeine, ...rest } = habit;
      void lastCaffeine;
      return { ...rest, caffeineFree: true };
    });
    const result = analyzeCorrelations(habits, input.outcomes, {
      windowDays: 14,
      endNightKey: '2026-10-14',
    })[2]!;
    expect(result).toMatchObject({
      pair: 'no-caffeine-awakenings',
      status: 'computed',
      method: 'point-biserial',
      sampleSize: 12,
      groupSizes: [6, 6],
    });
    expect(result).not.toHaveProperty('hoursBeforeSleepLine');
    // The caffeine-hours pair only sees nights with a caffeine time.
    expect(
      analyzeCorrelations(habits, input.outcomes, options)[1]!.sampleSize,
    ).toBe(6);
    // Missing caffeine without the mark is missing data, not a caffeine-free night.
    const unmarked = habits.map(({ caffeineFree, ...habit }) => {
      void caffeineFree;
      return habit;
    });
    expect(
      analyzeCorrelations(unmarked, input.outcomes, options)[2]!.sampleSize,
    ).toBe(6);
    // Four caffeine-free nights is below the five-per-side gate.
    const four = habits.map((habit, index) => {
      if (index !== 4 && index !== 5) return habit;
      const { caffeineFree, ...rest } = habit;
      void caffeineFree;
      return { ...rest, lastCaffeine: habit.lastMeal! };
    });
    expect(analyzeCorrelations(four, input.outcomes, options)[2]).toMatchObject(
      { status: 'insufficient-data', groupSizes: [4, 8] },
    );
    expect(() =>
      analyzeCorrelations(
        [{ ...input.habits[0]!, caffeineFree: true }, ...input.habits.slice(1)],
        input.outcomes,
        options,
      ),
    ).toThrow('invalid-predictor');
  });
  it('reports undefined constant statistics and rejects ambiguous or invalid input', () => {
    const input = dataset(10);
    const constant = input.outcomes.map((outcome) => ({
      ...outcome,
      morningEnergy: 3,
    }));
    expect(
      analyzeCorrelations(input.habits, constant, options)[3],
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
    expect(result.coefficient).toBeCloseTo(-1, 14);
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
