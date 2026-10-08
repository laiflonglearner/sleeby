const { mkdirSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');
const {
  AndroidConfig,
  withAndroidManifest,
  withDangerousMod,
} = require('expo/config-plugins');

const exclusions = `    <exclude domain="file" path="SQLite" />
    <exclude domain="sharedpref" path="SecureStore" />`;
const backupRules = `<?xml version="1.0" encoding="utf-8"?>
<full-backup-content>
${exclusions}
</full-backup-content>
`;
const transferRules = `<?xml version="1.0" encoding="utf-8"?>
<data-extraction-rules>
  <cloud-backup>
${exclusions}
  </cloud-backup>
  <device-transfer>
${exclusions}
  </device-transfer>
</data-extraction-rules>
`;

function packageName(config) {
  const name = config.android?.package;
  if (!name || !/^[a-zA-Z_]\w*(\.[a-zA-Z_]\w*)+$/.test(name)) {
    throw new Error('Android package name is missing or invalid');
  }
  return name;
}

function backupAgentSource(name) {
  return `package ${name}

import android.app.backup.BackupAgentHelper
import android.app.backup.FullBackupDataOutput

/** App data stays on this device; users transfer it through export and import. */
class NoBackupAgent : BackupAgentHelper() {
  override fun onFullBackup(data: FullBackupDataOutput) = Unit
}
`;
}

/** Keeps the database and device key out of backup and phone transfers. */
module.exports = function withPrivateStorage(config) {
  config = withAndroidManifest(config, (config) => {
    const application = AndroidConfig.Manifest.getMainApplicationOrThrow(
      config.modResults,
    );
    // Android skips custom agents when this is false. The agent writes no app data.
    application.$['android:allowBackup'] = 'true';
    application.$['android:fullBackupContent'] = '@xml/sleeby_backup_rules';
    application.$['android:dataExtractionRules'] = '@xml/sleeby_transfer_rules';
    application.$['android:backupAgent'] =
      `${packageName(config)}.NoBackupAgent`;
    application.$['android:fullBackupOnly'] = 'true';
    return config;
  });

  return withDangerousMod(config, [
    'android',
    (config) => {
      const directory = join(
        config.modRequest.platformProjectRoot,
        'app/src/main/res/xml',
      );
      mkdirSync(directory, { recursive: true });
      writeFileSync(join(directory, 'sleeby_backup_rules.xml'), backupRules);
      writeFileSync(
        join(directory, 'sleeby_transfer_rules.xml'),
        transferRules,
      );
      const name = packageName(config);
      const sourceDirectory = join(
        config.modRequest.platformProjectRoot,
        'app/src/main/java',
        ...name.split('.'),
      );
      mkdirSync(sourceDirectory, { recursive: true });
      writeFileSync(
        join(sourceDirectory, 'NoBackupAgent.kt'),
        backupAgentSource(name),
      );
      return config;
    },
  ]);
};
