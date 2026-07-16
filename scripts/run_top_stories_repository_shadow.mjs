import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  createFailureArtifactBundle,
  createTopStoriesRunArtifacts,
} from './top-stories-shadow/artifactBundle.mjs';
import {
  sha256Text,
  stableJson,
} from './top-stories-shadow/canonicalJson.mjs';
import {
  buildTopStoriesOperationalRecord,
  serializeTopStoriesOperationalRecord,
} from './top-stories-shadow/operationalRecord.mjs';
import { resolveTopStoriesNominalSlot } from './top-stories-shadow/nominalSlot.mjs';
import { buildRepositoryReplayInput } from './top-stories-shadow/repositoryReplayAdapter.mjs';

const REQUIRED_ARGS = [
  'config',
  'sections',
  'source-health',
  'output',
  'run-at',
  'repository-sha',
  'workflow-run-id',
  'workflow-run-attempt',
];

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = String(argv[index] || '').replace(/^--/, '');
    const value = argv[index + 1];
    if (!key || value === undefined) {
      throw new Error(`Invalid CLI argument near ${argv[index]}`);
    }
    args[key] = value;
  }
  REQUIRED_ARGS.forEach(key => {
    if (!args[key]) throw new Error(`Missing required --${key}`);
  });
  return args;
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

function buildMetadata(args, slot) {
  return {
    repositorySha: args['repository-sha'],
    workflowRunId: args['workflow-run-id'],
    workflowRunAttempt: Number(args['workflow-run-attempt']),
    scheduledAt: slot.scheduledAt,
    runAt: slot.runAt,
  };
}

function describeFile(name, text) {
  return {
    name,
    byteSize: Buffer.byteLength(text, 'utf8'),
    sha256: sha256Text(text),
  };
}

function buildPublicationManifest(context, files) {
  return {
    schemaVersion: 'nw-top-stories-shadow-publication-manifest/v1',
    studyId: context.studyId || null,
    observationId: context.observationId || null,
    nominalSlotKey: context.nominalSlotKey || null,
    scheduledAt: context.scheduledAt || null,
    runAt: context.runAt || null,
    integrityScope: 'accidental-corruption-and-transfer-completeness-only',
    files: Object.entries(files)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([name, text]) => describeFile(name, text)),
  };
}

async function writeFiles(outputDir, files) {
  await mkdir(outputDir, { recursive: true });
  await Promise.all(Object.entries(files).map(([name, content]) => (
    writeFile(path.join(outputDir, name), content, 'utf8')
  )));
}

function finalizeFiles(runResult, operational) {
  const files = {
    ...runResult.files,
    'operational.json': serializeTopStoriesOperationalRecord(operational),
  };
  const manifest = buildPublicationManifest(operational, files);
  return {
    ...files,
    'publication_manifest.json': `${stableJson(manifest)}\n`,
  };
}

async function execute(args) {
  const runAt = new Date(args['run-at']).toISOString();
  const slot = resolveTopStoriesNominalSlot(runAt);
  const studyConfig = await readJson(args.config);
  const sectionsSnapshot = await readJson(args.sections);
  const sourceHealthSnapshot = await readJson(args['source-health']);
  const metadata = buildMetadata(args, slot);
  const inputBundle = buildRepositoryReplayInput({
    sectionsSnapshot,
    sourceHealthSnapshot,
    nowMs: Date.parse(runAt),
    sourceFiles: {
      sections: args.sections,
      sourceHealth: args['source-health'],
    },
  });
  const runResult = createTopStoriesRunArtifacts({
    studyConfig,
    inputBundle,
    metadata,
  });
  const operational = buildTopStoriesOperationalRecord({
    studyConfig,
    metadata,
    slot,
    adapterInput: inputBundle,
    runResult,
  });
  await writeFiles(args.output, finalizeFiles(runResult, operational));
  return { runResult, operational };
}

async function writeFailure(args, error) {
  if (!args?.output) return;
  let studyConfig;
  let slot;
  try {
    studyConfig = args.config ? await readJson(args.config) : null;
  } catch {
    studyConfig = null;
  }
  try {
    slot = resolveTopStoriesNominalSlot(args['run-at']);
  } catch {
    slot = null;
  }
  const metadata = {
    repositorySha: args['repository-sha'] || null,
    workflowRunId: args['workflow-run-id'] || null,
    workflowRunAttempt: Number(args['workflow-run-attempt'] || 0),
    scheduledAt: slot?.scheduledAt || null,
    runAt: slot?.runAt || args['run-at'] || null,
  };
  const runResult = createFailureArtifactBundle(error, {
    studyConfig,
    metadata,
  });
  const operational = buildTopStoriesOperationalRecord({
    studyConfig,
    metadata,
    slot,
    adapterInput: null,
    runResult,
  });
  await writeFiles(args.output, finalizeFiles(runResult, operational));
}

async function run() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
    const result = await execute(args);
    console.log(JSON.stringify({
      artifactName: [
        'top-stories-shadow',
        result.operational.studyId,
        result.operational.nominalSlotKey,
        result.operational.workflowRunId,
        `attempt-${result.operational.workflowRunAttempt}`,
      ].join('-'),
      scheduledAt: result.operational.scheduledAt,
      observationState: result.operational.observationState,
    }));
    if (!result.runResult.ok) process.exitCode = 1;
  } catch (error) {
    await writeFailure(args, error);
    console.error(error?.message || String(error));
    process.exitCode = 1;
  }
}

await run();
