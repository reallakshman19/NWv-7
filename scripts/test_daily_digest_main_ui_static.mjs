import fs from 'node:fs';

function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exitCode = 1;
}

const client = fs.readFileSync('src/data/datasets/dailyDigestDatasetApiClient.js', 'utf8');
const dataset = fs.readFileSync('src/data/datasets/dailyDigestDataset.js', 'utf8');
const mainPage = fs.readFileSync('src/pages/MainPage.jsx', 'utf8');
const component = fs.readFileSync('src/components/DailyDigestSection.jsx', 'utf8');
const store = fs.readFileSync('cloudflare/daily-digest-api/src/snapshotStore.js', 'utf8');
const migration = fs.readFileSync('cloudflare/daily-digest-api/migrations/0003_daily_digest_card_metadata.sql', 'utf8');

if (!client.includes("method: 'GET'")) fail('Daily Digest client must be GET-only');
if (/method:\s*['"](?:POST|PUT|PATCH|DELETE)/i.test(client)) fail('browser write method forbidden');
if (!client.includes('?date=')) fail('explicit same-day digest date query missing');
if (!dataset.includes('runtime.configuredBackendUrl')) fail('shared backend authority not consumed');
if (!dataset.includes("'NOT_FROZEN'")) fail('expected pre-freeze empty state missing');
if (!dataset.includes('ALLOWED_HOSTS')) fail('publisher URL allowlist missing');
if (!mainPage.includes('DailyDigestSection')) fail('Daily Digest component not wired to Main');
if ((mainPage.match(/\{dailyDigestSection\}/g) || []).length !== 2) fail('Daily Digest must render in desktop and mobile flows');
if (!mainPage.includes("id: 'daily-digest'")) fail('Daily Digest section navigation entry missing');
if (!component.includes('Publisher-curated')) fail('publisher-curated UI marker missing');
if (!store.includes('canonical_url') || !store.includes('title')) fail('selected card metadata persistence missing');
if (/article_body|raw_content/i.test(store)) fail('raw publisher content persistence forbidden');
if (!migration.includes('ADD COLUMN title TEXT') || !migration.includes('ADD COLUMN canonical_url TEXT')) fail('card metadata migration incomplete');

if (!process.exitCode) console.log('PASS: NW-DD-006 Daily Digest Main UI static guard');
