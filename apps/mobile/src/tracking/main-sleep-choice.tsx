import { COPY_TEMPLATES as copy } from '@sleeby/copy';
import type { SleebyRepository } from '@sleeby/data';
import type { Night, SleepRecord } from '@sleeby/domain';
import { randomUUID } from 'expo-crypto';
import { Pressable, Text, useColorScheme, View } from 'react-native';
import { sleepText, useSaveOperation } from './state';

/** Dismissal performs no write, keeping the previous explicit choice intact. */
export function MainSleepChoice({
  repository,
  night,
  sleeps,
  onSaved,
  onDismiss,
}: {
  repository: SleebyRepository;
  night: Night;
  sleeps: readonly SleepRecord[];
  onSaved: () => void;
  onDismiss: () => void;
}) {
  const color = useColorScheme() === 'dark' ? '#f5f5ef' : '#22271f';
  const operation = useSaveOperation<Night>(
    (value) => repository.saveMainSleepChoice(value, night.id),
    onSaved,
  );
  return (
    <View style={{ gap: 12 }}>
      <Text accessibilityRole="header" style={{ color }}>
        {copy.mainSleepQuestion}
      </Text>
      {sleeps.map((sleep) => (
        <Pressable
          key={sleep.id}
          accessibilityRole="button"
          accessibilityLabel={`${copy.useMainSleep}: ${sleepText(sleep)}`}
          accessibilityState={{
            selected: night.primarySessionId === sleep.id,
            disabled: operation.locked,
          }}
          disabled={operation.locked}
          style={{
            minHeight: 48,
            padding: 12,
            borderWidth: 1,
            borderColor: '#758271',
            borderRadius: 12,
          }}
          onPress={() =>
            operation.save(() => ({
              ...night,
              id: randomUUID(),
              primarySessionId: sleep.id,
            }))
          }
        >
          <Text style={{ color }}>
            {sleepText(sleep)}
            {night.primarySessionId === sleep.id ? ' (Main sleep)' : ''}
          </Text>
          <Text style={{ color }}>{copy.useMainSleep}</Text>
        </Pressable>
      ))}
      {operation.status === 'read-failed' && (
        <Pressable
          accessibilityRole="button"
          onPress={() => operation.save(() => night)}
          style={{ minHeight: 48, padding: 12 }}
        >
          <Text style={{ color }}>{copy.retry}</Text>
        </Pressable>
      )}
      <Pressable
        accessibilityRole="button"
        disabled={operation.busy || operation.status === 'read-failed'}
        onPress={onDismiss}
        style={{ minHeight: 48, padding: 12 }}
      >
        <Text style={{ color }}>Close</Text>
      </Pressable>
      {operation.message && (
        <Text accessibilityRole="alert" style={{ color }}>
          {operation.message}
        </Text>
      )}
    </View>
  );
}
