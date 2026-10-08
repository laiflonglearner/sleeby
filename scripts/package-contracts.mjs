import assert from 'node:assert/strict';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  existsSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const workspace = process.cwd();
const directory = mkdtempSync(join(tmpdir(), 'sleeby-package-contracts-'));
const archives = {};
function run(command, args, cwd = workspace) {
  let executable = command;
  let argumentsList = args;
  if (command === 'pnpm') {
    const cli = process.env.npm_execpath;
    assert.ok(cli, 'Run this contract through pnpm test:contracts');
    executable = /\.[cm]?js$/.test(cli) ? process.execPath : cli;
    argumentsList = executable === process.execPath ? [cli, ...args] : args;
  }
  const result = spawnSync(executable, argumentsList, {
    cwd,
    stdio: 'inherit',
  });
  assert.equal(result.status, 0, `${command} ${args.join(' ')} failed`);
}

for (const name of ['domain', 'copy']) {
  run(
    'pnpm',
    ['pack', '--pack-destination', directory],
    join(workspace, 'packages', name),
  );
  const version = JSON.parse(
    readFileSync(join(workspace, 'packages', name, 'package.json'), 'utf8'),
  ).version;
  const tarball = join(directory, `sleeby-${name}-${version}.tgz`);
  archives[name] = tarball;
  const unpacked = join(directory, name);
  mkdirSync(unpacked);
  run('tar', ['-xzf', tarball, '-C', unpacked]);
  const manifest = JSON.parse(
    readFileSync(join(unpacked, 'package', 'package.json'), 'utf8'),
  );
  assert.deepEqual(manifest.exports, {
    ...(name === 'domain'
      ? {
          './export-schema': './schema/export.schema.json',
          './export-schema-v1': './schema/export-v1.schema.json',
        }
      : {}),
    '.': { types: './dist/index.d.ts', default: './dist/index.js' },
  });
  assert.equal(manifest.types, './dist/index.d.ts');
  assert.equal(manifest.sideEffects, false);
  assert.equal(manifest.license, 'MIT');
  assert.ok(
    readdirSync(join(unpacked, 'package')).every((path) =>
      [
        'dist',
        'src',
        'schema',
        'LICENSE',
        'README.md',
        'package.json',
      ].includes(path),
    ),
  );
  // Declaration and runtime maps must point at sources inside the archive.
  const packageDirectory = join(unpacked, 'package');
  const dist = join(packageDirectory, 'dist');
  for (const file of readdirSync(dist).filter((file) =>
    file.endsWith('.map'),
  )) {
    const map = JSON.parse(readFileSync(join(dist, file), 'utf8'));
    for (const source of map.sources) {
      const target = resolve(dist, map.sourceRoot ?? '', source);
      assert.ok(
        target.startsWith(`${packageDirectory}/`) ||
          target.startsWith(`${packageDirectory}\\`),
      );
      assert.ok(existsSync(target), `${file}: missing mapped source ${source}`);
    }
  }
  assert.ok(
    readFileSync(
      join(unpacked, 'package', 'dist', 'index.d.ts'),
      'utf8',
    ).includes('export'),
  );
  const dependencies = manifest.dependencies ?? {};
  assert.ok(
    Object.values(dependencies).every(
      (version) => !version.startsWith('workspace:'),
    ),
  );
}

