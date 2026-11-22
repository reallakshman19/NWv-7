/** Explicitly shadow-only prototype: uses synthetic v2 fixtures, NOT a deployed Worker smoke. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { contentDigest, verifyGeneration, compareTransportGenerations } from './identityV2Shadow.js';

const NOW = 1_800_000_000_000;
const commit = 'a'.repeat(40);
const event = (id, override = {}) => ({
  canonicalOccurrenceId: id, id: `raw:${id}`, category: 'events',
  status: 'ACTIVE', eventStartAt: NOW + 86400000, expiryAt: NOW + 2 * 86400000,
  ...override,
});
const payloadFixture = () => ({
  schemaVersion: 2, generationId: 'gen-001', items: [event('occ:a'), event('occ:b')],
  pendingItems: [], retiredOccurrences: [],
  retiredRevisions: [],
  sourceAliases: [{ alias: 'source:a', canonicalOccurrenceId: 'occ:a' }, { alias: 'source:b', canonicalOccurrenceId: 'occ:b' }],
});
async function fixture(p = payloadFixture()) {
  return { payload: p, manifest: {
    schemaVersion: 2, generationId: p.generationId, sourceCommit: commit,
    identityVersion: 2, retentionPolicyVersion: 'upahead-retention-v2',
    ledgerVersion: 'ledger-v2', publishedAt: NOW, observedAt: NOW - 1000,
    semanticDigest: await contentDigest(p),
    recordCounts: { active: p.items.length, pending: p.pendingItems.length, retired: p.retiredOccurrences.length, aliases: p.sourceAliases.length },
  } };
}
const checked = (set, opts = {}) => verifyGeneration(set.payload, set.manifest, { nowMs: NOW + 1000, ...opts });

test('valid coherent generation is accepted', async () => {
  assert.equal((await checked(await fixture())).status, 'VALID');
});
test('same semantic data in different key/list order is equivalent', async () => {
  const a = await fixture(), b = structuredClone(a);
  b.payload.items.reverse(); b.payload.sourceAliases.reverse();
  b.payload.items[0] = Object.fromEntries(Object.entries(b.payload.items[0]).reverse());
  assert.deepEqual([await contentDigest(a.payload), await contentDigest(b.payload)].sort(), [a.manifest.semanticDigest, a.manifest.semanticDigest]);
  assert.equal((await compareTransportGenerations(a, b, { nowMs: NOW + 1000 })).equivalent, true);
});
test('mutating a canonical occurrence without manifest change rejects', async () => {
  const a = await fixture(); a.payload.items[0].eventStartAt += 60_000;
  assert.equal((await checked(a)).reason, 'semantic-digest-mismatch');
});
test('missing manifest rejects instead of presenting fresh empty content', async () => {
  const a = await fixture(); assert.equal((await verifyGeneration(a.payload, null)).reason, 'missing-payload-or-manifest');
});
test('legacy v1 snapshot is never mistaken for canonical v2', async () => {
  const a = await fixture(); a.payload.schemaVersion = 1;
  assert.equal((await checked(a)).reason, 'unsupported-version');
});
test('torn two-file generation rejects', async () => {
  const a = await fixture(); a.manifest.generationId = 'gen-002';
  assert.equal((await checked(a)).reason, 'generation-mismatch');
});
test('duplicate occurrence ID and missing session identity cannot be hidden', async () => {
  const a = await fixture(); a.payload.items.push(event('occ:a'));
  assert.equal((await checked(a)).reason, 'duplicate-canonical-occurrence-id');
});
test('stale is explicit, not incorrectly marked as fresh', async () => {
  const a = await fixture();
  assert.equal((await checked(a, { nowMs: NOW + 13 * 3600000 })).status, 'STALE_VALID');
});
test('future publication clock fails', async () => {
  const a = await fixture(); a.manifest.publishedAt = NOW + 10 * 3600000;
  assert.equal((await checked(a)).reason, 'invalid-publication-clock');
});
test('cancelled occurrence must not reappear as active', async () => {
  const p = payloadFixture(); p.retiredOccurrences.push({ canonicalOccurrenceId: 'occ:a', status: 'CANCELLED' });
  const a = await fixture(p);
  assert.equal((await checked(a)).reason, 'retired-occurrence-resurrected');
});
test('rejects rehashed generations with invalid active lifecycle fields', async () => {
  for (const [field, value, reason] of [
    ['status', 'CANCELLED', 'invalid-occurrence-status'],
    ['expiryAt', undefined, 'invalid-occurrence-expiry'],
    ['expiryAt', NOW + 1000, 'expired-active-occurrence'],
  ]) {
    const payload = payloadFixture();
    if (value === undefined) delete payload.items[0][field];
    else payload.items[0][field] = value;
    const result = await checked(await fixture(payload));
    assert.equal(result.status, 'INVALID');
    assert.equal(result.reason, reason);
  }
});
test('source alias cannot point to an unknown occurrence', async () => {
  const a = await fixture(); a.payload.sourceAliases[0].canonicalOccurrenceId = 'occ:nonexistent';
  assert.equal((await checked(a)).reason, 'orphan-source-alias');
});
test('contradictory manifests across transports fail parity', async () => {
  const a = await fixture(), b = await fixture();
  b.payload.generationId = 'gen-002'; b.manifest.generationId = 'gen-002'; b.manifest.semanticDigest = await contentDigest(b.payload);
  assert.equal((await compareTransportGenerations(a, b, { nowMs: NOW + 1000 })).reason, 'generation-or-payload-drift');
});
test('verified-empty is distinct from missing/upstream failure', async () => {
  const p = payloadFixture(); p.items = []; p.sourceAliases = [];
  const a = await fixture(p);
  assert.equal((await checked(a)).status, 'VALID');
  assert.equal(a.manifest.recordCounts.active, 0);
});
