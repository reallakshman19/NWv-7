import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { discoverTopStoriesArtifactDirectories, readTopStoriesArtifactDirectory } from './top-stories-shadow/artifactReader.mjs';
import { serializeTopStoriesDailyReport } from './top-stories-shadow/dailyAggregation.mjs';
import { aggregateTopStoriesDailyEvidence } from './top-stories-shadow/dailyEvidenceAggregation.mjs';
import { renderTopStoriesDailyMarkdown } from './top-stories-shadow/dailyReportMarkdown.mjs';
import { sha256Text, stableJson } from './top-stories-shadow/canonicalJson.mjs';
import { validateTopStoriesStudyConfig } from './top-stories-shadow/studyConfig.mjs';

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = String(argv[index] || '').replace(/^--/, '');
    const value = argv[index + 1];
    if (!key || value === undefined) throw new Error(`Invalid CLI argument near ${argv[index]}`);
    args[key] = value;
  }
  ['input', 'output', 'config', 'date'].forEach(key => {
    if (!args[key]) throw new Error(`Missing required --${key}`);
  });
  return args;
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

function describe(name, text) {
  return { name, byteSize: Buffer.byteLength(text, 'utf8'), sha256: sha256Text(text) };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const studyConfig = validateTopStoriesStudyConfig(await readJson(args.config), {
    nowMs: Date.now(),
  });
  const directories = await discoverTopStoriesArtifactDirectories(args.input);
  const records = [];
  for (const directory of directories) {
    records.push(await readTopStoriesArtifactDirectory(directory));
  }
  const { report } = aggregateTopStoriesDailyEvidence(records, {
    date: args.date,
    studyConfig,
  });
  const jsonText = serializeTopStoriesDailyReport(report);
  const markdownText = `${renderTopStoriesDailyMarkdown(report)}\n`;
  const files = { 'daily_report.json': jsonText, 'daily_report.md': markdownText };
  const manifest = {
    schemaVersion: 'nw-top-stories-shadow-aggregation-manifest/v1',
    studyId: studyConfig.studyId,
    date: args.date,
    deterministicReplay: true,
    sourceDirectoryCount: directories.length,
    files: Object.entries(files)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([name, text]) => describe(name, text)),
  };
  files['aggregation_manifest.json'] = `${stableJson(manifest)}\n`;
  await mkdir(args.output, { recursive: true });
  await Promise.all(Object.entries(files).map(([name, text]) =>
    writeFile(path.join(args.output, name), text, 'utf8')));
  console.log(JSON.stringify({
    status: report.status,
    successfulRuns: report.coverage.successfulRuns,
  }));
}

await main();
