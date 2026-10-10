# Sleeby

Sleeby is an open source habit and sleep tracker without sleep scores, recovery grades, streak pressure, or medical claims. It keeps raw records and describes observed patterns. You decide what those patterns mean.

![Moe counter](https://count.getloli.com/@sleeby?theme=booru-vp&padding=3&offset=0&align=top&scale=0.5&pixelated=0&darkmode=0)

Phase 0 shared packages have passed owner review. The Android development source has encrypted database startup, day-start confirmation, Today habits, manual sleep entry, Nights with past edits, and Settings for sleep targets and stronger contrast. Edits append versions; earlier entries keep their saved boundaries and targets. This source has not passed P1-03 phone or owner acceptance. Nothing is published to npm.

## Workspace

| Package          | Responsibility                                                                                          | Distribution                          |
| ---------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| `@sleeby/domain` | Framework-free records, time and keys, source selection, metrics, statistics, downsampling, and exports | Public package after Phase 2 approval |
| `@sleeby/copy`   | Prewritten neutral templates and their resolver                                                         | Public package after Phase 2 approval |
| `@sleeby/data`   | SQLite schema, migrations, repositories, and the Dexie storage contract                                 | Private workspace package             |
| `@sleeby/config` | Shared strict TypeScript, ESLint, and Prettier configuration                                            | Private workspace package             |

Workspace globs include `apps/*`. The Android adapter lives in `apps/mobile`; see its [development instructions](apps/mobile/README.md). The domain has no runtime dependencies; copy imports its types only. CI checks imports, re-exports, dynamic imports, relative-path escapes, and manifest dependencies.

## Development

Use Node 24.21.0 from `.nvmrc` and Corepack to select pnpm 12.9.1 from `packageManager`. Install Corepack separately if your Node installation does not include it. Run `corepack pnpm install --frozen-lockfile`, then `corepack pnpm check`. Package consumers resolve workspace source directly. `pnpm build` emits plain ESM JavaScript, declarations, declaration maps, and source maps for release contract tests.

The workspace uses pnpm's hoisted installation layout to keep Android CMake paths short on Windows. The isolated layout nests Worklets and Reanimated under long peer-dependency directory names, which can exceed native build path limits. After changing layouts, run `corepack pnpm install --frozen-lockfile` and remove the generated directories `apps/mobile/android/build`, `apps/mobile/android/.cxx`, `apps/mobile/android/app/build`, and `apps/mobile/android/app/.cxx` if present before rebuilding. These caches contain the old package paths. See [Expo's monorepo documentation](https://docs.expo.dev/guides/monorepos/#package-managers-with-isolated-dependencies).

A previous isolated install can leave obsolete launchers in each workspace's `node_modules/.bin` directory. Remove launchers whose target files no longer exist so commands use the root launchers. Keep launchers for packages that remain installed locally, such as the mobile app's ESLint version.

The toolchain was verified against the official registries on 2026-10-04. TypeScript 6.0.3 is the newest stable release supported by current `typescript-eslint` 8.71.0, whose declared range excludes TypeScript 7. Microsoft TSDoc parses export documentation directly. Data alone skips checking third-party declaration files because current Drizzle declares optional non-SQLite backends with upstream type errors; project source remains strict.

## Data contracts

Health catalog version 1 enumerates all 41 concrete records in stable Health Connect SDK 1.1.0. Catalog entries describe normalized units, raw views, and export mappings, but do not grant permissions or promise that a mobile view already ships. Experimental medical-resource APIs and newer alpha SDK types are excluded. Original native data remains intact alongside typed views. Missing native offsets stay unknown until an explicit localization reference is supplied.

Raw storage is append-only. SQLite triggers prevent replacement, updates, and deletion. Source selection and derived caches live separately and can be recomputed. Night totals use UTC interval unions. Changing a day boundary never silently changes stored historical keys. An interrupted primary sleep session remains one night, consistent with the [Consensus Sleep Diary](https://pmc.ncbi.nlm.nih.gov/articles/PMC3250369/); selecting the session with the greatest unioned asleep duration is a reviewable app rule of thumb, not a clinical classifier.

The four registered correlations join habit day D to night D. Meal and caffeine predictors are measured in hours before sleep: the elapsed UTC hours from the last meal or caffeine to the start of that night's sleep, which the caller supplies. The dividing line is chosen by the person or, when none is chosen, is the median of complete days in the active window. Zero means fewer hours before sleep, one means at or above the line, and ties at the line go to one. At least five complete days are required in each group afterward. A fourth comparison sets nights marked as having no caffeine against nights with caffeine. Screen-free duration versus morning energy uses Pearson with at least seven pairs. Binary comparisons display Welch intervals on group-one-minus-group-zero mean differences and export point-biserial coefficients; continuous comparisons use Fisher z intervals. No multiple-pair search or wearable outcome pairs are included.

## Verification and releases

`pnpm check` runs lint and layering checks, formatting, strict typechecks, fixture and property tests, SQLite migration tests, and packed-package consumer contracts. Committed SciPy JSON fixtures are generated explicitly with `scripts/generate-statistics-fixtures.py`; CI consumes the fixtures and does not install Python. The generated JSON records the reference versions and methods.

Changesets governs public API versions. A breaking exported type or function is a major change after 1.0; before 1.0 it requires a minor change. Release CI is manually invoked, restricted to the `npm-release` environment and Phase 2 repository setting, and publishes with npm provenance. The checked-in release policy currently blocks publication even if a release job is invoked. Scope availability, trusted publishing configuration, and human review are prerequisites for Phase 2.

See [Contributing](CONTRIBUTING.md), [Security](SECURITY.md), [Code of conduct](CODE_OF_CONDUCT.md), and [Privacy](PRIVACY.md). Public implementation discussion belongs in [GitHub issues](https://github.com/laiflonglearner/sleeby/issues) and pull requests.
