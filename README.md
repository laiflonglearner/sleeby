# Sleeby

Sleeby is an open source habit and sleep tracker without sleep scores, recovery grades, streak pressure, or medical claims. It keeps raw records and describes observed patterns. You decide what those patterns mean.

Phase 0 builds the shared packages and tooling. There is no app or UI yet. The types, schemas, predictor definitions, and copy templates require owner review before mobile development begins. Nothing is published to npm.

## Workspace

| Package          | Responsibility                                                                                        | Distribution                          |
| ---------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------- |
| `@sleeby/domain` | Framework-free records, time and keys, reconciliation, metrics, statistics, downsampling, and exports | Public package after Phase 2 approval |
| `@sleeby/copy`   | Prewritten neutral templates and their resolver                                                       | Public package after Phase 2 approval |
| `@sleeby/data`   | SQLite schema, migrations, repositories, and the Dexie storage contract                               | Private workspace package             |
| `@sleeby/config` | Shared strict TypeScript, ESLint, and Prettier configuration                                          | Private workspace package             |

Workspace globs reserve `apps/*`. No app directories exist in Phase 0. Platform adapters belong in future apps. The domain has no runtime dependencies; copy imports its types only. CI checks imports, re-exports, dynamic imports, relative-path escapes, and manifest dependencies.

## Development

Use Node 24.21.0 from `.nvmrc` and Corepack to select pnpm 12.9.1 from `packageManager`. Install Corepack separately if your Node installation does not include it. Run `corepack pnpm install --frozen-lockfile`, then `corepack pnpm check`. Package consumers resolve workspace source directly. `pnpm build` emits plain ESM JavaScript, declarations, declaration maps, and source maps for release contract tests.

The toolchain was verified against the official registries on 2026-10-04. TypeScript 6.0.3 is the newest stable release supported by current `typescript-eslint` 8.71.0, whose declared range excludes TypeScript 7. Microsoft TSDoc parses export documentation directly. Data alone skips checking third-party declaration files because current Drizzle declares optional non-SQLite backends with upstream type errors; project source remains strict.

## Data contracts

Health catalog version 1 enumerates all 41 concrete records in stable Health Connect SDK 1.1.0. Catalog entries describe normalized units, raw views, and export mappings, but do not grant permissions or promise that a mobile view already ships. Experimental medical-resource APIs and newer alpha SDK types are excluded. Original native payloads remain intact alongside typed projections. Missing native offsets stay unknown until an explicit localization reference is supplied.

Raw storage is append-only. SQLite triggers prevent replacement, updates, and deletion. Source selection and derived caches live separately and can be recomputed. Night totals use UTC interval unions. Changing a day boundary never silently changes stored historical keys. An interrupted primary sleep session remains one night, consistent with the [Consensus Sleep Diary](https://pmc.ncbi.nlm.nih.gov/articles/PMC3250369/); selecting the session with the greatest unioned asleep duration is a reviewable app heuristic, not a clinical classifier.

The three registered correlations join habit day D to night D. Meal and caffeine cutoff predictors use local cutoff minutes unwrapped at each habit's stored boundary, split at the median of complete days in the active window. Zero means below the median, one means at or above it. Ties stay together; at least five complete days are required in each group afterward. Screen-free duration versus morning energy uses Pearson with at least seven pairs. Binary comparisons display Welch intervals on later-minus-earlier mean differences and export point-biserial coefficients; continuous comparisons use Fisher z intervals. No multiple-pair search or wearable outcome pairs are included.

## Verification and releases

`pnpm check` runs lint and layering checks, formatting, strict typechecks, fixture and property tests, SQLite migration tests, and packed-package consumer contracts. Committed SciPy JSON fixtures are generated explicitly with `scripts/generate-statistics-fixtures.py`; CI consumes the fixtures and does not install Python. The generated JSON records the reference versions and methods.

Changesets governs public API versions. A breaking exported type or function is a major change after 1.0; before 1.0 it requires a minor change. Release CI is manually invoked, restricted to the `npm-release` environment and Phase 2 repository setting, and publishes with npm provenance. The checked-in release policy currently blocks publication even if a release job is invoked. Scope availability, trusted publishing configuration, and human review are prerequisites for Phase 2.

See [Contributing](CONTRIBUTING.md), [Security](SECURITY.md), [Code of conduct](CODE_OF_CONDUCT.md), and [Privacy](PRIVACY.md). Public implementation discussion belongs in [GitHub issues](https://github.com/laiflonglearner/sleeby/issues) and pull requests.
