import { COPY_TEMPLATES as copy } from '@sleeby/copy';
import type { SleebyRepository, StoredRevision } from '@sleeby/data';
import type { Night, SleepRecord } from '@sleeby/domain';
import { useCallback, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import {
  Pressable,
  ScrollView,
  Text,
  useColorScheme,
  View,
} from 'react-native';
import { MainSleepChoice } from './main-sleep-choice';
import { sleepText } from './state';

type Version = {
  revision: StoredRevision<Night>;
  sleeps: readonly SleepRecord[];
};

/** Read only a bounded ancestry page and the intervals referenced by that page. */
export function NightDetail({
  repository,
  nightKey,
  askMain = false,
}: {
  repository: SleebyRepository;
  nightKey: string;
  askMain?: boolean;
}) {
  const router = useRouter();
  const [current, setCurrent] = useState<Version | null>(null);
  const [history, setHistory] = useState<readonly Version[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [asking, setAsking] = useState(askMain);
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const dark = useColorScheme() === 'dark';
  const color = dark ? '#f5f5ef' : '#22271f';
  const page = useCallback(
    (position?: string) => {
      const result = repository.readNightHistoryPage(nightKey, 10, position);
      return {
        versions: result.revisions.map((revision) => ({
          revision,
          sleeps: repository.readSleepByIds(revision.value.sessionIds),
        })),
        cursor: result.nextCursor,
      };
    },
    [repository, nightKey],
  );
  const load = useCallback(() => {
    const result = page();
    setCurrent(result.versions[0] ?? null);
    setHistory(result.versions.slice(1));
    setCursor(result.cursor);
    setLoaded(true);
    setFailed(false);
  }, [page]);
  useFocusEffect(
    useCallback(() => {
      try {
        load();
      } catch {
        setFailed(true);
      }
    }, [load]),
  );
  const openSleep = (id?: string) =>
    router.push({
      pathname: '/sleep-entry',
      params: { key: nightKey, ...(id ? { sleep: id } : {}) },
    });
  const version = (value: Version, editable: boolean) => (
    <View key={value.revision.value.id} style={{ gap: 12 }}>
      <Text style={{ color }}>
        {editable ? 'Current' : copy.pastEdits}:{' '}
        {value.revision.value.keyAssignment.key}
      </Text>
      {value.revision.value.primarySessionId === null && (
        <Text style={{ color }}>{copy.mainSleepMissing}</Text>
      )}
      {value.sleeps.map((sleep) => (
        <View key={sleep.id} style={{ gap: 8 }}>
          <Text style={{ color }}>
            {sleepText(sleep)}
            {value.revision.value.primarySessionId === sleep.id
              ? ' (Main sleep)'
              : ''}
          </Text>
          {editable && sleep.source === 'manual' && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${copy.edit}: ${sleepText(sleep)}`}
              onPress={() => openSleep(sleep.id)}
              style={{ minHeight: 48, padding: 12 }}
            >
              <Text style={{ color }}>{copy.edit}</Text>
            </Pressable>
          )}
        </View>
      ))}
    </View>
  );
  return (
    <ScrollView
      contentContainerStyle={{
        flexGrow: 1,
        padding: 24,
        gap: 24,
        backgroundColor: dark ? '#131a16' : '#f8f5ee',
      }}
    >
      <Text accessibilityRole="header" style={{ color, fontSize: 28 }}>
        Night {nightKey}
      </Text>
      {failed && (
        <>
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
        </>
      )}
      {!loaded && !failed && (
        <Text style={{ color }}>{copy.storageOpening}</Text>
      )}
      {current && !failed && (
        <>
          <Text style={{ color }}>{copy.saved}</Text>
          {version(current, true)}
          <Pressable
            accessibilityRole="button"
            onPress={() => openSleep()}
            style={{ minHeight: 48, padding: 12 }}
          >
            <Text style={{ color }}>Add sleep</Text>
          </Pressable>
          {asking ? (
            <MainSleepChoice
              key={current.revision.value.id}
              repository={repository}
              night={current.revision.value}
              sleeps={current.sleeps}
              onSaved={() => {
                load();
                setAsking(false);
              }}
              onDismiss={() => setAsking(false)}
            />
          ) : (
            <Pressable
              accessibilityRole="button"
              onPress={() => setAsking(true)}
              style={{ minHeight: 48, padding: 12 }}
            >
              <Text style={{ color }}>{copy.mainSleepQuestion}</Text>
            </Pressable>
          )}
          <Text accessibilityRole="header" style={{ color }}>
            {copy.pastEdits}
          </Text>
          {history.map((value) => version(value, false))}
          {cursor && (
            <Pressable
              accessibilityRole="button"
              style={{ minHeight: 48, padding: 12 }}
              onPress={() => {
                try {
                  const result = page(cursor);
                  setHistory((old) => [...old, ...result.versions]);
                  setCursor(result.cursor);
                } catch {
                  setFailed(true);
                }
              }}
            >
              <Text style={{ color }}>More past edits</Text>
            </Pressable>
          )}
        </>
      )}
      {loaded && !current && !failed && (
        <Text style={{ color }}>No saved sleep for this night.</Text>
      )}
    </ScrollView>
  );
}
