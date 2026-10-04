import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ESLint } from 'eslint';
import {
  importAllowed,
  manifestViolations,
} from '../../packages/config/layering.mjs';

test('layering catches workspace, platform, storage, relative and dynamic bypasses', async () => {
  const root = process.cwd().replaceAll('\\', '/');
  assert.equal(
    importAllowed(`${root}/packages/domain/src/a.ts`, '@sleeby/copy'),
    false,
  );
  assert.equal(
    importAllowed(`${root}/packages/domain/src/a.ts`, '../../data/src/a.js'),
    false,
  );
  assert.equal(
    importAllowed(`${root}/packages/domain/src/a.ts`, './time.js'),
    true,
  );
  assert.equal(
    importAllowed(`${root}/packages/copy/src/a.ts`, '@sleeby/domain', false),
    false,
  );
  assert.equal(
    importAllowed(`${root}/packages/copy/src/a.ts`, '@sleeby/domain', true),
    true,
  );
  for (const dependency of [
    'react',
    'react-native',
    'next',
    'expo-sqlite',
    'dexie',
    '@sleeby/data',
  ]) {
    assert.equal(
      manifestViolations(
        { name: '@sleeby/domain', dependencies: { [dependency]: '*' } },
        'domain',
      ).length,
      1,
    );
  }
  const eslint = new ESLint();
  for (const source of [
    "import { x } from '@sleeby/copy';",
    "export * from '../../data/src/index.js';",
    "const name = '@sleeby/copy'; import(name);",
  ]) {
    const result = await eslint.lintText(source, {
      filePath: 'packages/domain/src/violation.ts',
    });
    assert.ok(
      result[0].messages.some(
        (message) => message.ruleId === 'sleeby/layering',
      ),
    );
  }
});
