# Contributing

Open a GitHub issue describing the observable behavior and proposed scope before a significant change. Keep changes reviewable and use Conventional Commits. Do not include real health records, secrets, or personally identifying screenshots in issues or pull requests.

Install the pinned Node and pnpm versions described in the README. Run `pnpm check` before submitting a pull request. Public package contracts are tested from packed artifacts, not source aliases. Add a Changeset for public API changes and describe breaking signatures explicitly.

Domain code stays framework-free and produces machine states only. Copy belongs in `@sleeby/copy`. App adapters implement domain ports; no platform package belongs in shared domain code. Runtime dependencies and import directions are checked in CI. Tooling configuration is a development dependency only.

Preserve original records and comments that explain intent. Reconciliation adds reversible selections rather than changing raw data. Derive durations from UTC instants and nightly totals from interval unions. Use the named constants for specified thresholds. Keep Markdown paragraphs on one line and do not write em dashes.

Phase 0 ends at owner review of types, schemas, predictors, and templates. Do not initialize an Expo app or publish packages before the applicable review gate is accepted.
