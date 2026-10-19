import fs from 'node:fs';
import { validatePrEvidence } from '../src/quality/prEvidenceContract.js';

const eventPath = process.env.GITHUB_EVENT_PATH;
if (!eventPath) {
  console.error('GITHUB_EVENT_PATH is missing: cannot attest PR evidence.');
  process.exitCode = 1;
} else {
  const event = JSON.parse(fs.readFileSync(eventPath, 'utf8'));
  if (!event.pull_request) {
    console.error('No pull_request event payload: evidence gate cannot run.');
    process.exitCode = 1;
  } else {
    const result = validatePrEvidence(event.pull_request.body, {
      expectedHeadSha: event.pull_request.head?.sha,
    });
    if (!result.ok) {
      console.error('PR EVIDENCE CONTRACT FAILED:\n' + result.failures.map(s => '- ' + s).join('\n'));
      console.error('Use .github/PULL_REQUEST_TEMPLATE.md. NOT_RUN and BLOCKED require explanations.');
      process.exitCode = 1;
    } else {
      console.log('PR EVIDENCE CONTRACT PASS (structure only; reviewer must validate accuracy).');
    }
  }
}
