import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { sha256Text, stableJson } from './top-stories-shadow/canonicalJson.mjs';
import {
  TOP_STORIES_OPERATIONAL_VALIDATION_SCHEMA,
  validateTopStoriesOperationalDay,
} from './top-stories-shadow/operationalValidation.mjs';
import { renderTopStoriesOperationalValidationMarkdown } from './top-stories-shadow/operationalValidationMarkdown.mjs';

const REQUIRED_ARGS = [
  'daily-report',
  'daily-markdown',
  'aggregation-manifest',
  'download-manifest',
  'config',
  'output',
];

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = String(argv[index] || '').replace(/^--/, '');
    const value = argv[index + 1];
    if (!key || value === undefined) throw new Error(`Invalid CLI argument near ${argv[index]}`);
    args[key] = value;
  }
  REQUIRED_ARGS.forEach(key => {
    if (!args[key]) throw new Error(`Missing required --${key}`);
  });
  return args;
}

async function readText(filePath) {
  return readFile(filePath, 'utf8');
}

function parseJson(text, name) {
  try {
    return JSON.parse(text);
  } catch (error) {
    const wrapped = new Error(`Invalid JSON in ${name}: ${error.message}`);
    wrapped.code = 'invalid_json';
    throw wrapped;
  }
}

function descriptorErrors(manifest, files) {
  const errors = [];
  const descriptors = new Map((manifest?.files || []).map(item => [item.name, item]));
  for (const [name, text] of Object.entries(files)) {
    const descriptor = descriptors.get(name);
    if (!descriptor) {
      errors.push(`missing_descriptor:${name}`);
      continue;
    }
    if (Number(descriptor.byteSize) !== Buffer.byteLength(text, 'utf8')) {
      errors.push(`byte_size_mismatch:${name}`);
    }
    if (descriptor.sha256 !== sha256Text(text)) {
      errors.push(`sha256_mismatch:${name}`);
    }
  }
  return errors.sort();
}

function failureValidation(error, context = {}) {
  const reason = error?.code || 'operational_validation_failed';
  return {
    schemaVersion: TOP_STORIES_OPERATIONAL_VALIDATION_SCHEMA,
    studyId: context.studyId || null,
    date: context.date || null,
    decision: 'FAIL',
    reportStatus: null,
    checks: [{
      id: 'validation_execution',
      status: 'FAIL',
      actual: error?.message || String(error),
      threshold: 'successful deterministic validation',
      reasonCode: reason,
    }],
    failureReasonCodes: [reason],
    warningReasonCodes: [],
    insufficiencyReasonCodes: [],
    metrics: {},
    editorialObservations: {
      calm15mMedianIncumbentRetention: null,
      calm60mMedianIncumbentRetention: null,
      operationalDecisionIndependentOfEditorialMetrics: true,
    },
    thresholds: null,
    productionChangeAuthorized: false,
    editorialPolicyChangeAuthorized: false,
  };
}

function describe(name, text) {
  return {
    name,
    byteSize: Buffer.byteLength(text, 'utf8'),
    sha256: sha256Text(text),
  };
}

async function writeOutputs(outputDir, validation) {
  const jsonText = `${stableJson(validation)}\n`;
  const markdownText = `${renderTopStoriesOperationalValidationMarkdown(validation)}\n`;
  const files = {
    'operational_validation.json': jsonText,
    'operational_validation.md': markdownText,
  };
  const manifest = {
    schemaVersion: 'nw-top-stories-24h-validation-manifest/v1',
    studyId: validation.studyId,
    date: validation.date,
    decision: validation.decision,
    deterministicReplay: true,
    files: Object.entries(files)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([name, text]) => describe(name, text)),
  };
  files['validation_manifest.json'] = `${stableJson(manifest)}\n`;
  await mkdir(outputDir, { recursive: true });
  await Promise.all(Object.entries(files).map(([name, text]) =>
    writeFile(path.join(outputDir, name), text, 'utf8')));
}

async function execute(args) {
  const [
    dailyReportText,
    dailyMarkdownText,
    aggregationManifestText,
    downloadManifestText,
    configText,
  ] = await Promise.all([
    readText(args['daily-report']),
    readText(args['daily-markdown']),
    readText(args['aggregation-manifest']),
    readText(args['download-manifest']),
    readText(args.config),
  ]);
  const dailyReport = parseJson(dailyReportText, 'daily_report.json');
  const aggregationManifest = parseJson(
    aggregationManifestText,
    'aggregation_manifest.json',
  );
  const downloadManifest = parseJson(downloadManifestText, 'download_manifest.json');
  const studyConfig = parseJson(configText, 'study config');
  const errors = descriptorErrors(aggregationManifest, {
    'daily_report.json': dailyReportText,
    'daily_report.md': dailyMarkdownText,
  });
  return validateTopStoriesOperationalDay({
    dailyReport,
    aggregationManifest,
    downloadManifest,
    studyConfig,
    integrity: { ok: errors.length === 0, errors },
  });
}

async function main() {
  let args;
  let validation;
  try {
    args = parseArgs(process.argv.slice(2));
    validation = await execute(args);
  } catch (error) {
    let context = {};
    try {
      const config = args?.config ? parseJson(await readText(args.config), 'study config') : null;
      const report = args?.['daily-report']
        ? parseJson(await readText(args['daily-report']), 'daily_report.json')
        : null;
      context = { studyId: config?.studyId, date: report?.date };
    } catch {
      context = {};
    }
    validation = failureValidation(error, context);
  }
  if (!args?.output) throw new Error('Validation output path is unavailable');
  await writeOutputs(args.output, validation);
  console.log(JSON.stringify({
    decision: validation.decision,
    studyId: validation.studyId,
    date: validation.date,
  }));
  if (validation.decision === 'FAIL') process.exitCode = 1;
}

await main();
