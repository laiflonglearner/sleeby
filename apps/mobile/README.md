# Sleeby Android development app

P1-02 opens the device database before showing any screen. P1-03 source asks for a day-start time and privacy-note acknowledgement, then opens Today, Nights and Settings. Today saves last meal, last caffeine or a caffeine-free choice, morning/afternoon sunlight minutes, movement and optional minutes, screen-free minutes, and tracked/rest/unmonitored days. Empty values stay distinct from zero and false. P1-03 phone and owner acceptance remain open.

Sleep entry shows both calendar dates and elapsed UTC minutes. Night detail lets you choose main sleep and read past edits; closing the question keeps a prior choice or leaves it unanswered. Interval edits append versions and keep the original intervals. Nights reads bounded pages. Settings saves optional bedtime/wake targets, day start and stronger contrast. Settings changes affect future entries; saved days and Nights keep their original boundaries and target snapshots.

The 04:00 day start is a suggestion until confirmed. A chosen boundary survives reopening; earlier entries retain their saved boundary. A failed write keeps the draft, and retry uses the same operation ID. After a successful write followed by a failed read, retry reads the saved value without appending again. Time entry keeps exact minutes, and repeated local times ask for an occurrence. Drafts exist only in memory; leaving asks before discarding them.

Migration 0002 adds immutable preferences and predecessor indexes. Its automated checks use disposable databases. Applying it to an existing owner's app database still needs separate permission before launching that build.

## Start locally

Use Node 24.21.0 and pnpm 12.9.1. From the repository root, run `corepack pnpm --filter @sleeby/mobile start --dev-client` for Metro and `corepack pnpm --filter @sleeby/mobile android --device` for the Android development build. Expo Go cannot load SQLCipher.

## Storage startup

The root layout waits for one shared `openRepository()` promise. It keeps screens closed while storage opens or fails. The resulting repository is available through `useRepository()`. Opening and failure messages come from `@sleeby/copy`; native error details and keys are never displayed.

A new installation creates 32 random bytes, saves the hex key in SecureStore, and reads it back before use. An existing database without a key stops before opening a connection. The first SQL statement sets the key; the next checks SQLCipher, followed by a schema read that tests the key. Shared migrations and the repository follow only after those checks. There is no plaintext fallback.

The connection lasts for the app process. React effect restarts share the same promise and do not create another key or close a connection still used by another screen. An opening failure stays closed until the app process restarts.

The Android config plugin writes explicit exclusions for `files/SQLite` and SecureStore preferences in both backup formats and in device transfer rules. It sets `allowBackup=true` so Android parses the custom backup agent and `fullBackupOnly` flag. The agent writes no app data for cloud backup, ADB backup, or phone transfer. Android 12 ignores the custom agent when `allowBackup=false`, but still permits ADB backup of debug builds; that combination copied private app files in a device check. See [Android 12 manifest parsing](https://raw.githubusercontent.com/aosp-mirror/platform_frameworks_base/android-12.0.0_r1/core/java/android/content/pm/parsing/ParsingPackageUtils.java), [Android backup rules](https://developer.android.com/identity/data/autobackup), and [Expo SecureStore backup](https://docs.expo.dev/versions/latest/sdk/securestore/#android-auto-backup).

The plugin also installs `NoBackupAgent`, which writes no full-backup app data and registers no key/value helpers. Android 12 treats ADB backup as a separate operation: debug builds can pass backup eligibility independently of `allowBackup`, and the XML parser selects sections only for cloud backup and phone transfer. The native callback also covers explicit ADB backup. See [Android backup agents](https://developer.android.com/reference/android/app/backup/BackupAgent), [Android 12 eligibility](https://android.googlesource.com/platform/frameworks/base/+/refs/tags/android-12.0.0_r1/services/backup/java/com/android/server/backup/utils/BackupEligibilityRules.java), and [Android 12 XML selection](https://android.googlesource.com/platform/frameworks/base/+/refs/tags/android-12.0.0_r1/core/java/android/app/backup/FullBackup.java).

## Device storage checks

Use a development build with Metro running and the phone connected through ADB. Set `SLEEBY_METRO_PORT` when Metro uses a port other than 8081. These checks do not read the app key or existing health entries.

1. Run `corepack pnpm --filter @sleeby/mobile check:storage`. It checks the active SQLCipher connection, shared migration count, WITHOUT ROWID tables, and immutable triggers. It inserts one made-up habit inside a transaction and always rolls that transaction back. A separate `p1-02-check.db` stores a made-up test value using a test-only key; the wrong-key attempt targets that separate file.
2. Fully stop and reopen Sleeby, then wait for its day-start question or Today screen.
3. Run `corepack pnpm --filter @sleeby/mobile check:storage --verify`. It reads the previously saved test value without creating it.
4. Separately inspect the encrypted file header and attempt a schema read with ordinary SQLite, using only the separate test file.
5. Check the installed backup flags and XML rules, then perform the phone's backup check and inspect its result. A configured exclusion alone does not demonstrate what the phone backed up.

For each backup attempt, use a fresh archive path and wait for the owner to confirm readiness before starting. The Full backup screen includes a Back up my data button. Allow at most 60 seconds for that confirmation. After a successful transfer, run `node scripts/check-mobile-backup.mjs <archive-path>` from the repository root. The checker lists file names and sizes only, checks the archive structure and Sleeby manifest entry, and rejects SQLite or SecureStore files. A missing, empty, cancelled, or unfinished backup cannot pass even if no database name is visible. Keep the transfer completion evidence beside the archive check.

The separate test file can be removed after verification with `adb shell run-as org.sleeby.app rm files/SQLite/p1-02-check.db`. Do not clear app storage, remove the main database, or remove SecureStore keys as part of these checks.

Run `corepack pnpm check` before submission. Device evidence and owner acceptance are separate from package tests. iOS backup behavior is outside P1-02.
