import {
  assignDayKey,
  durationMinutes,
  localClockMinutes,
  localTimeCandidates,
  type KeyAssignment,
  type Timestamp,
} from '@sleeby/domain';
import { COPY_TEMPLATES } from '@sleeby/copy';
import { useNavigation } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
import type { NightPage, SleebyRepository } from '@sleeby/data';
import { useTrackingTheme } from './theme';

/** Format an exact local minute position. */
export function clockText(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

/** Entry timestamps keep the zone that was visible during editing. */
export function currentTimestamp(): Timestamp {
  return {
    utc: new Date().toISOString(),
    reference: {
      kind: 'iana',
      zone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    },
  };
}

/** A new wheel starts on a five-minute mark, without changing saved exact minutes. */
export function initialMinutes(): number {
  return (Math.round(localClockMinutes(currentTimestamp()) / 5) * 5) % 1440;
}

/** Validate a typed calendar date without accepting JavaScript date overflow. */
export function validDate(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date.startsWith('0000'))
    return false;
  const instant = Date.parse(`${date}T12:00:00Z`);
  return (
    Number.isFinite(instant) &&
    new Date(instant).toISOString().slice(0, 10) === date
  );
}

/** Calendar arithmetic stays separate from elapsed UTC time. */
export function nextDate(date: string): string {
  if (!validDate(date)) throw new RangeError('invalid-date');
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + 1);
  return value.toISOString().slice(0, 10);
}

/** Find an entry time inside the explicitly selected habit day. */
export function habitTime(
  assignment: KeyAssignment,
  minutes: number,
  zone: string,
) {
  const date =
    minutes < assignment.boundaryMinutes
      ? nextDate(assignment.key)
      : assignment.key;
  return {
    date,
    ...localTimeCandidates(date, Math.floor(minutes / 60), minutes % 60, zone),
  };
}

/** Find both displayed calendar dates before calculating real elapsed time. */
export function sleepTimes(
  date: string,
  start: number,
  end: number,
  zone: string,
) {
  const endDate = end < start ? nextDate(date) : date;
  return {
    startDate: date,
    endDate,
    equalClocks: start === end,
    start: localTimeCandidates(date, Math.floor(start / 60), start % 60, zone),
    end: localTimeCandidates(endDate, Math.floor(end / 60), end % 60, zone),
  };
}

/** Saved values retain their original local reference and exact elapsed length. */
export function sleepText(sleep: import('@sleeby/domain').SleepRecord): string {
  const format = (stamp: typeof sleep.start) => {
    if (stamp.reference === null) return stamp.utc;
    const date = assignDayKey({ ...stamp, reference: stamp.reference }, 0).key;
    return `${date} ${clockText(localClockMinutes({ ...stamp, reference: stamp.reference }))}`;
  };
  return `${format(sleep.start)} to ${format(sleep.end)} (${durationMinutes(sleep.start.utc, sleep.end.utc)} minutes)`;
}

/** Keep one operation across retries, and never append again after a committed write. */
export function useSaveOperation<T>(
  write: (value: T) => void,
  read: () => void,
) {
  const attempt = useRef<{ value: T; committed: boolean } | null>(null);
  const [status, setStatus] = useState<
    'idle' | 'saved' | 'write-failed' | 'read-failed' | 'conflict'
  >('idle');
  const [busy, setBusy] = useState(false);
  const running = useRef(false);
  const save = (build: () => T) => {
    if (running.current || status === 'conflict') return;
    running.current = true;
    setBusy(true);
    try {
      attempt.current ??= { value: build(), committed: false };
      if (!attempt.current.committed) {
        write(attempt.current.value);
        attempt.current.committed = true;
      }
      read();
      setStatus('saved');
    } catch (error) {
      setStatus(
        attempt.current?.committed
          ? 'read-failed'
          : error instanceof RangeError &&
              /stale-entry|conflicting-entry/.test(error.message)
            ? 'conflict'
            : 'write-failed',
      );
    } finally {
      running.current = false;
      setBusy(false);
    }
  };
  const change = () => {
    if (attempt.current?.committed && status === 'read-failed') return;
    attempt.current = null;
    setStatus('idle');
  };
  const message =
    status === 'saved'
      ? COPY_TEMPLATES.saved
      : status === 'read-failed'
        ? COPY_TEMPLATES.readFailed
        : status === 'conflict'
          ? COPY_TEMPLATES.changedEntry
          : status === 'write-failed'
            ? COPY_TEMPLATES.saveFailed
            : null;
  return {
    save,
    change,
    status,
    busy,
    message,
    locked: busy || status === 'read-failed' || status === 'conflict',
  };
}

/** Ask before leaving an in-memory draft. */
export function confirmDraftExit(dirty: boolean, leave: () => void): void {
  if (!dirty) {
    leave();
    return;
  }
  Alert.alert(COPY_TEMPLATES.leaveDraft, undefined, [
    { text: COPY_TEMPLATES.keepEditing, style: 'cancel' },
    { text: COPY_TEMPLATES.leave, style: 'destructive', onPress: leave },
  ]);
}

/** Navigation and the date picker use the same draft-exit question. */
export function useDraftExit(dirty: boolean): () => void {
  const navigation = useNavigation();
  const { setDirty } = useTrackingTheme();
  useEffect(() => {
    setDirty(dirty);
    return () => setDirty(false);
  }, [dirty, setDirty]);
  const leaving = useRef(false);
  useEffect(
    () =>
      navigation.addListener('beforeRemove', (event) => {
        if (!dirty || leaving.current) return;
        event.preventDefault();
        confirmDraftExit(true, () => {
          leaving.current = true;
          navigation.dispatch(event.data.action);
        });
      }),
    [dirty, navigation],
  );
  return () => {
    leaving.current = true;
  };
}

/** Quick logging opens the day under the confirmed boundary. */
export function currentDay(boundary: number): string {
  return assignDayKey(currentTimestamp(), boundary).key;
}

/** Read only the next bounded inventory page. A failed read leaves the prior page intact. */
export function moreNights(
  repository: SleebyRepository,
  page: NightPage,
): NightPage {
  if (!page.nextCursor) return page;
  const next = repository.readNightPage(30, page.nextCursor);
  return {
    nights: [...page.nights, ...next.nights],
    nextCursor: next.nextCursor,
  };
}
