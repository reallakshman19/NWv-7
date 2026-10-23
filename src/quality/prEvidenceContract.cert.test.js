import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validatePrEvidence } from './prEvidenceContract.js';

const HEAD = '62ce8835166ed92ff5d6e0361f0f9f3833a89e69';
const VALID = [
  '# Problem and evidence',
  '- Issue / audit finding: NW-AUDIT-20261019 #138',
  '- Reproduced on commit: 8d8f9c32fc7199472a29f5f127c167972de47877',
  '- Expected behavior: Digest caps sources at two.',
  '- Observed behavior: An uncapped fill permits three.',
  '- Evidence (logs/screenshots/fixture): Synthetic fixture in this test.',
  '# Root cause',
  '- Root cause: An uncapped final-fill loop bypasses the source limit.',
  '- Relevant upstream/downstream contracts: The final-fill contract.',
  '- Alternatives rejected and why: An unchecked fill violates the invariant.',
  '# What changed',
  '| Claimed correction / invariant | Runtime code path | Regression test / fixture |',
  '| --- | --- | --- |',
  '| Hard cap | src/data/dailyDigestLiveFallback.js | src/data/dailyDigestLiveFallback.cert.test.js |',
  '# Scope control',
  '- In scope: Live digest selection.',
  '- Explicitly unchanged: Provider queries.',
  '- Related PRs / branch dependencies: None.',
  '- Data schema, freshness, source authority, cache, or policy changes (or none): None.',
  '# Verification on the exact PR head',
  '- PR head SHA: ' + HEAD,
  '- CI run URL: NOT_RUN, pending first CI run',
  '| Gate | Status (PASS / FAIL / NOT_RUN / BLOCKED) | Evidence / reason |',
  '| --- | --- | --- |',
  '| Lint | NOT_RUN | Awaiting CI trigger |',
  '| Unit & regression tests | NOT_RUN | Awaiting CI trigger |',
  '| Build | NOT_RUN | Awaiting CI trigger |',
  '| Domain certification | BLOCKED | Waiting for editorial profile |',
  '| Integration / browser smoke | NOT_RUN | Requires staging |',
  '| Staging or production validation | BLOCKED | No deployment authorization |',
  '# Operational acceptance',
  '- Runtime/environment tested (Static / Live / Hybrid / Worker): CI only.',
  '- Real data epoch / timestamp / source authority: Not applicable.',
  '- Before/after observations: Contract rejects structural errors.',
  '- Warnings or degraded behavior remaining: Does not authenticate CI links.',
  '- Deployment performed?: no',
  '- Rollback commit or recovery plan: Revert the PR commit if necessary.',
  '# Review disposition',
  '- Reviewer(s): Not yet assigned; independent review required.',
  '- Unresolved risks and evidence gaps: CI and review still pending.',
  '- Follow-up issue(s): #138',
  '- Merge decision: DO NOT MERGE without green CI and independent review.',
].join('\n');

