import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const BASE_BRANCH = 'nw-dd-004a-global-v1-decision';
const ALLOWED = new Set([
  'cloudflare/daily-digest-api/src/index.js',
  'cloudflare/daily-digest-api/src/pilotCandidatePolicy.js',
  'cloudflare/daily-digest-api/src/pilotFreeze.js',
  'cloudflare/daily-digest-api/src/pilotFreeze.cert.test.js',
  'cloudflare/daily-digest-api/src/selector.js',
  'cloudflare/daily-digest-api/src/selector.cert.test.js',
  'cloudflare/daily-digest-api/wrangler.toml.example',
  'reports/NW-DD-005_pilot_freeze_snapshot_proof.md',
  'scripts/test_daily_digest_pilot_freeze_static.mjs',
]);

function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exitCode = 1;
}

function changedFiles() {
  for (const base of [`origin/${BASE_BRANCH}...HEAD`, `${BASE_BRANCH}...HEAD`]) {
    try {
      const output = execFileSync('git', ['diff', '--name-only', base], { encoding: 'utf8' }).trim();
      if (output) return output.split('\n').filter(Boolean);
    } catch {}
  }
  fail(`unable to resolve DD-005 base branch ${BASE_BRANCH}`);
  return [];
}

const pilot = fs.readFileSync('cloudflare/daily-digest-api/src/pilotFreeze.js', 'utf8');
const index = fs.readFileSync('cloudflare/daily-digest-api/src/index.js', 'utf8');
const wrangler = fs.readFileSync('cloudflare/daily-digest-api/wrangler.toml.example', 'utf8');
const selector = fs.readFileSync('cloudflare/daily-digest-api/src/selector.js', 'utf8');

if (!pilot.includes("PILOT_FREEZE_TIME = '10:15'")) fail('10:15 IST pilot boundary missing');
for (const source of ['discoverAkashvaniMorningNews', 'discoverIndianExpressDailyBriefing', 'discoverTheHinduMorningDigest']) {
  if (!pilot.includes(source)) fail(`missing India discoverer ${source}`);
}
if (!pilot.includes('resolveGlobalV1Availability')) fail('global v1 decision not consumed');
if (!pilot.includes('ALREADY_FROZEN')) fail('idempotent freeze contract missing');
if (!index.includes('runScheduledDispatch')) fail('scheduled dispatch contract missing');
if (!wrangler.includes('DAILY_DIGEST_PILOT_WRITE_ENABLED = "false"')) fail('pilot writer must default disabled');
if (/\[triggers\]/.test(wrangler)) fail('production cron trigger remains forbidden in DD-005');
if (!selector.includes('DEGRADED_INDIA_AND_GLOBAL_SHORTFALL')) fail('combined degradation state missing');

for (const path of changedFiles()) {
  if (!ALLOWED.has(path)) fail(`out-of-scope DD-005 change ${path}`);
  if (path.startsWith('.github/workflows/')) fail(`workflow change forbidden: ${path}`);
}

if (!process.exitCode) console.log('PASS: NW-DD-005 pilot freeze scope guard');
