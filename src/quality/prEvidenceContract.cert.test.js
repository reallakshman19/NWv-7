import { describe, expect, it } from 'vitest';
import { validatePrEvidence } from './prEvidenceContract.js';

const VALID = [
  '# Problem and evidence',
  '- Issue / audit finding: NW-AUDIT-20261019 #138',
  '- Expected behavior: Digest caps sources at two.',
  '- Observed behavior: An uncapped fill permits three.',
  '# Root cause',
  '- Root cause: An uncapped final-fill loop bypasses the source limit.',
  '# What changed',
  '| Claimed correction / invariant | Runtime code path | Regression test / fixture |',
  '| --- | --- | --- |',
  '| Hard cap | src/data/dailyDigestLiveFallback.js | src/data/dailyDigestLiveFallback.cert.test.js |',
  '# Scope control',
  '- In scope: Live digest selection.',
  '- Explicitly unchanged: Provider queries.',
  '# Verification on the exact PR head',
  '- PR head SHA: 62ce8835166ed92ff5d6e0361f0f9f3833a89e69',
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
  '- Deployment performed?: no (none authorized)',
  '- Rollback commit or recovery plan: Revert the PR commit if necessary.',
  '# Review disposition',
  '- Reviewer(s): Not yet assigned; independent review required.',
  '- Merge decision: DO NOT MERGE without green CI and independent review.',
].join('\n');

describe('pull request evidence contract', () => {
  it('allows truthful NOT_RUN and BLOCKED states with specific reasons', () => {
    expect(validatePrEvidence(VALID)).toEqual({ ok: true, failures: [] });
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

  it('rejects verification claims for a stale or incorrect pull request head', () => {
    const result = validatePrEvidence(VALID, {
      expectedHeadSha: 'a'.repeat(40),
    });
    expect(result.ok).toBe(false);
    expect(result.failures.join(' ')).toContain('PR head SHA');
    expect(validatePrEvidence(VALID, {
      expectedHeadSha: '62ce8835166ed92ff5d6e0361f0f9f3833a89e69',
    }).ok).toBe(true);
  });

  it('rejects template-only placeholders', () => {
    expect(validatePrEvidence('# Problem and evidence\n- Issue / audit finding:\n- Expected behavior:\n- Observed behavior:').ok).toBe(false);
  });
});
