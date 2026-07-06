import { spawn } from 'node:child_process';

const nodeBin = process.execPath;

function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    requireConfig: false,
    smoke: false,
    help: false,
  };

  for (const arg of argv) {
    if (arg === '--require-config') {
      options.requireConfig = true;
    } else if (arg === '--smoke') {
      options.smoke = true;
    } else if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function printUsage() {
  console.log('Usage: node scripts/check_up_ahead_edge_readiness.mjs [--require-config] [--smoke]');
  console.log('');
  console.log('Default mode is no-network readiness:');
  console.log('  node scripts/verify_up_ahead_edge_activation_config.mjs --allow-empty');
  console.log('  node scripts/run_up_ahead_edge_api_tests.mjs');
  console.log('');
  console.log('--require-config  Fail if no Worker base URL is configured.');
  console.log('--smoke           Opt into the activation verifier smoke path. Not used by default.');
}

function buildActivationArgs(options) {
  const args = ['scripts/verify_up_ahead_edge_activation_config.mjs'];

  if (!options.requireConfig) {
    args.push('--allow-empty');
  }

  if (options.smoke) {
    args.push('--smoke');
  }

  return args;
}

function buildReadinessCommands(options) {
  return [
    {
      label: 'Activation config readiness',
      command: nodeBin,
      args: buildActivationArgs(options),
      display: `node ${buildActivationArgs(options).join(' ')}`,
    },
    {
      label: 'Edge API/Data Health certification pack',
      command: nodeBin,
      args: ['scripts/run_up_ahead_edge_api_tests.mjs'],
      display: 'node scripts/run_up_ahead_edge_api_tests.mjs',
    },
  ];
}

function runCommand(entry) {
  return new Promise(resolve => {
    console.log(`[Up Ahead edge readiness] ${entry.label}`);
    console.log(`$ ${entry.display}`);

    const child = spawn(entry.command, entry.args, {
      stdio: 'inherit',
      shell: false,
      env: process.env,
    });

    child.on('error', error => {
      console.error(`[Up Ahead edge readiness] FAIL: ${entry.display}`);
      console.error(error?.message || String(error));
      resolve(1);
    });

    child.on('close', code => {
      if (code === 0) {
        resolve(0);
        return;
      }
      console.error(`[Up Ahead edge readiness] FAIL: ${entry.display}`);
      resolve(code || 1);
    });
  });
}

export async function runUpAheadEdgeReadiness({ argv = process.argv.slice(2) } = {}) {
  const options = parseArgs(argv);

  if (options.help) {
    printUsage();
    return 0;
  }

  for (const entry of buildReadinessCommands(options)) {
    const code = await runCommand(entry);
    if (code !== 0) return code;
  }

  console.log('[Up Ahead edge readiness] PASS');
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runUpAheadEdgeReadiness().then(code => {
    process.exitCode = code;
  }).catch(error => {
    console.error('[Up Ahead edge readiness] FAIL');
    console.error(error?.message || String(error));
    process.exitCode = 1;
  });
}

export { parseArgs, buildActivationArgs, buildReadinessCommands };
