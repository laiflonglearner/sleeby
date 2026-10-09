import { COPY_TEMPLATES as copy } from '@sleeby/copy';
import type { TrackingSettings } from '@sleeby/domain';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, Text } from 'react-native';
import { useRepository } from '../../db/provider';
import { Onboarding } from '../../tracking/onboarding';
import { PrivacyNote } from '../../tracking/privacy-note';
import { SettingsForm } from '../../tracking/settings-form';
import { useTrackingTheme } from '../../tracking/theme';
export default function Settings() {
  const repository = useRepository();
  const theme = useTrackingTheme();
  const [settings, setSettings] = useState<TrackingSettings | null>(null);
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [revision, setRevision] = useState(0);
  const load = useCallback(() => {
    const saved = repository.readCurrentTrackingSettings()?.value ?? null;
    setSettings(saved);
    setFailed(false);
    setLoaded(true);
    setRevision((value) => value + 1);
  }, [repository]);
  useFocusEffect(
    useCallback(() => {
      try {
        load();
      } catch {
        setFailed(true);
      }
    }, [load]),
  );
  return (
    <ScrollView
      contentContainerStyle={{
        flexGrow: 1,
        padding: 24,
        gap: 20,
        backgroundColor: theme.background,
      }}
    >
      {failed ? (
        <>
          <Text accessibilityRole="alert" style={{ color: theme.text }}>
            {copy.storageUnavailable}
          </Text>
          <Pressable
            accessibilityRole="button"
            style={{ minHeight: 48, padding: 12 }}
            onPress={() => {
              try {
                load();
              } catch {
                setFailed(true);
              }
            }}
          >
            <Text style={{ color: theme.text }}>{copy.retry}</Text>
          </Pressable>
        </>
      ) : !loaded ? (
        <Text style={{ color: theme.text }}>{copy.storageOpening}</Text>
      ) : !settings ? (
        <Onboarding repository={repository} onConfirmed={load} />
      ) : !settings.privacyNoteAcknowledged ? (
        <PrivacyNote
          repository={repository}
          settings={settings}
          onSaved={load}
        />
      ) : (
        <SettingsForm
          key={`${settings.id}:${revision}`}
          repository={repository}
          initial={settings}
          onSaved={load}
        />
      )}
    </ScrollView>
  );
}
