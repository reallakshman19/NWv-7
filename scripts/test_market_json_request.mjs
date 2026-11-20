import assert from 'node:assert/strict';
import { test } from 'node:test';
import { boundedMarketJson } from '../src/services/marketJsonRequest.js';
const fixture = data => ({ ok: true, status: 200, headers: new Headers({ 'content-type': 'application/json' }),
  body: new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode(JSON.stringify(data))); controller.close(); } }) });

test('valid JSON through source-dated response works', async () => {
  const result = await boundedMarketJson('https://example.test/', { fetchImpl: async () => fixture({status:'SUCCESS', data:[123]}), timeoutMs:100 });
  assert.deepEqual(result, {status:'SUCCESS',data:[123]});
});
test('provider HTTP 429 retains status for bounded cooldown', async () => {
  await assert.rejects(boundedMarketJson('https://example.test/', { fetchImpl: async () => ({ok:false,status:429}), timeoutMs:100 }), error=>error.status===429);
});
test('reject HTML SPA fallback with HTTP 200',async()=>{
  await assert.rejects(boundedMarketJson('x',{fetchImpl:async()=>({ok:true,headers:new Headers({'content-type':'text/html'}),json:async()=>({})}),timeoutMs:100}),/HTML/);
});
test('reject oversized streaming body without decoding more',async()=>{
  const big = new Uint8Array(100);
  await assert.rejects(boundedMarketJson('x',{fetchImpl:async()=>({ok:true,body:new ReadableStream({start(c){c.enqueue(big);c.close();}})}),maxBytes:60,timeoutMs:100}),/byte limit/);
});
test('body never ends: single deadline includes JSON read',async()=>{
  let abort=false;
  const response = {ok:true,json:()=>new Promise(()=>{})};
  await assert.rejects(boundedMarketJson('x',{fetchImpl:async (_url,{signal})=>{
    signal.addEventListener('abort',()=>abort=true);return response;},timeoutMs:8}),{name:'TimeoutError'});
  assert.equal(abort,true);
});
test('external cancellation interrupts pending transport',async()=>{
  const controller = new AbortController();
  const promise = boundedMarketJson('x', {fetchImpl:async(_u,{signal})=>new Promise((_,reject)=>{
    signal.addEventListener('abort',()=>reject(Object.assign(new Error('abort'),{name:'AbortError'})));
  }),signal:controller.signal,timeoutMs:150});
  controller.abort();
  await assert.rejects(promise,{name:'AbortError'});
});
test('body reader that ignores abort cannot extend absolute deadline',async()=>{
  const stuck = new ReadableStream({start(c){c.enqueue(new Uint8Array([123]));}});
  await assert.rejects(boundedMarketJson('x',{fetchImpl:async()=>({ok:true,body:stuck}),timeoutMs:8}),{name:'TimeoutError'});
});
