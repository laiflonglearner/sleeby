# Sleeby privacy policy

Effective date: 2026-10-04.

Sleeby contains open source libraries, database schemas, tests, and an Android development app with local database startup, an explicit day-start question and daily manual last-meal entries. Sleep screens and the remaining fields are in progress. The app does not request health permissions, operate a server, or send app data to an analytics service. Synthetic fixtures used by the test suite do not contain users' health histories.

Sleeby's intended tracking model is local storage under your control. Future mobile apps must request access only to categories you choose and only after views and exports for those data types exist. Native permissions, encrypted storage, backup exclusion, and the exact runtime privacy behavior will be verified and this policy reviewed before that release. No encryption-at-rest claim is made for an unshipped application or browser storage.

Raw exports include original records, metadata, and suppressed records. Exports are plaintext, so anyone with the file can read it. The separate anonymized mode omits free-text notes, locations, device and origin identifiers, and exact calendar dates. Anonymized does not mean impossible to identify. Your sleep and habit pattern over weeks can be distinctive, so a person who already knows your routine, or who has other data about you, might recognize you. Treat an anonymized file as private health data and share it only with people you trust. You choose whether and with whom to share exported data; an external AI service applies its own privacy terms.

The manual-entry work in progress keeps edits as additional versions on the phone. Settings include the chosen day-start time, optional sleep targets, privacy-note acknowledgement and contrast preference. Version 2 exports include those settings, main-sleep choices, target snapshots and edit history. Earlier entries keep their saved day boundaries and targets when settings change. Removing the app removes its local saved data. This description does not claim a shipped manual-entry release.

Future browser use stores data in that browser on that device, with no account required. Clearing site data clears that browser store. Sleeby does not claim encryption at rest for browser data.

The official policy is maintained at [this repository's privacy policy URL](https://github.com/laiflonglearner/sleeby/blob/main/PRIVACY.md). A future Health Connect app must show the same policy text and URL before requesting access. Changes affecting data handling require review before release. Privacy questions can be raised through the repository maintainer's profile contact; do not include health data in public issues.
