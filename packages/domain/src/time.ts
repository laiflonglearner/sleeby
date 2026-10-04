import {
  DEFAULT_DAY_BOUNDARY_MINUTES,
  MILLISECONDS_PER_MINUTE,
  MINUTES_PER_DAY,
  PLOT_ANCHOR_MINUTES,
} from './constants.js';

/** Entry-time localization, never the device's current timezone. */
export type TimeReference =
  | Readonly<{ kind: 'iana'; zone: string }>
  | Readonly<{ kind: 'offset'; offsetSeconds: number }>;

/** A normalized UTC instant and the local reference supplied at ingestion. */
export interface Timestamp {
  readonly utc: string;
  readonly reference: TimeReference;
}

/** A stored local calendar key and the boundary used to assign it. */
export interface KeyAssignment {
  readonly key: string;
  readonly boundaryMinutes: number;
}

/** Bedtime and wake time expressed as local minutes after midnight. */
export interface ScheduleTarget {
  readonly bedtimeMinutes: number;
  readonly wakeMinutes: number;
}

interface LocalParts {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
}

function validMinute(value: number): void {
  if (!Number.isInteger(value) || value < 0 || value >= MINUTES_PER_DAY) {
    throw new RangeError('invalid-local-minute');
  }
}

function utcDate(year: number, month: number, day: number): Date {
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  return date;
}

/** Reject naive or invalid ISO timestamps and retain native nanosecond precision. */
export function instantNanoseconds(iso: string): bigint {
  const match =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(Z|[+-]\d{2}:\d{2})$/.exec(
      iso,
    );
  if (!match) throw new RangeError('invalid-instant');
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = utcDate(year, month, day);
  const suffix = match[8]!;
  const offsetHour = suffix === 'Z' ? 0 : Number(suffix.slice(1, 3));
  const offsetMinute = suffix === 'Z' ? 0 : Number(suffix.slice(4, 6));
  if (
    year < 1 ||
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() + 1 !== month ||
    date.getUTCDate() !== day ||
    Number(match[4]) > 23 ||
    Number(match[5]) > 59 ||
    Number(match[6]) > 59 ||
    offsetHour > 18 ||
    offsetMinute > 59 ||
    (offsetHour === 18 && offsetMinute !== 0)
  ) {
    throw new RangeError('invalid-instant');
  }
  const milliseconds = Date.parse(iso);
  if (!Number.isFinite(milliseconds)) throw new RangeError('invalid-instant');
  const remainder = (match[7] ?? '').padEnd(9, '0').slice(3);
  return BigInt(milliseconds) * 1_000_000n + BigInt(remainder);
}

/** Epoch milliseconds for localization and display; elapsed arithmetic uses exact instants. */
export function instantMilliseconds(iso: string): number {
  const nanoseconds = instantNanoseconds(iso);
  return (
    Number(nanoseconds / 1_000_000n) +
    Number(nanoseconds % 1_000_000n) / 1_000_000
  );
}

/** Normalize an explicit-offset instant to UTC without dropping fractional precision. */
export function normalizeUtcInstant(iso: string): string {
  instantNanoseconds(iso);
  const canonical = new Date(Date.parse(iso)).toISOString();
  const fraction = /\.(\d+)(?:Z|[+-]\d{2}:\d{2})$/.exec(iso)?.[1] ?? '';
  return fraction.length > 3
    ? `${canonical.slice(0, -1)}${fraction.slice(3)}Z`
    : canonical;
}

function validateReference(reference: TimeReference): void {
  if (reference.kind === 'offset') {
    if (
      !Number.isInteger(reference.offsetSeconds) ||
      Math.abs(reference.offsetSeconds) > 18 * 60 * 60
    ) {
      throw new RangeError('invalid-offset');
    }
  } else if (
    reference.kind === 'iana' &&
    typeof reference.zone === 'string' &&
    /^[A-Za-z][A-Za-z0-9_.+-]*(?:\/[A-Za-z0-9_.+-]+)*$/.test(reference.zone)
  ) {
    // Intl uses the runtime's IANA database, with no domain platform dependency.
    new Intl.DateTimeFormat('en', { timeZone: reference.zone }).format(0);
  } else {
    throw new RangeError('invalid-time-reference');
  }
}

