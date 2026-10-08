/** Where the database key lives; the real store is the device keystore. */
export interface KeyStore {
  get(): Promise<string | null>;
  set(value: string): Promise<void>;
}

/** Thrown when a database file exists but its key is gone. No new key is made. */
export class KeyMissingError extends Error {
  constructor() {
    super('key-missing-database-exists');
  }
}

const KEY_PATTERN = /^[0-9a-f]{64}$/;

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Returns the 64 hex character key. Creates one only when no database file
 * exists, and reads it back before use. Never replaces a missing key for an
 * existing file (the full lost-key flow is P1-09).
 */
export async function loadOrCreateKey(
  store: KeyStore,
  databaseExists: boolean,
  randomBytes: (length: number) => Uint8Array,
): Promise<string> {
  const stored = await store.get();
  if (stored !== null) {
    if (!KEY_PATTERN.test(stored)) throw new Error('key-malformed');
    return stored;
  }
  if (databaseExists) throw new KeyMissingError();
  const created = hex(randomBytes(32));
  await store.set(created);
  if ((await store.get()) !== created) throw new Error('key-readback-failed');
  return created;
}
