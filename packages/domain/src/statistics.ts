/** Two-sided confidence level required by the registered comparison contract. */
export const CORRELATION_CONFIDENCE_LEVEL = 0.95 as const;

/** Standard-normal 97.5th percentile used by the Fisher transformation. */
const NORMAL_975_QUANTILE = 1.959963984540054;
const CONFIDENCE_UPPER_PROBABILITY = (1 + CORRELATION_CONFIDENCE_LEVEL) / 2;
const BETA_MAX_ITERATIONS = 256;
const QUANTILE_MAX_ITERATIONS = 128;
const CONVERGENCE_TOLERANCE = 1e-14;
const MIN_CONTINUED_FRACTION_DENOMINATOR = 1e-300;

/** A two-sided interval in the same units as its associated statistic. */
export interface ConfidenceInterval {
  /** Lower endpoint, inclusive. */
  readonly lower: number;
  /** Upper endpoint, inclusive. */
  readonly upper: number;
  /** Fixed coverage specified for all registered comparisons. */
  readonly confidenceLevel: typeof CORRELATION_CONFIDENCE_LEVEL;
}

/** Machine-readable reasons that a statistic cannot be calculated. */
export type StatisticalUnavailableReason =
  | 'insufficient-observations'
  | 'mismatched-observations'
  | 'non-finite-observation'
  | 'constant-variable'
  | 'invalid-binary-predictor'
  | 'invalid-correlation'
  | 'numerical-failure';

/** Numerical results contain no display copy and never encode failure as NaN. */
export type StatisticalResult<T> =
  | { readonly status: 'computed'; readonly value: T }
  | {
      readonly status: 'unavailable';
      readonly reason: StatisticalUnavailableReason;
    };

/** Welch comparison, consistently oriented as group one minus group zero. */
export interface WelchMeanDifference {
  /** Observed group-one mean minus observed group-zero mean. */
  readonly difference: number;
  /** Arithmetic average of the zero-coded observations. */
  readonly groupZeroMean: number;
  /** Arithmetic average of the one-coded observations. */
  readonly groupOneMean: number;
  /** Estimated standard error without an equal-variance assumption. */
  readonly standardError: number;
  /** Welch-Satterthwaite degrees of freedom, which need not be an integer. */
  readonly degreesOfFreedom: number;
  /** Student-t interval on the difference, not on the correlation coefficient. */
  readonly confidenceInterval: ConfidenceInterval;
}

function unavailable(
  reason: StatisticalUnavailableReason,
): StatisticalResult<never> {
  return { status: 'unavailable', reason };
}

function compensatedSum(values: readonly number[]): number {
  let sum = 0;
  let correction = 0;
  for (const value of values) {
    const adjusted = value - correction;
    const next = sum + adjusted;
    correction = next - sum - adjusted;
    sum = next;
  }
  return sum;
}

function scaleOf(values: readonly number[]): number {
  let scale = 0;
  for (const value of values) scale = Math.max(scale, Math.abs(value));
  return scale;
}

function centered(values: readonly number[]): {
  mean: number;
  deviations: number[];
} {
  const mean = compensatedSum(values) / values.length;
  return { mean, deviations: values.map((value) => value - mean) };
}

/**
 * Calculates Pearson's product-moment coefficient for aligned observations.
 *
 * @remarks Inputs are scaled before centering to avoid overflow in squared deviations. Minimum sample gates for registered comparisons belong to the correlation engine, while this numerical primitive requires two observations.
 */
export function pearsonCorrelation(
  predictor: readonly number[],
  outcome: readonly number[],
): StatisticalResult<number> {
  if (predictor.length !== outcome.length)
    return unavailable('mismatched-observations');
  if (predictor.length < 2) return unavailable('insufficient-observations');
  if (!predictor.every(Number.isFinite) || !outcome.every(Number.isFinite)) {
    return unavailable('non-finite-observation');
  }
  const predictorScale = scaleOf(predictor) || 1;
  const outcomeScale = scaleOf(outcome) || 1;
  const x = centered(
    predictor.map((value) => value / predictorScale),
  ).deviations;
  const y = centered(outcome.map((value) => value / outcomeScale)).deviations;
  const xSquares = compensatedSum(x.map((value) => value * value));
  const ySquares = compensatedSum(y.map((value) => value * value));
  if (xSquares === 0 || ySquares === 0) return unavailable('constant-variable');
  const crossProducts = x.map((value, index) => value * (y[index] ?? 0));
  const coefficient =
    compensatedSum(crossProducts) / Math.sqrt(xSquares) / Math.sqrt(ySquares);
  if (!Number.isFinite(coefficient)) return unavailable('numerical-failure');
  // Roundoff can exceed the mathematical range by a few ulps at perfect correlation.
  return { status: 'computed', value: Math.max(-1, Math.min(1, coefficient)) };
}

