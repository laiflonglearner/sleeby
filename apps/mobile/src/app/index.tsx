import { COPY_TEMPLATES as copy } from '@sleeby/copy';
import type { HabitEntry, TrackingSettings } from '@sleeby/domain';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  Pressable,
  ScrollView,
  Text,
  TextInput,
  useColorScheme,
  View,
} from 'react-native';
import { useRepository } from '../db/provider';
import { HabitForm } from '../tracking/habit-form';
import { Onboarding } from '../tracking/onboarding';
import { confirmDraftExit, currentDay, validDate } from '../tracking/state';

export default function Today() {
  const repository = useRepository();
  const [settings, setSettings] = useState<TrackingSettings | null>(null);
  const [day, setDay] = useState('');
  const [typedDate, setTypedDate] = useState('');
  const [habit, setHabit] = useState<HabitEntry | null>(null);
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [revision, setRevision] = useState(0);
  const dark = useColorScheme() === 'dark';
  const color = dark ? '#f5f5ef' : '#22271f';
  const load = useCallback(() => {
    const saved = repository.readCurrentTrackingSettings()?.value ?? null;
    const key = day || (saved ? currentDay(saved.dayBoundaryMinutes) : '');
    const current = key
      ? (repository.readCurrentHabit(key)?.value ?? null)
      : null;
    setSettings(saved);
    setDay(key);
    setTypedDate(key);
    setHabit(current);
    setFailed(false);
    setLoaded(true);
    setRevision((value) => value + 1);
  }, [repository, day]);
  useFocusEffect(
    useCallback(() => {
      try {
        load();
      } catch {
        setFailed(true);
      }
    }, [load]),
  );
  const openDay = () =>
    confirmDraftExit(dirty, () => {
      try {
        const current = repository.readCurrentHabit(typedDate)?.value ?? null;
        setHabit(current);
        setDay(typedDate);
        setDirty(false);
        setRevision((value) => value + 1);
        setFailed(false);
      } catch {
        setFailed(true);
      }
    });
  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{
        flexGrow: 1,
        padding: 24,
        gap: 24,
        backgroundColor: dark ? '#131a16' : '#f8f5ee',
      }}
    >
      {failed ? (
        <View style={{ gap: 16 }}>
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
        </View>
      ) : !loaded ? (
        <Text style={{ color }}>{copy.storageOpening}</Text>
      ) : !settings ? (
        <Onboarding repository={repository} onConfirmed={load} />
      ) : (
        <>
          <Text
            accessibilityRole="header"
            style={{ color, fontSize: 30, fontWeight: '600' }}
          >
            {copy.today}
          </Text>
          <Text style={{ color }}>{copy.date}</Text>
          <TextInput
            accessibilityLabel={copy.date}
            accessibilityHint="YYYY-MM-DD"
            value={typedDate}
            onChangeText={setTypedDate}
            autoCapitalize="none"
            placeholder="YYYY-MM-DD"
            placeholderTextColor={dark ? '#c5cec1' : '#4e5b48'}
            maxLength={10}
            style={{
              color,
              minHeight: 48,
              padding: 12,
              borderWidth: 1,
              borderColor: '#758271',
              borderRadius: 12,
              fontSize: 18,
            }}
          />
          <Pressable
            accessibilityRole="button"
            disabled={!validDate(typedDate)}
            onPress={openDay}
            style={{
              minHeight: 48,
              padding: 12,
              borderWidth: 1,
              borderColor: '#758271',
              borderRadius: 12,
            }}
          >
            <Text style={{ color }}>{copy.openDay}</Text>
          </Pressable>
          <Text style={{ color, fontSize: 22 }}>{day}</Text>
          <HabitForm
            key={`${day}:${revision}`}
            repository={repository}
            settings={settings}
            day={day}
            initial={habit}
            onSaved={load}
            onDirty={setDirty}
          />
        </>
      )}
    </ScrollView>
  );
}
