import assert from 'node:assert/strict';
import { test } from 'node:test';
import { contentDigest } from './identityV2Shadow.js';
import { EDGE_V2_SHADOW_PATH, checkShadowUrls, verifyEdgeV2Shadow, edgeV2DiagnosticResponse } from './edgeV2Probe.js';

const NOW = 1_800_000_000_000;
const MANIFEST = 'https://snapshot.example.com/v2/gen-1/manifest.json';
const DATA = 'https://snapshot.example.com/v2/gen-1/payload.json';
const ENV = { UP_AHEAD_V2_SHADOW_ENABLED: 'true', UP_AHEAD_V2_SHADOW_MANIFEST_URL: MANIFEST,
  UP_AHEAD_V2_SHADOW_PAYLOAD_URL: DATA, UP_AHEAD_V2_SHADOW_TIMEOUT_MS: '100' };
const basePayload = () => ({ schemaVersion: 2, generationId: 'gen-1',
  items: [{ canonicalOccurrenceId: 'occ:1', category: 'events', expiryAt: NOW + 86400000 }],
  pendingItems: [], retiredOccurrences: [], retiredRevisions: [],
  sourceAliases: [{ alias: 'source:1', canonicalOccurrenceId: 'occ:1' }],
});
async function fixture(payload = basePayload()) {
  const manifest = { schemaVersion: 2, generationId: payload.generationId, sourceCommit: 'a'.repeat(40),
    identityVersion: 2, retentionPolicyVersion: 'upahead-retention-v2', ledgerVersion: 'ledger-v2',
    publishedAt: NOW - 1000, observedAt: NOW - 2000, semanticDigest: await contentDigest(payload),
    recordCounts: {active:payload.items.length, pending:payload.pendingItems.length,
      retired:payload.retiredOccurrences.length, aliases:payload.sourceAliases.length} };
  return { payload, manifest };
}
function upstream({payload, manifest}, options = {}) {
  return async url => {
    if (options.unavailable) return new Response('offline', {status:503});
    const value = url === MANIFEST ? manifest : url === DATA ? payload : null;
    if (value === null) throw Error('wrong URL');
    if (options.invalidJson && url === DATA) return new Response('{INVALID', {status:200});
    return new Response(JSON.stringify(value), {status:200, headers: options.headers || {}});
  };
}
const verify = async (f, env = ENV, options = {}) => verifyEdgeV2Shadow(env, f, { nowMs: NOW, ...options });

test('default route requires explicit enablement', async () => {
  assert.deepEqual(await verifyEdgeV2Shadow({}, undefined, {nowMs:NOW}), {state:'NOT_CONFIGURED',reason:'shadow-disabled'});
  assert.equal(EDGE_V2_SHADOW_PATH, '/api/datasets/upAhead/v2/verify');
});
test('manifest and payload URLs must be trusted HTTPS same origin', () => {
  assert.equal(checkShadowUrls({...ENV,UP_AHEAD_V2_SHADOW_PAYLOAD_URL:'http://bad.example.com'}).ok, false);
  assert.equal(checkShadowUrls({...ENV,UP_AHEAD_V2_SHADOW_PAYLOAD_URL:'https://other.example.com/payload'}).ok, false);
  assert.equal(checkShadowUrls({...ENV,UP_AHEAD_V2_SHADOW_PAYLOAD_URL: MANIFEST}).ok, false);
  assert.equal(checkShadowUrls({...ENV,UP_AHEAD_V2_SHADOW_PAYLOAD_URL:'https://user:pass@snapshot.example.com/f'}).ok, false);
});
test('valid generation yields metadata without exposing source data or URLs', async () => {
  const a=await fixture();let calls=[];
  const f=upstream(a);const receipt=await verify(async u=>{calls.push(u);return f(u)});
  assert.equal(receipt.state,'VALID');assert.equal(receipt.generationId,'gen-1');
  assert.deepEqual(calls,[MANIFEST,DATA]);
  assert.equal(JSON.stringify(receipt).includes('snapshot.example.com'),false);
  assert.equal(JSON.stringify(receipt).includes('source:1'),false);
});
test('verified-empty is valid, never equivalent to unavailable',async()=>{
  const p=basePayload();p.items=[];p.sourceAliases=[];
  const a=await fixture(p);const valid=await verify(upstream(a));
  assert.equal(valid.state,'VALID');assert.equal(valid.counts.active,0);
  assert.equal((await verify(upstream(a,{unavailable:true}))).state,'UPSTREAM_UNAVAILABLE');
});
test('older publication is explicitly stale, not VALID',async()=>{
  const a=await fixture();a.manifest.publishedAt=NOW - 13*3600000;a.manifest.observedAt=a.manifest.publishedAt-1000;
  assert.equal((await verify(upstream(a))).state,'STALE_VALID');
});
test('torn payload vs manifest fails closed',async()=>{
  const a=await fixture();a.payload.generationId='gen-2';
  const result=await verify(upstream(a));assert.deepEqual([result.state,result.reason],['INVALID','generation-mismatch']);
});
test('mutation of canonical occurrence fails digest comparison',async()=>{
  const a=await fixture();a.payload.items[0].category='movies';
  assert.equal((await verify(upstream(a))).reason,'semantic-digest-mismatch');
});
test('cancelled occurrence cannot be resurrected',async()=>{
  const p=basePayload();p.retiredOccurrences=[{canonicalOccurrenceId:'occ:1',status:'CANCELLED'}];
  const a=await fixture(p);
  assert.equal((await verify(upstream(a))).reason,'retired-occurrence-resurrected');
});
test('missing manifest is INVALID rather than verified empty',async()=>{
  const a=await fixture();a.manifest={};
  assert.equal((await verify(upstream(a))).state,'INVALID');
});
test('invalid JSON, oversize and non-200 are separate failures',async()=>{
  const a=await fixture();
  assert.equal((await verify(upstream(a,{invalidJson:true}))).reason,'invalid-json');
  assert.equal((await verify(upstream(a,{headers:{'Content-Length':'9000000'}}))).reason,'artifact-oversize');
  assert.equal((await verify(upstream(a,{unavailable:true}))).reason,'upstream-non-ok');
});
test('timeout reports unavailable; fetch failure does not claim verified zero',async()=>{
  const x=await verifyEdgeV2Shadow({...ENV,UP_AHEAD_V2_SHADOW_TIMEOUT_MS:'10'},()=>new Promise(()=>{}),{nowMs:NOW});
  assert.deepEqual([x.state,x.reason],['UPSTREAM_UNAVAILABLE','upstream-timeout']);
});
test('invalid shadow config is NOT_CONFIGURED, never falls back to live data',async()=>{
  const x=await verify(async()=>new Response('{}'),{UP_AHEAD_V2_SHADOW_ENABLED:'true'});
  assert.equal(x.state,'NOT_CONFIGURED');
});
test('HTTP semantics expose verified, invalid, stale and failed states',async()=>{
  const json=(body,init)=>new Response(JSON.stringify(body),{...init,headers:{'Access-Control-Expose-Headers':'X-NW-UpAhead-Source',...init.headers}});
  for (const [state,code] of [['VALID',200],['INVALID',422],['STALE_VALID',503],['UPSTREAM_UNAVAILABLE',503],['NOT_CONFIGURED',503]]){
    const response=edgeV2DiagnosticResponse({state,reason:'test',generationId:'gen-1'},json);
    assert.equal(response.status,code);assert.equal(response.headers.get('X-NW-UpAhead-Generation'),'gen-1');
    assert.match(response.headers.get('Access-Control-Expose-Headers'),/X-NW-UpAhead-Digest/);
  }
});

