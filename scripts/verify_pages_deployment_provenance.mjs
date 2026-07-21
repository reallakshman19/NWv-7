import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PAGES_TRACKED_FILE_NAMES,
  sha256Bytes,
  validatePagesDeploymentProvenance,
} from './pagesDeploymentProvenance.mjs';

const DEFAULT_ARTIFACT_DIR = 'artifacts/pages-deployment-provenance';
const REQUIRED_DEPLOYED_FILES = [
  'sections_latest.json',
  'source_health.json',
];
const SHA_RE = /^[0-9a-f]{40}$/;

function add(reasons, code, condition = true) {
  if (condition) reasons.add(code);
}

function normalizeBaseUrl(value) {
  const text = String(value || '').trim();
  const url = new URL(text);
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('DEPLOYED_BASE_URL must use http or https');
  }
  if (!url.pathname.endsWith('/')) url.pathname += '/';
  return url;
}

function cacheBustedUrl(baseUrl, relativePath, token) {
  const url = new URL(relativePath, baseUrl);
  url.searchParams.set('pages_provenance', token);
  return url;
}

function looksLikeHtml(bytes, contentType = '') {
  if (String(contentType).toLowerCase().includes('text/html')) return true;
  const prefix = Buffer.from(bytes).subarray(0, 256).toString('utf8').trimStart();
  return /^<!doctype\s+html/i.test(prefix) || /^<html[\s>]/i.test(prefix);
}

async function fetchBytes(baseUrl, relativePath, token) {
  const requestUrl = cacheBustedUrl(baseUrl, relativePath, token);
  const response = await fetch(requestUrl, {
    cache: 'no-store',
    headers: {
      'cache-control': 'no-cache, no-store, max-age=0',
      pragma: 'no-cache',
    },
  });
  const bytes = Buffer.from(await response.arrayBuffer());
  return {
    requestUrl: requestUrl.toString(),
    finalUrl: response.url,
    status: response.status,
    ok: response.ok,
    contentType: response.headers.get('content-type') || '',
    bytes,
    html: looksLikeHtml(bytes, response.headers.get('content-type') || ''),
    cacheBustPreserved: new URL(response.url).searchParams.get(
      'pages_provenance',
    ) === token,
  };
}

function publicFetchRecord(record) {
  return {
    requestUrl: record.requestUrl,
    finalUrl: record.finalUrl,
    httpStatus: record.status,
    contentType: record.contentType,
    byteSize: record.bytes.length,
    cacheBustPreserved: record.cacheBustPreserved,
  };
}

function parseJson(bytes) {
  return JSON.parse(Buffer.from(bytes).toString('utf8'));
}

async function writeReport(directory, report) {
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(
    path.join(directory, 'report.json'),
    `${JSON.stringify(report, null, 2)}\n`,
    'utf8',
  );
}

function manifestRecord(manifest, name) {
  return Array.isArray(manifest?.files)
    ? manifest.files.find(file => file?.name === name)
    : null;
}

async function verifyManifest(baseUrl, token, expectedSha, report, reasons) {
  let fetched;
  try {
    fetched = await fetchBytes(baseUrl, 'newsdata/pages_data_manifest.json', token);
  } catch (error) {
    report.manifest.error = error?.message || String(error);
    add(reasons, 'manifest_fetch_failed');
    return null;
  }
  report.manifest = {
    ...publicFetchRecord(fetched),
    observedSha256: sha256Bytes(fetched.bytes),
  };
  add(reasons, 'manifest_http_error', !fetched.ok);
  add(reasons, 'manifest_html_fallback', fetched.html);
  add(reasons, 'cache_bust_mismatch', !fetched.cacheBustPreserved);
  if (!fetched.ok || fetched.html) return null;
  let manifest;
  try {
    manifest = parseJson(fetched.bytes);
  } catch (error) {
    report.manifest.error = error?.message || String(error);
    add(reasons, 'manifest_json_invalid');
    return null;
  }
  report.observedProvenance = manifest?.provenance || null;
  report.manifest.schemaVersion = manifest?.schemaVersion ?? null;
  report.manifest.manifestVersion = manifest?.manifestVersion ?? null;
  report.manifest.allTrackedFilesMatched =
    manifest?.allTrackedFilesMatched ?? null;
  const validation = validatePagesDeploymentProvenance(manifest, {
    expectedSourceSha: expectedSha,
    requiredFileNames: PAGES_TRACKED_FILE_NAMES,
  });
  validation.reasonCodes.forEach(code => add(reasons, code));
  add(reasons, 'tracked_file_accounting_mismatch',
    manifest?.allTrackedFilesMatched !== true);
  return manifest;
}