function runCli(event) {
  const dir = mkdtempSync(join(tmpdir(), 'nw-pr-evidence-'));
  try {
    const file = join(dir, 'event.json');
    writeFileSync(file, JSON.stringify(event));
    return spawnSync(process.execPath, ['scripts/validate_pr_evidence.mjs'], {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: { ...process.env, GITHUB_EVENT_PATH: file },
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}


const GATE_NAMES = [
  'Lint',
  'Unit & regression tests',
  'Build',
  'Domain certification',
  'Integration / browser smoke',
  'Staging or production validation',
];

// Exercise the checked-in authoring template, not a separately typed fixture.
const CHECKED_IN_TEMPLATE = readFileSync(
  new URL('../../.github/PULL_REQUEST_TEMPLATE.md', import.meta.url),
  'utf8'
);

function completeCheckedInTemplate() {
  let body = CHECKED_IN_TEMPLATE.replace(/^- ([^:\n]+):.*$/gm, (_line, label) => {
    if (label === 'PR head SHA') return '- ' + label + ': ' + HEAD;
    if (label === 'CI run URL') return '- ' + label + ': NOT_RUN, synthetic example only';
    return '- ' + label + ': Synthetic example; no claim of real execution';
  });
  body = body.replace(
    /^\| \| \| \|$/m,
    '| Synthetic correction | src/quality/prEvidenceContract.js | src/quality/prEvidenceContract.cert.test.js |'
  );
  for (const label of GATE_NAMES) {
    body = body.replace(
      '| ' + label + ' | | |',
      '| ' + label + ' | NOT_RUN | Synthetic example; no executed gate claimed |'
    );
  }
  return body;
}

describe('checked-in PR template compatibility', () => {
  it('uses exactly six canonical verification gates in the real template', () => {
    const observedLabels = CHECKED_IN_TEMPLATE.split('\n')
      .map(line => line.match(/^\|\s*(.*?)\s*\|\s*\|\s*\|$/)?.[1])
      .filter(Boolean);
    expect(observedLabels).toEqual(GATE_NAMES);
  });

  it('accepts a fully completed copy of the actual checked-in PR template', () => {
    const completed = completeCheckedInTemplate();
    const result = validatePrEvidence(completed, { expectedHeadSha: HEAD });
    expect(result).toEqual({ ok: true, failures: [] });
  });

  it('rejects a noncanonical Domain certification gate in that completed template', () => {
    const completed = completeCheckedInTemplate();
    const wrongLabel = completed.replace(
      '| Domain certification | NOT_RUN |',
      '| Domain certification (editorial / workflow / data platform, as applicable) | NOT_RUN |'
    );
    expect(wrongLabel).not.toBe(completed);
    const result = validatePrEvidence(wrongLabel, { expectedHeadSha: HEAD });
    expect(result.ok).toBe(false);
    expect(result.failures).toContain('Domain certification: status must be PASS, FAIL, NOT_RUN or BLOCKED');
  });
});

describe('pull request evidence contract', () => {
  it('allows truthful NOT_RUN and BLOCKED states with specific reasons', () => {
    expect(validatePrEvidence(VALID, { expectedHeadSha: HEAD })).toEqual({ ok: true, failures: [] });
  });

  it('rejects missing root cause and empty traceability mapping', () => {
    const body = VALID
      .replace('- Root cause: An uncapped final-fill loop bypasses the source limit.', '- Root cause:')
      .replace('| Hard cap | src/data/dailyDigestLiveFallback.js | src/data/dailyDigestLiveFallback.cert.test.js |', '');
    const result = validatePrEvidence(body);
    expect(result.ok).toBe(false);
    expect(result.failures.join(' ')).toContain('Root cause');
    expect(result.failures.join(' ')).toContain('traceability');
  });

  it('rejects blank verification status and unsupported status labels', () => {
    const result = validatePrEvidence(VALID.replace('| Build | NOT_RUN | Awaiting CI trigger |', '| Build | OK | |'));
    expect(result.ok).toBe(false);
    expect(result.failures.join(' ')).toContain('Build');
  });

  it('rejects a mismatched, absent, or malformed authoritative head SHA', () => {
    expect(validatePrEvidence(VALID, { expectedHeadSha: 'a'.repeat(40) }).ok).toBe(false);
    expect(validatePrEvidence(VALID, { expectedHeadSha: undefined }).ok).toBe(false);
    expect(validatePrEvidence(VALID, { expectedHeadSha: 'invalid' }).ok).toBe(false);
    expect(validatePrEvidence(VALID, { expectedHeadSha: HEAD }).ok).toBe(true);
    expect(validatePrEvidence(VALID.replace(HEAD, '0'.repeat(40))).ok).toBe(true);
    expect(validatePrEvidence(VALID.replace(HEAD, '0'.repeat(40)), { expectedHeadSha: HEAD }).ok).toBe(false);
    expect(validatePrEvidence(VALID.replace(HEAD, 'broken')).ok).toBe(false);
  });

  it('requires exact mandatory field labels rather than substring aliases', () => {
    const altered = VALID.replace('- Root cause: An uncapped final-fill loop bypasses the source limit.', '- No actual Root cause: Arbitrary text.');
    const result = validatePrEvidence(altered);
    expect(result.ok).toBe(false);
    expect(result.failures.join(' ')).toContain('Root cause');
  });

  it('requires all named fields from the authoring template, including reproduced commit', () => {
    const mandatory = [
      'Issue / audit finding', 'Reproduced on commit', 'Expected behavior', 'Observed behavior',
      'Evidence (logs/screenshots/fixture)', 'Root cause', 'Relevant upstream/downstream contracts',
      'Alternatives rejected and why', 'In scope', 'Explicitly unchanged',
      'Related PRs / branch dependencies', 'Data schema, freshness, source authority, cache, or policy changes (or none)',
      'PR head SHA', 'CI run URL', 'Runtime/environment tested (Static / Live / Hybrid / Worker)',
      'Real data epoch / timestamp / source authority', 'Before/after observations',
      'Warnings or degraded behavior remaining', 'Deployment performed?', 'Rollback commit or recovery plan',
      'Reviewer(s)', 'Unresolved risks and evidence gaps', 'Follow-up issue(s)', 'Merge decision',
    ];
    for (const name of mandatory) {
      const line = VALID.split('\n').find(value => value.startsWith('- ' + name + ':'));
      expect(line, 'missing fixture line for ' + name).toBeDefined();
      const result = validatePrEvidence(VALID.replace(line, '- ' + name + ':'));
      expect(result.ok, 'field should be enforced: ' + name).toBe(false);
      expect(result.failures.join(' ')).toContain(name);
    }
  });

  it('rejects template-only placeholders', () => {
    expect(validatePrEvidence('# Problem and evidence\n- Issue / audit finding:\n- Expected behavior:\n- Observed behavior:').ok).toBe(false);
  });

  it('requires each exact gate name and a specific reason', () => {
    expect(validatePrEvidence(VALID.replace('| Build | NOT_RUN | Awaiting CI trigger |', '| Build someday | NOT_RUN | Awaiting CI trigger |')).ok).toBe(false);
    expect(validatePrEvidence(VALID.replace('| Build | NOT_RUN | Awaiting CI trigger |', '| Build | NOT_RUN | |')).ok).toBe(false);
  });

  it('CLI succeeds on an event with an authoritative matching SHA', () => {
    const run = runCli({ pull_request: { head: { sha: HEAD }, body: VALID } });
    expect(run.status, run.stderr).toBe(0);
    expect(run.stdout).toContain('structure only');
  });

  it('CLI fails closed if event head SHA is absent, malformed, or mismatched', () => {
    for (const head of [undefined, {}, { sha: 'invalid' }, { sha: '0'.repeat(40) }]) {
      const run = runCli({ pull_request: { head, body: VALID } });
      expect(run.status, 'head=' + JSON.stringify(head) + ' ' + run.stdout + run.stderr).not.toBe(0);
    }
  });

  it('makes no false authenticity claim about plausible fabricated CI links', () => {
    const fake = VALID
      .replace('- CI run URL: NOT_RUN, pending first CI run', '- CI run URL: https://github.com/reallakshman19/NWv-7/actions/runs/9999999999')
      .replace('| Lint | NOT_RUN | Awaiting CI trigger |', '| Lint | PASS | https://github.com/reallakshman19/NWv-7/actions/runs/9999999999 |');
    expect(validatePrEvidence(fake).ok).toBe(true);
    // Only GitHub evidence inspection by a reviewer can verify these claims.
  });
});
