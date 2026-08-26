#!/usr/bin/env node
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { classifySectionsLiveParity, summarizeSectionsLiveParity } from './sectionsLiveParity.mjs';

const execute = promisify(execFile);
const SCRIPT_DIR = fileURLToPath(new URL('.', import.meta.url));
const DEFAULT_CONFIG = resolve(SCRIPT_DIR, '../../cloudflare/sections-shadow/wrangler.local.jsonc');
const WRANGLER_BIN = resolve(SCRIPT_DIR, '../../cloudflare/sections-shadow/node_modules/wrangler/bin/wrangler.js');

function parseArgs(argv) {
  const args = { reference: null, epochId: null, output: null, config: DEFAULT_CONFIG };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--reference') args.reference = resolve(argv[++index]);
    else if (argv[index] === '--epoch-id') args.epochId = argv[++index];
    else if (argv[index] === '--output') args.output = resolve(argv[++index]);
    else if (argv[index] === '--config') args.config = resolve(argv[++index]);
    else throw new Error(`Unknown argument: ${argv[index]}`);
  }
  if (!args.reference || !args.epochId) throw new Error('--reference and --epoch-id are required');
  if (!/^[a-z0-9:-]+$/i.test(args.epochId)) throw new Error('--epoch-id contains unsupported characters');
  return args;
}

async function readRemoteEvidence(args) {
  const sql = `SELECT o.content_json, o.object_digest, e.state
    FROM sections_shadow_evidence_objects o
    JOIN sections_shadow_epochs e ON e.epoch_id = o.epoch_id
    WHERE o.epoch_id = '${args.epochId}'`;
  const { stdout } = await execute(process.execPath, [
    WRANGLER_BIN, 'd1', 'execute', 'nw-sections-shadow', '--remote',
    '-c', args.config, '--command', sql, '--json',
  ], {
    cwd: resolve(SCRIPT_DIR, '../../cloudflare/sections-shadow'),
    env: { ...process.env, NO_COLOR: '1' },
    maxBuffer: 5_000_000,
  });
  const response = JSON.parse(stdout);
  const row = response?.[0]?.results?.[0];
  if (!row || row.state !== 'SHADOW_COMMITTED') {
    throw new Error(`Remote epoch ${args.epochId} is not committed or has no evidence`);
  }
  const actualDigest = createHash('sha256').update(row.content_json).digest('hex');
  if (actualDigest !== row.object_digest) throw new Error('Remote D1 evidence digest verification failed');
  return JSON.parse(row.content_json);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const [reference, shadow] = await Promise.all([
    readFile(args.reference, 'utf8').then(JSON.parse),
    readRemoteEvidence(args),
  ]);
  const parity = classifySectionsLiveParity(reference, shadow);
  const report = {
    schemaVersion: 'nw-sections-live-parity-report/v1',
    referenceNowMs: reference.nowMs,
    shadowNowMs: shadow.nowMs,
    shadowEpochId: args.epochId,
    shadowEvidenceVerified: true,
    metrics: summarizeSectionsLiveParity(reference, shadow),
    ...parity,
  };
  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  if (args.output) await writeFile(args.output, serialized, 'utf8');
  else process.stdout.write(serialized);
  if (parity.classification === 'UNKNOWN_DRIFT' || parity.classification === 'INFRASTRUCTURE_DRIFT') {
    process.exitCode = 2;
  }
}

main().catch(error => {
  process.stderr.write(`${error?.stack || error}\n`);
  process.exitCode = 1;
});
