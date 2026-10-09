import { COPY_TEMPLATES as copy } from '@sleeby/copy';
import type { HabitEntry, TrackingSettings } from '@sleeby/domain';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useRepository } from '../../db/provider';
import { HabitForm } from '../../tracking/habit-form';
import { Onboarding } from '../../tracking/onboarding';
import { useTrackingTheme } from '../../tracking/theme';
import { confirmDraftExit, currentDay, validDate } from '../../tracking/state';

export default function Today() {
  const repository = useRepository();
  const router = useRouter();
  const [settings, setSettings] = useState<TrackingSettings | null>(null);
  const [day, setDay] = useState('');
  const [typedDate, setTypedDate] = useState('');
  const [habit, setHabit] = useState<HabitEntry | null>(null);
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [revision, setRevision] = useState(0);
  const theme = useTrackingTheme();
  const color = theme.text;
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
        backgroundColor: theme.background,
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
          <View style={{ gap: 8 }}>
            <Text
              accessibilityRole="header"
              style={{ color, fontSize: 18, fontWeight: '600' }}
            >
              Viewing day
            </Text>
            <Text style={{ color, fontSize: 22 }}>{day}</Text>
            <Text style={{ color }}>Enter a date to open another day</Text>
            <View
              style={{
                flexDirection: 'row',
                flexWrap: 'wrap',
                gap: 8,
                alignItems: 'center',
              }}
            >
              <TextInput
                accessibilityLabel="Date to open"
                accessibilityHint="YYYY-MM-DD"
                value={typedDate}
                onChangeText={setTypedDate}
                autoCapitalize="none"
                placeholder="YYYY-MM-DD"
                placeholderTextColor={theme.text}
                maxLength={10}
                style={{
                  flexGrow: 1,
                  flexBasis: 180,
                  color,
                  minHeight: 48,
                  padding: 12,
                  borderWidth: 1,
                  borderColor: theme.border,
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
                  borderColor: theme.border,
                  borderRadius: 12,
                  backgroundColor: theme.fill,
                }}
              >
                <Text style={{ color }}>{copy.openDay}</Text>
              </Pressable>
            </View>
          </View>
          <HabitForm
            key={`${day}:${revision}`}
            repository={repository}
            settings={settings}
            day={day}
            initial={habit}
            onSaved={load}
            onDirty={setDirty}
          />
          <Pressable
            accessibilityRole="button"
            style={{ minHeight: 48, padding: 12 }}
            onPress={() =>
              confirmDraftExit(dirty, () =>
                router.push({ pathname: '/sleep-entry', params: { key: day } }),
              )
            }
          >
            <Text style={{ color }}>Add sleep</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            style={{ minHeight: 48, padding: 12 }}
            onPress={() =>
              confirmDraftExit(dirty, () =>
                router.push({ pathname: '/night/[key]', params: { key: day } }),
              )
            }
          >
            <Text style={{ color }}>Open night {day}</Text>
          </Pressable>
        </>
      )}
    </ScrollView>
  );
}
