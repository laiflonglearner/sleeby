import { COPY_TEMPLATES as copy } from '@sleeby/copy';
import type { SleebyRepository } from '@sleeby/data';
import type { TrackingSettings } from '@sleeby/domain';
import { randomUUID } from 'expo-crypto';
import { useState } from 'react';
import { Pressable, Text, View, useColorScheme } from 'react-native';
import { clockText, currentTimestamp, useSaveOperation } from './state';
import { TimeEntry } from './time-entry';

/** No preference exists until the person confirms the suggested time. */
export function Onboarding({
  repository,
  onConfirmed,
}: {
  repository: SleebyRepository;
  onConfirmed: () => void;
}) {
  const [minutes, setMinutes] = useState(240);
  const dark = useColorScheme() === 'dark';
  const color = dark ? '#f5f5ef' : '#22271f';
  const operation = useSaveOperation<TrackingSettings>(
    (value) => repository.saveTrackingSettings(value, null),
    onConfirmed,
  );
  return (
    <View style={{ gap: 20 }}>
      <Text accessibilityRole="header" style={{ color, fontSize: 28 }}>
        {copy.dayStartTitle}
      </Text>
      <Text style={{ color }}>{copy.dayStartHelp}</Text>
      <TimeEntry
        label={copy.dayStart}
        value={minutes}
        showNow={false}
        disabled={operation.locked}
        onChange={(value) => {
          operation.change();
          setMinutes(value);
        }}
      />
      <Pressable
        accessibilityRole="button"
        disabled={operation.busy || operation.status === 'conflict'}
        onPress={() =>
          operation.save(() => ({
            id: randomUUID(),
            timestamp: currentTimestamp(),
            target: null,
            dayBoundaryMinutes: minutes,
            privacyNoteAcknowledged: false,
            strongerContrast: false,
          }))
        }
        style={{
          minHeight: 48,
          padding: 16,
          backgroundColor: dark ? '#354336' : '#dbe5d4',
          borderRadius: 12,
        }}
      >
        <Text style={{ color }}>
          {copy.dayStartConfirm} {clockText(minutes)}
        </Text>
      </Pressable>
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
