import { spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import process from 'process';
import {
  PRODUCTION_DATA_DOMAINS,
  publishSelectedDomains,
  validateDomainOutputs,
  verifyPublishedParity,
  writeProductionManifest,
} from './production_data_recovery.mjs';

const ROOT = process.cwd();
const DEFAULT_DOMAINS = ['news', 'market', 'weather', 'travel'];
const STAGE_INPUTS = ['scripts', 'src', 'config', 'public', 'package.json', 'package-lock.json', 'requirements.txt'];

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}

function parseArgs(argv) {
  const options = { domains: [...DEFAULT_DOMAINS], publish: false, keepStage: false, plan: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--publish') options.publish = true;
    else if (arg === '--keep-stage') options.keepStage = true;
    else if (arg === '--plan') options.plan = true;
    else if (arg === '--domain' || arg === '--domains') {
      const raw = argv[++i];
      if (!raw) fail(`${arg} requires a comma-separated value`);
      options.domains = raw.split(',').map(value => value.trim()).filter(Boolean);
    } else fail(`unknown argument: ${arg}`);
  }
  const unknown = options.domains.filter(domain => !PRODUCTION_DATA_DOMAINS[domain]);
  if (unknown.length) fail(`unknown domain(s): ${unknown.join(', ')}`);
  return options;
}

function copyStageInput(stageDir, input) {
  const source = path.join(ROOT, input);
  if (!fs.existsSync(source)) return;
  const target = path.join(stageDir, input);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.cpSync(source, target, { recursive: true, force: true });
}

function makeStage() {
  const stageDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nw-production-stage-'));
  for (const input of STAGE_INPUTS) copyStageInput(stageDir, input);
  return stageDir;
}

function run(stageDir, command, args, { env = {}, allowFailure = false } = {}) {
  console.log(`\n> ${command} ${args.join(' ')}`);
  const result = spawnSync(command, args, {
    cwd: stageDir,
    env: { ...process.env, ...env },
    encoding: 'utf8',
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0 && !allowFailure) {
    throw new Error(`command failed (${result.status}): ${command} ${args.join(' ')}`);
  }
  if (result.status !== 0) {
    console.warn(`WARN: non-gating command failed (${result.status}): ${command} ${args.join(' ')}`);
  }
}

function pythonBin() {
  return process.env.NW_PYTHON_BIN || (process.platform === 'win32' ? 'python' : 'python3');
}

function commandsFor(domain) {
  const py = pythonBin();
  if (domain === 'news') return [
    [py, ['scripts/fetch_insight_stories.py']],
    [py, ['scripts/validate_insight_prefetch_output.py'], { allowFailure: true }],
    [py, ['scripts/fetch_sections_stories.py']],
    [py, ['scripts/validate_sections_prefetch_output.py']],
    [py, ['scripts/validate_newsdata_freshness.py']],
  ];
  if (domain === 'market') return [
    [py, ['scripts/market_snapshot_worker.py']],
    [process.execPath, ['scripts/test_market_snapshot_integrity.mjs']],
  ];
  if (domain === 'weather') return [
    [py, ['scripts/weather_snapshot_worker.py']],
    [process.execPath, ['scripts/test_public_snapshot_freshness_static.mjs'], { env: { SNAPSHOT_FRESHNESS_FILES: 'weather_snapshot.json' } }],
  ];
  if (domain === 'travel') return ['chennai', 'trichy', 'muscat', 'colombo'].map(location => [
    process.execPath,
    ['scripts/collect_travel_local_news.mjs'],
    { env: { TRAVEL_LOCATION_KEY: location } },
  ]);
  return [];
}

function gitHead() {
  const result = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' });
  return result.status === 0 ? result.stdout.trim() : 'unknown';
}

function printPlan(domains) {
  console.log(JSON.stringify({
    mode: 'PLAN',
    domains,
    stageInputs: STAGE_INPUTS,
    domainOutputs: Object.fromEntries(domains.map(domain => [domain, PRODUCTION_DATA_DOMAINS[domain].outputs])),
    publishTargets: ['public/<output>', 'docs/<output>'],
  }, null, 2));
}

const options = parseArgs(process.argv.slice(2));
if (options.plan) {
  printPlan(options.domains);
  process.exit(0);
}

let stageDir = null;
try {
  stageDir = makeStage();
  console.log(`Staging production refresh in ${stageDir}`);
  const domainResults = [];

  for (const domain of options.domains) {
    console.log(`\n=== ${domain.toUpperCase()} ===`);
    for (const [command, args, commandOptions] of commandsFor(domain)) {
      run(stageDir, command, args, commandOptions);
    }
    domainResults.push(validateDomainOutputs({
      publicRoot: path.join(stageDir, 'public'),
      domain,
      enforceFreshness: true,
    }));
  }

  console.log('\nAll selected domains passed staging validation.');
  if (!options.publish) {
    console.log('Dry run complete. Re-run with --publish to update public/ and docs/.');
    process.exit(0);
  }

  const publishedFiles = publishSelectedDomains({
    stagePublicRoot: path.join(stageDir, 'public'),
    repoRoot: ROOT,
    domains: options.domains,
  });

  const parity = verifyPublishedParity({ repoRoot: ROOT, domains: options.domains, enforceFreshness: true });
  const manifest = writeProductionManifest({
    repoRoot: ROOT,
    sourceCommit: gitHead(),
    domains: options.domains,
    domainResults: parity,
    publishedFiles,
  });
  console.log(JSON.stringify({ status: 'PASS', manifest }, null, 2));
} catch (error) {
  console.error(error?.stack || error);
  process.exitCode = 1;
} finally {
  if (stageDir && !options.keepStage) fs.rmSync(stageDir, { recursive: true, force: true });
  else if (stageDir) console.log(`Stage preserved: ${stageDir}`);
}
