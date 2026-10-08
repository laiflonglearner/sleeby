import { getRandomBytes } from 'expo-crypto';
import { File } from 'expo-file-system';
import * as SecureStore from 'expo-secure-store';
import { defaultDatabaseDirectory, openDatabaseSync } from 'expo-sqlite';
import { toRepositoryPort } from './adapter';
import { runMigrations } from './migrate';
import { openSleebyRepository } from './open';

const KEY_NAME = 'sleeby.dbkey';
const FILE_NAME = 'sleeby.db';
// SQLite returns a native path on Android; File takes a URI.
const databaseDirectory = defaultDatabaseDirectory.startsWith('/')
  ? `file://${defaultDatabaseDirectory}`
  : defaultDatabaseDirectory;
const options = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};
let opening: ReturnType<typeof openSleebyRepository> | undefined;

/** Shares one encrypted connection for the lifetime of the app. */
export function openRepository() {
  opening ??= openSleebyRepository({
    keyStore: {
      get: () => SecureStore.getItemAsync(KEY_NAME, options),
      set: (value) => SecureStore.setItemAsync(KEY_NAME, value, options),
    },
    databaseExists: () => new File(databaseDirectory, FILE_NAME).exists,
    randomBytes: getRandomBytes,
    openDatabase: () => openDatabaseSync(FILE_NAME),
    migrate: runMigrations,
    toPort: toRepositoryPort,
  });
  return opening;
}
