import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { test } from 'node:test';
import withPrivateStorage from '../../apps/mobile/plugins/with-private-storage.js';

test('Android backup and phone transfer exclude both the database and key', async () => {
  const prefix = join(resolve(tmpdir()), 'sleeby-backup-');
  const directory = mkdtempSync(prefix);
  try {
    const config = withPrivateStorage({
      name: 'Sleeby',
      slug: 'sleeby',
      android: { package: 'org.sleeby.app' },
    });
    const manifest = await config.mods.android.manifest({
      ...config,
      modRequest: {},
      modResults: {
        manifest: {
          application: [{ $: { 'android:name': '.MainApplication' } }],
        },
      },
    });
    const application = manifest.modResults.manifest.application[0].$;
    assert.equal(application['android:name'], '.MainApplication');
    // Android only parses backupAgent and fullBackupOnly when allowBackup is true.
    assert.equal(application['android:allowBackup'], 'true');
    assert.equal(
      JSON.parse(
        readFileSync(
          new URL('../../apps/mobile/app.json', import.meta.url),
          'utf8',
        ),
      ).expo.android.allowBackup,
      true,
    );
    assert.equal(
      application['android:backupAgent'],
      'org.sleeby.app.NoBackupAgent',
    );
    assert.equal(application['android:fullBackupOnly'], 'true');
    assert.equal(
      application['android:fullBackupContent'],
      '@xml/sleeby_backup_rules',
    );
    assert.equal(
      application['android:dataExtractionRules'],
      '@xml/sleeby_transfer_rules',
    );

    for (let run = 0; run < 2; run++) {
      await config.mods.android.dangerous({
        ...config,
        modRequest: { platformProjectRoot: directory },
      });
      const backup = readFileSync(
        join(directory, 'app/src/main/res/xml/sleeby_backup_rules.xml'),
        'utf8',
      );
      const agent = readFileSync(
        join(directory, 'app/src/main/java/org/sleeby/app/NoBackupAgent.kt'),
        'utf8',
      );
      assert.match(agent, /^package org\.sleeby\.app\n/);
      assert.match(agent, /class NoBackupAgent : BackupAgentHelper\(\)/);
      assert.match(
        agent,
        /class NoBackupAgent : BackupAgentHelper\(\) \{\s*override fun onFullBackup\(data: FullBackupDataOutput\) = Unit\s*\}/,
      );
      assert.doesNotMatch(agent, /super\.onFullBackup|addHelper\s*\(/);
      const transfer = readFileSync(
        join(directory, 'app/src/main/res/xml/sleeby_transfer_rules.xml'),
        'utf8',
      );
      for (const section of [
        backup,
        transfer.match(/<cloud-backup>([\s\S]*?)<\/cloud-backup>/)?.[1],
        transfer.match(/<device-transfer>([\s\S]*?)<\/device-transfer>/)?.[1],
      ]) {
        assert.ok(section);
        assert.match(section, /<exclude domain="file" path="SQLite"\s*\/>/);
        assert.match(
          section,
          /<exclude domain="sharedpref" path="SecureStore"\s*\/>/,
        );
      }
    }
  } finally {
    assert.ok(resolve(directory).startsWith(prefix));
    assert.equal(
      resolve(directory).split(sep).at(-1)?.startsWith('sleeby-backup-'),
      true,
    );
    rmSync(directory, { recursive: true, force: true });
  }
});

test('Android backup agent refuses a missing or invalid package name', async () => {
  for (const name of [undefined, '', 'org/sleeby/app', 'org.sleeby.app;']) {
    const config = withPrivateStorage({
      name: 'Sleeby',
      slug: 'sleeby',
      android: { package: name },
    });
    await assert.rejects(
      () =>
        config.mods.android.manifest({
          ...config,
          modRequest: {},
          modResults: {
            manifest: {
              application: [{ $: { 'android:name': '.MainApplication' } }],
            },
          },
        }),
      /Android package name is missing or invalid/,
    );
  }
});
