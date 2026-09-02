import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const TRACKED_CONFIG = path.join(ROOT, 'wrangler.jsonc');
const LOCAL_CONFIG = path.join(ROOT, 'wrangler.local.jsonc');
const DB_NAME = 'nw-sections-shadow';
const WORKER_ORIGIN = 'https://nw-sections-shadow.reallaksh19.workers.dev';
const D1_PLACEHOLDER = 'REPLACE_WITH_D1_DATABASE_ID';
const MAX_PREVIEW_AGE_MS = 150 * 60 * 1000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const NO_AUTO_CREATE = '--experimental-auto-create=false';
const NO_PROVISION = '--experimental-provision=false';

function bin(name) {
  return process.platform === 'win32' ? `${name}.cmd` : name;
}

function localWranglerBin() {
  return path.join(ROOT, 'node_modules', '.bin', bin('wrangler'));
}

function commandFailure(command, result) {
  const output = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
  const suffix = output ? `\n${output}` : '';
  return new Error(`${command} failed with exit code ${result.status}${suffix}`);
}

export function runCommand(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || ROOT,
    encoding: 'utf8',
    env: { ...process.env, NO_COLOR: '1' },
    shell: false,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw commandFailure(command, result);
  return String(result.stdout || '').trim();
}

function wrangler(args, options = {}) {
  const executable = localWranglerBin();
  if (!existsSync(executable)) {
    throw new Error('Wrangler is not installed. Run npm ci in cloudflare/sections-shadow first.');
  }
  return runCommand(executable, [...args, NO_AUTO_CREATE, NO_PROVISION], options);
}

function parseJsonOutput(text) {
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf('[');
    const end = text.lastIndexOf(']');
    if (start < 0 || end <= start) throw new Error('Wrangler did not return parseable JSON');
    return JSON.parse(text.slice(start, end + 1));
  }
}

export function selectExistingDatabase(rows, databaseName = DB_NAME) {
  const matches = Array.isArray(rows) ? rows.filter(row => row?.name === databaseName) : [];
  if (matches.length !== 1) {
    throw new Error(`Expected exactly one existing D1 database named ${databaseName}; found ${matches.length}`);
  }
  const id = String(matches[0]?.uuid || matches[0]?.id || matches[0]?.database_id || '');
  if (!UUID_RE.test(id)) throw new Error(`Existing ${databaseName} D1 database has an invalid UUID`);
  return id;
}

export function verifyTrackedAuthority(config) {
  const vars = config?.vars || {};
  const database = config?.d1_databases?.[0];
  const producer = config?.queues?.producers?.[0];
  const consumer = config?.queues?.consumers?.[0];
  const cron = config?.triggers?.crons?.[0];
  const assertions = [
    [config?.name === 'nw-sections-shadow', 'unexpected Worker name'],
    [cron === '0 * * * *', 'unexpected Cron schedule'],
    [vars.SHADOW_MODE === 'S1_GITHUB_PRIMARY_CF_SHADOW', 'unexpected authority mode'],
    [vars.SHADOW_SCHEDULE_ENABLED === 'true', 'schedule must be enabled'],
    [vars.SHADOW_LIVE_ACQUISITION_ENABLED === 'true', 'live acquisition must be enabled'],
    [vars.SHADOW_BROWSER_FALLBACK_ENABLED === 'false', 'Browser fallback must remain disabled'],
    [vars.SHADOW_PREVIEW_READ_ENABLED === 'true', 'Preview reads must be enabled'],
    [config?.browser?.binding === 'SHADOW_BROWSER', 'unexpected Browser binding'],
    [database?.binding === 'SHADOW_DB', 'unexpected D1 binding'],
    [database?.database_name === DB_NAME, 'unexpected D1 database name'],
    [database?.database_id === D1_PLACEHOLDER, 'tracked D1 placeholder changed'],
    [producer?.binding === 'SHADOW_QUEUE', 'unexpected Queue producer binding'],
    [producer?.queue === 'nw-sections-shadow', 'unexpected Queue producer name'],
    [consumer?.queue === 'nw-sections-shadow', 'unexpected Queue consumer name'],
    [consumer?.dead_letter_queue === 'nw-sections-shadow-dlq', 'unexpected dead-letter Queue'],
  ];
  const failed = assertions.find(([passed]) => !passed);
  if (failed) throw new Error(`Tracked authority check failed: ${failed[1]}`);
}