async function liveFixture() {
  const a = await fixture();
  const now = Date.now();
  a.manifest.publishedAt = now - 1000;
  a.manifest.observedAt = now - 2000;
  a.payload.items[0].expiryAt = now + 86400000;
  a.manifest.semanticDigest = await contentDigest(a.payload);
  return a;
}

test('actual Worker v2 probe is disabled by default; legacy route still works', async () => {
  const {default:worker}=await import('./index.js');
  const disabled=await worker.fetch(new Request(`https://worker.example.com${EDGE_V2_SHADOW_PATH}`),{});
  assert.equal(disabled.status,404);
  const original=globalThis.fetch;
  globalThis.fetch=async()=>new Response(JSON.stringify({timeline:[],sections:{},weekly_plan:[],lastUpdated:new Date(NOW).toISOString(),auditSummary:{},dropReport:[]}),{status:200});
  try{
    const legacy=await worker.fetch(new Request('https://worker.example.com/api/datasets/upAhead'),{UP_AHEAD_DATASET_URL:'https://snapshot.example.com/public/data/up_ahead.json'});
    assert.equal(legacy.status,200);
    assert.equal(legacy.headers.get('X-NW-UpAhead-Source'),'upstream');
  }finally{globalThis.fetch=original}
});
test('actual Worker opt-in probe verifies exact pair and exposes metadata',async()=>{
  const {default:worker}=await import('./index.js');
  const a=await liveFixture();const original=globalThis.fetch;
  globalThis.fetch=upstream(a);
  try{
    const res=await worker.fetch(new Request(`https://worker.example.com${EDGE_V2_SHADOW_PATH}`),ENV);
    assert.equal(res.status,200);assert.equal((await res.json()).state,'VALID');
    assert.equal(res.headers.get('X-NW-UpAhead-Generation'),'gen-1');
  }finally{globalThis.fetch=original}
});
test('actual Worker fails invalid canonical pair without serving empty success',async()=>{
  const {default:worker}=await import('./index.js');
  const a=await liveFixture();a.payload.items[0].category='movies';const original=globalThis.fetch;
  globalThis.fetch=upstream(a);
  try{
    const res=await worker.fetch(new Request(`https://worker.example.com${EDGE_V2_SHADOW_PATH}`),ENV);
    assert.equal(res.status,422);assert.deepEqual([...(Object.values(await res.json())).slice(0,2)],['INVALID','semantic-digest-mismatch']);
  }finally{globalThis.fetch=original}
});
