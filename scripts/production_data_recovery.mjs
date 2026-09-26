import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const HOUR_MS = 60 * 60 * 1000;

export const PRODUCTION_DATA_SCHEMA = 'nw-production-data-manifest/v1';
export const PRODUCTION_DATA_DOMAINS = Object.freeze({
  news: Object.freeze({
    maxAgeHours: 3,
    outputs: Object.freeze([
      'newsdata/insight_latest.json',
      'newsdata/sections_latest.json',
      'newsdata/source_health.json',
      'newsdata/insight_quality_report.json',
      'newsdata/insight_quality_summary.md',
      'newsdata/sections_quality_report.json',
      'newsdata/sections_quality_summary.md',
      'newsdata/newsdata_freshness_report.json',
      'newsdata/newsdata_freshness_summary.md',
      'newsdata/section_source_policy_report.json',
    ]),
    freshnessFiles: Object.freeze([
      Object.freeze({ path: 'newsdata/sections_latest.json', fields: ['fetchedAt', 'generatedAt'] }),
      Object.freeze({ path: 'newsdata/insight_latest.json', fields: ['fetchedAt', 'generatedAt'] }),
    ]),
  }),
  market: Object.freeze({
    maxAgeHours: 8,
    outputs: Object.freeze([
      'data/market_snapshot.json',
      'data/market_metrics.json',
      'data/source_health.json',
      'data/mutual_fund_snapshot.json',
      'data/fx_snapshot.json',
    ]),
    freshnessFiles: Object.freeze([
      Object.freeze({ path: 'data/market_snapshot.json', fields: ['fetchedAt', 'generatedAt', 'generated_at'] }),
    ]),
  }),
  weather: Object.freeze({
    maxAgeHours: 8,
    outputs: Object.freeze(['data/weather_snapshot.json']),
    freshnessFiles: Object.freeze([
      Object.freeze({ path: 'data/weather_snapshot.json', fields: ['fetchedAt', 'generatedAt', 'generated_at', 'timestamp'] }),
    ]),
  }),
  travel: Object.freeze({
    maxAgeHours: 8,
    outputs: Object.freeze([
      'data/travel-local-chennai.json',
      'data/travel-local-trichy.json',
      'data/travel-local-muscat.json',
      'data/travel-local-colombo.json',
    ]),
    freshnessFiles: Object.freeze([
      Object.freeze({ path: 'data/travel-local-chennai.json', fields: ['generatedAt'] }),
      Object.freeze({ path: 'data/travel-local-trichy.json', fields: ['generatedAt'] }),
      Object.freeze({ path: 'data/travel-local-muscat.json', fields: ['generatedAt'] }),
      Object.freeze({ path: 'data/travel-local-colombo.json', fields: ['generatedAt'] }),
    ]),
  }),
});

