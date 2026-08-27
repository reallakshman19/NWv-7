#!/usr/bin/env node
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { qualifySectionsShadow } from './sectionsShadowQualification.mjs';

function parseArgs(argv) {
  const args = { inputDir: null, output: null };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--input-dir') args.inputDir = resolve(argv[++index]);
    else if (argv[index] === '--output') args.output = resolve(argv[++index]);
    else if (argv[index] === '--help') args.help = true;
    else throw new Error(`Unknown argument: ${argv[index]}`);
  }
  if (!args.help && !args.inputDir) throw new Error('--input-dir is required');
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write('Usage: node qualifySectionsShadow.mjs --input-dir DIR [--output FILE]\n');
    return;
  }
  const files = (await readdir(args.inputDir, { withFileTypes: true }))
    .filter(entry => entry.isFile() && entry.name.endsWith('.json'))
    .map(entry => resolve(args.inputDir, entry.name))
    .sort();
  const reports = [];
  for (const file of files) {
    const value = JSON.parse(await readFile(file, 'utf8'));
    if (value.schemaVersion !== 'nw-sections-live-parity-report/v1') {
      throw new Error(`${file} is not a Sections live parity report`);
    }
    reports.push(value);
  }
  const result = qualifySectionsShadow(reports);
  const serialized = `${JSON.stringify(result, null, 2)}\n`;
  if (args.output) await writeFile(args.output, serialized, 'utf8');
  else process.stdout.write(serialized);
  if (result.status !== 'QUALIFIED') process.exitCode = 2;
}

main().catch(error => {
  process.stderr.write(`${error?.stack || error}\n`);
  process.exitCode = 1;
});
