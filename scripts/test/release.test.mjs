import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

test('Phase 0 release entry point refuses before invoking npm publishing', () => {
  const result = spawnSync(process.execPath, ['scripts/release.mjs'], {
    encoding: 'utf8',
  });
  assert.notEqual(result.status, 0);
  assert.match(
    result.stderr,
    /npm publishing is disabled until the Phase 2 contract review/,
  );
  assert.equal(result.stdout, '');
});