async function verifyDeployedFile(baseUrl, token, manifest, name, reasons) {
  const expected = manifestRecord(manifest, name);
  const result = {
    name,
    expectedSha256: expected?.distSha256 || null,
    manifestMatched: expected?.matched ?? null,
    manifestDistExists: expected?.distExists ?? null,
  };
  if (!expected) {
    add(reasons, 'tracked_file_missing');
    return { ...result, verdict: 'FAIL', reasonCodes: ['tracked_file_missing'] };
  }
  let fetched;
  try {
    fetched = await fetchBytes(baseUrl, `newsdata/${name}`, `${token}-${name}`);
  } catch (error) {
    add(reasons, 'deployed_file_fetch_failed');
    return {
      ...result,
      verdict: 'FAIL',
      reasonCodes: ['deployed_file_fetch_failed'],
      error: error?.message || String(error),
    };
  }
  const observedSha256 = sha256Bytes(fetched.bytes);
  const fileReasons = [];
  if (!fetched.ok) fileReasons.push('deployed_file_http_error');
  if (!fetched.cacheBustPreserved) fileReasons.push('cache_bust_mismatch');
  if (fetched.html) fileReasons.push('deployed_file_html_fallback');
  if (!/^[0-9a-f]{64}$/.test(String(expected.distSha256 || ''))) {
    fileReasons.push('tracked_file_hash_invalid');
  } else if (observedSha256 !== expected.distSha256) {
    fileReasons.push('deployed_file_hash_mismatch');
  }
  if (expected.distExists !== true || expected.matched !== true) {
    fileReasons.push('tracked_file_accounting_mismatch');
  }
  fileReasons.forEach(code => add(reasons, code));
  return {
    ...result,
    ...publicFetchRecord(fetched),
    observedSha256,
    verdict: fileReasons.length ? 'FAIL' : 'PASS',
    reasonCodes: [...new Set(fileReasons)].sort(),
  };
}

export async function verifyPagesDeploymentProvenance(options = {}) {
  const checkedAt = new Date().toISOString();
  const artifactDir = options.artifactDir || DEFAULT_ARTIFACT_DIR;
  const expectedSourceSha = String(options.expectedSourceSha || '').trim();
  const report = {
    schemaVersion: 'nw-pages-deployment-provenance-verification/v1',
    checkedAt,
    deployedBaseUrl: options.deployedBaseUrl || null,
    expectedSourceSha: expectedSourceSha || null,
    observedProvenance: null,
    manifest: {},
    checkedFiles: [],
    verdict: 'FAIL',
    reasonCodes: [],
  };
  const reasons = new Set();
  let baseUrl = null;
  if (!SHA_RE.test(expectedSourceSha)) add(reasons, 'expected_source_sha_invalid');
  try {
    baseUrl = normalizeBaseUrl(options.deployedBaseUrl);
  } catch (error) {
    report.manifest.error = error?.message || String(error);
    add(reasons, 'deployed_base_url_invalid');
  }
  const token = `${Date.now()}-${expectedSourceSha || 'missing'}`;
  if (baseUrl && SHA_RE.test(expectedSourceSha)) {
    const manifest = await verifyManifest(
      baseUrl,
      token,
      expectedSourceSha,
      report,
      reasons,
    );
    if (manifest) {
      for (const name of REQUIRED_DEPLOYED_FILES) {
        report.checkedFiles.push(await verifyDeployedFile(
          baseUrl,
          token,
          manifest,
          name,
          reasons,
        ));
      }
    }
  }
  report.reasonCodes = [...reasons].sort();
  report.verdict = report.reasonCodes.length ? 'FAIL' : 'PASS';
  await writeReport(artifactDir, report);
  return report;
}

async function main() {
  const report = await verifyPagesDeploymentProvenance({
    deployedBaseUrl: process.env.DEPLOYED_BASE_URL,
    expectedSourceSha: process.env.EXPECTED_SOURCE_SHA,
    artifactDir: process.env.PAGES_PROVENANCE_ARTIFACT_DIR ||
      DEFAULT_ARTIFACT_DIR,
  });
  console.log(JSON.stringify({
    verdict: report.verdict,
    expectedSourceSha: report.expectedSourceSha,
    observedSourceSha: report.observedProvenance?.sourceSha || null,
    reasonCodes: report.reasonCodes,
  }, null, 2));
  if (report.verdict !== 'PASS') process.exitCode = 1;
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  main().catch(async error => {
    const artifactDir = process.env.PAGES_PROVENANCE_ARTIFACT_DIR ||
      DEFAULT_ARTIFACT_DIR;
    const report = {
      schemaVersion: 'nw-pages-deployment-provenance-verification/v1',
      checkedAt: new Date().toISOString(),
      expectedSourceSha: process.env.EXPECTED_SOURCE_SHA || null,
      observedProvenance: null,
      checkedFiles: [],
      verdict: 'FAIL',
      reasonCodes: ['verification_execution_failed'],
      error: error?.message || String(error),
    };
    await writeReport(artifactDir, report);
    console.error(error);
    process.exitCode = 1;
  });
}
