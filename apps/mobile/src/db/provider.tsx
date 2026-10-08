import { COPY_TEMPLATES } from '@sleeby/copy';
import type { SleebyRepository } from '@sleeby/data';
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  useColorScheme,
  View,
} from 'react-native';
import { openRepository } from './index';

const RepositoryContext = createContext<SleebyRepository | null>(null);
type Startup =
  | { kind: 'opening' }
  | { kind: 'failed' }
  | { kind: 'ready'; repository: SleebyRepository };

/** Keeps screens closed until encrypted storage is ready. */
export function RepositoryProvider({ children }: { children: ReactNode }) {
  const [startup, setStartup] = useState<Startup>({ kind: 'opening' });
  const dark = useColorScheme() === 'dark';

  useEffect(() => {
    let mounted = true;
    openRepository().then(
      (repository) => {
        if (mounted) setStartup({ kind: 'ready', repository });
      },
      () => {
        if (mounted) setStartup({ kind: 'failed' });
      },
    );
    return () => {
      mounted = false;
    };
  }, []);

  if (startup.kind === 'ready') {
    return (
      <RepositoryContext.Provider value={startup.repository}>
        {children}
      </RepositoryContext.Provider>
    );
  }

  return (
    <View
      style={[styles.container, { backgroundColor: dark ? '#000' : '#fff' }]}
    >
      {startup.kind === 'opening' && <ActivityIndicator />}
      <Text
        accessibilityRole={startup.kind === 'failed' ? 'alert' : 'text'}
        accessibilityLiveRegion="polite"
        style={{ color: dark ? '#fff' : '#000' }}
      >
        {startup.kind === 'opening'
          ? COPY_TEMPLATES.storageOpening
          : COPY_TEMPLATES.storageUnavailable}
      </Text>
    </View>
  );
}

/** Returns the repository after the startup gate has opened. */
export function useRepository(): SleebyRepository {
  const repository = useContext(RepositoryContext);
  if (!repository) throw new Error('repository-not-ready');
  return repository;
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24, gap: 16 },
});
