import assert from 'node:assert/strict';
import { test } from 'node:test';
import { deflateSync } from 'node:zlib';
import { inspectMobileBackup } from '../check-mobile-backup.mjs';

function tarEntry(name, size = 0) {
  const header = Buffer.alloc(512);
  header.write(name);
  header.write(size.toString(8).padStart(11, '0'), 124);
  header.fill(32, 148, 156);
  header[156] = 48;
  const checksum = header.reduce((sum, byte) => sum + byte, 0);
  header.write(checksum.toString(8).padStart(6, '0') + '\0 ', 148);
  return Buffer.concat([header, Buffer.alloc(Math.ceil(size / 512) * 512)]);
}

const manifest = tarEntry('apps/org.sleeby.app/_manifest', 12);
const end = Buffer.alloc(1024);
const archive = (tar, compressed = false) =>
  Buffer.concat([
    Buffer.from(`ANDROID BACKUP\n5\n${compressed ? 1 : 0}\nnone\n`),
    compressed ? deflateSync(tar) : tar,
  ]);

test('completed backup reports names and sizes in both archive formats', () => {
  for (const compressed of [false, true]) {
    const result = inspectMobileBackup(
      archive(Buffer.concat([manifest, end]), compressed),
    );
    assert.deepEqual(result.entries, [
      { name: 'apps/org.sleeby.app/_manifest', size: 12 },
    ]);
  }
});

test('missing, empty, truncated, and corrupt backup data cannot pass', () => {
  const corrupt = Buffer.from(manifest);
  corrupt[0] = 0;
  for (const bytes of [
    Buffer.alloc(0),
    archive(Buffer.alloc(0)),
    archive(end),
    archive(Buffer.concat([tarEntry('apps/org.sleeby.app/_manifest'), end])),
    archive(manifest),
    archive(manifest.subarray(0, 512)),
    archive(Buffer.concat([manifest, Buffer.alloc(512)])),
    archive(Buffer.concat([corrupt, end])),
    archive(Buffer.concat([manifest, end]), true).subarray(0, 30),
  ]) {
    assert.throws(() => inspectMobileBackup(bytes));
  }
});

test('SQLite files and SecureStore preferences cannot pass', () => {
  for (const name of [
    'apps/org.sleeby.app/f/SQLite/sleeby.db',
    'apps/org.sleeby.app/f/SQLite/p1-02-check.db-wal',
    'apps/org.sleeby.app/sp/SecureStore.xml',
    'apps/org.sleeby.app/db/other',
  ]) {
    assert.throws(
      () =>
        inspectMobileBackup(
          archive(Buffer.concat([manifest, tarEntry(name), end])),
        ),
      /Database or SecureStore/,
    );
  }
});
