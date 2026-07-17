import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { buildTopStoriesPilotDecisionPack } from './top-stories-shadow/pilotDecisionPack.mjs';
import { renderTopStoriesPilotRollupMarkdown } from './top-stories-shadow/pilotRollupMarkdown.mjs';
import { sha256Text, stableJson } from './top-stories-shadow/canonicalJson.mjs';

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = String(argv[index] || '').replace(/^--/, '');
    const value = argv[index + 1];
    if (!key || value === undefined) throw new Error(`Invalid CLI argument near ${argv[index]}`);
    args[key] = value;
  }
  ['input', 'output', 'config'].forEach(key => {
    if (!args[key]) throw new Error(`Missing required --${key}`);
  });
  for (const key of ['start-date', 'end-date']) {
    if (args[key] && !/^\d{4}-\d{2}-\d{2}$/.test(args[key])) {
      throw new Error(`--${key} must use YYYY-MM-DD`);
    }
  }
  if (args['start-date'] && args['end-date'] && args['start-date'] > args['end-date']) {
    throw new Error('--start-date cannot be after --end-date');
  }
  return args;
}

async function walk(root) {
  const entries = await readdir(root, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...await walk(full));
    else files.push(full);
  }
  return files.sort();
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

function descriptor(name, text) {
  return {
    name,
    byteSize: Buffer.byteLength(text, 'utf8'),
    sha256: sha256Text(text),
  };
}

function dateIncluded(date, startDate, endDate) {
  if (!date) return false;
  if (startDate && date < startDate) return false;
  if (endDate && date > endDate) return false;
  return true;
}

async function discoverInputs(root, bounds = {}) {
  const files = await walk(root);
  const dailyPaths = files.filter(file => path.basename(file) === 'daily_report.json');
  const validationPaths = files.filter(file => path.basename(file) === 'operational_validation.json');
  const daily = await Promise.all(dailyPaths.map(async file => ({ file, value: await readJson(file) })));
  const validation = await Promise.all(validationPaths.map(async file => ({ file, value: await readJson(file) })));
  const dates = [...new Set([
    ...daily.map(row => row.value?.date),
    ...validation.map(row => row.value?.date),
  ].filter(date => dateIncluded(date, bounds.startDate, bounds.endDate)))].sort();
  const entries = [];
  const inputManifest = [];
  for (const date of dates) {
    const dailyRows = daily.filter(row => row.value?.date === date);
    const validationRows = validation.filter(row => row.value?.date === date);
    if (!dailyRows.length || !validationRows.length) {
      inputManifest.push({
        date,
        status: 'EXCLUDED',
        reasonCodes: [
          !dailyRows.length ? 'missing_daily_report' : null,
          !validationRows.length ? 'missing_operational_validation' : null,
        ].filter(Boolean),
        dailyPaths: dailyRows.map(row => row.file),
        validationPaths: validationRows.map(row => row.file),
      });
      continue;
    }
    for (const dailyRow of dailyRows) {
      for (const validationRow of validationRows) {
        entries.push({
          sourceId: `${dailyRow.file}|${validationRow.file}`,
          dailyReport: dailyRow.value,
          operationalValidation: validationRow.value,
        });
      }
    }
    inputManifest.push({
      date,
      status: 'CANDIDATE',
      reasonCodes: [],
      dailyPaths: dailyRows.map(row => row.file),
      validationPaths: validationRows.map(row => row.file),
    });
  }
  return { entries, inputManifest, discoveredFiles: files };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const studyConfig = await readJson(args.config);
  const discovered = await discoverInputs(args.input, {
    startDate: args['start-date'],
    endDate: args['end-date'],
  });
  const rollup = buildTopStoriesPilotDecisionPack(discovered.entries, { studyConfig });
  const jsonText = `${stableJson(rollup)}\n`;
  const markdownText = `${renderTopStoriesPilotRollupMarkdown(rollup)}\n`;
  const files = {
    'pilot_rollup.json': jsonText,
    'pilot_rollup.md': markdownText,
  };
  const manifest = {
    schemaVersion: 'nw-top-stories-pilot-manifest/v1',
    studyId: studyConfig.studyId,
    decision: rollup.decision,
    deterministicReplay: true,
    requestedRange: {
      startDate: args['start-date'] || null,
      endDate: args['end-date'] || null,
    },
    discoveredFileCount: discovered.discoveredFiles.length,
    inputManifest: discovered.inputManifest,
    files: Object.entries(files)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([name, text]) => descriptor(name, text)),
  };
  files['pilot_manifest.json'] = `${stableJson(manifest)}\n`;
  await mkdir(args.output, { recursive: true });
  await Promise.all(Object.entries(files).map(([name, text]) =>
    writeFile(path.join(args.output, name), text, 'utf8')));
  console.log(JSON.stringify({
    decision: rollup.decision,
    suppliedDays: rollup.dayCounts.supplied,
    usableDays: rollup.dayCounts.usable,
  }));
}

await main();
