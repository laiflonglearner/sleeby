import type { SQLiteDatabase } from '@sleeby/data';
import { SleebyRepository } from '@sleeby/data';
import { loadOrCreateKey, type KeyStore } from './key';

/** The few expo-sqlite connection methods the open sequence needs. */
export interface Connection {
  execSync(sql: string): void;
  getFirstSync(sql: string): unknown;
  closeSync(): void;
}

/** Everything the open sequence touches, so tests can record the call order. */
export interface OpenDeps<C extends Connection> {
  keyStore: KeyStore;
  databaseExists: () => boolean;
  randomBytes: (length: number) => Uint8Array;
  openDatabase: () => C;
  migrate: (connection: C) => Promise<void>;
  toPort: (connection: C) => SQLiteDatabase;
}

/**
 * Key, open, `PRAGMA key` as the first statement, verify, migrate, then build
 * the repository. Any failure closes the connection and no plaintext fallback exists.
 */
export async function openSleebyRepository<C extends Connection>(
  deps: OpenDeps<C>,
): Promise<SleebyRepository> {
  const key = await loadOrCreateKey(
    deps.keyStore,
    deps.databaseExists(),
    deps.randomBytes,
  );
  const connection = deps.openDatabase();
  try {
    connection.execSync(`PRAGMA key = "x'${key}'"`);
    const cipher = connection.getFirstSync('PRAGMA cipher_version') as {
      cipher_version?: unknown;
    } | null;
    if (
      typeof cipher?.cipher_version !== 'string' ||
      cipher.cipher_version.trim() === ''
    ) {
      throw new Error('sqlcipher-unavailable');
    }
    connection.getFirstSync('SELECT count(*) FROM sqlite_master');
    await deps.migrate(connection);
    return new SleebyRepository(deps.toPort(connection));
  } catch (error) {
    connection.closeSync();
    throw error;
  }
}
