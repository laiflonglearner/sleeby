import { COPY_TEMPLATES as copy } from '@sleeby/copy';
import type { NightPage } from '@sleeby/data';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, Text } from 'react-native';
import { useRepository } from '../../db/provider';
import { moreNights } from '../../tracking/state';
import { useTrackingTheme } from '../../tracking/theme';
export default function Nights() {
  const repository = useRepository();
  const router = useRouter();
  const theme = useTrackingTheme();
  const [page, setPage] = useState<NightPage>({ nights: [], nextCursor: null });
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  const load = useCallback(() => {
    try {
      setPage(repository.readNightPage(30));
      setReady(true);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [repository]);
  useFocusEffect(load);
  return (
    <ScrollView
      contentContainerStyle={{
        flexGrow: 1,
        padding: 24,
        gap: 16,
        backgroundColor: theme.background,
      }}
    >
      {page.nights.map((night) => (
        <Pressable
          key={night.id}
          accessibilityRole="button"
          style={{
            minHeight: 48,
            padding: 12,
            borderWidth: 1,
            borderColor: theme.border,
            borderRadius: 12,
          }}
          onPress={() =>
            router.push({
              pathname: '/night/[key]',
              params: { key: night.keyAssignment.key },
            })
          }
        >
          <Text style={{ color: theme.text }}>{night.keyAssignment.key}</Text>
          <Text style={{ color: theme.text }}>
            {night.primarySessionId === null
              ? copy.mainSleepMissing
              : copy.saved}
          </Text>
        </Pressable>
      ))}
      {failed && (
        <Text accessibilityRole="alert" style={{ color: theme.text }}>
          {copy.storageUnavailable}
        </Text>
      )}
      {(!ready || page.nextCursor) && (
        <Pressable
          accessibilityRole="button"
          style={{ minHeight: 48, padding: 12 }}
          onPress={() => {
            if (!ready) {
              load();
              return;
            }
            try {
              setPage(moreNights(repository, page));
              setFailed(false);
            } catch {
              setFailed(true);
            }
          }}
        >
          <Text style={{ color: theme.text }}>
            {failed ? copy.retry : 'More nights'}
          </Text>
        </Pressable>
      )}
    </ScrollView>
  );
}