/**
 * Calculates point-biserial r with the binary predictor coded zero or one.
 *
 * @remarks Point-biserial is algebraically Pearson correlation with a binary variable. Sharing the centered implementation avoids different rounding rules between equivalent methods.
 */
export function pointBiserialCorrelation(
  binaryPredictor: readonly number[],
  outcome: readonly number[],
): StatisticalResult<number> {
  if (!binaryPredictor.every((value) => value === 0 || value === 1)) {
    return unavailable('invalid-binary-predictor');
  }
  return pearsonCorrelation(binaryPredictor, outcome);
}

/**
 * Calculates the two-sided 95% Fisher z interval on a Pearson coefficient.
 *
 * @remarks The standard error is 1 / sqrt(n - 3). Perfect positive or negative correlation has its limiting singleton interval. A constant variable must be rejected before this function is called.
 */
export function fisherZConfidenceInterval(
  coefficient: number,
  sampleSize: number,
): StatisticalResult<ConfidenceInterval> {
  if (!Number.isFinite(coefficient) || coefficient < -1 || coefficient > 1) {
    return unavailable('invalid-correlation');
  }
  if (!Number.isInteger(sampleSize) || sampleSize < 4) {
    return unavailable('insufficient-observations');
  }
  if (Math.abs(coefficient) === 1) {
    return {
      status: 'computed',
      value: {
        lower: coefficient,
        upper: coefficient,
        confidenceLevel: CORRELATION_CONFIDENCE_LEVEL,
      },
    };
  }
  const z = Math.atanh(coefficient);
  const margin = NORMAL_975_QUANTILE / Math.sqrt(sampleSize - 3);
  return {
    status: 'computed',
    value: {
      lower: Math.tanh(z - margin),
      upper: Math.tanh(z + margin),
      confidenceLevel: CORRELATION_CONFIDENCE_LEVEL,
    },
  };
}

// Lanczos coefficients evaluate log-gamma without overflowing gamma itself.
const LANCZOS_COEFFICIENTS = [
  676.5203681218851, -1259.1392167224028, 771.3234287776531, -176.6150291621406,
  12.507343278686905, -0.13857109526572012, 9.984369578019572e-6,
  1.5056327351493116e-7,
] as const;

function logGamma(argument: number): number {
  if (argument < 0.5)
    return (
      Math.log(Math.PI) -
      Math.log(Math.sin(Math.PI * argument)) -
      logGamma(1 - argument)
    );
  const shifted = argument - 1;
  let series = 0.99999999999980993;
  for (const [index, coefficient] of LANCZOS_COEFFICIENTS.entries()) {
    series += coefficient / (shifted + index + 1);
  }
  const base = shifted + 7.5;
  return (
    0.5 * Math.log(2 * Math.PI) +
    (shifted + 0.5) * Math.log(base) -
    base +
    Math.log(series)
  );
}

function protectedDenominator(value: number): number {
  if (Math.abs(value) >= MIN_CONTINUED_FRACTION_DENOMINATOR) return value;
  return value < 0
    ? -MIN_CONTINUED_FRACTION_DENOMINATOR
    : MIN_CONTINUED_FRACTION_DENOMINATOR;
}

// The incomplete-beta continued fraction (NIST DLMF 8.17.22) is evaluated with modified Lentz updates.
// Symmetry in regularizedBeta chooses the faster-converging side, https://dlmf.nist.gov/8.17#v.
function betaContinuedFraction(
  a: number,
  b: number,
  x: number,
): number | undefined {
  const sum = a + b;
  let c = 1;
  let d = 1 / protectedDenominator(1 - (sum * x) / (a + 1));
  let result = d;
  for (let iteration = 1; iteration <= BETA_MAX_ITERATIONS; iteration += 1) {
    const twice = 2 * iteration;
    let coefficient =
      (iteration * (b - iteration) * x) / ((a - 1 + twice) * (a + twice));
    d = 1 / protectedDenominator(1 + coefficient * d);
    c = protectedDenominator(1 + coefficient / c);
    result *= d * c;
    coefficient =
      -((a + iteration) * (sum + iteration) * x) /
      ((a + twice) * (a + 1 + twice));
    d = 1 / protectedDenominator(1 + coefficient * d);
    c = protectedDenominator(1 + coefficient / c);
    const change = d * c;
    result *= change;
    if (Math.abs(change - 1) <= CONVERGENCE_TOLERANCE) return result;
  }
  // Bounded iteration avoids an unresponsive client and never returns an unconverged interval.
  return undefined;
}

