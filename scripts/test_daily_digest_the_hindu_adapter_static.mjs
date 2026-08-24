import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const BASE_BRANCH = 'nw-dd-002-india-source-adapters';
const REQUIRED = [
  'cloudflare/daily-digest-api/src/adapters/rss.js',
  'cloudflare/daily-digest-api/src/adapters/theHinduMorningDigest.js',
  'cloudflare/daily-digest-api/src/adapters/theHinduMorningDigest.cert.test.js',
  'reports/NW-DD-003_the_hindu_morning_digest_adapter.md',
];
const ALLOWED = new Set([
  ...REQUIRED,
  'cloudflare/daily-digest-api/src/registry.js',
  'cloudflare/daily-digest-api/wrangler.toml.example',
  'scripts/test_daily_digest_the_hindu_adapter_static.mjs',
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
  fail(`unable to resolve DD-003 base branch ${BASE_BRANCH}`);
  return [];
}

REQUIRED.forEach(path => {
  if (!fs.existsSync(path)) fail(`missing required file ${path}`);
});

const registry = fs.readFileSync('cloudflare/daily-digest-api/src/registry.js', 'utf8');
if (!registry.includes("adapterKey: 'THE_HINDU_MORNING_DIGEST'")) fail('The Hindu adapter registry contract missing');
if (!registry.includes("acquisitionQualification: 'PILOT'")) fail('The Hindu pilot acquisition qualification missing');
if (!registry.includes("daily-digest-registry/v0.3")) fail('registry version not bumped to v0.3');
if (!registry.includes('https://www.thehindu.com/news/national/feeder/default.rss')) fail('direct publisher RSS missing');

const adapter = fs.readFileSync('cloudflare/daily-digest-api/src/adapters/theHinduMorningDigest.js', 'utf8');
if (/google\.com|werindia|conven\.org|free-list/i.test(adapter)) fail('third-party discovery reference is forbidden');
if (!adapter.includes("accessibilityState: ACCESSIBILITY_STATES.UNKNOWN")) fail('collector success must not imply user accessibility');

const wrangler = fs.readFileSync('cloudflare/daily-digest-api/wrangler.toml.example', 'utf8');
if (/\[triggers\]/.test(wrangler)) fail('production cron remains forbidden in DD-003');
if (!wrangler.includes('daily-digest-registry/v0.3')) fail('Wrangler registry version mismatch');

for (const path of changedFiles()) {
  if (!ALLOWED.has(path)) fail(`out-of-scope DD-003 change ${path}`);
}

if (!process.exitCode) console.log('PASS: NW-DD-003 The Hindu adapter scope guard');
