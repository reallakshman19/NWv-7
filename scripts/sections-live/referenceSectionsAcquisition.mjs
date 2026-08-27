#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSectionsSourceRegistryAuthority } from '../top-stories-shadow/sectionsShadowSourceRegistry.mjs';
import { acquireLiveLane, buildLiveLaneDefinitions } from './sectionsLiveAuthority.mjs';
import { buildSectionsLiveEvidence, compactSectionsLiveEvidence } from './sectionsLiveEvidence.mjs';

const SCRIPT_DIR = fileURLToPath(new URL('.', import.meta.url));
const DEFAULT_REGISTRY = resolve(SCRIPT_DIR, '../../config/section_sources.json');

function parseArgs(argv) {
  const args = { registry: DEFAULT_REGISTRY, output: null, nowMs: Date.now(), concurrency: 6 };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--registry') args.registry = resolve(argv[++index]);
    else if (value === '--output') args.output = resolve(argv[++index]);
    else if (value === '--now-ms') args.nowMs = Number(argv[++index]);
    else if (value === '--concurrency') args.concurrency = Number(argv[++index]);
    else if (value === '--help') args.help = true;
    else throw new Error(`Unknown argument: ${value}`);
  }
  if (!Number.isFinite(args.nowMs) || args.nowMs < 0) throw new Error('--now-ms must be non-negative');
  if (!Number.isInteger(args.concurrency) || args.concurrency < 1 || args.concurrency > 12) {
    throw new Error('--concurrency must be an integer from 1 to 12');
  }
  return args;
}

async function mapWithConcurrency(items, concurrency, task) {
  const output = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const index = next++;
      output[index] = await task(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return output;
}

export async function runReferenceSectionsAcquisition(options = {}) {
  const registryPath = options.registry || DEFAULT_REGISTRY;
  const registry = JSON.parse(await readFile(registryPath, 'utf8'));
  const authority = buildSectionsSourceRegistryAuthority(registry);
  const lanes = buildLiveLaneDefinitions(authority);
  const nowMs = Number(options.nowMs ?? Date.now());
  const laneResults = await mapWithConcurrency(
    lanes,
    Number(options.concurrency || 6),
    lane => acquireLiveLane(lane, { nowMs, fetchImpl: options.fetchImpl || globalThis.fetch }),
  );
  return compactSectionsLiveEvidence(buildSectionsLiveEvidence({
    laneResults,
    nowMs,
    sourceRegistryVersion: authority.sourceRegistryVersion,
    sourceRegistryDigest: authority.sourceRegistryDigest,
  }));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(
      'Usage: node referenceSectionsAcquisition.mjs [--output FILE] [--now-ms MS] [--concurrency 1..12]\n',
    );
    return;
  }
  const evidence = await runReferenceSectionsAcquisition(args);
  const serialized = `${JSON.stringify(evidence, null, 2)}\n`;
  if (args.output) await writeFile(args.output, serialized, 'utf8');
  else process.stdout.write(serialized);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    process.stderr.write(`${error?.stack || error}\n`);
    process.exitCode = 1;
  });
}