function regularizedBeta(x: number, a: number, b: number): number | undefined {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const weight = Math.exp(
    logGamma(a + b) -
      logGamma(a) -
      logGamma(b) +
      a * Math.log(x) +
      b * Math.log1p(-x),
  );
  if (x < (a + 1) / (a + b + 2)) {
    const fraction = betaContinuedFraction(a, b, x);
    return fraction === undefined ? undefined : (weight * fraction) / a;
  }
  const fraction = betaContinuedFraction(b, a, 1 - x);
  return fraction === undefined ? undefined : 1 - (weight * fraction) / b;
}

function studentTCdf(
  value: number,
  degreesOfFreedom: number,
): number | undefined {
  const beta = regularizedBeta(
    degreesOfFreedom / (degreesOfFreedom + value * value),
    degreesOfFreedom / 2,
    0.5,
  );
  return beta === undefined ? undefined : 1 - beta / 2;
}

function studentT975Quantile(degreesOfFreedom: number): number | undefined {
  let lower = 0;
  let upper = 1;
  let bracketed = false;
  for (let iteration = 0; iteration < QUANTILE_MAX_ITERATIONS; iteration += 1) {
    const probability = studentTCdf(upper, degreesOfFreedom);
    if (probability === undefined) return undefined;
    if (probability >= CONFIDENCE_UPPER_PROBABILITY) {
      bracketed = true;
      break;
    }
    upper *= 2;
  }
  if (!bracketed) return undefined;
  for (let iteration = 0; iteration < QUANTILE_MAX_ITERATIONS; iteration += 1) {
    const midpoint = (lower + upper) / 2;
    const probability = studentTCdf(midpoint, degreesOfFreedom);
    if (probability === undefined) return undefined;
    if (probability < CONFIDENCE_UPPER_PROBABILITY) lower = midpoint;
    else upper = midpoint;
    if (upper - lower <= CONVERGENCE_TOLERANCE * Math.max(1, midpoint))
      return (lower + upper) / 2;
  }
  return undefined;
}

/**
 * Calculates Welch's two-sided 95% interval on group-one minus group-zero means.
 *
 * @remarks Uses unbiased sample variances and Welch-Satterthwaite degrees of freedom. A small bounded incomplete-beta solver supplies the Student-t quantile without a runtime statistics library. If both variances vanish, the Welch interval is undefined and the result is unavailable. One constant group is valid when the other varies.
 */
export function welchMeanDifference(
  groupZero: readonly number[],
  groupOne: readonly number[],
): StatisticalResult<WelchMeanDifference> {
  if (groupZero.length < 2 || groupOne.length < 2)
    return unavailable('insufficient-observations');
  if (!groupZero.every(Number.isFinite) || !groupOne.every(Number.isFinite)) {
    return unavailable('non-finite-observation');
  }
  const scale = Math.max(scaleOf(groupZero), scaleOf(groupOne)) || 1;
  const zero = centered(groupZero.map((value) => value / scale));
  const one = centered(groupOne.map((value) => value / scale));
  const zeroVariance =
    compensatedSum(zero.deviations.map((value) => value * value)) /
    (groupZero.length - 1);
  const oneVariance =
    compensatedSum(one.deviations.map((value) => value * value)) /
    (groupOne.length - 1);
  const zeroTerm = zeroVariance / groupZero.length;
  const oneTerm = oneVariance / groupOne.length;
  const combinedTerm = zeroTerm + oneTerm;
  if (combinedTerm === 0) return unavailable('constant-variable');
  // Normalized weights avoid underflow when computing the square of tiny variances.
  const zeroWeight = zeroTerm / combinedTerm;
  const oneWeight = oneTerm / combinedTerm;
  const degreesOfFreedom =
    1 /
    ((zeroWeight * zeroWeight) / (groupZero.length - 1) +
      (oneWeight * oneWeight) / (groupOne.length - 1));
  const quantile = studentT975Quantile(degreesOfFreedom);
  if (quantile === undefined) return unavailable('numerical-failure');
  const difference = (one.mean - zero.mean) * scale;
  const standardError = Math.sqrt(combinedTerm) * scale;
  const margin = quantile * standardError;
  const value: WelchMeanDifference = {
    difference,
    groupZeroMean: zero.mean * scale,
    groupOneMean: one.mean * scale,
    standardError,
    degreesOfFreedom,
    confidenceInterval: {
      lower: difference - margin,
      upper: difference + margin,
      confidenceLevel: CORRELATION_CONFIDENCE_LEVEL,
    },
  };
  if (
    ![
      difference,
      standardError,
      value.groupZeroMean,
      value.groupOneMean,
      value.confidenceInterval.lower,
      value.confidenceInterval.upper,
    ].every(Number.isFinite)
  ) {
    return unavailable('numerical-failure');
  }
  return { status: 'computed', value };
}
