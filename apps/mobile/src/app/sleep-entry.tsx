import { COPY_TEMPLATES as copy } from '@sleeby/copy';
import type { Night, SleepRecord, TrackingSettings } from '@sleeby/domain';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, Text, useColorScheme } from 'react-native';
import { useRepository } from '../db/provider';
import { SleepForm } from '../tracking/sleep-form';
import { Onboarding } from '../tracking/onboarding';
import { validDate } from '../tracking/state';

export default function SleepEntry() {
  const repository = useRepository();
  const router = useRouter();
  const params = useLocalSearchParams<{ key: string; sleep?: string }>();
  const [entry, setEntry] = useState<{
    settings: TrackingSettings | null;
    night: Night | null;
    initial: SleepRecord | null;
  } | null>(null);
  const [failed, setFailed] = useState(false);
  const dark = useColorScheme() === 'dark';
  const color = dark ? '#f5f5ef' : '#22271f';
  const container = {
    flexGrow: 1,
    padding: 24,
    gap: 24,
    backgroundColor: dark ? '#131a16' : '#f8f5ee',
  };
  const load = useCallback(() => {
    if (!validDate(params.key)) return;
    const settings = repository.readCurrentTrackingSettings()?.value ?? null;
    const night = repository.readCurrentNight(params.key)?.value ?? null;
    if (params.sleep && !night?.sessionIds.includes(params.sleep))
      throw new RangeError('missing-edited-sleep');
    const initial = params.sleep
      ? (repository.readSleepByIds([params.sleep])[0] ?? null)
      : null;
    setEntry({ settings, night, initial });
    setFailed(false);
  }, [repository, params.key, params.sleep]);
  useFocusEffect(
    useCallback(() => {
      try {
        load();
      } catch {
        setFailed(true);
      }
    }, [load]),
  );
  if (!validDate(params.key))
    return (
      <ScrollView contentContainerStyle={container}>
        <Text style={{ color }}>Choose a date on Today.</Text>
      </ScrollView>
    );
  if (failed)
    return (
      <ScrollView contentContainerStyle={container}>
        <Text accessibilityRole="alert" style={{ color }}>
          {copy.storageUnavailable}
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            try {
              load();
            } catch {
              setFailed(true);
            }
          }}
          style={{ minHeight: 48, padding: 12 }}
        >
          <Text style={{ color }}>{copy.retry}</Text>
        </Pressable>
      </ScrollView>
    );
  if (!entry)
    return (
      <ScrollView contentContainerStyle={container}>
        <Text style={{ color }}>{copy.storageOpening}</Text>
      </ScrollView>
    );
  if (!entry.settings)
    return (
      <ScrollView contentContainerStyle={container}>
        <Onboarding repository={repository} onConfirmed={load} />
      </ScrollView>
    );
  return (
    <ScrollView contentContainerStyle={container}>
      <Text accessibilityRole="header" style={{ color, fontSize: 28 }}>
        Sleep entry
      </Text>
      <SleepForm
        key={`${entry.night?.id ?? 'new'}:${params.sleep ?? 'new'}`}
        repository={repository}
        settings={entry.settings}
        day={params.key}
        night={entry.night}
        initial={entry.initial}
        onSaved={(key) => {
          // Read the committed Night before displaying success or changing routes.
          if (!repository.readCurrentNight(key))
            throw new RangeError('missing-saved-night');
          router.replace({
            pathname: '/night/[key]',
            params: { key, choose: '1' },
          });
        }}
      />
    </ScrollView>
  );
}
