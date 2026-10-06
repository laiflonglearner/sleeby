import type { CorrelationResult } from '@sleeby/domain';

/** First neutral template set, pending the Phase 0 owner review. */
export const COPY_TEMPLATES = {
  insufficient:
    'Not enough days with both measurements yet for this comparison.',
  unavailable:
    "This comparison can't be calculated from the days that have both measurements.",
  unavailableConstant:
    'Every value was the same, so there is nothing to compare yet.',
  meal: 'Average awakenings per night: {meanone} when your last meal was {line}+ hours before sleep ({one} nights), {meanzero} when it was closer to sleep ({zero} nights). Difference: {difference}.',
  caffeine:
    'Average awakenings per night: {meanone} when your last caffeine was {line}+ hours before sleep ({one} nights), {meanzero} when it was closer to sleep ({zero} nights). Difference: {difference}.',
  noCaffeine:
    'Average awakenings per night: {meanone} on nights with caffeine ({one} nights), {meanzero} on nights with none ({zero} nights). Difference: {difference}.',
  lineChosen: 'You chose the {line} hour mark.',
  lineMedian: 'The {line} hour mark is the middle of your nights.',
  screen:
    'On {count} days with both measurements, screen-free time and morning energy moved together by {coefficient}. At 1, more screen-free time goes with higher energy. At 0, there is no pattern. At -1, more screen-free time goes with lower energy.',
  interval:
    'Your result is {value}. Every day is a bit different, so it could be anywhere from {lower} to {upper} (95% range).',
  intervalDifference:
    'Every day is a bit different, so the difference could be anywhere from {lower} to {upper} (95% range).',
  wide: 'This range is wide, so the result is uncertain. More days make it narrower.',
  trendHigher:
    'The average {metric} was higher in your recent days than in your earlier days.',
  trendLower:
    'The average {metric} was lower in your recent days than in your earlier days.',
  trendEqual:
    'The average {metric} was the same in your recent and earlier days.',
  trendInsufficient:
    'Not enough days with both measurements yet to describe this trend.',
  trendUnavailable:
    "A trend can't be calculated for these days. Either some values are missing or all values are the same.",
  deviceEstimated: 'Device-estimated sleep stages.',
  exportPlaintext:
    "Exports aren't encrypted. Anyone you share the file with can read it.",
  exportAnonymized:
    "This export doesn't include notes, identifiers, locations, or exact calendar dates. The remaining health data could still identify you.",
  browserPrivacy:
    'Data stays in this browser on this device and is cleared when you clear site data.',
} as const;

/** All generated copy consists of selected templates and numeric substitutions. */
export interface ResolvedCopy {
  readonly description: string;
  readonly interval?: string;
  readonly width?: string;
}

function number(value: number): string {
  if (!Number.isFinite(value)) throw new RangeError('invalid-copy-number');
  return new Intl.NumberFormat('en', { maximumFractionDigits: 2 }).format(
    Object.is(value, -0) ? 0 : value,
  );
}

function fill(
  template: string,
  values: Readonly<Record<string, number>>,
): string {
  return template.replace(/\{([a-z]+)\}/g, (_, key: string) => {
    const value = values[key];
    if (value === undefined) throw new RangeError('missing-copy-parameter');
    return number(value);
  });
}

/** Resolve every registered correlation state without causal or diagnostic language. */
export function resolveCorrelationCopy(
  result: CorrelationResult,
): ResolvedCopy {
  if (result.status === 'insufficient-data')
    return { description: COPY_TEMPLATES.insufficient };
  if (result.status === 'unavailable')
    return {
      description:
        result.reason === 'constant-variable'
          ? COPY_TEMPLATES.unavailableConstant
          : COPY_TEMPLATES.unavailable,
    };
  const description =
    result.method === 'pearson'
      ? fill(COPY_TEMPLATES.screen, {
          coefficient: result.coefficient,
          count: result.sampleSize,
        })
      : [
          fill(
            result.pair === 'meal-awakenings'
              ? COPY_TEMPLATES.meal
              : result.pair === 'caffeine-awakenings'
                ? COPY_TEMPLATES.caffeine
                : COPY_TEMPLATES.noCaffeine,
            {
              difference: result.difference,
              zero: result.groupSizes[0],
              one: result.groupSizes[1],
              line: result.hoursBeforeSleepLine ?? 0,
              meanzero: result.groupMeans[0],
              meanone: result.groupMeans[1],
            },
          ),
          ...(result.hoursBeforeSleepLine === undefined
            ? []
            : [
                fill(
                  result.lineSource === 'chosen'
                    ? COPY_TEMPLATES.lineChosen
                    : COPY_TEMPLATES.lineMedian,
                  { line: result.hoursBeforeSleepLine },
                ),
              ]),
        ].join(' ');
  return {
    description,
    interval:
      result.method === 'pearson'
        ? fill(COPY_TEMPLATES.interval, {
            value: result.coefficient,
            lower: result.confidenceInterval.lower,
            upper: result.confidenceInterval.upper,
          })
        : fill(COPY_TEMPLATES.intervalDifference, {
            lower: result.confidenceInterval.lower,
            upper: result.confidenceInterval.upper,
          }),
    ...(result.intervalWide ? { width: COPY_TEMPLATES.wide } : {}),
  };
}

/** Pre-reviewed metric labels prevent arbitrary caller text entering generated summaries. */
export type TrendMetric =
  'awakeningCount' | 'morningEnergy' | 'screenFreeMinutes' | 'sleepMinutes';

/** Trend states describe observed averages only; callers supply the calculated state. */
export type TrendState =
  'higher' | 'lower' | 'equal' | 'insufficient' | 'unavailable';

/** Resolve every trend state from a fixed template and a fixed metric label. */
export function resolveTrendCopy(
  metric: TrendMetric,
  state: TrendState,
): string {
  const labels: Record<TrendMetric, string> = {
    awakeningCount: 'awakening count',
    morningEnergy: 'reported morning energy',
    screenFreeMinutes: 'screen-free duration',
    sleepMinutes: 'sleep duration',
  };
  if (state === 'insufficient') return COPY_TEMPLATES.trendInsufficient;
  if (state === 'unavailable') return COPY_TEMPLATES.trendUnavailable;
  const template = {
    higher: COPY_TEMPLATES.trendHigher,
    lower: COPY_TEMPLATES.trendLower,
    equal: COPY_TEMPLATES.trendEqual,
  }[state];
  return template.replace('{metric}', labels[metric]);
}
