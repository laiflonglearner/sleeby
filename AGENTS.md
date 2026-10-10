# Agent guide

## Required workflow

1. Read this file and any applicable nested AGENTS.md before acting. Read README.md, CONTRIBUTING.md, and the task's existing issue or plan.
2. Inspect the implementation, tests, nearby patterns, and relevant package documentation before recommending or changing anything. Identify the root cause. If required context is unavailable, name the exact missing files or information.
3. Keep changes within the requested scope. Preserve unrelated work, existing comments that explain intent, and established contracts.
4. Use the verification requirements below. Fix failures caused by the change without weakening checks or acceptance criteria.
5. Report the result, exact verification evidence, remaining blockers, and one concrete next step. Give a scope-accurate Conventional Commit message when confident in the result.

## Current project scope

Sleeby is an open source habit and sleep tracker that preserves raw records and describes observed patterns. It does not provide sleep scores, recovery grades, streak pressure, diagnoses, or medical recommendations.

Phase 0 contains shared packages and tooling. No app or UI exists yet. Owner review of types, schemas, predictors, and copy templates is required before mobile development begins. Do not initialize an app or publish packages before the applicable gate is accepted.

## Workspace and dependencies

- packages/domain: framework-free records, time handling, source selection, metrics, statistics, and exports.
- packages/copy: reviewed neutral templates and their resolvers.
- packages/data: SQLite schema, Drizzle migrations, repositories, and the Dexie storage contract.
- packages/config: shared TypeScript, ESLint, Prettier, and layering configuration.

Domain has no runtime dependencies. Copy imports domain types only. Data depends on domain and Drizzle. Platform adapters belong in future apps. Tooling configuration is a development dependency only.

Read packages/config/layering.mjs and scripts/check-layering.mjs before changing dependency boundaries. Do not bypass their restrictions through re-exports, dynamic imports, or relative paths.

## Product and data contracts

Read packages/domain/README.md before changing domain behavior, packages/copy/README.md before changing wording, and PRIVACY.md before changing data handling.

Preserve original data and append-only history. Source selection must remain reversible. Derived caches must remain recomputable.

Calculate elapsed durations from UTC instants and sleep totals from interval unions. Preserve timestamp precision and stored day or night keys with their boundaries. Missing native offsets remain unknown until an explicit localization reference is supplied.

Reuse named thresholds and registered predictor definitions. Do not expand correlation pairs, alter statistical meaning, or introduce causal or clinical claims without an explicit product decision.

Domain returns machine states. Product wording belongs in @sleeby/copy. Keep templates neutral and use the existing resolver contracts.

Use synthetic health fixtures. Never include real health records or secrets in source, logs, issues, or reports. Keep export behavior and privacy documentation consistent.

## Database changes

SQLite migrations live in packages/data/migrations. Inspect schema definitions, migration history, generated metadata, and storage tests together.

Preserve WITHOUT ROWID tables and immutable triggers when generating rebuilds; Drizzle does not model all of these protections.

Verify fresh-database creation and relevant upgrade behavior using disposable databases. Do not rewrite an already-applied migration without an explicit decision and evidence about affected databases.

Never apply migrations to a user's database without explicit authorization. Report separately whether a migration was authored, tested, or applied.

## Verification

Use the Node and pnpm versions pinned by .nvmrc and package.json. Do not substitute npm for pnpm.

Before submission, pnpm check must pass. It runs lint, dependency layering, formatting, typechecks, tests, and built-package consumer contracts. Follow the user's authorization boundaries when running commands.

Use focused checks during implementation. Add meaningful regression coverage for changed behavior. Do not lower thresholds, disable rules, or remove assertions to obtain a passing result.

Regenerate statistical fixtures only when the task requires it. Inspect the generator and reference methods first.

Report checks as PASS, FAIL, or NOT RUN. Local checks do not establish CI, browser, device, publication, or owner acceptance.

## Public API and releases

Add a Changeset for public API changes. Preserve TSDoc, export schema compatibility, and packed-package consumer contracts.

Breaking public signatures require a minor release before 1.0 and a major release after 1.0.

Publication is currently disabled by .changeset/release-policy.json. Do not change the release gate, publish packages, or claim release readiness without the applicable owner decision.

