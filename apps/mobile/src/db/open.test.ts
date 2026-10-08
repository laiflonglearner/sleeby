import { loadOrCreateKey, KeyMissingError } from './key';
import { openSleebyRepository, type Connection } from './open';

function memoryStore(initial: string | null) {
  let value = initial;
  return {
    get: async () => value,
    set: async (v: string) => {
      value = v;
    },
  };
}
const bytes = (n: number) => new Uint8Array(n).fill(171);
const KEY = 'ab'.repeat(32);

function deps(initial: string | null, exists: boolean, log: string[]) {
  const connection: Connection = {
    execSync: (sql) => void log.push(`exec ${sql}`),
    getFirstSync: (sql) => {
      log.push(`first ${sql}`);
      return sql === 'PRAGMA cipher_version'
        ? { cipher_version: '4.10.0' }
        : { 'count(*)': 0 };
    },
    closeSync: () => void log.push('close'),
  };
  return {
    keyStore: memoryStore(initial),
    databaseExists: () => exists,
    randomBytes: bytes,
    openDatabase: () => {
      log.push('open');
      return connection;
    },
    migrate: async () => void log.push('migrate'),
    toPort: () => ({ exec: () => undefined, prepare: () => ({}) as never }),
  };
}

it('creates a 64 hex key only when no database file exists', async () => {
  await expect(loadOrCreateKey(memoryStore(null), false, bytes)).resolves.toBe(
    KEY,
  );
});

it('refuses to make a new key for an existing database file', async () => {
  await expect(loadOrCreateKey(memoryStore(null), true, bytes)).rejects.toThrow(
    KeyMissingError,
  );
});

it('sets the key first, verifies, then migrates', async () => {
  const log: string[] = [];
  await openSleebyRepository(deps(KEY, true, log));
  expect(log).toEqual([
    'open',
    `exec PRAGMA key = "x'${KEY}'"`,
    'first PRAGMA cipher_version',
    'first SELECT count(*) FROM sqlite_master',
    'migrate',
  ]);
});

it('closes without creating tables when SQLCipher is absent', async () => {
  const log: string[] = [];
  const d = deps(KEY, false, log);
  const open = d.openDatabase;
  d.openDatabase = () => {
    const c = open();
    c.getFirstSync = () => null;
    return c;
  };
  await expect(openSleebyRepository(d)).rejects.toThrow(
    'sqlcipher-unavailable',
  );
  expect(log).toEqual(['open', `exec PRAGMA key = "x'${KEY}'"`, 'close']);
});

it('closes the connection and does not migrate when verification fails', async () => {
  const log: string[] = [];
  const d = deps(KEY, true, log);
  const open = d.openDatabase;
  d.openDatabase = () => {
    const c = open();
    c.getFirstSync = () => {
      throw new Error('file is not a database');
    };
    return c;
  };
  await expect(openSleebyRepository(d)).rejects.toThrow('not a database');
  expect(log).toContain('close');
  expect(log).not.toContain('migrate');
});
