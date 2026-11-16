import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

const workflow = fs.readFileSync('.github/workflows/deploy.yml', 'utf8');
const SOURCE_SHA = 'a'.repeat(40);
const OTHER_SHA = 'b'.repeat(40);
const names = [
  'CI Validation Gate', 'News Prefetch', 'Market Refresh', 'Weather Refresh',
  'UpAhead Refresh', 'Daily News Brief', 'Breaking Refresh',
  'Travel local news prefetch',
];
const extractScript = (start, end) => {
  const section = workflow.split(`      - name: ${start}\n`)[1]
    ?.split(`      - name: ${end}\n`)[0];
  const block = section?.split('        run: |\n')[1];
  return block?.split('\n')
    .map(line => line.startsWith('          ') ? line.slice(10) : line)
    .join('\n');
};
const sourceScript = extractScript(
  'Resolve deployment checkout authority', 'Checkout deployment source once',
);
const lateScript = extractScript(
  'Reject superseded source before publication for every release trigger',
  'Write pages data manifest',
);
const deployScript = extractScript(
  'Recheck frozen source immediately before Pages publication',
  'Deploy to GitHub Pages',
);
const context = {
  TRIGGER_EVENT: 'workflow_run', EVENT_SHA: SOURCE_SHA,
  DEFAULT_BRANCH: 'main', UPSTREAM_HEAD_SHA: SOURCE_SHA,
  UPSTREAM_HEAD_BRANCH: 'main', UPSTREAM_CONCLUSION: 'success',
  UPSTREAM_WORKFLOW_NAME: 'CI Validation Gate',
  UPSTREAM_REPOSITORY: 'reallakshman19/NWv-7',
  CURRENT_REPOSITORY: 'reallakshman19/NWv-7',
};

function execute(script, overrides = {}, remoteSha = null) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 's1-pages-trigger-'));
  const outputPath = path.join(root, 'github-output');
  try {
    if (remoteSha !== null) {
      const stub = path.join(root, 'git');
      fs.writeFileSync(stub, `#!/bin/sh
printf '%s\\trefs/heads/main\\n' "${remoteSha}"
`);
      fs.chmodSync(stub, 0o755);
    }
    const result = spawnSync('bash', ['-c', script], {
      encoding: 'utf8',
      env: {
        ...process.env, ...context, ...overrides,
        GITHUB_OUTPUT: outputPath,
        FROZEN_SOURCE_SHA: SOURCE_SHA,
        EXPECTED_SHA: SOURCE_SHA,
        TARGET_REPOSITORY: 'reallakshman19/NWv-7',
        PATH: root + ':' + process.env.PATH,
      },
    });
    return {
      status: result.status,
      stderr: result.stderr,
      output: fs.existsSync(outputPath) ? fs.readFileSync(outputPath, 'utf8') : '',
    };
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

describe('read-only release event and final source challenge matrix', () => {
  it('has executable source, preupload and final-deploy guards in real workflow', () => {
    expect(sourceScript).toContain('case "$TRIGGER_EVENT"');
    expect(lateScript).toContain('git ls-remote');
    expect(deployScript).toContain('git ls-remote');
    expect(workflow).toContain('needs: build');
    expect(workflow).not.toMatch(/^ {2}push:/m);
    expect(workflow).toContain('environment:');
    expect(workflow).toContain('name: github-pages');
  });

  it('hard-blocks unsupported direct push and adversarial event types', () => {
    for (const trigger of ['push', 'pull_request', 'schedule', 'repository_dispatch']) {
      expect(execute(sourceScript, { TRIGGER_EVENT: trigger }).status)
        .not.toBe(0);
    }
  });

  it('pins manual dispatch to the exact trigger SHA, never to a loose branch', () => {
    const accepted = execute(sourceScript, {
      TRIGGER_EVENT: 'workflow_dispatch', EVENT_SHA: SOURCE_SHA,
    });
    expect(accepted.status, accepted.stderr).toBe(0);
    expect(accepted.output).toContain('checkout_ref=' + SOURCE_SHA);
    expect(accepted.output).toContain('expected_source_sha=' + SOURCE_SHA);
    for (const invalid of ['main', '', 'not-a-commit']) {
      expect(execute(sourceScript, {
        TRIGGER_EVENT: 'workflow_dispatch', EVENT_SHA: invalid,
      }).status).not.toBe(0);
    }
  });

  it.each(names)('accepts only eligible main SUCCESS from %s', workflowName => {
    const current = execute(sourceScript, { UPSTREAM_WORKFLOW_NAME: workflowName });
    expect(current.status, current.stderr).toBe(0);
    if (workflowName === 'CI Validation Gate') {
      expect(current.output).toContain('checkout_ref=' + SOURCE_SHA);
      expect(current.output).toContain('workflow-run-ci-verified-sha');
    } else {
      expect(current.output).toContain('checkout_ref=main');
      expect(current.output).toContain('workflow-run-default-branch-checkout');
    }
  });

  it.each(names)('rejects unsuccessful or forged %s upstream context', workflowName => {
    for (const edits of [
      { UPSTREAM_CONCLUSION: 'failure' },
      { UPSTREAM_CONCLUSION: 'cancelled' },
      { UPSTREAM_HEAD_BRANCH: 'malicious-feature' },
      { UPSTREAM_REPOSITORY: 'fork/NWv-7' },
      { UPSTREAM_HEAD_SHA: 'not-a-commit' },
    ]) {
      expect(execute(sourceScript, {
        UPSTREAM_WORKFLOW_NAME: workflowName, ...edits,
      }).status, JSON.stringify({ workflowName, edits })).not.toBe(0);
    }
  });

  it('rejects an unknown upstream workflow and absent branch authority', () => {
    expect(execute(sourceScript, {
      UPSTREAM_WORKFLOW_NAME: 'Unauthorized Deployment Bot',
    }).status).not.toBe(0);
    expect(execute(sourceScript, { DEFAULT_BRANCH: '' }).status).not.toBe(0);
  });

  it('rejects changed main between qualification and Pages artifact upload', () => {
    expect(execute(lateScript, {}, SOURCE_SHA).status).toBe(0);
    expect(execute(lateScript, {}, OTHER_SHA).status).not.toBe(0);
    expect(execute(lateScript, {}, 'invalid').status).not.toBe(0);
  });

  it('rejects changed main even on a deploy-only rerun with an old build output', () => {
    expect(execute(deployScript, {}, SOURCE_SHA).status).toBe(0);
    expect(execute(deployScript, {}, OTHER_SHA).status).not.toBe(0);
    expect(execute(deployScript, {}, 'invalid').status).not.toBe(0);
  });

  it('requires browser and byte-seal verification before Pages artifact creation', () => {
    const browser = workflow.indexOf(
      'Check built Pages World health before publication',
    );
    const manifest = workflow.indexOf('node scripts/write_pages_data_manifest.mjs');
    const seal = workflow.indexOf('node scripts/verify_s1_preupload_seal.mjs');
    const artifact = workflow.indexOf('actions/upload-pages-artifact@v3');
    const publication = workflow.indexOf('actions/deploy-pages@v4');
    expect(browser).toBeGreaterThan(-1);
    expect(manifest).toBeGreaterThan(browser);
    expect(seal).toBeGreaterThan(manifest);
    expect(artifact).toBeGreaterThan(seal);
    expect(publication).toBeGreaterThan(artifact);
  });
});
