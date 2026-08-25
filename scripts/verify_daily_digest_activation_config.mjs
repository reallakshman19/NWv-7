import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ENDPOINT_PATH = '/api/datasets/dailyDigest';
const REQUIRED_CRON = '45 4 * * *';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PLACEHOLDERS = ['<D1_DATABASE_ID>', '00000000-0000-0000-0000-000000000000'];

export function verifyDailyDigestBaseUrl(input) {
  const raw = String(input || '').trim();
  if (!raw) return { ok: false, error: 'Daily Digest API base URL is required.' };
  let parsed;
  try { parsed = new URL(raw); } catch { return { ok: false, error: `Invalid URL: ${raw}` }; }
  if (parsed.protocol !== 'https:') return { ok: false, error: 'Production URL must use https.' };
  if (parsed.search || parsed.hash) return { ok: false, error: 'Base URL must not include query or hash.' };
  if (parsed.pathname.includes(ENDPOINT_PATH)) return { ok: false, error: `Base URL must not include ${ENDPOINT_PATH}.` };
  const urlPath = parsed.pathname === '/' ? '' : parsed.pathname.replace(/\/+$/, '');
  const baseUrl = `${parsed.origin}${urlPath}`;
  return { ok: true, baseUrl, endpointUrl: `${baseUrl}${ENDPOINT_PATH}` };
}

function extractDatabaseId(source) {
  const match = String(source || '').match(/database_id\s*=\s*"([^"]+)"/);
  return match?.[1] || '';
}

export function verifyProductionWranglerText(text) {
  const source = String(text || '');
  const errors = [];
  const databaseId = extractDatabaseId(source);
  if (!source.includes('DAILY_DIGEST_PILOT_WRITE_ENABLED = "true"')) errors.push('writer_not_enabled');
  if (!source.includes('[triggers]') || !source.includes(`crons = ["${REQUIRED_CRON}"]`)) errors.push('cron_not_qualified');
  if (!source.includes('binding = "DB"')) errors.push('d1_binding_missing');
  if (!source.includes('database_name = "daily-digest"')) errors.push('d1_name_mismatch');
  if (!databaseId || PLACEHOLDERS.includes(databaseId) || !UUID_PATTERN.test(databaseId)) errors.push('d1_id_invalid_or_placeholder');
  return { ok: errors.length === 0, errors, databaseIdPresent: Boolean(databaseId) };
}

export function verifyProductionWranglerFile(configPath) {
  const config = String(configPath || '').trim();
  if (!config) return { ok: false, errors: ['config_path_required'] };
  try {
    return verifyProductionWranglerText(fs.readFileSync(config, 'utf8'));
  } catch {
    return { ok: false, errors: ['config_unreadable'] };
  }
}

function parseArgs(argv = process.argv.slice(2)) {
  const options = { configPath: '', baseUrl: '' };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--config') options.configPath = argv[++index] || '';
    else if (arg === '--url') options.baseUrl = argv[++index] || '';
    else if (!options.baseUrl) options.baseUrl = arg;
  }
  return options;
}

function print(label, result) {
  if (!result.ok) {
    console.error(`${label}: FAIL`);
    console.error((result.errors || [result.error]).join(', '));
    return 1;
  }
  console.log(`${label}: PASS`);
  if (result.endpointUrl) console.log(`Endpoint: ${result.endpointUrl}`);
  return 0;
}

function isMainModule(metaUrl = import.meta.url, argv1 = process.argv[1]) {
  if (!argv1) return false;
  return fileURLToPath(metaUrl) === path.resolve(argv1);
}

export function runActivationVerifier({ argv = process.argv.slice(2), env = process.env } = {}) {
  const options = parseArgs(argv);
  const configPath = options.configPath || env.DAILY_DIGEST_WRANGLER_CONFIG || '';
  const baseUrl = options.baseUrl || env.DAILY_DIGEST_API_BASE_URL || env.VITE_API_BASE_URL || '';
  if (!configPath && !baseUrl) {
    console.error('Daily Digest activation preflight: FAIL');
    console.error('Provide --config <local-wrangler.toml> and/or --url <worker-base-url>.');
    return 1;
  }
  let code = 0;
  if (configPath) code |= print('Daily Digest production config', verifyProductionWranglerFile(configPath));
  if (baseUrl) code |= print('Daily Digest API base URL', verifyDailyDigestBaseUrl(baseUrl));
  return code ? 1 : 0;
}

if (isMainModule()) {
  process.exitCode = runActivationVerifier();
}

export { ENDPOINT_PATH, REQUIRED_CRON, isMainModule, parseArgs };
