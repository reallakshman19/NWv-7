import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const REQUIRED = [
  'cloudflare/daily-digest-api/src/index.js',
  'cloudflare/daily-digest-api/src/contracts.js',
  'cloudflare/daily-digest-api/src/registry.js',
  'cloudflare/daily-digest-api/src/selector.js',
  'cloudflare/daily-digest-api/src/snapshotStore.js',
  'cloudflare/daily-digest-api/migrations/0001_daily_digest.sql',
  'cloudflare/daily-digest-api/wrangler.toml.example',
  'reports/NW-DD-001_daily_digest_shared_snapshot_foundation.md',
];

const FORBIDDEN_PREFIXES = [
  '.github/workflows/', 'src/pages/', 'src/components/', 'src/viewModels/',
  'public/data/', 'public/newsdata/', 'cloudflare/upahead-dataset-api/',
];

function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exitCode = 1;
}

function changedFiles() {
  for (const base of ['origin/main...HEAD', 'main...HEAD']) {
    try {
      return execFileSync('git', ['diff', '--name-only', base], { encoding: 'utf8' })
        .trim().split('\n').filter(Boolean);
    } catch {}
  }
  return [];
}

REQUIRED.forEach(path => {
  if (!fs.existsSync(path)) fail(`missing required file ${path}`);
});

const wrangler = fs.readFileSync('cloudflare/daily-digest-api/wrangler.toml.example', 'utf8');
if (/\[triggers\]/.test(wrangler)) fail('production cron must not be configured in NW-DD-001');
if (!/\[\[d1_databases\]\]/.test(wrangler)) fail('D1 binding missing');
if (!/00000000-0000-0000-0000-000000000000/.test(wrangler)) fail('placeholder D1 id missing');

const worker = fs.readFileSync('cloudflare/daily-digest-api/src/index.js', 'utf8');
if (!worker.includes('/api/datasets/dailyDigest')) fail('dataset read route missing');
if (!worker.includes('SOURCE_ADAPTERS_NOT_AUTHORIZED')) fail('scheduled no-write guard missing');
if (/request\.method\s*===\s*['"]POST['"]/.test(worker)) fail('public POST route must not exist');

for (const path of changedFiles()) {
  if (FORBIDDEN_PREFIXES.some(prefix => path.startsWith(prefix))) fail(`forbidden changed path ${path}`);
}

if (!process.exitCode) console.log('PASS: NW-DD-001 static foundation guard');
