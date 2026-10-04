import { normalizeUtcInstant } from '@sleeby/domain';

/** Fixed-width UTC index key preserves nanosecond order without altering raw timestamps. */
export function storageUtcIndex(utc: string): string {
  if (normalizeUtcInstant(utc) !== utc)
    throw new RangeError('noncanonical-utc');
  // Fractions must have equal widths for SQLite and IndexedDB text ordering to match time.
  return `${utc.slice(0, 20)}${utc.slice(20, -1).padEnd(9, '0')}Z`;
}
