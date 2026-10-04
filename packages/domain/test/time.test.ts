import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  assignDayKey,
  assignNightKey,
  assignNapKey,
  dayBoundaryMinutes,
  durationMinutes,
  normalizeTimestamp,
  toRelativeSleepMinutes,
} from '../src/time.js';

describe('time and historical keys', () => {
  it('preserves native nanoseconds through UTC normalization and elapsed differences', () => {
    const timestamp = normalizeTimestamp(
      '2026-10-04T01:00:00.123456789+07:00',
      { kind: 'offset', offsetSeconds: 25_200 },
    );
    expect(timestamp.utc).toBe('2026-10-03T18:00:00.123456789Z');
    expect(
      durationMinutes(
        '2026-10-04T00:00:00.000000001Z',
        '2026-10-04T00:00:00.000000002Z',
      ),
    ).toBeCloseTo(1 / 60_000_000_000, 20);
    const beforeBoundary = normalizeTimestamp(
      '2026-10-04T03:59:59.999999999Z',
      { kind: 'offset', offsetSeconds: 0 },
    );
    expect(assignDayKey(beforeBoundary).key).toBe('2026-10-03');
  });
  it.each([
    ['2026-03-08T00:00:00-05:00', '2026-03-08T08:00:00-04:00', 420],
    ['2026-11-01T00:00:00-04:00', '2026-11-01T08:00:00-05:00', 540],
  ])('uses UTC duration across DST: %s', (start, end, minutes) => {
    expect(durationMinutes(start, end)).toBe(minutes);
  });

  it('uses a stored IANA zone across both DST transitions', () => {
    const zone = { kind: 'iana', zone: 'America/New_York' } as const;
    expect(
      toRelativeSleepMinutes(normalizeTimestamp('2026-03-08T07:00:00Z', zone)),
    ).toBe(540);
    expect(
      toRelativeSleepMinutes(normalizeTimestamp('2026-11-01T05:30:00Z', zone)),
    ).toBe(450);
    expect(
      toRelativeSleepMinutes(normalizeTimestamp('2026-11-01T06:30:00Z', zone)),
    ).toBe(450);
    expect(
      assignDayKey(normalizeTimestamp('2026-03-08T08:00:00Z', zone), 240).key,
    ).toBe('2026-03-08');
  });

  it('preserves explicit keys across boundary changes and morning logging', () => {
    const start = normalizeTimestamp('2026-10-04T01:00:00+07:00', {
      kind: 'offset',
      offsetSeconds: 25_200,
    });
    const stored = assignNightKey(start, 240);
    expect(stored).toEqual({ key: '2026-10-03', boundaryMinutes: 240 });
    expect(assignDayKey(start, 0).key).toBe('2026-10-04');
    expect(stored.key).toBe('2026-10-03');
    expect(assignNapKey(start, 240)).toEqual(stored);
  });

  it('covers exact midnight, boundary equality, and early and late targets', () => {
    const timestamp = (clock: string) =>
      normalizeTimestamp(`2026-10-04T${clock}:00Z`, {
        kind: 'offset',
        offsetSeconds: 0,
      });
    expect(assignDayKey(timestamp('00:00')).key).toBe('2026-10-03');
    expect(assignDayKey(timestamp('04:00')).key).toBe('2026-10-04');
    expect(
      dayBoundaryMinutes({ bedtimeMinutes: 1_320, wakeMinutes: 360 }),
    ).toBe(120);
    expect(dayBoundaryMinutes({ bedtimeMinutes: 180, wakeMinutes: 660 })).toBe(
      420,
    );
    expect(dayBoundaryMinutes()).toBe(240);
    expect(() =>
      dayBoundaryMinutes({ bedtimeMinutes: 0, wakeMinutes: 0 }),
    ).toThrow();
  });

  it('rejects naive timestamps, normalized invalid dates, and invalid references', () => {
    expect(() =>
      normalizeTimestamp('2026-01-01T00:00:00Z', {
        kind: 'iana',
        zone: undefined,
      } as unknown as Parameters<typeof normalizeTimestamp>[1]),
    ).toThrow('invalid-time-reference');
    expect(() =>
      normalizeTimestamp('2026-01-01T00:00:00Z', {
        kind: 'iana',
        zone: '+07:00',
      }),
    ).toThrow('invalid-time-reference');
    for (const iso of [
      '2026-02-30T00:00:00Z',
      '2026-10-04T00:00:00',
      '2026-01-01T24:00:00Z',
      '2026-01-01T00:00:00+18:01',
    ]) {
      expect(() =>
        normalizeTimestamp(iso, { kind: 'offset', offsetSeconds: 0 }),
      ).toThrow();
    }
    expect(() =>
      normalizeTimestamp('2026-01-01T00:00:00Z', {
        kind: 'iana',
        zone: 'invalid/zone',
      }),
    ).toThrow();
  });

  it('offset localization and key assignment match an independent calendar oracle', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: Date.UTC(2020, 0, 1), max: Date.UTC(2035, 0, 1) }),
        fc.integer({ min: -64_800, max: 64_800 }),
        fc.integer({ min: 0, max: 1_439 }),
        (instant, offsetSeconds, boundary) => {
          const timestamp = normalizeTimestamp(
            new Date(instant).toISOString(),
            { kind: 'offset', offsetSeconds },
          );
          const local = new Date(instant + offsetSeconds * 1_000);
          const minute = local.getUTCHours() * 60 + local.getUTCMinutes();
          expect(toRelativeSleepMinutes(timestamp)).toBe(
            (minute + 360) % 1_440,
          );
          const expected = new Date(
            Date.UTC(
              local.getUTCFullYear(),
              local.getUTCMonth(),
              local.getUTCDate(),
            ),
          );
          if (minute < boundary) expected.setUTCDate(expected.getUTCDate() - 1);
          expect(assignDayKey(timestamp, boundary).key).toBe(
            expected.toISOString().slice(0, 10),
          );
        },
      ),
      { numRuns: 500 },
    );
  });

  it('sweeps DST years and zones with equivalent imported offsets', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2020, max: 2035 }),
        fc.integer({ min: 0, max: 365 }),
        fc.constantFrom(
          'America/New_York',
          'Europe/Berlin',
          'Australia/Sydney',
          'Asia/Jakarta',
        ),
        (year, day, zone) => {
          const instant = Date.UTC(year, 0, day + 1, 6, 30);
          const zoned = normalizeTimestamp(new Date(instant).toISOString(), {
            kind: 'iana',
            zone,
          });
          const offsetName = new Intl.DateTimeFormat('en', {
            timeZone: zone,
            timeZoneName: 'longOffset',
          })
            .formatToParts(instant)
            .find((part) => part.type === 'timeZoneName')!.value;
          const match = /GMT([+-])(\d{2}):(\d{2})/.exec(offsetName);
          const offset = match
            ? (match[1] === '-' ? -1 : 1) *
              (Number(match[2]) * 3_600 + Number(match[3]) * 60)
            : 0;
          const imported = normalizeTimestamp(zoned.utc, {
            kind: 'offset',
            offsetSeconds: offset,
          });
          expect(assignDayKey(zoned)).toEqual(assignDayKey(imported));
          expect(toRelativeSleepMinutes(zoned)).toBe(
            toRelativeSleepMinutes(imported),
          );
        },
      ),
      { numRuns: 500 },
    );
  });
  it('sweeps both actual US transition nights across years using wall-clock and UTC oracles', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2020, max: 2035 }),
        fc.boolean(),
        (year, spring) => {
          const month = spring ? 2 : 10;
          const firstWeekday = new Date(Date.UTC(year, month, 1)).getUTCDay();
          const firstSunday = 1 + ((7 - firstWeekday) % 7);
          const day = firstSunday + (spring ? 7 : 0);
          const date = new Date(Date.UTC(year, month, day))
            .toISOString()
            .slice(0, 10);
          const start = `${date}T00:00:00${spring ? '-05:00' : '-04:00'}`;
          const end = `${date}T08:00:00${spring ? '-04:00' : '-05:00'}`;
          const reference = { kind: 'iana', zone: 'America/New_York' } as const;
          const normalizedStart = normalizeTimestamp(start, reference);
          const normalizedEnd = normalizeTimestamp(end, reference);
          expect(durationMinutes(start, end)).toBe(spring ? 420 : 540);
          expect(
            toRelativeSleepMinutes(normalizedEnd) -
              toRelativeSleepMinutes(normalizedStart),
          ).toBe(480);
          expect(assignDayKey(normalizedEnd).key).toBe(date);
        },
      ),
      { numRuns: 200 },
    );
  });
});