async function prepareLocalConfig(force = false) {
  const trackedText = await readFile(TRACKED_CONFIG, 'utf8');
  const tracked = JSON.parse(trackedText);
  verifyTrackedAuthority(tracked);
  if (existsSync(LOCAL_CONFIG) && !force) {
    throw new Error('wrangler.local.jsonc already exists; use --force only when intentionally rebuilding it');
  }

  const scratch = await mkdtemp(path.join(os.tmpdir(), 'nw-sections-shadow-'));
  try {
    wrangler(['whoami', '--cwd', scratch], { cwd: scratch });
    const rows = parseJsonOutput(wrangler(['d1', 'list', '--json', '--cwd', scratch], { cwd: scratch }));
    const databaseId = selectExistingDatabase(rows);
    const localText = trackedText.replace(D1_PLACEHOLDER, databaseId);
    if (localText === trackedText) throw new Error('D1 placeholder replacement did not occur');
    await writeFile(LOCAL_CONFIG, localText, { encoding: 'utf8', mode: 0o600 });
    await chmod(LOCAL_CONFIG, 0o600).catch(() => undefined);
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }

  runCommand('git', ['check-ignore', '--quiet', 'wrangler.local.jsonc']);
  console.log('Activation config: PASS (existing D1 bound; UUID intentionally not printed)');
}

function verifyNoPendingMigrations() {
  const output = wrangler([
    'd1', 'migrations', 'list', DB_NAME,
    '--remote', '-c', LOCAL_CONFIG,
  ]);
  const pending = output.match(/\b\d{4}[^\s]*\.sql\b/g) || [];
  if (pending.length > 0) {
    throw new Error(`Remote D1 has unapplied migrations: ${pending.join(', ')}`);
  }
  console.log('Remote D1 migrations: PASS (none pending)');
}

function runPackageCheck() {
  runCommand(bin('npm'), ['run', 'check']);
  console.log('Package certification: PASS');
}

function deployWorker() {
  wrangler(['deploy', '-c', LOCAL_CONFIG]);
  console.log('Worker deploy: PASS');
}

async function fetchJson(pathname) {
  const response = await fetch(`${WORKER_ORIGIN}${pathname}`, {
    cache: 'no-store',
    signal: AbortSignal.timeout(15_000),
    headers: { 'cache-control': 'no-cache' },
  });
  let body = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  if (!response.ok || !body) throw new Error(`${pathname} returned HTTP ${response.status}`);
  return { response, body };
}

export function verifyHealth(body) {
  const expected = {
    mode: 'S1_GITHUB_PRIMARY_CF_SHADOW',
    servingAuthority: 'github_static',
    cloudflareBrowserServingAuthority: false,
    previewReadEnabled: true,
    shadowScheduleEnabled: true,
    liveAcquisitionEnabled: true,
    browserFallbackEnabled: false,
    sourceLaneCount: 41,
    writeSurface: 'queue_only',
  };
  for (const [key, value] of Object.entries(expected)) {
    if (body?.[key] !== value) throw new Error(`/health contract mismatch for ${key}`);
  }
}

export function verifyPreview(body, nowMs = Date.now()) {
  const fetchedAt = Number(body?.fetchedAt || 0);
  const epochId = String(body?.preview?.epochId || '');
  const sections = body?.sections && typeof body.sections === 'object' ? body.sections : {};
  const totalStories = Object.values(sections).reduce(
    (sum, stories) => sum + (Array.isArray(stories) ? stories.length : 0), 0,
  );
  if (body?.schemaVersion !== 2) throw new Error('Preview schemaVersion must be 2');
  if (body?.preview?.evidenceVerified !== true) throw new Error('Preview evidence is not verified');
  if (body?.preview?.servingAuthority !== 'github_static') throw new Error('Preview authority drift detected');
  if (!epochId.startsWith('live-')) throw new Error('Preview is not backed by an independent live epoch');
  if (!Number.isFinite(fetchedAt) || fetchedAt <= 0) throw new Error('Preview fetchedAt is invalid');
  const ageMs = nowMs - fetchedAt;
  if (ageMs < 0 || ageMs > MAX_PREVIEW_AGE_MS) {
    throw new Error(`Committed live epoch is too old: ${Math.round(ageMs / 60_000)} minutes`);
  }
  if (totalStories < 1) throw new Error('Committed live epoch contains no renderable stories');
  return { epochId, ageMinutes: Math.round(ageMs / 60_000), totalStories };
}

async function smokeProduction() {
  const health = await fetchJson('/health');
  verifyHealth(health.body);
  const preview = await fetchJson('/preview/sections/latest');
  if (preview.response.headers.get('x-nw-data-source') !== 'cloudflare-preview') {
    throw new Error('Preview response is missing x-nw-data-source=cloudflare-preview');
  }
  const summary = verifyPreview(preview.body);
  console.log(`Production smoke: PASS (${summary.epochId}, ${summary.ageMinutes}m old, ${summary.totalStories} stories)`);
}

function parseMode(argv) {
  return {
    force: argv.includes('--force'),
    prepareOnly: argv.includes('--prepare-only'),
    smokeOnly: argv.includes('--smoke-only'),
  };
}

async function main() {
  const mode = parseMode(process.argv.slice(2));
  if (mode.smokeOnly) {
    await smokeProduction();
    return;
  }
  await prepareLocalConfig(mode.force);
  verifyNoPendingMigrations();
  if (mode.prepareOnly) return;
  runPackageCheck();
  deployWorker();
  await smokeProduction();
}

if (path.resolve(process.argv[1] || '') === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error(`Production activation: FAIL\n${error?.message || String(error)}`);
    process.exitCode = 1;
  });
}
