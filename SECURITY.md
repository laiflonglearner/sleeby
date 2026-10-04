# Security

Report vulnerabilities privately through [GitHub private vulnerability reporting](https://github.com/laiflonglearner/sleeby/security/advisories/new). Include affected versions, reproduction steps, impact, and a minimal synthetic example. Do not put real health data or vulnerability details in public issues.

The supported version is the latest reviewed release. Phase 0 packages are prerelease contracts and have not been published. Fixes are reviewed before coordinated disclosure; no response-time guarantee is made.

The threat model covers access to stored data and copied database files in a future mobile app. Phase 0 supplies schemas and contracts, not an encrypted application. Device encryption, app locking, backup exclusions, and real-device acceptance remain prerequisites for the mobile release. Exports are plaintext. Anonymized exports reduce direct identifiers but cannot guarantee that remaining health data is unidentifiable.
