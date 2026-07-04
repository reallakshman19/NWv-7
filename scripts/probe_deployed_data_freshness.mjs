import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDatasetContracts } from './data_freshness_contracts.mjs';
import { validateInsightContract } from './dataContracts/insightContract.mjs';
import { validateSectionsContract } from './dataContracts/sectionsContract.mjs';
import { validateUpAheadContract } from './dataContracts/upAheadContract.mjs';
import {
  makeResult,
  payloadTimestamp,
} from './dataContracts/sharedContractUtils.mjs';

const REPORT_PATH = 'reports/deployed_data_freshness_report.json';

function parseArgs(argv) {
  const args = { baseUrl: '', baseDir: '', strictAge: false };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--base-url') args.baseUrl = argv[index + 1] || '';
    if (argv[index] === '--base-dir') args.baseDir = argv[index + 1] || '';
    if (argv[index] === '--strict-age') args.strictAge = true;
  }
  if (!args.baseUrl && !args.baseDir) args.baseDir = 'public';
  return args;
}

function hashContent(text) {
  return crypto.createHash('sha256').update(text).digest('hex').slice(0, 16);
}

function datasetUrl(baseUrl, datasetPath) {
  const cleanBase = String(baseUrl).replace(/\/$/, '');
  return `${cleanBase}${datasetPath}`;
}

async function readLocalJson(baseDir, datasetPath) {
  const fullPath = path.join(baseDir, datasetPath.replace(/^\//, ''));
  const content = await fs.readFile(fullPath, 'utf8');
  return { content, source: fullPath, httpStatus: 200 };
}

async function readRemoteJson(baseUrl, datasetPath) {
  const url = datasetUrl(baseUrl, datasetPath);
  const response = await fetch(url, { cache: 'no-store' });
  const content = await response.text();
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  return { content, source: url, httpStatus: response.status };
}

async function loadDataset(args, dataset) {
  return args.baseUrl
    ? readRemoteJson(args.baseUrl, dataset.path)
    : readLocalJson(args.baseDir, dataset.path);
}

function validateBasicContract(snapshot) {
  const errors = [];
  const warnings = [];
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) errors.push('payload is not an object');
  if (!payloadTimestamp(snapshot)) errors.push('freshness timestamp is missing or invalid');
  if (!snapshot?.contentHash) warnings.push('contentHash is missing');
  return makeResult(errors, warnings, { fetchedAt: payloadTimestamp(snapshot) });
}

function validateContract(kind, snapshot) {
  if (kind === 'insight') return validateInsightContract(snapshot);
  if (kind === 'sections') return validateSectionsContract(snapshot);
  if (kind === 'upAhead') return validateUpAheadContract(snapshot);
  return validateBasicContract(snapshot);
}

function ageState(ageMs, contract, enforceAge) {
  if (ageMs > contract.failAgeMs) {
    return enforceAge ? { error: `age exceeds fail threshold: ${ageMs}ms` } : { warning: `age exceeds deployed fail threshold: ${ageMs}ms` };
  }
  if (ageMs > contract.warnAgeMs) return { warning: `age exceeds warn threshold: ${ageMs}ms` };
  return {};
}

function makeDatasetReport(contract, payload, content, validation, args) {
  const fetchedAt = payloadTimestamp(payload);
  const ageMs = fetchedAt ? Math.max(0, Date.now() - fetchedAt) : 0;
  const errors = [...validation.errors];
  const warnings = [...validation.warnings];
  const age = ageState(ageMs, contract, Boolean(args.baseUrl || args.strictAge));
  if (age.error) errors.push(age.error);
  if (age.warning) warnings.push(age.warning);
  return {
    dataset: contract.dataset,
    path: contract.path,
    ok: errors.length === 0,
    status: errors.length ? 'FAIL' : warnings.length ? 'WARN' : 'PASS',
    fetchedAt,
    ageMs,
    contentHash: payload?.contentHash || hashContent(content),
    errors,
    warnings,
    metrics: validation.metrics || {},
  };
}

async function probeOne(args, contract) {
  try {
    const loaded = await loadDataset(args, contract);
    const payload = JSON.parse(loaded.content);
    const validation = validateContract(contract.contract, payload);
    return {
      ...makeDatasetReport(contract, payload, loaded.content, validation, args),
      source: loaded.source,
      httpStatus: loaded.httpStatus,
    };
  } catch (error) {
    return {
      dataset: contract.dataset,
      path: contract.path,
      ok: false,
      status: 'FAIL',
      fetchedAt: 0,
      ageMs: 0,
      contentHash: '',
      errors: [error?.message || String(error)],
      warnings: [],
    };
  }
}

function summarize(results) {
  const status = results.some(item => item.status === 'FAIL') ? 'FAIL' : results.some(item => item.status === 'WARN') ? 'WARN' : 'PASS';
  return {
    status,
    generatedAt: Date.now(),
    datasetCount: results.length,
    passCount: results.filter(item => item.status === 'PASS').length,
    warnCount: results.filter(item => item.status === 'WARN').length,
    failCount: results.filter(item => item.status === 'FAIL').length,
    datasets: results,
  };
}

async function writeReport(report) {
  await fs.mkdir(path.dirname(REPORT_PATH), { recursive: true });
  await fs.writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
}

function printSummary(report) {
  console.log(`Data freshness contracts: ${report.status}`);
  for (const item of report.datasets) {
    const ageHours = item.fetchedAt ? (item.ageMs / 3_600_000).toFixed(2) : 'n/a';
    console.log(`- ${item.dataset}: ${item.status} (${ageHours}h) ${item.path}`);
    for (const error of item.errors) console.log(`  ERROR: ${error}`);
    for (const warning of item.warnings) console.log(`  WARN: ${warning}`);
  }
  console.log(`Report: ${REPORT_PATH}`);
}

export async function runProbe(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const results = await Promise.all(getDatasetContracts().map(item => probeOne(args, item)));
  const report = summarize(results);
  await writeReport(report);
  printSummary(report);
  return report.status === 'FAIL' ? 1 : 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runProbe().then(code => process.exit(code));
}
