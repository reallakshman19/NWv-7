import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyProductionWranglerText } from './verify_daily_digest_activation_config.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..');
const PACKAGE_DIR = path.join(REPO_ROOT, 'cloudflare', 'daily-digest-api');
const TEMPLATE_PATH = path.join(PACKAGE_DIR, 'wrangler.production.toml.example');
const TARGET_PATH = path.join(PACKAGE_DIR, 'wrangler.production.toml');
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function readDatabaseId(argv = process.argv.slice(2), env = process.env) {
  return String(argv.find(arg => !arg.startsWith('--')) || env.DAILY_DIGEST_D1_DATABASE_ID || '').trim();
}

function shouldForce(argv = process.argv.slice(2)) {
  return argv.includes('--force');
}

export function prepareProductionConfig({ databaseId, force = false } = {}) {
  const id = String(databaseId || '').trim();
  if (!UUID_PATTERN.test(id)) return { ok: false, error: 'A UUID-shaped D1 database ID is required.' };
  if (!fs.existsSync(TEMPLATE_PATH)) return { ok: false, error: 'Production Wrangler template is missing.' };
  if (fs.existsSync(TARGET_PATH) && !force) return { ok: false, error: 'Local production config already exists; use --force to replace it.' };

  const template = fs.readFileSync(TEMPLATE_PATH, 'utf8');
  const content = template.replace('<D1_DATABASE_ID>', id);
  const verified = verifyProductionWranglerText(content);
  if (!verified.ok) return { ok: false, error: `Generated config failed preflight: ${verified.errors.join(', ')}` };

  fs.writeFileSync(TARGET_PATH, content, { encoding: 'utf8', mode: 0o600 });
  return { ok: true, path: path.relative(REPO_ROOT, TARGET_PATH) };
}

export function runPrepare({ argv = process.argv.slice(2), env = process.env } = {}) {
  const result = prepareProductionConfig({ databaseId: readDatabaseId(argv, env), force: shouldForce(argv) });
  if (!result.ok) {
    console.error('Daily Digest production config preparation: FAIL');
    console.error(result.error);
    return 1;
  }
  console.log('Daily Digest production config preparation: PASS');
  console.log(`Created: ${result.path}`);
  console.log('D1 database ID: configured but intentionally not printed');
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exitCode = runPrepare();
}

export { TARGET_PATH, TEMPLATE_PATH, readDatabaseId, shouldForce };
