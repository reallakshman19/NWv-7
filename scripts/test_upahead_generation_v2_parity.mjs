/** Cross-language Python generation -> Worker-compatible WebCrypto verification.
 * Synthetic shadow fixture; not real organizer authority or deployed edge proof.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { contentDigest, compareTransportGenerations, verifyGeneration } from '../cloudflare/upahead-dataset-api/src/identityV2Shadow.js';

const NOW = 1_800_000_000_000;
const SCRIPTS = dirname(fileURLToPath(import.meta.url));
const PY = String.raw`
import json
from upahead_identity import binding_alias
from upahead_identity.generation import resolve_and_build
now=1800000000000
one={"id":"story-a", "source":"test-organizer", "category":"events", "title":"Seminar – Advanced\u00a0AI", "url":"https://source.example/1", "eventStartAt": now+86400000, "expiryAt":now+172800000, "publishedAt":now-10000}
two=dict(one, id="story-b", url="https://source.example/2",title="Seminar — Advanced AI")
third=dict(one, id="story-unverified", url="https://source.example/3", title="Unknown seminar")
b={"authorityRole":"organizer","authorityNamespace":"synthetic-authority", "authorityOccurrenceId":"session-one", "evidenceRefs":["https://source.example/sessions/one"], "adjudicatedBy":"synthetic-fixture"}
rows=[one,two,third]
claims={binding_alias(one):b, binding_alias(two):b}
a=resolve_and_build(rows, source_commit="a"*40,published_at=now,observed_at=now-1000,trusted_bindings=claims)
c=resolve_and_build(list(reversed(rows)), source_commit="a"*40,published_at=now,observed_at=now-1000,trusted_bindings=claims)
print(json.dumps({"first":a,"reversed":c},ensure_ascii=False))
`;
function fixture() {
  let lastError = '';
  for (const executable of ['python3', 'python']) {
    try {
      const output = execFileSync(executable, ['-c', PY], { cwd: SCRIPTS, encoding: 'utf8', timeout: 20_000 });
      return JSON.parse(output);
    } catch (error) { lastError = error?.message || String(error); }
  }
  throw new Error('Python publisher parity fixture unavailable: ' + lastError);
}
const data = fixture();
const first = data.first, reversed = data.reversed;

test('Python immutable producer equals Cloudflare WebCrypto canonical digest', async () => {
  assert.equal(await contentDigest(first.payload), first.manifest.semanticDigest);
  assert.equal((await verifyGeneration(first.payload, first.manifest, {nowMs: NOW+3000})).status, 'VALID');
});
test('Publisher and Worker comparisons are order-invariant', async () => {
  assert.equal(first.manifest.generationId, reversed.manifest.generationId);
  assert.equal(first.manifest.semanticDigest, reversed.manifest.semanticDigest);
  assert.equal((await compareTransportGenerations({payload:first.payload,manifest:first.manifest},
    {payload:reversed.payload,manifest:reversed.manifest}, {nowMs: NOW+3000})).equivalent, true);
});
test('Unbound raw record cannot become an active occurrence from a Python emit', () => {
  assert.equal(first.payload.items.length, 1);
  assert.equal(first.payload.quarantine.length, 1);
  assert.equal(first.payload.sourceAliases.length, 2);
});
test('Changing source title after emit invalidates Worker verification', async () => {
  const payload = structuredClone(first.payload);
  payload.items[0].title += ' doctored';
  assert.equal((await verifyGeneration(payload, first.manifest,{nowMs:NOW+3000})).reason,'semantic-digest-mismatch');
});
test('Edge validator refuses a fabricated future publication time', async () => {
  const manifest = structuredClone(first.manifest);
  manifest.publishedAt += 60*60_000;
  assert.equal((await verifyGeneration(first.payload, manifest,{nowMs:NOW+3000})).reason,'invalid-publication-clock');
});