export function sha256Buffer(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

export function sha256File(filePath) {
  return sha256Buffer(fs.readFileSync(filePath));
}

export function parseTimestamp(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value < 1e12 ? value * 1000 : value;
  }
  if (typeof value === 'string' && value.trim()) {
    const numeric = Number(value);
    if (Number.isFinite(numeric) && /^\d+(?:\.\d+)?$/.test(value.trim())) {
      return numeric < 1e12 ? numeric * 1000 : numeric;
    }
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function freshnessTimestamp(payload, fields) {
  for (const field of fields) {
    const parsed = parseTimestamp(payload?.[field]);
    if (parsed !== null) return parsed;
  }
  return null;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function validateTravelPayload(payload, expectedKey) {
  assert(payload?.schemaVersion === 1, `${expectedKey}: schemaVersion must be 1`);
  assert(payload?.type === 'travel-location-news-payload', `${expectedKey}: invalid payload type`);
  assert(payload?.locationKey === expectedKey, `${expectedKey}: locationKey mismatch`);
  assert(Array.isArray(payload?.stories), `${expectedKey}: stories must be an array`);
  assert(Number(payload?.storyCount) === payload.stories.length, `${expectedKey}: storyCount mismatch`);
  assert(payload.stories.length > 0, `${expectedKey}: refusing to publish an empty travel snapshot`);
  for (const [index, story] of payload.stories.entries()) {
    assert(String(story?.title || '').trim(), `${expectedKey}: stories[${index}] title missing`);
    assert(String(story?.url || '').startsWith('http'), `${expectedKey}: stories[${index}] url invalid`);
  }
}

function validateNewsPayload(publicRoot) {
  const sections = readJson(path.join(publicRoot, 'newsdata/sections_latest.json'));
  const required = ['topStories', 'india', 'tn', 'trichy', 'muscat', 'world', 'business', 'technology', 'sports', 'entertainment'];
  assert(sections?.schemaVersion >= 1, 'news: sections_latest schemaVersion missing');
  assert(sections?.sections && typeof sections.sections === 'object', 'news: sections object missing');
  for (const key of required) {
    const value = sections.sections[key];
    const items = Array.isArray(value) ? value : value?.items;
    assert(Array.isArray(items), `news: section ${key} missing`);
  }
}

function validateMarketPayload(publicRoot) {
  const market = readJson(path.join(publicRoot, 'data/market_snapshot.json'));
  assert(Array.isArray(market?.indices), 'market: indices missing');
  assert(market.indices.length >= 3, 'market: fewer than 3 indices');
}

function validateWeatherPayload(publicRoot) {
  const weather = readJson(path.join(publicRoot, 'data/weather_snapshot.json'));
  for (const key of ['chennai', 'trichy', 'muscat', 'colombo']) {
    assert(weather?.[key] && typeof weather[key] === 'object', `weather: ${key} missing`);
  }
}

export function validateDomainOutputs({ publicRoot, domain, nowMs = Date.now(), enforceFreshness = true }) {
  const contract = PRODUCTION_DATA_DOMAINS[domain];
  assert(contract, `unknown production data domain: ${domain}`);

  for (const relativePath of contract.outputs) {
    const fullPath = path.join(publicRoot, relativePath);
    assert(fs.existsSync(fullPath), `${domain}: missing output ${relativePath}`);
    assert(fs.statSync(fullPath).size > 0, `${domain}: empty output ${relativePath}`);
  }

  if (domain === 'news') validateNewsPayload(publicRoot);
  if (domain === 'market') validateMarketPayload(publicRoot);
  if (domain === 'weather') validateWeatherPayload(publicRoot);
  if (domain === 'travel') {
    for (const key of ['chennai', 'trichy', 'muscat', 'colombo']) {
      validateTravelPayload(readJson(path.join(publicRoot, `data/travel-local-${key}.json`)), key);
    }
  }

  const freshness = [];
  for (const entry of contract.freshnessFiles) {
    const fullPath = path.join(publicRoot, entry.path);
    const payload = readJson(fullPath);
    const timestamp = freshnessTimestamp(payload, entry.fields);
    assert(timestamp !== null, `${domain}: ${entry.path} freshness timestamp missing`);
    const ageHours = (nowMs - timestamp) / HOUR_MS;
    assert(ageHours >= -0.25, `${domain}: ${entry.path} timestamp is too far in the future`);
    if (enforceFreshness) {
      assert(ageHours <= contract.maxAgeHours, `${domain}: ${entry.path} is ${ageHours.toFixed(2)}h old; max ${contract.maxAgeHours}h`);
    }
    freshness.push({ path: entry.path, timestamp: new Date(timestamp).toISOString(), ageHours: Number(Math.max(0, ageHours).toFixed(3)) });
  }

  return { domain, outputs: [...contract.outputs], freshness };
}

function writeFileAtomic(targetPath, buffer) {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  const tempPath = `${targetPath}.nwtmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tempPath, buffer);
  fs.renameSync(tempPath, targetPath);
}

function restoreTarget(targetPath, original) {
  if (original === null) {
    fs.rmSync(targetPath, { force: true });
    return;
  }
  writeFileAtomic(targetPath, original);
}

export function publishDomainOutputs({ stagePublicRoot, repoRoot, domain }) {
  const contract = PRODUCTION_DATA_DOMAINS[domain];
  assert(contract, `unknown production data domain: ${domain}`);

  const operations = [];
  for (const relativePath of contract.outputs) {
    const sourcePath = path.join(stagePublicRoot, relativePath);
    assert(fs.existsSync(sourcePath), `${domain}: staged source missing ${relativePath}`);
    const bytes = fs.readFileSync(sourcePath);
    const publicTarget = path.join(repoRoot, 'public', relativePath);
    const docsTarget = path.join(repoRoot, 'docs', relativePath);
    operations.push({ relativePath, bytes, publicTarget, docsTarget });
  }

  const originals = new Map();
  const touched = [];
  try {
    for (const op of operations) {
      for (const targetPath of [op.publicTarget, op.docsTarget]) {
        originals.set(targetPath, fs.existsSync(targetPath) ? fs.readFileSync(targetPath) : null);
        writeFileAtomic(targetPath, op.bytes);
        touched.push(targetPath);
      }
      const sourceHash = sha256Buffer(op.bytes);
      assert(sha256File(op.publicTarget) === sourceHash, `${domain}: public hash mismatch for ${op.relativePath}`);
      assert(sha256File(op.docsTarget) === sourceHash, `${domain}: docs hash mismatch for ${op.relativePath}`);
    }
  } catch (error) {
    for (const targetPath of touched.reverse()) {
      try { restoreTarget(targetPath, originals.get(targetPath)); } catch { /* best effort rollback */ }
    }
    throw error;
  }

  return operations.map(op => ({
    path: op.relativePath,
    sha256: sha256Buffer(op.bytes),
    bytes: op.bytes.length,
  }));
}

export function verifyPublishedParity({ repoRoot, domains, enforceFreshness = false, nowMs = Date.now() }) {
  const results = [];
  for (const domain of domains) {
    const contract = PRODUCTION_DATA_DOMAINS[domain];
    assert(contract, `unknown production data domain: ${domain}`);
    const freshness = validateDomainOutputs({ publicRoot: path.join(repoRoot, 'public'), domain, nowMs, enforceFreshness });
    const files = [];
    for (const relativePath of contract.outputs) {
      const publicPath = path.join(repoRoot, 'public', relativePath);
      const docsPath = path.join(repoRoot, 'docs', relativePath);
      assert(fs.existsSync(docsPath), `${domain}: served docs copy missing ${relativePath}`);
      const publicHash = sha256File(publicPath);
      const docsHash = sha256File(docsPath);
      assert(publicHash === docsHash, `${domain}: public/docs drift for ${relativePath}`);
      files.push({ path: relativePath, sha256: publicHash, bytes: fs.statSync(publicPath).size });
    }
    results.push({ domain, freshness: freshness.freshness, files });
  }
  return results;
}

export function writeProductionManifest({ repoRoot, sourceCommit, domains, domainResults, publishedFiles, generatedAt = new Date().toISOString() }) {
  const manifest = {
    schemaVersion: PRODUCTION_DATA_SCHEMA,
    generatedAt,
    sourceCommit,
    domains,
    validation: domainResults,
    files: publishedFiles,
  };
  const bytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  for (const target of [
    path.join(repoRoot, 'public/_nw/production-data-manifest.json'),
    path.join(repoRoot, 'docs/_nw/production-data-manifest.json'),
  ]) {
    writeFileAtomic(target, bytes);
  }
  return manifest;
}
