import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function workerFixture() {
  const handlers = new Map();
  let openedCaches = 0, upstreamCalls = 0;
  const scope = {
    URL, Promise, Response,
    self: {
      location: {origin:'https://nwv.example'},
      addEventListener(type, callback) {handlers.set(type,callback);},
    },
    caches: {
      async open() {
        openedCaches++;
        return {
          async put(){},
          async match(){return null;},
        };
      },
    },
    async fetch() {upstreamCalls++;return new Response('fixture asset',{status:200});},
  };
  vm.runInNewContext(fs.readFileSync('public/sw.js','utf8'),scope,{filename:'public/sw.js'});
  const handle=handlers.get('fetch');
  assert.equal(typeof handle,'function');
  return {
    request(url,method='GET') {
      let response;
      handle({
        request: {url,method,mode:'cors'},
        respondWith(promise){response=promise;},
      });
      return response;
    },
    counts(){return {openedCaches,upstreamCalls};},
  };
}

test('Market publication bypasses the app shell SW at root and GitHub Pages prefix',()=>{
  const worker=workerFixture();
  for(const u of [
    'https://nwv.example/data/market_snapshot.json',
    'https://nwv.example/NWv-7/data/market_snapshot.json',
    'https://nwv.example/data/market_snapshot.json?version=1',
    'https://nwv.example/data/mutual_fund_snapshot.json',
    'https://nwv.example/NWv-7/data/market_source_health.json',
    'https://nwv.example/data/market_metrics.json',
  ]) assert.equal(worker.request(u),undefined,'Market publication passed into SW cache: '+u);
  assert.deepEqual(worker.counts(),{openedCaches:0,upstreamCalls:0});
});

test('newsdata and dataset authority continue to bypass shell cache',()=>{
  const worker=workerFixture();
  for(const u of [
    'https://nwv.example/newsdata/daily.json',
    'https://nwv.example/api/datasets/manifest.json',
    'https://nwv.example/preview/sections/top.json',
  ]) assert.equal(worker.request(u),undefined);
  assert.deepEqual(worker.counts(),{openedCaches:0,upstreamCalls:0});
});

test('normal static app-shell assets remain service-worker managed',async()=>{
  const worker=workerFixture();
  const response=worker.request('https://nwv.example/index.html');
  assert.ok(response && typeof response.then==='function');
  assert.equal((await response).status,200);
  assert.deepEqual(worker.counts(),{openedCaches:1,upstreamCalls:1});
});

test('cross-origin market provider requests never pass through the shell cache',()=>{
  const worker=workerFixture();
  assert.equal(worker.request('https://api.frankfurter.dev/v2/rate/omr/inr'),undefined);
  assert.deepEqual(worker.counts(),{openedCaches:0,upstreamCalls:0});
});


test('free/open-only cache namespace invalidates older cache families',()=>{
  const source=fs.readFileSync('public/sw.js','utf8');
  assert.match(source,/news-weather-app-v4-free-open-market/);
  assert.match(source,/cacheName\.startsWith\(CACHE_PREFIX\) && cacheName !== CACHE_NAME/);
});
