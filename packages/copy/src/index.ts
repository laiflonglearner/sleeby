import type { CorrelationResult } from '@sleeby/domain';

/** First neutral template set, pending the Phase 0 owner review. */
export const COPY_TEMPLATES = {
  insufficient: 'Not enough paired days yet for this comparison.',
  unavailable: 'This comparison cannot be calculated from these paired days.',
  meal: 'The difference in average awakening count (later-cutoff minus earlier-cutoff) was {difference}. The earlier-cutoff meal group contains {zero} nights; the later-cutoff group contains {one} nights.',
  caffeine:
    'The difference in average awakening count (later-cutoff minus earlier-cutoff) was {difference}. The earlier-cutoff caffeine group contains {zero} nights; the later-cutoff group contains {one} nights.',
  screen:
    'Screen-free duration and reported morning energy had a correlation of {coefficient} across {count} paired days.',
  interval: 'The 95% interval runs from {lower} to {upper}.',
  wide: 'The range is wide under the selected display-width setting.',
  trendHigher: 'The average {metric} was higher in the later period.',
  trendLower: 'The average {metric} was lower in the later period.',
  trendEqual: 'The average {metric} was the same in both periods.',
  trendInsufficient: 'Not enough paired days yet to describe this trend.',
  trendUnavailable: 'This trend cannot be calculated from these values.',
  deviceEstimated: 'Device-estimated sleep stages.',
  exportPlaintext:
    'Exports are plaintext. Anyone you share the file with can read its contents.',
  exportAnonymized:
    'This export omits notes, identifiers, locations, and exact calendar dates. The remaining health data may still be identifying.',
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
    return { description: COPY_TEMPLATES.unavailable };
  const description =
    result.method === 'pearson'
      ? fill(COPY_TEMPLATES.screen, {
          coefficient: result.coefficient,
          count: result.sampleSize,
        })
      : fill(
          result.pair === 'meal-awakenings'
            ? COPY_TEMPLATES.meal
            : COPY_TEMPLATES.caffeine,
          {
            difference: result.difference,
            zero: result.groupSizes[0],
            one: result.groupSizes[1],
          },
        );
  return {
    description,
    interval: fill(COPY_TEMPLATES.interval, {
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
