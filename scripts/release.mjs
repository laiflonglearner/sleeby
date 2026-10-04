import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const policy = JSON.parse(
  readFileSync(
    new URL('../.changeset/release-policy.json', import.meta.url),
    'utf8',
  ),
);
if (policy.phase < 2 || !policy.publishEnabled)
  throw new Error(
    'npm publishing is disabled until the Phase 2 contract review',
  );
const cli = process.env.npm_execpath;
if (!cli) throw new Error('Run releases through pnpm release:packages');
const executable = /\.[cm]?js$/.test(cli) ? process.execPath : cli;
const args = ['exec', 'changeset', 'publish', '--provenance'];
const result = spawnSync(
  executable,
  executable === process.execPath ? [cli, ...args] : args,
  { stdio: 'inherit' },
);
process.exit(result.status ?? 1);
