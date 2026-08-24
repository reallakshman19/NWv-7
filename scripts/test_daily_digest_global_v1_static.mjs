import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const BASE_BRANCH = 'nw-dd-004-firstft-asia-resolver';
const REQUIRED = [
  'cloudflare/daily-digest-api/src/globalV1Qualification.js',
  'cloudflare/daily-digest-api/src/globalV1Qualification.cert.test.js',
  'reports/NW-DD-004A_global_v1_source_decision.md',
];
const ALLOWED = new Set([
  'cloudflare/daily-digest-api/src/globalV1Qualification.js',
  'cloudflare/daily-digest-api/src/globalV1Qualification.cert.test.js',
  'cloudflare/daily-digest-api/src/registry.js',
  'cloudflare/daily-digest-api/wrangler.toml.example',
  'reports/NW-DD-004A_global_v1_source_decision.md',
  'scripts/test_daily_digest_global_v1_static.mjs',
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
  fail(`unable to resolve DD-004A base branch ${BASE_BRANCH}`);
  return [];
}

REQUIRED.forEach(path => {
  if (!fs.existsSync(path)) fail(`missing required file ${path}`);
});

const registry = fs.readFileSync('cloudflare/daily-digest-api/src/registry.js', 'utf8');
if (!registry.includes("daily-digest-registry/v0.5")) fail('registry version must be v0.5');
if (!registry.includes("CURRENT_EDITION_DISCOVERY_AUTHORITY_NOT_PROVEN")) fail('FT v1 exclusion missing');
if (!registry.includes("publisherFamily: 'ASSOCIATED_PRESS'")) fail('AP HOLD candidate missing');
if (!registry.includes("publisherFamily: 'BBC'")) fail('BBC HOLD candidate missing');
if (/publisherFamily: 'FINANCIAL_TIMES'[\s\S]{0,500}qualificationState: 'QUALIFIED'/.test(registry)) fail('FT must remain HOLD');
if (/publisherFamily: 'ASSOCIATED_PRESS'[\s\S]{0,400}discoveryUrl:/.test(registry)) fail('AP discovery URL must not be invented');
if (/publisherFamily: 'BBC'[\s\S]{0,400}discoveryUrl:/.test(registry)) fail('BBC discovery URL must not be invented');

const qualification = fs.readFileSync('cloudflare/daily-digest-api/src/globalV1Qualification.js', 'utf8');
if (!qualification.includes("G1_ROLE = 'GLOBAL_BUSINESS_AND_WORLD'")) fail('G1 role changed');
if (!qualification.includes("'GLOBAL_UNAVAILABLE'")) fail('explicit degraded global state missing');

const wrangler = fs.readFileSync('cloudflare/daily-digest-api/wrangler.toml.example', 'utf8');
if (/\[triggers\]/.test(wrangler)) fail('production cron remains forbidden in DD-004A');
if (!wrangler.includes('daily-digest-registry/v0.5')) fail('Wrangler registry version mismatch');

for (const path of changedFiles()) {
  if (!ALLOWED.has(path)) fail(`out-of-scope DD-004A change ${path}`);
}

if (!process.exitCode) console.log('PASS: NW-DD-004A global v1 decision scope guard');
