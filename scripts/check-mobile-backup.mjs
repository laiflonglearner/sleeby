import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { inflateSync } from 'node:zlib';

/** Reads archive headers only. File contents, keys, and health data stay private. */
export function inspectMobileBackup(archive) {
  let offset = 0;
  const line = () => {
    const end = archive.indexOf(10, offset);
    assert.ok(end >= offset, 'Incomplete Android backup header');
    const value = archive.subarray(offset, end).toString('ascii');
    offset = end + 1;
    return value;
  };
  assert.equal(line(), 'ANDROID BACKUP');
  const version = line();
  assert.match(version, /^[1-5]$/);
  const compressed = line();
  assert.match(compressed, /^[01]$/);
  assert.equal(line(), 'none', 'Cannot inspect an encrypted archive');
  const bytes = archive.subarray(offset);
  const tar = compressed === '1' ? inflateSync(bytes) : bytes;
  assert.ok(tar.length >= 1024 && tar.length % 512 === 0, 'Incomplete tar');
  const entries = [];
  let position = 0;
  let ended = false;
  while (position + 512 <= tar.length) {
    const header = tar.subarray(position, position + 512);
    if (header.every((byte) => byte === 0)) {
      assert.ok(position + 1024 <= tar.length, 'Missing tar end blocks');
      assert.ok(
        tar.subarray(position).every((byte) => byte === 0),
        'Invalid tar end',
      );
      ended = true;
      break;
    }
    const field = (start, end) =>
      header.subarray(start, end).toString('utf8').split('\0')[0];
    const octal = (start, end) => {
      const text = field(start, end).trim();
      assert.match(text, /^[0-7]+$/, 'Invalid tar number');
      return Number.parseInt(text, 8);
    };
    const checksum = header.reduce(
      (sum, byte, index) => sum + (index >= 148 && index < 156 ? 32 : byte),
      0,
    );
    assert.equal(octal(148, 156), checksum, 'Invalid tar checksum');
    assert.ok([0, 48, 53].includes(header[156]), 'Unsupported tar entry type');
    const prefix = field(345, 500);
    const name = [prefix, field(0, 100)].filter(Boolean).join('/');
    assert.ok(
      !name.split('/').includes('..') && !name.startsWith('/'),
      'Invalid tar path',
    );
    const size = octal(124, 136);
    const next = position + 512 + Math.ceil(size / 512) * 512;
    assert.ok(
      Number.isSafeInteger(next) && next <= tar.length,
      'Truncated tar entry',
    );
    entries.push({ name, size });
    position = next;
  }
  assert.ok(ended, 'Missing tar end blocks');
  assert.ok(
    entries.some(
      ({ name, size }) => name === 'apps/org.sleeby.app/_manifest' && size > 0,
    ),
    'No Sleeby app manifest in archive',
  );
  assert.ok(
    !entries.some(({ name }) =>
      /SQLite|SecureStore|\.db(?:[-./]|$)|^apps\/org\.sleeby\.app\/db\//i.test(
        name,
      ),
    ),
    'Database or SecureStore file in archive',
  );
  return {
    version,
    archiveBytes: archive.length,
    tarBytes: tar.length,
    entries,
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  assert.ok(process.argv[2], 'Pass the completed backup archive path');
  console.log(
    JSON.stringify(inspectMobileBackup(readFileSync(process.argv[2])), null, 2),
  );
}
