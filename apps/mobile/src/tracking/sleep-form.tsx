import { COPY_TEMPLATES as copy } from '@sleeby/copy';
import type { SleebyRepository } from '@sleeby/data';
import {
  assignDayKey,
  durationMinutes,
  localClockMinutes,
  type Night,
  type SleepRecord,
  type Timestamp,
  type TrackingSettings,
} from '@sleeby/domain';
import { randomUUID } from 'expo-crypto';
import { useMemo, useState } from 'react';
import { Pressable, Text, TextInput, useColorScheme, View } from 'react-native';
import {
  currentTimestamp,
  initialMinutes,
  sleepTimes,
  useDraftExit,
  useSaveOperation,
  validDate,
} from './state';
import { TimeCandidates, TimeEntry } from './time-entry';

/** A manual interval and its Night version always share one atomic save. */
export function SleepForm({
  repository,
  settings,
  day,
  night,
  initial,
  onSaved,
}: {
  repository: SleebyRepository;
  settings: TrackingSettings;
  day: string;
  night: Night | null;
  initial: SleepRecord | null;
  onSaved: (key: string) => void;
}) {
  const [date, setDate] = useState(() =>
    initial?.start.reference
      ? assignDayKey(
          { ...initial.start, reference: initial.start.reference },
          0,
        ).key
      : day,
  );
  const [start, setStart] = useState(() =>
    initial?.start.reference
      ? localClockMinutes({
          ...initial.start,
          reference: initial.start.reference,
        })
      : initialMinutes(),
  );
  const [end, setEnd] = useState(() =>
    initial?.end.reference
      ? localClockMinutes({ ...initial.end, reference: initial.end.reference })
      : initialMinutes(),
  );
  const [zone] = useState(() =>
    initial?.start.reference?.kind === 'iana'
      ? initial.start.reference.zone
      : Intl.DateTimeFormat().resolvedOptions().timeZone,
  );
  const [chosenStart, setChosenStart] = useState<Timestamp | null>(
    initial?.start.reference
      ? { ...initial.start, reference: initial.start.reference }
      : null,
  );
  const [chosenEnd, setChosenEnd] = useState<Timestamp | null>(
    initial?.end.reference
      ? { ...initial.end, reference: initial.end.reference }
      : null,
  );
  const [dirty, setDirty] = useState(false);
  const permitExit = useDraftExit(dirty);
  const times = useMemo(
    () => (validDate(date) ? sleepTimes(date, start, end, zone) : null),
    [date, start, end, zone],
  );
  const startStamp =
    chosenStart ??
    (times?.start.status === 'valid' ? times.start.candidates[0] : null);
  const endStamp =
    chosenEnd ??
    (times?.end.status === 'valid' ? times.end.candidates[0] : null);
  const elapsed =
    startStamp && endStamp && endStamp.utc > startStamp.utc
      ? durationMinutes(startStamp.utc, endStamp.utc)
      : null;
  const valid = times !== null && !times.equalClocks && elapsed !== null;
  const color = useColorScheme() === 'dark' ? '#f5f5ef' : '#22271f';
  const operation = useSaveOperation<{
    sleep: SleepRecord;
    night: Night;
    expected: string | null;
    replaces: string | null;
  }>(
    (value) =>
      repository.saveManualSleep(
        value.sleep,
        value.night,
        value.expected,
        value.replaces,
      ),
    () => {
      const key =
        night?.keyAssignment.key ??
        (startStamp
          ? assignDayKey(startStamp, settings.dayBoundaryMinutes).key
          : day);
      permitExit();
      onSaved(key);
      setDirty(false);
    },
  );
  const change = () => {
    operation.change();
    setDirty(true);
  };
  return (
    <View style={{ gap: 16 }}>
      <Text style={{ color }}>{copy.date}</Text>
      <TextInput
        accessibilityLabel={copy.date}
        accessibilityHint="YYYY-MM-DD"
        value={date}
        editable={!operation.locked}
        onChangeText={(value) => {
          change();
          setDate(value);
          setChosenStart(null);
          setChosenEnd(null);
        }}
        style={{
          color,
          minHeight: 48,
          borderWidth: 1,
          borderColor: '#758271',
          padding: 12,
        }}
      />
      <TimeEntry
        label="Sleep"
        value={start}
        disabled={operation.locked}
        onChange={(value) => {
          change();
          setStart(value);
          setChosenStart(null);
          if (
            times &&
            sleepTimes(date, value, end, zone).endDate !== times.endDate
          )
            setChosenEnd(null);
        }}
      />
      {times && (
        <TimeCandidates
          {...times.start}
          chosen={chosenStart?.utc ?? null}
          onChoose={(stamp) => {
            if (!operation.locked) {
              change();
              setChosenStart(stamp);
            }
          }}
        />
      )}
      <TimeEntry
        label="Wake"
        value={end}
        disabled={operation.locked}
        onChange={(value) => {
          change();
          setEnd(value);
          setChosenEnd(null);
        }}
      />
      {times && (
        <>
          <TimeCandidates
            {...times.end}
            chosen={chosenEnd?.utc ?? null}
            onChoose={(stamp) => {
              if (!operation.locked) {
                change();
                setChosenEnd(stamp);
              }
            }}
          />
          <Text style={{ color }}>
            Sleep: {times.startDate} to {times.endDate} ({zone})
          </Text>
        </>
      )}
      {elapsed !== null && <Text style={{ color }}>{elapsed} minutes</Text>}
      {times?.equalClocks && (
        <Text accessibilityRole="alert" style={{ color }}>
          Choose different sleep and wake times.
        </Text>
      )}
      {night && (
        <Text style={{ color }}>
          {copy.preservedDay} {night.keyAssignment.key}
        </Text>
      )}
      <Pressable
        accessibilityRole="button"
        disabled={!valid || operation.busy || operation.status === 'conflict'}
        accessibilityState={{
          disabled: !valid || operation.busy || operation.status === 'conflict',
        }}
        style={{
          minHeight: 48,
          padding: 16,
          borderWidth: 1,
          borderColor: '#758271',
          borderRadius: 12,
        }}
        onPress={() =>
          operation.save(() => {
            if (!startStamp || !endStamp || !valid)
              throw new RangeError('invalid-sleep');
            const assignment =
              night?.keyAssignment ??
              assignDayKey(startStamp, settings.dayBoundaryMinutes);
            const id = randomUUID();
            return {
              expected: night?.id ?? null,
              replaces: initial?.id ?? null,
              sleep: {
                id,
                type: 'sleepSession',
                source: 'manual',
                origin: 'org.sleeby.app',
                device: null,
                recordingMethod: 'manual',
                externalId: null,
                lastModifiedUtc: currentTimestamp().utc,
                start: startStamp,
                end: endStamp,
                keyAssignment: assignment,
                rawPayload: null,
                payload: { stages: [] },
              },
              night: {
                ...night,
                id: randomUUID(),
                keyAssignment: assignment,
                target: night ? night.target : settings.target,
                sessionIds: initial
                  ? (night?.sessionIds ?? []).map((value) =>
                      value === initial.id ? id : value,
                    )
                  : [...(night?.sessionIds ?? []), id],
                primarySessionId:
                  initial && night?.primarySessionId === initial.id
                    ? id
                    : (night?.primarySessionId ?? null),
              },
            };
          })
        }
      >
        <Text style={{ color }}>
          {operation.status === 'read-failed' ? copy.retry : copy.save}
        </Text>
      </Pressable>
      {operation.message && (
        <Text accessibilityRole="alert" style={{ color }}>
          {operation.message}
        </Text>
      )}
    </View>
  );
}
