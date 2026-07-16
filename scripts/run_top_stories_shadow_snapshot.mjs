import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  createFailureArtifactBundle,
  createTopStoriesRunArtifacts,
} from './top-stories-shadow/artifactBundle.mjs';

const REQUIRED_ARGS = [
  'config',
  'input',
  'output',
  'scheduled-at',
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
    if (!key || value === undefined) throw new Error(`Invalid CLI argument near ${argv[index]}`);
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

function buildMetadata(args) {
  return {
    repositorySha: args['repository-sha'],
    workflowRunId: args['workflow-run-id'],
    workflowRunAttempt: Number(args['workflow-run-attempt']),
    scheduledAt: args['scheduled-at'],
    runAt: args['run-at'],
  };
}

async function writeBundle(outputDir, files) {
  await mkdir(outputDir, { recursive: true });
  await Promise.all(Object.entries(files).map(([name, content]) => (
    writeFile(path.join(outputDir, name), content, 'utf8')
  )));
}

async function run() {
  let args;
  let studyConfig;
  let metadata;
  try {
    args = parseArgs(process.argv.slice(2));
    metadata = buildMetadata(args);
    studyConfig = await readJson(args.config);
    const inputBundle = await readJson(args.input);
    const result = createTopStoriesRunArtifacts({
      studyConfig,
      inputBundle,
      metadata,
    });
    await writeBundle(args.output, result.files);
    if (!result.ok) {
      console.error(result.failure.errorMessage);
      process.exitCode = 1;
      return;
    }
    console.log(`Wrote ${result.snapshot.observationId}`);
  } catch (error) {
    const outputDir = args?.output;
    if (outputDir) {
      const failure = createFailureArtifactBundle(error, { studyConfig, metadata });
      await writeBundle(outputDir, failure.files);
    }
    console.error(error?.message || String(error));
    process.exitCode = 1;
  }
}

await run();
