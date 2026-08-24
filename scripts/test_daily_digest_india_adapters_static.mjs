import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const BASE_BRANCH = 'nw-dd-001-daily-digest-foundation';
const REQUIRED = [
  'cloudflare/daily-digest-api/src/publicationCalendar.js',
  'cloudflare/daily-digest-api/src/adapters/html.js',
  'cloudflare/daily-digest-api/src/adapters/akashvaniMorningNews.js',
  'cloudflare/daily-digest-api/src/adapters/indianExpressDailyBriefing.js',
  'reports/NW-DD-002_india_source_adapters.md',
];
const ALLOWED = [
  'cloudflare/daily-digest-api/src/publicationCalendar.js',
  'cloudflare/daily-digest-api/src/publicationCalendar.cert.test.js',
  'cloudflare/daily-digest-api/src/registry.js',
  'cloudflare/daily-digest-api/wrangler.toml.example',
  'scripts/test_daily_digest_india_adapters_static.mjs',
  'reports/NW-DD-002_india_source_adapters.md',
];
const ALLOWED_PREFIXES = ['cloudflare/daily-digest-api/src/adapters/'];

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
  fail(`unable to resolve DD-002 base branch ${BASE_BRANCH}`);
  return [];
}

function isAllowed(path) {
  return ALLOWED.includes(path) || ALLOWED_PREFIXES.some(prefix => path.startsWith(prefix));
}

REQUIRED.forEach(path => {
  if (!fs.existsSync(path)) fail(`missing required file ${path}`);
});

const registry = fs.readFileSync('cloudflare/daily-digest-api/src/registry.js', 'utf8');
if (!registry.includes("adapterKey: 'AKASHVANI_MORNING_NEWS'")) fail('Akashvani adapter registry contract missing');
if (!registry.includes("adapterKey: 'INDIAN_EXPRESS_DAILY_BRIEFING'")) fail('Indian Express adapter registry contract missing');
if (!registry.includes("daily-digest-registry/v0.2")) fail('registry version not bumped');

const wrangler = fs.readFileSync('cloudflare/daily-digest-api/wrangler.toml.example', 'utf8');
if (/\[triggers\]/.test(wrangler)) fail('production cron remains forbidden in DD-002');
if (!wrangler.includes('daily-digest-registry/v0.2')) fail('Wrangler registry version mismatch');

for (const path of changedFiles()) {
  if (!isAllowed(path)) fail(`out-of-scope DD-002 change ${path}`);
}

if (!process.exitCode) console.log('PASS: NW-DD-002 India adapter scope guard');
