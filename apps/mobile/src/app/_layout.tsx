import { Stack } from 'expo-router';
import { useState } from 'react';
import { COPY_TEMPLATES as copy } from '@sleeby/copy';
import { ScrollView, Pressable, Text } from 'react-native';
import { Onboarding } from '../tracking/onboarding';
import { PrivacyNote } from '../tracking/privacy-note';
import { TrackingThemeProvider, useTrackingTheme } from '../tracking/theme';
import { RepositoryProvider, useRepository } from '../db/provider';

function EntryGate() {
  const repository = useRepository();
  const theme = useTrackingTheme();
  const read = () => repository.readCurrentTrackingSettings()?.value ?? null;
  const [initial] = useState(() => {
    try {
      return { settings: read(), failed: false };
    } catch {
      return { settings: null, failed: true };
    }
  });
  const [settings, setSettings] = useState(initial.settings);
  const [failed, setFailed] = useState(initial.failed);
  const load = () => {
    setSettings(read());
    setFailed(false);
  };
  if (!settings || !settings.privacyNoteAcknowledged || failed)
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
        ) : !settings ? (
          <Onboarding repository={repository} onConfirmed={load} />
        ) : (
          <PrivacyNote
            repository={repository}
            settings={settings}
            onSaved={load}
          />
        )}
      </ScrollView>
    );
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: theme.background },
        headerTintColor: theme.text,
        contentStyle: { backgroundColor: theme.background },
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="sleep-entry" options={{ title: 'Sleep entry' }} />
      <Stack.Screen name="night/[key]" options={{ title: 'Night' }} />
    </Stack>
  );
}
function TrackingStack() {
  const repository = useRepository();
  return (
    <TrackingThemeProvider repository={repository}>
      <EntryGate />
    </TrackingThemeProvider>
  );
}
export default function RootLayout() {
  return (
    <RepositoryProvider>
      <TrackingStack />
    </RepositoryProvider>
  );
}
