import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const ALLOWED = new Set([
  'cloudflare/daily-digest-api/migrations/0002_daily_digest_quality.sql',
  'cloudflare/daily-digest-api/src/adapters/akashvaniMorningNews.js',
  'cloudflare/daily-digest-api/src/adapters/digestQualityEvidence.js',
  'cloudflare/daily-digest-api/src/adapters/digestQualityEvidence.cert.test.js',
  'cloudflare/daily-digest-api/src/adapters/indianExpressDailyBriefing.js',
  'cloudflare/daily-digest-api/src/adapters/theHinduMorningDigest.js',
  'cloudflare/daily-digest-api/src/pilotCandidatePolicy.js',
  'cloudflare/daily-digest-api/src/pilotFreeze.js',
  'cloudflare/daily-digest-api/src/pilotFreeze.cert.test.js',
  'cloudflare/daily-digest-api/src/qualityClassifier.js',
  'cloudflare/daily-digest-api/src/qualityClassifier.cert.test.js',
  'cloudflare/daily-digest-api/src/snapshotStore.js',
  'cloudflare/daily-digest-api/src/snapshotStore.cert.test.js',
  'cloudflare/daily-digest-api/wrangler.toml.example',
  'reports/NW-DD-005A_digest_quality_classifier.md',
  'scripts/test_daily_digest_quality_classifier_static.mjs',
]);

function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exitCode = 1;
}

function changedFiles() {
  for (const base of ['origin/main...HEAD', 'main...HEAD']) {
    try {
      const output = execFileSync('git', ['diff', '--name-only', base], { encoding: 'utf8' }).trim();
      if (output) return output.split('\n').filter(Boolean);
    } catch {}
  }
  fail('unable to resolve DD-005A main base');
  return [];
}

const classifier = fs.readFileSync('cloudflare/daily-digest-api/src/qualityClassifier.js', 'utf8');
const pilot = fs.readFileSync('cloudflare/daily-digest-api/src/pilotFreeze.js', 'utf8');
const store = fs.readFileSync('cloudflare/daily-digest-api/src/snapshotStore.js', 'utf8');
const migration = fs.readFileSync('cloudflare/daily-digest-api/migrations/0002_daily_digest_quality.sql', 'utf8');
const wrangler = fs.readFileSync('cloudflare/daily-digest-api/wrangler.toml.example', 'utf8');

if (!classifier.includes("QUALITY_EVIDENCE_VERSION = 'daily-digest-quality/v0.1'")) fail('quality evidence version missing');
if (!pilot.includes("PILOT_POLICY_VERSION = 'daily-digest-policy/v0.3'")) fail('pilot policy version not advanced');
if (/qualityEvidence.*items/i.test(store)) fail('raw quality items must not be persisted');
if (/headline|article_body|raw_content/i.test(migration)) fail('raw publisher content columns are forbidden');
if (!store.includes('quality_topic_counts_json')) fail('derived quality audit persistence missing');
if (/openai|gemini|anthropic|llm/i.test(classifier)) fail('AI quality ranking is forbidden');
if (/qualityScore|weightedScore/i.test(classifier)) fail('scalar quality score is forbidden');
if (/\[triggers\]/.test(wrangler)) fail('production cron trigger remains forbidden');
if (!wrangler.includes('daily-digest-policy/v0.3')) fail('Wrangler policy version mismatch');

for (const path of changedFiles()) {
  if (!ALLOWED.has(path)) fail(`out-of-scope DD-005A change ${path}`);
  if (path.startsWith('.github/workflows/')) fail(`workflow change forbidden: ${path}`);
}

if (!process.exitCode) console.log('PASS: NW-DD-005A digest quality classifier scope guard');