## Git and concurrent work

Inspect Git status, staged paths, and the relevant diff before editing or delivering work. Treat pre-existing changes as protected work.

Every agent must commit its reviewed, task-owned work in coherent scopes before reporting completion or handing work to checkpoint or dispatch. Include new files. Do not leave task-owned edits staged, modified, or untracked for a later worker to sort out. If a task is not finished, commit a valid intermediate state before handoff; if the state cannot stand alone, keep working in the same task instead of dispatching another worker.

Continue on the existing branch when the work belongs to its active topic. Before editing a different topic, start a `<type>/<topic>` branch using the matching Conventional Commit type, such as `feat/`, `fix/`, `style/`, `refactor/`, `perf/`, `test/`, `docs/`, `chore/`, `build/`, or `ci/`. Never use an agent, service, model, or tool name as a branch prefix. Commit its reviewed scopes, then push that topic branch before handing it off. This standing instruction authorizes topic-branch pushes. Never push `main`.

Open a pull request when the topic has a useful review boundary, such as a cross-package behavior change, public API or schema change, migration, user-visible feature, or security and data handling work. Do not open a pull request for tiny copy, typo, or one-file documentation changes. A different topic still gets its own pushed branch, but can wait for more related commits before opening a pull request. Small changes within the active topic stay on its branch without a pull request.

Stage exact reviewed paths only. Never use blanket staging, bypass hooks, delete .git/index.lock, or reset another session's work. Do not rewrite published commits or force-push. Work reaches remote `main` through the repository's chosen integration path; do not assume a pull request is needed for every commit.

Delegate only when the user or applicable instructions request it. Assign explicit file ownership and preserve other workers' changes.

## Unavailable model fallbacks

Keep Claude models as first choices. Only when the selected Claude model is unavailable on the current host, use these owner-approved alternatives: Haiku low to Luna 6 low (`gpt-6-luna`), Sonnet 5.5 medium to Sol 6.1 medium (`gpt-6.1-sol`), and Opus medium to Sol 6.1 high (`gpt-6.1-sol`). Opus fallback high is a specific exception to the medium effort ceiling. Preserve the original task tier, owner gates, scope, and permissions; changing models grants no permission to start work, run checks, or commit. Never treat a task failure as model unavailability. If neither model is available, return the prompt and the missing model. Existing Codex roles keep their defaults; these alternatives apply only to unavailable Claude models.

## Documentation and handoff

Create documents in Markdown unless another format is requested. Keep each paragraph, list item, and table row on one unwrapped line. Do not reflow untouched prose.

Do not write em dashes. Never use the words forbidden in .agents/skills/commit-message/SKILL.md, including `reconcile` and its variants such as `reconciled` and `reconciliation`, in any text: documents, READMEs, code comments, issues, pull requests, commit messages, and reports. Avoid jargon and buzzwords; use plain words. Preserve comments unless they are demonstrably useless or incorrect.

Update existing documentation when behavior changes. Do not invent links to nonexistent trackers, runbooks, apps, or packages.

Keep handoffs concise: what changed, why, verification results, blockers, and the next action. Owner review determines acceptance.

<!-- BEGIN:turborepo-agent-rules -->

# This is NOT the Turborepo you know

Turborepo configuration, task behavior, and CLI commands can vary between installed versions and may differ from your training data. Resolve the `turbo` package from this file's directory or relevant workspace; in monorepos, it may not be visible from the repository root. For example, run `node -p "require.resolve('turbo/package.json')"` from a workspace that depends on `turbo`.

Read `docs/README.md` inside that installed package first, then read the relevant pages from its `docs/` directory before changing Turborepo configuration or commands. Heed deprecation notices. These bundled docs match the installed package version and are available without network access.

This block is written and re-added by `turbo` before repository-scoped commands when an AI agent is detected. In the Turborepo source repository, its template is defined in `crates/turborepo-cli/src/cli/agent_guidance.rs`. Removing the managed block while updates are enabled means a later qualifying invocation will add it again. Set `"agentGuidance": false` in the root `turbo.json` or `turbo.jsonc` to opt out; this does not remove an existing block. Keep the block committed with your work to avoid an uncommitted change on the next agent invocation.
<!-- END:turborepo-agent-rules -->
