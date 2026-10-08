import { COPY_TEMPLATES as copy } from '@sleeby/copy';
import { localClockMinutes, type Timestamp } from '@sleeby/domain';
import { useEffect, useRef } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useColorScheme,
  useWindowDimensions,
  View,
} from 'react-native';
import { clockText, currentTimestamp } from './state';

function Wheel({
  label,
  value,
  count,
  onChange,
  disabled,
}: {
  label: string;
  value: number;
  count: number;
  onChange: (value: number) => void;
  disabled: boolean;
}) {
  const wheel = useRef<ScrollView>(null);
  const height = 48 * Math.max(1, useWindowDimensions().fontScale);
  const dark = useColorScheme() === 'dark';
  useEffect(() => {
    wheel.current?.scrollTo({ y: value * height, animated: false });
  }, [value, height]);
  return (
    <View style={{ flex: 1 }}>
      <Text style={{ color: dark ? '#f5f5ef' : '#22271f' }}>{label}</Text>
      <ScrollView
        ref={wheel}
        nestedScrollEnabled
        scrollEnabled={!disabled}
        style={{ height: height * 3 }}
        contentContainerStyle={{ paddingVertical: height }}
        snapToInterval={height}
        decelerationRate="fast"
        showsVerticalScrollIndicator={false}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={label}
        accessibilityState={{ disabled }}
        accessibilityValue={{
          min: 0,
          max: count - 1,
          now: value,
          text: String(value).padStart(2, '0'),
        }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(event) => {
          if (!disabled)
            onChange(
              (value +
                (event.nativeEvent.actionName === 'increment'
                  ? 1
                  : count - 1)) %
                count,
            );
        }}
        onScrollEndDrag={(event) => {
          if (!disabled && Math.abs(event.nativeEvent.velocity?.y ?? 0) < 0.2) {
            onChange(
              Math.max(
                0,
                Math.min(
                  count - 1,
                  Math.round(event.nativeEvent.contentOffset.y / height),
                ),
              ),
            );
          }
        }}
        onMomentumScrollEnd={(event) => {
          if (!disabled)
            onChange(
              Math.max(
                0,
                Math.min(
                  count - 1,
                  Math.round(event.nativeEvent.contentOffset.y / height),
                ),
              ),
            );
        }}
      >
        {Array.from({ length: count }, (_, number) => (
          <Pressable
            key={number}
            disabled={disabled}
            onPress={() => onChange(number)}
            style={{
              height,
              justifyContent: 'center',
              alignItems: 'center',
              backgroundColor:
                number === value
                  ? dark
                    ? '#354336'
                    : '#dbe5d4'
                  : 'transparent',
              borderRadius: 12,
            }}
          >
            <Text
              style={{
                color: dark ? '#f5f5ef' : '#22271f',
                fontSize: 22,
                fontWeight: number === value ? '700' : '400',
              }}
            >
              {String(number).padStart(2, '0')}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

/** Native hour/minute wheels keep all sixty minute positions available. */
export function TimeEntry({
  label,
  value,
  onChange,
  disabled = false,
  showNow = true,
}: {
  label: string;
  value: number;
  onChange: (minutes: number) => void;
  disabled?: boolean;
  showNow?: boolean;
}) {
  const dark = useColorScheme() === 'dark';
  return (
    <View style={styles.section}>
      <Text
        style={{
          color: dark ? '#f5f5ef' : '#22271f',
          fontSize: 18,
          fontWeight: '600',
        }}
      >
        {label} {clockText(value)}
      </Text>
      <View style={styles.wheels}>
        <Wheel
          label={`${label} ${copy.hour}`}
          value={Math.floor(value / 60)}
          count={24}
          disabled={disabled}
          onChange={(hour) => onChange(hour * 60 + (value % 60))}
        />
        <Wheel
          label={`${label} ${copy.minute}`}
          value={value % 60}
          count={60}
          disabled={disabled}
          onChange={(minute) => onChange(Math.floor(value / 60) * 60 + minute)}
        />
      </View>
      {showNow && (
        <Pressable
          disabled={disabled}
          accessibilityRole="button"
          onPress={() => onChange(localClockMinutes(currentTimestamp()))}
          style={styles.button}
        >
          <Text style={{ color: dark ? '#f5f5ef' : '#22271f' }}>
            {copy.now}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

/** Repeated local times stay unchosen until the person picks an occurrence. */
export function TimeCandidates({
  status,
  candidates,
  chosen,
  onChoose,
}: {
  status: string;
  candidates: readonly Timestamp[];
  chosen: string | null;
  onChoose: (stamp: Timestamp) => void;
}) {
  const dark = useColorScheme() === 'dark';
  if (status === 'nonexistent')
    return (
      <Text
        accessibilityRole="alert"
        style={{ color: dark ? '#f5f5ef' : '#22271f' }}
      >
        {copy.nonexistentTime}
      </Text>
    );
  if (status !== 'repeated') return null;
  return (
    <View style={styles.section}>
      <Text style={{ color: dark ? '#f5f5ef' : '#22271f' }}>
        {copy.repeatedTime}
      </Text>
      {candidates.map((stamp, index) => (
        <Pressable
          key={stamp.utc}
          accessibilityRole="radio"
          accessibilityState={{ checked: chosen === stamp.utc }}
          onPress={() => onChoose(stamp)}
          style={styles.button}
        >
          <Text style={{ color: dark ? '#f5f5ef' : '#22271f' }}>
            {index === 0 ? copy.firstOccurrence : copy.secondOccurrence}:{' '}
            {stamp.utc}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 12 },
  wheels: { flexDirection: 'row', gap: 24 },
  button: {
    minHeight: 48,
    padding: 12,
    borderWidth: 1,
    borderColor: '#758271',
    borderRadius: 12,
    justifyContent: 'center',
  },
});
