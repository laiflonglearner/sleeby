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
import { Pressable, Switch, Text, TextInput, View } from 'react-native';
import {
  clockText,
  currentTimestamp,
  habitTime,
  initialMinutes,
  useDraftExit,
  useSaveOperation,
} from './state';
import { useTrackingTheme } from './theme';
import { TimeCandidates, TimeEntry } from './time-entry';

function ChoiceGroup<T extends string | boolean | undefined>({
  label,
  value,
  choices,
  disabled,
  onChange,
}: {
  label: string;
  value: T;
  choices: { value: T; label: string }[];
  disabled: boolean;
  onChange: (value: T) => void;
}) {
  const theme = useTrackingTheme();
  return (
    <View style={{ gap: 8 }}>
      <Text style={{ color: theme.text, fontWeight: '600' }}>{label}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {choices.map((choice) => {
          const selected = value === choice.value;
          return (
            <Pressable
              key={String(choice.value)}
              accessibilityRole="radio"
              accessibilityLabel={`${label}: ${choice.label}`}
              accessibilityState={{ checked: selected, disabled }}
              disabled={disabled}
              style={{
                flexGrow: 1,
                flexBasis: 96,
                minHeight: 48,
                paddingHorizontal: 8,
                paddingVertical: 10,
                alignItems: 'center',
                justifyContent: 'center',
                borderWidth: selected ? 2 : 1,
                borderColor: theme.border,
                borderRadius: 12,
                backgroundColor: selected ? theme.fill : theme.background,
              }}
              onPress={() => onChange(choice.value)}
            >
              <Text style={{ color: theme.text, textAlign: 'center' }}>
                {selected ? '✓  ' : ''}{choice.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

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
  const theme = useTrackingTheme();
  const color = theme.text;
  const [monitoring, setMonitoring] = useState(
    initial?.monitoring ?? 'tracked',
  );
  const [hasCaffeine, setHasCaffeine] = useState(
    initial?.lastCaffeine !== undefined,
  );
  const [caffeineFree, setCaffeineFree] = useState(initial?.caffeineFree);
  const [caffeineMinutes, setCaffeineMinutes] = useState(() =>
    initial?.lastCaffeine
      ? localClockMinutes(initial.lastCaffeine)
      : initialMinutes(),
  );
  const [caffeineChosen, setCaffeineChosen] = useState<Timestamp | null>(
    initial?.lastCaffeine ?? null,
  );
  const [movement, setMovement] = useState(initial?.movementCompleted);
  const [durations, setDurations] = useState(() => ({
    morningSunlightMinutes: initial?.morningSunlightMinutes?.toString() ?? '',
    afternoonSunlightMinutes:
      initial?.afternoonSunlightMinutes?.toString() ?? '',
    movementMinutes: initial?.movementMinutes?.toString() ?? '',
    screenFreeMinutes: initial?.screenFreeMinutes?.toString() ?? '',
  }));
  const fields = {
    morningSunlightMinutes: 'Outdoor daylight before midday (minutes)',
    afternoonSunlightMinutes: 'Outdoor daylight after midday (minutes)',
    movementMinutes: 'Movement minutes',
    screenFreeMinutes: 'Screen-free minutes',
  } as const;
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
  const caffeineCandidates = useMemo(
    () => habitTime({ key, boundaryMinutes }, caffeineMinutes, zone),
    [key, boundaryMinutes, caffeineMinutes, zone],
  );
  const caffeineStamp =
    caffeineChosen ??
    (caffeineCandidates.status === 'valid'
      ? (caffeineCandidates.candidates[0] ?? null)
      : null);
  const valid =
    (!hasMeal || stamp !== null) &&
    (!hasCaffeine || caffeineStamp !== null) &&
    !(hasCaffeine && caffeineFree === true) &&
    Object.values(durations).every(
      (value) =>
        value === '' ||
        (/^\d+$/.test(value) && Number.isSafeInteger(Number(value))),
    );
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
          <Text style={{ color }}>{copy[initial.monitoring]}</Text>
          <Text style={{ color }}>
            Last caffeine:{' '}
            {initial.lastCaffeine
              ? clockText(localClockMinutes(initial.lastCaffeine))
              : '·'}
          </Text>
          {initial.caffeineFree !== undefined && (
            <Text style={{ color }}>
              Did you have any caffeine?{' '}
              {initial.caffeineFree ? 'No' : 'Yes'}
            </Text>
          )}
          {initial.movementCompleted !== undefined && (
            <Text style={{ color }}>
              Movement:{' '}
              {initial.movementCompleted ? 'Completed' : 'Not completed'}
            </Text>
          )}
          {(Object.keys(fields) as (keyof typeof fields)[]).map((field) =>
            initial[field] !== undefined ? (
              <Text key={field} style={{ color }}>
                {fields[field]}: {initial[field]}
              </Text>
            ) : null,
          )}
          <Pressable
            accessibilityRole="button"
            style={{
              minHeight: 48,
              padding: 12,
              borderWidth: 1,
              borderColor: theme.border,
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
          <View style={{ gap: 12 }}>
            <ChoiceGroup
              label="Day status"
              value={monitoring}
              disabled={disabled}
              choices={(['tracked', 'rest', 'unmonitored'] as const).map(
                (value) => ({ value, label: copy[value] }),
              )}
              onChange={(value) => {
                change();
                setMonitoring(value);
              }}
            />
            <Text style={{ color }}>
              This applies to the whole day, not just the meal.{' '}
              {monitoring === 'tracked'
                ? 'Tracked days can be included in comparisons when the needed measurements are present.'
                : monitoring === 'rest'
                  ? 'Mark this as a rest day. It is left out of comparisons.'
                  : 'Mark this day as not tracked. It is left out of comparisons.'}
            </Text>
            <View style={{ gap: 8 }}>
              <Text style={{ color, fontWeight: '600' }}>Caffeine</Text>
              <ChoiceGroup
                label="Did you have any caffeine?"
                value={caffeineFree}
                disabled={disabled}
                choices={[
                  { value: undefined, label: 'Not answered' },
                  { value: false, label: 'Yes' },
                  { value: true, label: 'No' },
                ]}
                onChange={(value) => {
                  change();
                  setCaffeineFree(value);
                }}
              />
              <Text style={{ color }}>
                Adding the last caffeine time is optional.
              </Text>
              <View
                style={{
                  flexDirection: 'row',
                  gap: 12,
                  alignItems: 'center',
                  flexWrap: 'wrap',
                }}
              >
                <Text style={{ color }}>Add last caffeine time</Text>
                <Switch
                  accessibilityLabel="Add last caffeine time"
                  value={hasCaffeine}
                  disabled={disabled}
                  onValueChange={(value) => {
                    change();
                    setHasCaffeine(value);
                  }}
                />
              </View>
              {hasCaffeine && (
                <>
                  <TimeEntry
                    label="Last caffeine"
                    value={caffeineMinutes}
                    disabled={disabled}
                    onChange={(value) => {
                      change();
                      setCaffeineMinutes(value);
                      setCaffeineChosen(null);
                    }}
                  />
                  <Text style={{ color }}>
                    {copy.date}: {caffeineCandidates.date} {zone}
                  </Text>
                  <TimeCandidates
                    {...caffeineCandidates}
                    chosen={caffeineChosen?.utc ?? null}
                    onChoose={(value) => {
                      change();
                      setCaffeineChosen(value);
                    }}
                  />
                </>
              )}
              {hasCaffeine && caffeineFree === true && (
                <Text accessibilityRole="alert" style={{ color }}>
                  “No” conflicts with a last caffeine time. Change one of these
                  entries to save.
                </Text>
              )}
            </View>
            <ChoiceGroup
              label="Movement completed"
              value={movement}
              disabled={disabled}
              choices={[
                { value: undefined, label: 'Not answered' },
                { value: true, label: 'Completed' },
                { value: false, label: 'Not completed' },
              ]}
              onChange={(value) => {
                change();
                setMovement(value);
              }}
            />
            <View style={{ gap: 8 }}>
              <Text style={{ color, fontWeight: '600' }}>
                Optional daily notes
              </Text>
              <Text style={{ color }}>
                Leave any field blank if you do not track it.
              </Text>
              {(Object.keys(fields) as (keyof typeof fields)[]).map((field) => (
                <View key={field} style={{ gap: 8 }}>
                  <Text style={{ color }}>{fields[field]}</Text>
                  <TextInput
                    accessibilityLabel={fields[field]}
                    keyboardType="number-pad"
                    editable={!disabled}
                    value={durations[field]}
                    onChangeText={(value) => {
                      change();
                      setDurations((previous) => ({
                        ...previous,
                        [field]: value,
                      }));
                    }}
                    style={{
                      minHeight: 48,
                      padding: 12,
                      borderWidth: 1,
                      borderColor: theme.border,
                      color,
                    }}
                  />
                </View>
              ))}
            </View>
          </View>
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
              backgroundColor: theme.fill,
            }}
            onPress={() =>
              operation.save(() => {
                const {
                  lastMeal,
                  lastCaffeine,
                  caffeineFree: oldCaffeineFree,
                  movementCompleted,
                  morningSunlightMinutes,
                  afternoonSunlightMinutes,
                  movementMinutes,
                  screenFreeMinutes,
                  ...rest
                } = initial ?? {
                  monitoring: 'tracked' as const,
                  lastMeal: undefined,
                };
                void lastMeal;
                void lastCaffeine;
                void oldCaffeineFree;
                void movementCompleted;
                void morningSunlightMinutes;
                void afternoonSunlightMinutes;
                void movementMinutes;
                void screenFreeMinutes;
                return {
                  expected: initial?.id ?? null,
                  value: {
                    ...rest,
                    monitoring,
                    ...(caffeineFree !== undefined ? { caffeineFree } : {}),
                    ...(movement !== undefined
                      ? { movementCompleted: movement }
                      : {}),
                    ...Object.fromEntries(
                      Object.entries(durations)
                        .filter(([, value]) => value !== '')
                        .map(([field, value]) => [field, Number(value)]),
                    ),
                    ...(hasCaffeine && caffeineStamp
                      ? { lastCaffeine: caffeineStamp }
                      : {}),
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
