import { describe, expect, it } from 'vitest';
import { localTimeCandidates } from '../src/manual-time.js';
import { assignDayKey, durationMinutes } from '../src/time.js';

describe('explicit local time choices', () => {
  it('uses the chosen boundary and rejects impossible input', () => {
    const time = localTimeCandidates('2026-10-09', 0, 30, 'Asia/Jakarta');
    expect(time.status).toBe('valid');
    expect(assignDayKey(time.candidates[0]!, 240).key).toBe('2026-10-08');
    expect(
      localTimeCandidates('2026-02-30', 0, 30, 'Asia/Jakarta').status,
    ).toBe('invalid');
    expect(
      localTimeCandidates('2026-10-09', 24, 0, 'Asia/Jakarta').status,
    ).toBe('invalid');
    expect(
      localTimeCandidates('2026-10-09', 12, 0, 'unknown/zone').status,
    ).toBe('invalid');
  });
  it('keeps gaps and repeated times visible and calculates elapsed time', () => {
    expect(
      localTimeCandidates('2026-03-08', 2, 30, 'America/New_York'),
    ).toEqual({ status: 'nonexistent', candidates: [] });
    const repeated = localTimeCandidates(
      '2026-11-01',
      1,
      30,
      'America/New_York',
    );
    expect(repeated.status).toBe('repeated');
    expect(repeated.candidates.map((value) => value.utc)).toEqual([
      '2026-11-01T05:30:00.000Z',
      '2026-11-01T06:30:00.000Z',
    ]);
    const span = (day: string): number =>
      durationMinutes(
        localTimeCandidates(day, 0, 0, 'America/New_York').candidates[0]!.utc,
        localTimeCandidates(day, 8, 0, 'America/New_York').candidates[0]!.utc,
      );
    expect(span('2026-03-08')).toBe(420);
    expect(span('2026-11-01')).toBe(540);
  });
});
