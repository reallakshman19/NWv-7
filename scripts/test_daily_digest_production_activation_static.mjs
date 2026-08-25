import fs from 'node:fs';

const prod = fs.readFileSync('cloudflare/daily-digest-api/wrangler.production.toml.example', 'utf8');
const runbook = fs.readFileSync('cloudflare/daily-digest-api/DEPLOYMENT.md', 'utf8');
const worker = fs.readFileSync('cloudflare/daily-digest-api/src/index.js', 'utf8');
const verifier = fs.readFileSync('scripts/verify_daily_digest_activation_config.mjs', 'utf8');
const preparer = fs.readFileSync('scripts/prepare_daily_digest_production_config.mjs', 'utf8');
const gitignore = fs.readFileSync('.gitignore', 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(prod.includes('DAILY_DIGEST_PILOT_WRITE_ENABLED = "true"'), 'production writer flag must be enabled');
assert(prod.includes('[triggers]') && prod.includes('crons = ["45 4 * * *"]'), 'qualified cron missing');
assert(prod.includes('database_id = "<D1_DATABASE_ID>"'), 'production template must retain placeholder D1 ID');
assert(!prod.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i), 'real-looking D1 UUID must not be committed');
assert(gitignore.includes('cloudflare/daily-digest-api/wrangler.production.toml'), 'real production config must be gitignored');
assert(gitignore.includes('cloudflare/daily-digest-api/wrangler.toml'), 'local Worker config must be gitignored');
assert(verifier.includes('d1_id_invalid_or_placeholder'), 'activation verifier must reject placeholder/invalid D1 IDs');
assert(verifier.includes('DAILY_DIGEST_WRANGLER_CONFIG'), 'activation verifier must accept explicit local config');
assert(preparer.includes('D1 database ID: configured but intentionally not printed'), 'config preparer must not print the D1 ID');
assert(preparer.includes('mode: 0o600'), 'config preparer must request restrictive local file permissions');
assert(runbook.includes('migrations apply daily-digest --remote'), 'remote D1 migration command missing');
assert(runbook.includes('npx wrangler deploy'), 'deploy command missing');
assert(runbook.includes('--config cloudflare/daily-digest-api/wrangler.production.toml'), 'production config path missing from runbook');
assert(runbook.includes('crons = []'), 'rollback cron disable instruction missing');
assert(worker.includes("env.DAILY_DIGEST_PILOT_WRITE_ENABLED !== 'true'"), 'worker fail-closed dispatch guard missing');
assert(!worker.includes("request.method === 'POST'"), 'browser write route must remain absent');

console.log('Daily Digest production activation static guard: PASS');
