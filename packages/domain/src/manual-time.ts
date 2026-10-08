import type { Timestamp } from './time.js';

/** A wall-clock entry can name zero, one, or two instants. */
export type LocalTimeCandidates = Readonly<{
  status: 'invalid' | 'nonexistent' | 'valid' | 'repeated';
  candidates: readonly Timestamp[];
}>;

/** Find matching instants without silently moving an entry across a clock change. */
export function localTimeCandidates(
  date: string,
  hour: number,
  minute: number,
  zone: string,
): LocalTimeCandidates {
  const invalid: LocalTimeCandidates = { status: 'invalid', candidates: [] };
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !Number.isInteger(hour) ||
    hour < 0 ||
    hour > 23 ||
    !Number.isInteger(minute) ||
    minute < 0 ||
    minute > 59
  )
    return invalid;
  const nominal = Date.parse(
    `${date}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00Z`,
  );
  if (
    !Number.isFinite(nominal) ||
    new Date(nominal).toISOString().slice(0, 10) !== date ||
    date.startsWith('0000')
  )
    return invalid;
  let formatter: Intl.DateTimeFormat;
  try {
    formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: zone,
      calendar: 'iso8601',
      numberingSystem: 'latn',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    });
  } catch {
    return invalid;
  }
  const localEpoch = (instant: number): number => {
    const parts = formatter.formatToParts(instant);
    const part = (name: Intl.DateTimeFormatPartTypes): string =>
      parts.find((value) => value.type === name)!.value;
    return Date.parse(
      `${part('year').padStart(4, '0')}-${part('month')}-${part('day')}T${part('hour')}:${part('minute')}:${part('second')}Z`,
    );
  };
  const offsets = new Set<number>();
  // Both sides of nearby transitions are sampled; every candidate is checked against its exact local value.
  for (let hours = -36; hours <= 36; hours += 6) {
    const instant = nominal + hours * 3_600_000;
    offsets.add(localEpoch(instant) - instant);
  }
  const instants = [...offsets]
    .map((offset) => nominal - offset)
    .filter((instant) => localEpoch(instant) === nominal)
    .sort((a, b) => a - b);
  const candidates = instants.map((instant): Timestamp => ({
    utc: new Date(instant).toISOString(),
    reference: { kind: 'iana', zone },
  }));
  return {
    status:
      candidates.length === 0
        ? 'nonexistent'
        : candidates.length === 1
          ? 'valid'
          : 'repeated',
    candidates,
  };
}