function localParts(timestamp: Timestamp): LocalParts {
  instantNanoseconds(timestamp.utc);
  const milliseconds = Date.parse(timestamp.utc);
  validateReference(timestamp.reference);
  if (timestamp.reference.kind === 'offset') {
    const date = new Date(
      milliseconds + timestamp.reference.offsetSeconds * 1_000,
    );
    return {
      year: date.getUTCFullYear(),
      month: date.getUTCMonth() + 1,
      day: date.getUTCDate(),
      hour: date.getUTCHours(),
      minute: date.getUTCMinutes(),
    };
  }
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timestamp.reference.zone,
    calendar: 'iso8601',
    numberingSystem: 'latn',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(milliseconds);
  const part = (type: Intl.DateTimeFormatPartTypes): number => {
    const value = parts.find((entry) => entry.type === type)?.value;
    if (value === undefined) throw new RangeError('invalid-local-reference');
    return Number(value);
  };
  return {
    year: part('year'),
    month: part('month'),
    day: part('day'),
    hour: part('hour'),
    minute: part('minute'),
  };
}

/** Normalize explicit-offset ISO input to UTC, preserving its entry-time reference. */
export function normalizeTimestamp(
  iso: string,
  reference: TimeReference,
): Timestamp {
  validateReference(reference);
  return Object.freeze({
    utc: normalizeUtcInstant(iso),
    reference: Object.freeze({ ...reference }),
  });
}

/** Local minute position in an 18:00 plotting day. Never use this for durations. */
export function toRelativeSleepMinutes(timestamp: Timestamp): number {
  const local = localParts(timestamp);
  return (
    (local.hour * 60 + local.minute - PLOT_ANCHOR_MINUTES + MINUTES_PER_DAY) %
    MINUTES_PER_DAY
  );
}

/** Local wall-clock minute after midnight for declared predictor definitions. */
export function localClockMinutes(timestamp: Timestamp): number {
  const local = localParts(timestamp);
  return local.hour * 60 + local.minute;
}

/** Target midpoint along the forward overnight window, rounded down to a minute. */
export function dayBoundaryMinutes(target?: ScheduleTarget): number {
  if (target === undefined) return DEFAULT_DAY_BOUNDARY_MINUTES;
  validMinute(target.bedtimeMinutes);
  validMinute(target.wakeMinutes);
  const span =
    (target.wakeMinutes - target.bedtimeMinutes + MINUTES_PER_DAY) %
    MINUTES_PER_DAY;
  if (span === 0) throw new RangeError('empty-target-window');
  return Math.floor((target.bedtimeMinutes + span / 2) % MINUTES_PER_DAY);
}

/** Assign a day using local calendar comparison, preserving the boundary for history. */
export function assignDayKey(
  timestamp: Timestamp,
  boundaryMinutes = DEFAULT_DAY_BOUNDARY_MINUTES,
): KeyAssignment {
  validMinute(boundaryMinutes);
  const local = localParts(timestamp);
  // Calendar subtraction avoids an elapsed-time hour shifting the boundary on DST days.
  const date = utcDate(local.year, local.month, local.day);
  if (local.hour * 60 + local.minute < boundaryMinutes)
    date.setUTCDate(date.getUTCDate() - 1);
  return Object.freeze({
    key: date.toISOString().slice(0, 10),
    boundaryMinutes,
  });
}

/** Night D is assigned from its primary session start, never a morning logging time. */
export function assignNightKey(
  primarySessionStart: Timestamp,
  boundaryMinutes = DEFAULT_DAY_BOUNDARY_MINUTES,
): KeyAssignment {
  return assignDayKey(primarySessionStart, boundaryMinutes);
}

/** Nap keys use the same start-time day assignment but never create nights. */
export function assignNapKey(
  start: Timestamp,
  boundaryMinutes = DEFAULT_DAY_BOUNDARY_MINUTES,
): KeyAssignment {
  return assignDayKey(start, boundaryMinutes);
}

/** Real elapsed duration from UTC instants. Negative or empty spans are rejected. */
export function durationMilliseconds(startUtc: string, endUtc: string): number {
  const duration = instantNanoseconds(endUtc) - instantNanoseconds(startUtc);
  if (duration <= 0n) throw new RangeError('invalid-interval');
  return Number(duration) / 1_000_000;
}

/** Real elapsed minutes, retaining sub-minute precision. */
export function durationMinutes(startUtc: string, endUtc: string): number {
  return durationMilliseconds(startUtc, endUtc) / MILLISECONDS_PER_MINUTE;
}
