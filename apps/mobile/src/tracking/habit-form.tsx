import { COPY_TEMPLATES as copy } from '@sleeby/copy';
import type { SleebyRepository } from '@sleeby/data';
import {
  localClockMinutes,
  type HabitEntry,
  type Timestamp,
  type TrackingSettings,
} from '@sleeby/domain';
import { randomUUID } from 'expo-crypto';
import { useMemo, useState } from 'react';
import { Pressable, Switch, Text, useColorScheme, View } from 'react-native';
import {
  clockText,
  currentTimestamp,
  habitTime,
  initialMinutes,
  useDraftExit,
  useSaveOperation,
} from './state';
import { TimeCandidates, TimeEntry } from './time-entry';

/** The daily form keeps untouched fields and writes a new immutable snapshot. */
export function HabitForm({
  repository,
  settings,
  day,
  initial,
  onSaved,
  onDirty,
}: {
  repository: SleebyRepository;
  settings: TrackingSettings;
  day: string;
  initial: HabitEntry | null;
  onSaved: () => void;
  onDirty: (dirty: boolean) => void;
}) {
  const [hasMeal, setHasMeal] = useState(initial?.lastMeal !== undefined);
  const [minutes, setMinutes] = useState(() =>
    initial?.lastMeal ? localClockMinutes(initial.lastMeal) : initialMinutes(),
  );
  const [chosen, setChosen] = useState<Timestamp | null>(
    initial?.lastMeal ?? null,
  );
  const [dirty, setDirty] = useState(false);
  const [editing, setEditing] = useState(initial === null);
  const dark = useColorScheme() === 'dark';
  const color = dark ? '#f5f5ef' : '#22271f';
  const assignment = initial?.keyAssignment ?? {
    key: day,
    boundaryMinutes: settings.dayBoundaryMinutes,
  };
  const [zone] = useState(() =>
    initial?.lastMeal?.reference.kind === 'iana'
      ? initial.lastMeal.reference.zone
      : Intl.DateTimeFormat().resolvedOptions().timeZone,
  );
  const { key, boundaryMinutes } = assignment;
  const candidates = useMemo(
    () => habitTime({ key, boundaryMinutes }, minutes, zone),
    [key, boundaryMinutes, minutes, zone],
  );
  const stamp =
    chosen ??
    (candidates.status === 'valid' ? (candidates.candidates[0] ?? null) : null);
  const operation = useSaveOperation<{
    value: HabitEntry;
    expected: string | null;
  }>(
    (attempt) => repository.saveManualHabit(attempt.value, attempt.expected),
    () => {
      onSaved();
      setDirty(false);
      onDirty(false);
      setEditing(false);
    },
  );
  useDraftExit(dirty);
  const change = () => {
    operation.change();
    setDirty(true);
    onDirty(true);
  };
  const disabled = operation.locked || !editing;
  const valid = !hasMeal || stamp !== null;
  return (
    <View style={{ gap: 16 }}>
      <Text style={{ color }}>
        {copy.dayStart}: {clockText(assignment.boundaryMinutes)}
      </Text>
      {initial && (
        <View style={{ gap: 8 }}>
          <Text style={{ color }}>{copy.saved}</Text>
          <Text style={{ color }}>
            {copy.lastMeal}:{' '}
            {initial.lastMeal
              ? clockText(localClockMinutes(initial.lastMeal))
              : '·'}
          </Text>
          <Pressable
            accessibilityRole="button"
            style={{
              minHeight: 48,
              padding: 12,
              borderWidth: 1,
              borderColor: '#758271',
              borderRadius: 12,
            }}
            onPress={() => setEditing(true)}
          >
            <Text style={{ color }}>{copy.edit}</Text>
          </Pressable>
        </View>
      )}
      {editing && (
        <>
          <View
            style={{
              flexDirection: 'row',
              gap: 16,
              alignItems: 'center',
              flexWrap: 'wrap',
            }}
          >
            <Text style={{ color }}>{copy.lastMeal}</Text>
            <Switch
              accessibilityLabel={copy.lastMeal}
              value={hasMeal}
              disabled={disabled}
              onValueChange={(value) => {
                change();
                setHasMeal(value);
              }}
            />
          </View>
          {hasMeal && (
            <>
              <TimeEntry
                label={copy.lastMeal}
                value={minutes}
                disabled={disabled}
                onChange={(value) => {
                  change();
                  setMinutes(value);
                  setChosen(null);
                }}
              />
              <Text style={{ color }}>
                {copy.date}: {candidates.date} {zone}
              </Text>
              <TimeCandidates
                {...candidates}
                chosen={chosen?.utc ?? null}
                onChoose={(value) => {
                  change();
                  setChosen(value);
                }}
              />
            </>
          )}
          {initial && (
            <Text style={{ color }}>
              {copy.preservedDay} {assignment.key}
            </Text>
          )}
          <Pressable
            accessibilityRole="button"
            accessibilityState={{
              disabled:
                !valid || operation.busy || operation.status === 'conflict',
            }}
            disabled={
              !valid || operation.busy || operation.status === 'conflict'
            }
            style={{
              minHeight: 48,
              padding: 16,
              borderRadius: 12,
              backgroundColor: dark ? '#354336' : '#dbe5d4',
            }}
            onPress={() =>
              operation.save(() => {
                const { lastMeal, ...rest } = initial ?? {
                  monitoring: 'tracked' as const,
                  lastMeal: undefined,
                };
                void lastMeal;
                return {
                  expected: initial?.id ?? null,
                  value: {
                    ...rest,
                    id: randomUUID(),
                    timestamp: currentTimestamp(),
                    keyAssignment: assignment,
                    ...(hasMeal && stamp ? { lastMeal: stamp } : {}),
                  },
                };
              })
            }
          >
            <Text style={{ color }}>
              {operation.status === 'read-failed' ? copy.retry : copy.save}
            </Text>
          </Pressable>
        </>
      )}
      {operation.message && (
        <Text
          accessibilityRole={operation.status === 'saved' ? 'text' : 'alert'}
          accessibilityLiveRegion="polite"
          style={{ color }}
        >
          {operation.message}
        </Text>
      )}
    </View>
  );
}
