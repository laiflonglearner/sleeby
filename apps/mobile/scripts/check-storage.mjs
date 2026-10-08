import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import process from 'node:process';

const verify = process.argv.includes('--verify');
const port = Number(process.env.SLEEBY_METRO_PORT ?? 8081);
assert.ok(Number.isInteger(port) && port > 0 && port < 65536);
const socket = new WebSocket(
  `ws://localhost:${port}/expo-dev-plugins/broadcast`,
);
const pending = new Map();

function request(method, parameters = {}) {
  const requestId = randomUUID();
  return new Promise((done, fail) => {
    const timeout = setTimeout(() => {
      pending.delete(requestId);
      fail(new Error('SQLite inspector did not answer within 15 seconds'));
    }, 15_000);
    pending.set(requestId, { done, fail, timeout });
    socket.send(
      JSON.stringify({
        messageKey: { pluginName: 'expo-sqlite', method },
        payload: { ...parameters, requestId },
      }),
    );
  });
}

socket.addEventListener('message', (event) => {
  if (typeof event.data !== 'string') return;
  const frame = JSON.parse(event.data);
  if (frame.messageKey?.method !== 'response') return;
  const response = frame.payload;
  const waiting = pending.get(response.requestId);
  if (!waiting) return;
  pending.delete(response.requestId);
  clearTimeout(waiting.timeout);
  if (response.method === 'error') waiting.fail(new Error(response.error));
  else waiting.done(response);
});

const quoted = (value) => "'" + value.replaceAll("'", "''") + "'";
const journal = JSON.parse(
  readFileSync(
    new URL(
      '../../../packages/data/migrations/meta/_journal.json',
      import.meta.url,
    ),
    'utf8',
  ),
);

try {
  await new Promise((done, fail) => {
    const timeout = setTimeout(
      () => fail(new Error('Metro inspector connection timed out')),
      15_000,
    );
    socket.addEventListener(
      'open',
      () => {
        clearTimeout(timeout);
        done();
      },
      { once: true },
    );
    socket.addEventListener(
      'error',
      () => {
        clearTimeout(timeout);
        fail(new Error('Metro inspector is unavailable'));
      },
      { once: true },
    );
  });
  socket.send(
    JSON.stringify({
      __isHandshakeMessages: true,
      protocolVersion: 1,
      pluginName: 'expo-sqlite',
      method: 'handshake',
      browserClientId: randomUUID(),
    }),
  );
  const list = await request('listDatabases');
  const database = list.databases.find((entry) => entry.name === 'sleeby.db');
  assert.ok(
    database,
    'Open Sleeby and wait for the placeholder before running this check',
  );
  assert.ok(database.path.replaceAll('\\', '/').endsWith('/SQLite/sleeby.db'));
  const query = async (sql, parameters = []) =>
    (
      await request('executeQuery', {
        databasePath: database.path,
        query: sql,
        params: parameters,
      })
    ).result.rows;

  const cipher = await query('PRAGMA cipher_version');
  assert.equal(typeof cipher[0]?.cipher_version, 'string');
  assert.ok(cipher[0].cipher_version.length > 0);
  const migrationCount = await query(
    'SELECT count(*) AS total FROM __drizzle_migrations',
  );
  assert.equal(migrationCount[0].total, journal.entries.length);
  const tables = await query('PRAGMA main.table_list');
  const triggers = await query(
    "SELECT name FROM sqlite_master WHERE type='trigger'",
  );
  for (const table of [
    'raw_records',
    'habit_entries',
    'nights',
    'subjective_reports',
    'source_tombstones',
  ]) {
    assert.equal(tables.find((entry) => entry.name === table)?.wr, 1);
    for (const operation of ['update', 'delete', 'replace']) {
      assert.ok(
        triggers.some((entry) => entry.name === `${table}_no_${operation}`),
      );
    }
  }
  console.log('PASS SQLCipher and shared migrations on Android');

  const id = 'p1-02-check-' + randomUUID();
  const habit = {
    id,
    timestamp: {
      utc: '2026-10-01T12:00:00.000Z',
      reference: { kind: 'offset', offsetSeconds: 25200 },
    },
    keyAssignment: { key: '2026-10-01', boundaryMinutes: 240 },
    monitoring: 'tracked',
  };
  await query('BEGIN IMMEDIATE');
  try {
    await query(
      'INSERT INTO habit_entries (id,timestamp_utc,day_key,boundary_minutes,data_json) VALUES (?,?,?,?,?)',
      [
        id,
        '2026-10-01T12:00:00.000000000Z',
        '2026-10-01',
        240,
        JSON.stringify(habit),
      ],
    );
    for (const sql of [
      'UPDATE habit_entries SET id=id WHERE id=?',
      'DELETE FROM habit_entries WHERE id=?',
    ]) {
      await assert.rejects(() => query(sql, [id]), /immutable-habit-entry/);
    }
  } finally {
    await query('ROLLBACK');
  }
  console.log(
    'PASS immutable history rejects changes; test transaction rolled back',
  );

  const testPath =
    database.path.slice(0, -'sleeby.db'.length) + 'p1-02-check.db';
  const key = '01'.repeat(32);
  await query(
    `ATTACH DATABASE ${quoted(testPath)} AS sleeby_check KEY "x'${key}'"`,
  );
  try {
    if (!verify) {
      await query(
        'CREATE TABLE IF NOT EXISTS sleeby_check.fixture (id TEXT PRIMARY KEY, value TEXT NOT NULL)',
      );
      await query(
        "INSERT OR IGNORE INTO sleeby_check.fixture VALUES ('p1-02', 'made-up-test-value')",
      );
    }
    const saved = await query(
      "SELECT value FROM sleeby_check.fixture WHERE id='p1-02'",
    );
    assert.equal(saved[0]?.value, 'made-up-test-value');
  } finally {
    await query('DETACH DATABASE sleeby_check');
  }
  console.log(
    verify
      ? 'PASS saved test value after app restart'
      : 'PASS saved test value in separate encrypted file',
  );

  await assert.rejects(
    () =>
      query(
        `ATTACH DATABASE ${quoted(testPath)} AS sleeby_wrong_key KEY "x'${'02'.repeat(32)}'"`,
      ),
    /file is not a database|not a database|file is encrypted/i,
  );
  console.log('PASS wrong key refused for separate test file');
} catch (error) {
  console.error('FAIL Android storage check:', error.message);
  process.exitCode = 1;
} finally {
  for (const waiting of pending.values()) clearTimeout(waiting.timeout);
  socket.close();
}
