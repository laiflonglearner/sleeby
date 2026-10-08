import { getRandomBytes } from 'expo-crypto';
import { File } from 'expo-file-system';
import * as SecureStore from 'expo-secure-store';
import { openDatabaseSync } from 'expo-sqlite';
import { openRepository } from './index';
import { runMigrations } from './migrate';

jest.mock('expo-crypto', () => ({
  getRandomBytes: jest.fn((length: number) => new Uint8Array(length).fill(171)),
}));
jest.mock('expo-file-system', () => ({
  File: jest.fn((directory: string) => {
    if (!directory.startsWith('file://')) throw new Error('file-uri-expected');
    return { exists: false };
  }),
}));
jest.mock('expo-secure-store', () => {
  let key: string | null = null;
  return {
    WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'device-only',
    getItemAsync: jest.fn(async () => key),
    setItemAsync: jest.fn(async (_name: string, value: string) => {
      key = value;
    }),
  };
});
jest.mock('expo-sqlite', () => ({
  defaultDatabaseDirectory: '/data/user/0/test/files/SQLite',
  openDatabaseSync: jest.fn(() => ({
    execSync: jest.fn(),
    getFirstSync: jest.fn((sql: string) =>
      sql === 'PRAGMA cipher_version'
        ? { cipher_version: '4.10.0' }
        : { 'count(*)': 0 },
    ),
    closeSync: jest.fn(),
  })),
}));
jest.mock('./migrate', () => ({
  runMigrations: jest.fn(async () => undefined),
}));

it('shares key creation and one native connection across concurrent startup calls', async () => {
  const first = openRepository();
  const second = openRepository();
  expect(second).toBe(first);
  const [one, two] = await Promise.all([first, second]);
  expect(two).toBe(one);
  expect(openRepository()).toBe(first);
  expect(getRandomBytes).toHaveBeenCalledTimes(1);
  expect(getRandomBytes).toHaveBeenCalledWith(32);
  expect(SecureStore.setItemAsync).toHaveBeenCalledTimes(1);
  expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
    'sleeby.dbkey',
    'ab'.repeat(32),
    { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY },
  );
  expect(SecureStore.getItemAsync).toHaveBeenCalledTimes(2);
  expect(openDatabaseSync).toHaveBeenCalledTimes(1);
  expect(File).toHaveBeenCalledWith(
    'file:///data/user/0/test/files/SQLite',
    'sleeby.db',
  );
  expect(runMigrations).toHaveBeenCalledTimes(1);
});
