import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  PRODUCTION_DATA_DOMAINS,
  publishDomainOutputs,
  publishSelectedDomains,
  sha256File,
  validateDomainOutputs,
  verifyPublishedParity,
  writeProductionManifest,
} from './production_data_recovery.mjs';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

const cli = fs.readFileSync('scripts/refresh_production_data.mjs', 'utf8');
assert(cli.includes("'news', 'market', 'weather', 'travel'"), 'default recovery domains missing');
assert(cli.includes("if (!options.publish)"), 'refresh must be dry-run by default');
assert(cli.includes("publishSelectedDomains"), 'single transaction publication boundary missing');
assert(cli.includes("verifyPublishedParity"), 'post-publish parity verification missing');
assert(!cli.includes('.github/workflows/'), 'recovery CLI must not depend on GitHub Actions workflow paths');
assert(typeof publishSelectedDomains === 'function', 'multi-domain publisher missing');

const travelCollector = fs.readFileSync('scripts/collect_travel_local_news.mjs', 'utf8');
assert(travelCollector.includes('/<item>([\\s\\S]*?)<\\/item>/g'), 'travel RSS item parser must support multiline item bodies');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nw-production-recovery-test-'));
const stagePublic = path.join(root, 'stage-public');
const repoRoot = path.join(root, 'repo');
const now = Date.now();

writeJson(path.join(stagePublic, 'data/travel-local-chennai.json'), {
  schemaVersion: 1, type: 'travel-location-news-payload', locationKey: 'chennai', generatedAt: new Date(now).toISOString(), storyCount: 1,
  stories: [{ title: 'Chennai test', url: 'https://example.test/chennai' }],
});
writeJson(path.join(stagePublic, 'data/travel-local-trichy.json'), {
  schemaVersion: 1, type: 'travel-location-news-payload', locationKey: 'trichy', generatedAt: new Date(now).toISOString(), storyCount: 1,
  stories: [{ title: 'Trichy test', url: 'https://example.test/trichy' }],
});
writeJson(path.join(stagePublic, 'data/travel-local-muscat.json'), {
  schemaVersion: 1, type: 'travel-location-news-payload', locationKey: 'muscat', generatedAt: new Date(now).toISOString(), storyCount: 1,
  stories: [{ title: 'Muscat test', url: 'https://example.test/muscat' }],
});
writeJson(path.join(stagePublic, 'data/travel-local-colombo.json'), {
  schemaVersion: 1, type: 'travel-location-news-payload', locationKey: 'colombo', generatedAt: new Date(now).toISOString(), storyCount: 1,
  stories: [{ title: 'Colombo test', url: 'https://example.test/colombo' }],
});

validateDomainOutputs({ publicRoot: stagePublic, domain: 'travel', nowMs: now, enforceFreshness: true });
const published = publishDomainOutputs({ stagePublicRoot: stagePublic, repoRoot, domain: 'travel' });
assert(published.length === PRODUCTION_DATA_DOMAINS.travel.outputs.length, 'travel publication output count mismatch');
const parity = verifyPublishedParity({ repoRoot, domains: ['travel'], enforceFreshness: true, nowMs: now });
assert(parity.length === 1, 'travel parity result missing');

for (const relativePath of PRODUCTION_DATA_DOMAINS.travel.outputs) {
  assert(
    sha256File(path.join(repoRoot, 'public', relativePath)) === sha256File(path.join(repoRoot, 'docs', relativePath)),
    `public/docs parity failed for ${relativePath}`
  );
}

const manifest = writeProductionManifest({
  repoRoot,
  sourceCommit: 'fixture',
  domains: ['travel'],
  domainResults: parity,
  publishedFiles: published.map(file => ({ domain: 'travel', ...file })),
  generatedAt: new Date(now).toISOString(),
});
assert(manifest.schemaVersion === 'nw-production-data-manifest/v1', 'manifest schema mismatch');
assert(fs.existsSync(path.join(repoRoot, 'public/_nw/production-data-manifest.json')), 'public manifest missing');
assert(fs.existsSync(path.join(repoRoot, 'docs/_nw/production-data-manifest.json')), 'docs manifest missing');

fs.rmSync(root, { recursive: true, force: true });
console.log('PASS: production data recovery contract');
