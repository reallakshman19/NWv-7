import { spawn } from 'node:child_process';

const nodeBin = process.execPath;
const npxBin = process.platform === 'win32' ? 'npx.cmd' : 'npx';

export const UP_AHEAD_EDGE_API_TEST_COMMANDS = [
  {
    label: 'Worker contract executable test',
    command: nodeBin,
    args: ['scripts/test_up_ahead_edge_worker_contract.mjs'],
    display: 'node scripts/test_up_ahead_edge_worker_contract.mjs',
  },
  {
    label: 'Worker contract static guard',
    command: nodeBin,
    args: ['scripts/test_up_ahead_edge_worker_contract_static.mjs'],
    display: 'node scripts/test_up_ahead_edge_worker_contract_static.mjs',
  },
  {
    label: 'CORS exposed headers static guard',
    command: nodeBin,
    args: ['scripts/test_up_ahead_edge_cors_exposed_headers_static.mjs'],
    display: 'node scripts/test_up_ahead_edge_cors_exposed_headers_static.mjs',
  },
  {
    label: 'Freshness diagnostics static guard',
    command: nodeBin,
    args: ['scripts/test_up_ahead_edge_freshness_diagnostics_static.mjs'],
    display: 'node scripts/test_up_ahead_edge_freshness_diagnostics_static.mjs',
  },
  {
    label: 'Source diagnostics static guard',
    command: nodeBin,
    args: ['scripts/test_up_ahead_edge_source_diagnostics_static.mjs'],
    display: 'node scripts/test_up_ahead_edge_source_diagnostics_static.mjs',
  },
  {
    label: 'Payload contract static guard',
    command: nodeBin,
    args: ['scripts/test_up_ahead_edge_payload_contract_static.mjs'],
    display: 'node scripts/test_up_ahead_edge_payload_contract_static.mjs',
  },
  {
    label: 'Smoke static guard',
    command: nodeBin,
    args: ['scripts/test_up_ahead_edge_smoke_static.mjs'],
    display: 'node scripts/test_up_ahead_edge_smoke_static.mjs',
  },
  {
    label: 'Dataset diagnostics static guard',
    command: nodeBin,
    args: ['scripts/test_up_ahead_edge_dataset_diagnostics_static.mjs'],
    display: 'node scripts/test_up_ahead_edge_dataset_diagnostics_static.mjs',
  },
  {
    label: 'Dataset API client/provider cert tests',
    command: npxBin,
    args: [
      'vitest',
      'run',
      '--config',
      'vitest.config.js',
      'src/data/datasets/upAheadDatasetApiClient.cert.test.js',
      'src/data/datasets/upAheadDataset.providerChain.cert.test.js',
    ],
    display: 'npx vitest run --config vitest.config.js src/data/datasets/upAheadDatasetApiClient.cert.test.js src/data/datasets/upAheadDataset.providerChain.cert.test.js',
  },
  {
    label: 'Data Health detail static guard',
    command: nodeBin,
    args: ['scripts/test_up_ahead_edge_data_health_static.mjs'],
    display: 'node scripts/test_up_ahead_edge_data_health_static.mjs',
  },
  {
    label: 'Data Health summary static guard',
    command: nodeBin,
    args: ['scripts/test_up_ahead_edge_data_health_summary_static.mjs'],
    display: 'node scripts/test_up_ahead_edge_data_health_summary_static.mjs',
  },
  {
    label: 'Data Health export static guard',
    command: nodeBin,
    args: ['scripts/test_up_ahead_edge_data_health_export_static.mjs'],
    display: 'node scripts/test_up_ahead_edge_data_health_export_static.mjs',
  },
  {
    label: 'DataHealthPanel cert test',
    command: npxBin,
    args: [
      'vitest',
      'run',
      '--config',
      'vitest.config.js',
      'src/components/DataHealthPanel.cert.test.jsx',
    ],
    display: 'npx vitest run --config vitest.config.js src/components/DataHealthPanel.cert.test.jsx',
  },
  {
    label: 'Readiness static guard',
    command: nodeBin,
    args: ['scripts/test_up_ahead_edge_readiness_static.mjs'],
    display: 'node scripts/test_up_ahead_edge_readiness_static.mjs',
  },
];

function runCommand(entry) {
  return new Promise(resolve => {
    console.log(`[Up Ahead edge pack] ${entry.label}`);
    console.log(`$ ${entry.display}`);

    const child = spawn(entry.command, entry.args, {
      stdio: 'inherit',
      shell: false,
      env: process.env,
    });

    child.on('error', error => {
      console.error(`[Up Ahead edge pack] FAIL: ${entry.display}`);
      console.error(error?.message || String(error));
      resolve(1);
    });

    child.on('close', code => {
      if (code === 0) {
        resolve(0);
        return;
      }
      console.error(`[Up Ahead edge pack] FAIL: ${entry.display}`);
      resolve(code || 1);
    });
  });
}

export async function runUpAheadEdgeApiTests(commands = UP_AHEAD_EDGE_API_TEST_COMMANDS) {
  for (const entry of commands) {
    const code = await runCommand(entry);
    if (code !== 0) return code;
  }

  console.log('[Up Ahead edge pack] PASS');
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runUpAheadEdgeApiTests().then(code => {
    process.exitCode = code;
  }).catch(error => {
    console.error('[Up Ahead edge pack] FAIL');
    console.error(error?.message || String(error));
    process.exitCode = 1;
  });
}