const consumer = join(directory, 'consumer');
mkdirSync(consumer);
writeFileSync(
  join(consumer, 'package.json'),
  JSON.stringify({
    private: true,
    type: 'module',
    packageManager: 'pnpm@12.9.1',
    dependencies: {
      '@sleeby/domain': `file:${archives.domain}`,
      '@sleeby/copy': `file:${archives.copy}`,
    },
  }),
);
// Both packages are unpublished. Resolve the copy package's registry range to
// the inspected domain archive without changing either packed manifest.
writeFileSync(
  join(consumer, 'pnpm-workspace.yaml'),
  `overrides:\n  '@sleeby/domain': ${JSON.stringify(`file:${archives.domain.replaceAll('\\', '/')}`)}\n`,
);
run(
  'pnpm',
  ['install', '--offline', '--ignore-scripts', '--lockfile=false'],
  consumer,
);
writeFileSync(
  join(consumer, 'contract.mjs'),
  `
import assert from 'node:assert/strict';
import * as domain from '@sleeby/domain';
import * as copy from '@sleeby/copy';
const expected = ${readFileSync(resolve('scripts/test/public-api.json'), 'utf8')};
assert.deepEqual(Object.keys(domain).sort(), expected.domain);
assert.deepEqual(Object.keys(copy).sort(), expected.copy);
const time = domain.normalizeTimestamp('2026-10-04T01:00:00+07:00', {kind:'offset',offsetSeconds:25200});
assert.equal(domain.assignNightKey(time).key,'2026-10-03');
assert.equal(domain.durationMinutes('2026-03-08T00:00:00-05:00','2026-03-08T08:00:00-04:00'),420);
assert.equal(domain.HEALTH_RECORD_TYPES.length,41);
const schema = await import('@sleeby/domain/export-schema', {with:{type:'json'}});
assert.equal(schema.default.$id,'urn:sleeby:export');
const schemaV1 = await import('@sleeby/domain/export-schema-v1', {with:{type:'json'}});
assert.equal(schemaV1.default.$id,'urn:sleeby:export:v1');
assert.equal(domain.pearsonCorrelation([1,2,3],[3,2,1]).status,'computed');
assert.ok(copy.resolveCorrelationCopy({pair:'screen-energy',windowDays:14,startNightKey:'2026-10-01',endNightKey:'2026-10-14',sampleSize:0,status:'insufficient-data'}).description.includes('Not enough'));
assert.ok(copy.resolveTrendCopy('sleepMinutes','higher').includes('higher'));
console.log('Packed runtime consumer contract: PASS');
`,
);
run(process.execPath, ['contract.mjs'], consumer);
writeFileSync(
  join(consumer, 'contract.ts'),
  `
import { normalizeTimestamp, assignDayKey, analyzeCorrelations, type Timestamp, type HabitEntry, type HealthSource, type RawRecord, type SourceTombstone, type RevisionLink, type CorrelationResult } from '@sleeby/domain';
import { resolveCorrelationCopy, type ResolvedCopy } from '@sleeby/copy';
const timestamp: Timestamp = normalizeTimestamp('2026-10-04T20:00:00Z', {kind:'iana',zone:'Asia/Jakarta'});
const habit: HabitEntry = {id:'manual',timestamp,keyAssignment:assignDayKey(timestamp),monitoring:'tracked'};
const results: readonly CorrelationResult[] = analyzeCorrelations([habit], [], {windowDays:14,endNightKey:'2026-10-04'});
const text: ResolvedCopy = resolveCorrelationCopy(results[0]!);
void text;
declare const source: HealthSource;
const records: Promise<readonly RawRecord[]> = source.readPage({startUtc:'2026-10-01T00:00:00Z',endUtc:'2026-10-04T00:00:00Z',types:['sleepSession'],pageSize:100}).then(page=>page.records);
void records;
const tombstone: SourceTombstone = {id:'deletion',source:'health-connect',origin:'source',externalId:'native',observedAtUtc:timestamp.utc};
const revision: RevisionLink = {entity:'habit',id:habit.id,supersedesId:null};
void tombstone;
void revision;
// @ts-expect-error Raw records cannot be mutated through the public contract.
habit.keyAssignment.key = '2026-10-05';
// @ts-expect-error Only pre-registered windows are accepted.
analyzeCorrelations([],[],{windowDays:90,endNightKey:'2026-10-04'});
`,
);
writeFileSync(
  join(consumer, 'tsconfig.json'),
  JSON.stringify({
    compilerOptions: {
      strict: true,
      noUncheckedIndexedAccess: true,
      exactOptionalPropertyTypes: true,
      module: 'NodeNext',
      moduleResolution: 'NodeNext',
      target: 'ES2023',
      types: [],
      noEmit: true,
    },
    files: ['contract.ts'],
  }),
);
run(
  process.execPath,
  [
    join(workspace, 'node_modules/typescript/bin/tsc'),
    '-p',
    join(consumer, 'tsconfig.json'),
  ],
  consumer,
);
console.log('Packed TypeScript consumer contract: PASS');
