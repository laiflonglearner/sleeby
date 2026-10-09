import { COPY_TEMPLATES as copy } from '@sleeby/copy';
import type { SleebyRepository } from '@sleeby/data';
import type { TrackingSettings } from '@sleeby/domain';
import { randomUUID } from 'expo-crypto';
import { Pressable, Text, View } from 'react-native';
import { currentTimestamp, useSaveOperation } from './state';
import { useTrackingTheme } from './theme';
/** Acknowledgement preserves the confirmed boundary and other settings. */
export function PrivacyNote({
  repository,
  settings,
  onSaved,
}: {
  repository: SleebyRepository;
  settings: TrackingSettings;
  onSaved: () => void;
}) {
  const theme = useTrackingTheme();
  const operation = useSaveOperation<TrackingSettings>(
    (value) => repository.saveTrackingSettings(value, settings.id),
    onSaved,
  );
  return (
    <View style={{ gap: 20 }}>
      <Text style={{ color: theme.text }}>{copy.firstOpen}</Text>
      <Pressable
        accessibilityRole="button"
        disabled={operation.busy || operation.status === 'conflict'}
        style={{
          minHeight: 48,
          padding: 16,
          backgroundColor: theme.fill,
          borderRadius: 12,
        }}
        onPress={() =>
          operation.save(() => ({
            ...settings,
            id: randomUUID(),
            timestamp: currentTimestamp(),
            privacyNoteAcknowledged: true,
          }))
        }
      >
        <Text style={{ color: theme.text }}>
          {operation.status === 'read-failed' ? copy.retry : copy.continue}
        </Text>
      </Pressable>
      {operation.message && (
        <Text accessibilityRole="alert" style={{ color: theme.text }}>
          {operation.message}
        </Text>
      )}
    </View>
  );
}
