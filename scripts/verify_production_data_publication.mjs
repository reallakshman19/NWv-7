import process from 'process';
import { PRODUCTION_DATA_DOMAINS, verifyPublishedParity } from './production_data_recovery.mjs';

function parseArgs(argv) {
  let domains = Object.keys(PRODUCTION_DATA_DOMAINS);
  let enforceFreshness = false;
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--fresh') enforceFreshness = true;
    else if (argv[i] === '--domain' || argv[i] === '--domains') {
      domains = String(argv[++i] || '').split(',').map(v => v.trim()).filter(Boolean);
    } else throw new Error(`unknown argument: ${argv[i]}`);
  }
  return { domains, enforceFreshness };
}

try {
  const options = parseArgs(process.argv.slice(2));
  const results = verifyPublishedParity({ repoRoot: process.cwd(), ...options });
  console.log(JSON.stringify({ status: 'PASS', ...options, results }, null, 2));
} catch (error) {
  console.error(error?.stack || error);
  process.exit(1);
}
