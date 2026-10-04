# Sleeby privacy policy

Effective date: 2026-10-04.

Phase 0 contains open source libraries, database schemas, and tests. It does not contain a mobile app, request health permissions, collect health data, operate a server, or send data to an analytics service. Synthetic fixtures used by the test suite do not contain users' health histories.

Sleeby's intended tracking model is local storage under your control. Future mobile apps must request access only to categories you choose and only after views and exports for those data types exist. Native permissions, encrypted storage, backup exclusion, and the exact runtime privacy behavior will be verified and this policy reviewed before that release. No encryption-at-rest claim is made for an unshipped application or browser storage.

Raw exports include original records, metadata, and suppressed records. Exports are plaintext, so anyone with the file can read it. The separate anonymized mode omits free-text notes, locations, device and origin identifiers, and exact calendar dates. Remaining health patterns can still identify someone. You choose whether and with whom to share exported data; an external AI service applies its own privacy terms.

Future browser use stores data in that browser on that device, with no account required. Clearing site data clears that browser store. Sleeby does not claim encryption at rest for browser data.

The canonical policy is maintained at [this repository's privacy policy URL](https://github.com/laiflonglearner/sleeby/blob/main/PRIVACY.md). A future Health Connect app must show the same policy text and URL before requesting access. Changes affecting data handling require review before release. Privacy questions can be raised through the repository maintainer's profile contact; do not include health data in public issues.
