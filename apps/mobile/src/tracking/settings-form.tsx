import { COPY_TEMPLATES as copy } from '@sleeby/copy';
import type { SleebyRepository } from '@sleeby/data';
import type { TrackingSettings } from '@sleeby/domain';
import { randomUUID } from 'expo-crypto';
import { useState } from 'react';
import { Pressable, Switch, Text, View } from 'react-native';
import {
  currentTimestamp,
  initialMinutes,
  useDraftExit,
  useSaveOperation,
} from './state';
import { TimeEntry } from './time-entry';
import { useTrackingTheme } from './theme';
/** Settings append a version; older entries keep their saved choices. */
export function SettingsForm({
  repository,
  initial,
  onSaved,
}: {
  repository: SleebyRepository;
  initial: TrackingSettings;
  onSaved: () => void;
}) {
  const theme = useTrackingTheme();
  const [boundary, setBoundary] = useState(initial.dayBoundaryMinutes);
  const [target, setTarget] = useState(initial.target !== null);
  const [bed, setBed] = useState(
    initial.target?.bedtimeMinutes ?? initialMinutes(),
  );
  const [wake, setWake] = useState(
    initial.target?.wakeMinutes ?? initialMinutes(),
  );
  const [stronger, setStronger] = useState(initial.strongerContrast);
  const [dirty, setDirty] = useState(false);
  useDraftExit(dirty);
  const operation = useSaveOperation<TrackingSettings>(
    (value) => repository.saveTrackingSettings(value, initial.id),
    () => {
      theme.refresh();
      onSaved();
      setDirty(false);
    },
  );
  const change = () => {
    operation.change();
    setDirty(true);
  };
  return (
    <View style={{ gap: 20 }}>
      <TimeEntry
        label={copy.dayStart}
        value={boundary}
        showNow={false}
        disabled={operation.locked}
        onChange={(value) => {
          change();
          setBoundary(value);
        }}
      />
      <Text style={{ color: theme.text }}>Sleep target</Text>
      <Switch
        accessibilityLabel="Sleep target"
        value={target}
        disabled={operation.locked}
        onValueChange={(value) => {
          change();
          setTarget(value);
        }}
      />
      {target && (
        <>
          <TimeEntry
            label="Target bedtime"
            value={bed}
            showNow={false}
            disabled={operation.locked}
            onChange={(value) => {
              change();
              setBed(value);
            }}
          />
          <TimeEntry
            label="Target wake time"
            value={wake}
            showNow={false}
            disabled={operation.locked}
            onChange={(value) => {
              change();
              setWake(value);
            }}
          />
        </>
      )}
      <Text style={{ color: theme.text }}>Stronger contrast</Text>
      <Switch
        accessibilityLabel="Stronger contrast"
        value={stronger}
        disabled={operation.locked}
        onValueChange={(value) => {
          change();
          setStronger(value);
        }}
      />
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
            ...initial,
            id: randomUUID(),
            timestamp: currentTimestamp(),
            target: target ? { bedtimeMinutes: bed, wakeMinutes: wake } : null,
            dayBoundaryMinutes: boundary,
            strongerContrast: stronger,
          }))
        }
      >
        <Text style={{ color: theme.text }}>
          {operation.status === 'read-failed' ? copy.retry : copy.save}
        </Text>
      </Pressable>
      {operation.message && (
        <Text
          accessibilityRole={operation.status === 'saved' ? 'text' : 'alert'}
          style={{ color: theme.text }}
        >
          {operation.message}
        </Text>
      )}
    </View>
  );
}
