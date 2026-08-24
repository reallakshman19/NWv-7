import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const BASE_BRANCH = 'nw-dd-003-the-hindu-adapter';
const ALLOWED = new Set([
  'cloudflare/daily-digest-api/src/adapters/financialTimesFirstFtAsia.js',
  'cloudflare/daily-digest-api/src/adapters/financialTimesFirstFtAsia.cert.test.js',
  'cloudflare/daily-digest-api/src/registry.js',
  'cloudflare/daily-digest-api/wrangler.toml.example',
  'reports/NW-DD-004_firstft_asia_edition_resolver.md',
  'scripts/test_daily_digest_firstft_asia_static.mjs',
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
  fail(`unable to resolve DD-004 base branch ${BASE_BRANCH}`);
  return [];
}

const registry = fs.readFileSync('cloudflare/daily-digest-api/src/registry.js', 'utf8');
const ftStart = registry.indexOf("publisherFamily: 'FINANCIAL_TIMES'");
const ftEnd = registry.indexOf("publisherFamily: 'MONEYCONTROL'", ftStart);
const ftEntry = registry.slice(ftStart, ftEnd);
if (!ftEntry.includes("qualificationState: 'HOLD'")) fail('FT must remain HOLD in DD-004');
if (!ftEntry.includes("holdReason: 'CURRENT_EDITION_DISCOVERY_NOT_QUALIFIED'")) fail('FT hold reason not narrowed');
if (!ftEntry.includes("editionResolverQualification: 'QUALIFIED'")) fail('FT resolver qualification missing');
if (ftEntry.includes('discoveryUrl:')) fail('DD-004 must not invent a current FT discovery URL');
if (!registry.includes('daily-digest-registry/v0.4')) fail('registry version not bumped');

const adapter = fs.readFileSync('cloudflare/daily-digest-api/src/adapters/financialTimesFirstFtAsia.js', 'utf8');
if (/google\.com|bing\.com|news\.google/i.test(adapter)) fail('third-party discovery reference forbidden');
if (/\bfetchImpl\b|\bdiscoverFinancialTimes/i.test(adapter)) fail('DD-004 must remain resolver-only');

const wrangler = fs.readFileSync('cloudflare/daily-digest-api/wrangler.toml.example', 'utf8');
if (/\[triggers\]/.test(wrangler)) fail('production cron remains forbidden');
if (!wrangler.includes('daily-digest-registry/v0.4')) fail('Wrangler registry version mismatch');

for (const path of changedFiles()) {
  if (!ALLOWED.has(path)) fail(`out-of-scope DD-004 change ${path}`);
}

if (!process.exitCode) console.log('PASS: NW-DD-004 FirstFT Asia resolver scope guard');
