import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { sha256Text, stableJson } from './top-stories-shadow/canonicalJson.mjs';
import {
  buildPilotArtifactInputManifest,
  canonicalizeTopStoriesPilotArtifacts,
  PILOT_DOWNLOAD_SCHEMA,
  readTopStoriesPilotArtifact,
} from './top-stories-shadow/pilotArtifactReader.mjs';
import {
  buildTopStoriesPilotDecision,
  TOP_STORIES_PILOT_DECISION_SCHEMA,
} from './top-stories-shadow/pilotDecision.mjs';
import { renderTopStoriesPilotDecisionMarkdown } from './top-stories-shadow/pilotDecisionMarkdown.mjs';
import { validateTopStoriesStudyConfig } from './top-stories-shadow/studyConfig.mjs';

const REQUIRED_ARGS = ['input', 'download-manifest', 'config', 'output'];

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

async function readJson(filePath, name) {
  const text = await readFile(filePath, 'utf8');
  try {
    return JSON.parse(text);
  } catch (error) {
    const wrapped = new Error(`Invalid JSON in ${name}: ${error.message}`);
    wrapped.code = 'invalid_json';
    throw wrapped;
  }
}

function descriptor(name, text) {
  return {
    name,
    byteSize: Buffer.byteLength(text, 'utf8'),
    sha256: sha256Text(text),
  };
}

function failureDecision(error, context = {}) {
  const reason = error?.code || 'pilot_decision_execution_failed';
  return {
    schemaVersion: TOP_STORIES_PILOT_DECISION_SCHEMA,
    studyId: context.studyId || null,
    pilotStartDate: context.pilotStartDate || null,
    pilotEndDate: context.pilotEndDate || null,
    pilotWindowDays: context.pilotWindowDays || null,
    generatedAt: context.generatedAt || null,
    decision: 'FAIL',
    recommendation: 'OPERATIONAL_REPAIR_REQUIRED',
    reasonCodes: ['technical_evidence_failure'],
    failureReasonCodes: [reason],
    insufficiencyReasonCodes: [],
    evidenceGaps: [],
    thresholds: null,
    days: [],
    metrics: {},
    reviewChecklist: { expertApprovalRecorded: false },
    productionChangeAuthorized: false,
    automaticPolicyChangeAuthorized: false,
  };
}

async function readArtifacts(inputDir, downloadManifest) {
  const records = [];
  for (const metadata of downloadManifest.downloaded || []) {
    const directory = path.join(
      inputDir,
      path.basename(String(metadata.fileName || ''), '.zip'),
    );
    records.push(await readTopStoriesPilotArtifact(directory, metadata));
  }
  return records;
}

async function writeOutputs(outputDir, decision, inputManifest) {
  const jsonText = `${stableJson(decision)}\n`;
  const markdownText = `${renderTopStoriesPilotDecisionMarkdown(decision)}\n`;
  const inputText = `${stableJson(inputManifest)}\n`;
  const files = {
    'pilot_decision.json': jsonText,
    'pilot_decision.md': markdownText,
    'pilot_input_manifest.json': inputText,
  };
  const manifest = {
    schemaVersion: 'nw-top-stories-pilot-decision-manifest/v1',
    studyId: decision.studyId,
    pilotStartDate: decision.pilotStartDate,
    pilotEndDate: decision.pilotEndDate,
    decision: decision.decision,
    recommendation: decision.recommendation,
    deterministicReplay: true,
    files: Object.entries(files)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([name, text]) => descriptor(name, text)),
  };
  files['pilot_manifest.json'] = `${stableJson(manifest)}\n`;
  await mkdir(outputDir, { recursive: true });
  await Promise.all(Object.entries(files).map(([name, text]) =>
    writeFile(path.join(outputDir, name), text, 'utf8')));
}

async function execute(args) {
  const nowMs = args.now ? Date.parse(args.now) : Date.now();
  if (!Number.isFinite(nowMs)) throw new Error('--now must be a valid timestamp');
  const [rawConfig, downloadManifest] = await Promise.all([
    readJson(args.config, 'study config'),
    readJson(args['download-manifest'], 'pilot_download_manifest.json'),
  ]);
  const studyConfig = validateTopStoriesStudyConfig(rawConfig, { nowMs });
  if (downloadManifest?.schemaVersion !== PILOT_DOWNLOAD_SCHEMA) {
    const error = new Error('Unsupported pilot download manifest schema');
    error.code = 'pilot_download_schema_mismatch';
    throw error;
  }
  if (downloadManifest.studyId !== studyConfig.studyId) {
    const error = new Error('Pilot download manifest studyId does not match config');
    error.code = 'pilot_download_study_mismatch';
    throw error;
  }
  const records = await readArtifacts(args.input, downloadManifest);
  const canonicalized = canonicalizeTopStoriesPilotArtifacts(records);
  const inputManifest = buildPilotArtifactInputManifest(
    records,
    canonicalized,
    downloadManifest,
  );
  const decision = buildTopStoriesPilotDecision({
    canonicalArtifacts: canonicalized.canonical,
    inputManifest,
    studyConfig,
    nowMs,
  });
  return { decision, inputManifest };
}

async function main() {
  let args;
  let result;
  try {
    args = parseArgs(process.argv.slice(2));
    result = await execute(args);
  } catch (error) {
    let context = {};
    try {
      const config = args?.config ? await readJson(args.config, 'study config') : {};
      context = {
        studyId: config.studyId,
        pilotStartDate: config.pilotStartDate,
        pilotWindowDays: config.pilotWindowDays,
        generatedAt: args?.now || null,
      };
    } catch {
      context = {};
    }
    result = {
      decision: failureDecision(error, context),
      inputManifest: {
        schemaVersion: 'nw-top-stories-pilot-input-manifest/v1',
        error: error.message || String(error),
      },
    };
  }
  if (!args?.output) throw new Error('Pilot decision output path is unavailable');
  await writeOutputs(args.output, result.decision, result.inputManifest);
  console.log(JSON.stringify({
    decision: result.decision.decision,
    recommendation: result.decision.recommendation,
  }));
  if (result.decision.decision === 'FAIL') process.exitCode = 1;
}

await main();
