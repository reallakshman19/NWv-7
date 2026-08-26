#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { classifySectionsLiveParity } from './sectionsLiveParity.mjs';

function parseArgs(argv) {
  const args = { reference: null, shadow: null, output: null };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--reference') args.reference = resolve(argv[++index]);
    else if (argv[index] === '--shadow') args.shadow = resolve(argv[++index]);
    else if (argv[index] === '--output') args.output = resolve(argv[++index]);
    else throw new Error(`Unknown argument: ${argv[index]}`);
  }
  if (!args.reference || !args.shadow) throw new Error('--reference and --shadow are required');
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const [reference, shadow] = await Promise.all([
    readFile(args.reference, 'utf8').then(JSON.parse),
    readFile(args.shadow, 'utf8').then(JSON.parse),
  ]);
  const report = classifySectionsLiveParity(reference, shadow);
  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  if (args.output) await writeFile(args.output, serialized, 'utf8');
  else process.stdout.write(serialized);
  if (report.classification === 'UNKNOWN_DRIFT' || report.classification === 'INFRASTRUCTURE_DRIFT') {
    process.exitCode = 2;
  }
}

main().catch(error => {
  process.stderr.write(`${error?.stack || error}\n`);
  process.exitCode = 1;
});
