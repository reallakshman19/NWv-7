import test from 'node:test';
import assert from 'node:assert/strict';
import { handleRequest, normalizeBhavcopyQuote } from './src/index.js';

const CM = 'https://mcp.nseindia.in/cmmkt/mcp';
const EOD = 'https://mcp.nseindia.in/bhavcopy/cm/mcp';
const env = { ALLOWED_ORIGIN: 'https://reallakshman19.github.io', MARKET_OWNER_TOKEN: 'owner-secret-fixture' };
const NOW = Date.parse('2026-11-23T08:10:00Z');

function request(symbol = 'RELIANCE') {
  return new Request('https://worker.example/quote', {
    method: 'POST',
    headers: { origin: env.ALLOWED_ORIGIN, authorization: 'Bearer ' + env.MARKET_OWNER_TOKEN },
    body: JSON.stringify({ symbol }),
  });
}
function rpcReply(payload, id, session = null) {
  return new Response(JSON.stringify({ jsonrpc: '2.0', id, result: payload }), {
    headers: { 'content-type': 'application/json', ...(session ? { 'mcp-session-id': session } : {}) },
  });
}
function toolReply(payload) {
  return new Response('event: message\ndata: ' + JSON.stringify({
    jsonrpc: '2.0', id: 2, result: { isError: false, content: [{ type: 'text', text: JSON.stringify(payload) }] },
  }) + '\n\n', { headers: { 'content-type': 'text/event-stream' } });
}
const goodEod = { quotes: [
  { symbol: 'RELIANCE', date: '2026-11-20', close: 1584.25, pct_change: -1.1 },
] };

function mockedUpstreams(eodData = goodEod, primaryStatus = 502) {
  const calls = [];
  const fetchImpl = async (url, opts) => {
    const body = JSON.parse(opts.body);
    calls.push({ url, body, headers: opts.headers });
    if (url === CM) return new Response('unavailable', { status: primaryStatus });
    assert.equal(url, EOD);
    if (body.method === 'initialize') return rpcReply({ protocolVersion: '2025-06-18' }, 1, 'eod-session');
    if (body.method === 'notifications/initialized') return new Response(null, { status: 202 });
    if (body.method === 'tools/call') return toolReply(eodData);
    throw new Error('unexpected request method: ' + body.method);
  };
  return { fetchImpl, calls };
}

test('primary CM failure falls back to separate official NSE Bhavcopy MCP with actual trading date', async () => {
  const { fetchImpl, calls } = mockedUpstreams();
  const response = await handleRequest(request(), env, fetchImpl, NOW);
  assert.equal(response.status, 200);
  const { quote } = await response.json();
  assert.deepEqual({
    sourceTier: quote.sourceTier, priceType: quote.priceType, source: quote.source,
    freshness: quote.freshness, priceDate: quote.priceDate, value: quote.value,
  }, {
    sourceTier: 'NSE_EOD_FALLBACK', priceType: 'END_OF_DAY_CLOSE',
    source: 'NSE Bhavcopy MCP', freshness: 'END_OF_DAY',
    priceDate: '2026-11-20', value: 1584.25,
  });
  assert.equal(quote.quoteAt, undefined); // MUST NOT invent an intraday timestamp.
  assert.equal(quote.changePercent, -1.1);
  assert.deepEqual(calls.map(call => call.url), [CM, EOD, EOD, EOD]);
  assert.deepEqual(calls[3].body.params, { name: 'get_bulk_quote', arguments: { symbols: ['RELIANCE'] } });
  assert.equal(calls[3].headers['mcp-session-id'], 'eod-session');
});

test('EOD normalization rejects stale, impossible, future, mismatched or duplicate equity rows', () => {
  const row = goodEod.quotes[0];
  assert.equal(normalizeBhavcopyQuote(goodEod, 'RELIANCE', NOW)?.sourceTier, 'NSE_EOD_FALLBACK');
  const variations = [
    { quotes: [{ ...row, date: '2026-11-30' }] },
    { quotes: [{ ...row, date: '2026-11-01' }] },
    { quotes: [{ ...row, date: '2026-11-31' }] },
    { quotes: [{ ...row, date: '' }] },
    { quotes: [{ ...row, symbol: 'TCS' }] },
    { quotes: [{ ...row, close: -1 }] },
    { quotes: [row, row] },
    { error: 'source unavailable' },
  ];
  for (const bad of variations) assert.equal(normalizeBhavcopyQuote(bad, 'RELIANCE', NOW), null);
});

test('both official sources unavailable: never fabricate or silently reuse a Bhavcopy close', async () => {
  const { fetchImpl, calls } = mockedUpstreams({ error: 'get_bulk_quote currently unavailable' });
  const response = await handleRequest(request(), env, fetchImpl, NOW);
  assert.equal(response.status, 502);
  assert.deepEqual(await response.json(), { error: 'NSE_UNAVAILABLE_OR_UNQUALIFIED' });
  assert.equal(calls.length, 4);
});

test('auth failure never touches either official source', async () => {
  let upstreamCalls = 0;
  const bad = new Request('https://worker.example/quote', {
    method: 'POST',
    headers: { origin: env.ALLOWED_ORIGIN, authorization: 'Bearer wrong' },
    body: JSON.stringify({ symbol: 'RELIANCE' }),
  });
  const res = await handleRequest(bad, env, async () => { upstreamCalls++; throw Error('unexpected'); }, NOW);
  assert.equal(res.status, 401);
  assert.equal(upstreamCalls, 0);
});
