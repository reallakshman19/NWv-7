import test from 'node:test';
import assert from 'node:assert/strict';
import { handleRequest, normalizeNseQuote } from './src/index.js';

const env = { ALLOWED_ORIGIN: 'https://reallakshman19.github.io', MARKET_OWNER_TOKEN: 'super-secret-test-token' };
const NOW = Date.parse('2026-11-23T08:10:00Z');
const origin = env.ALLOWED_ORIGIN;

function ownerRequest(symbol = 'RELIANCE', token = env.MARKET_OWNER_TOKEN, suppliedOrigin = origin) {
  return new Request('https://test-worker.example/quote', {
    method: 'POST',
    headers: { origin: suppliedOrigin, authorization: 'Bearer ' + token, 'content-type': 'application/json' },
    body: JSON.stringify({ symbol }),
  });
}

function rpcResponses(quote = { updatedAt: '2026-11-23T08:00:00Z',
  stock: { symbol: 'RELIANCE', lastTradedPrice: 1580.60, change: -5.40, perChange: -0.34 } }) {
  const packets = [
    new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result: { protocolVersion: '2025-06-18' } }), {
      status: 200, headers: { 'content-type': 'application/json', 'mcp-session-id': 'valid-session' },
    }),
    new Response(null, { status: 202 }),
    new Response('event: message\ndata: ' + JSON.stringify({
      jsonrpc: '2.0', id: 2, result: { isError: false,
        content: [{ type: 'text', text: JSON.stringify(quote) }] },
    }) + '\n\n', { status: 200, headers: { 'content-type': 'text/event-stream' } }),
  ];
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return packets.shift() || new Response('', { status: 500 });
  };
  return { fetchImpl, calls };
}

test('owner-initiated official NSE quote: 3 MCP stages, session, validated provenance', async () => {
  const { fetchImpl, calls } = rpcResponses();
  const response = await handleRequest(ownerRequest(), env, fetchImpl, NOW);
  assert.equal(response.status, 200);
  const { quote } = await response.json();
  assert.equal(quote.source, 'NSE CM Market Live MCP');
  assert.equal(quote.value, 1580.6);
  assert.equal(quote.symbol, 'RELIANCE');
  assert.equal(quote.changePercent, -0.34);
  assert.equal(quote.quoteAt, '2026-11-23T08:00:00.000Z');
  assert.equal(quote.freshness, 'RECENT_PROVIDER_OBSERVATION');
  assert.equal(response.headers.get('cache-control'), 'private, no-store, max-age=0');
  assert.equal(response.headers.get('access-control-allow-origin'), origin);
  assert.equal(calls.length, 3);
  assert.ok(calls.every(item => item.url === 'https://mcp.nseindia.in/cmmkt/mcp'));
  const initRpc = JSON.parse(calls[0].init.body);
  assert.equal(initRpc.method, 'initialize');
  assert.equal(JSON.parse(calls[1].init.body).method, 'notifications/initialized');
  assert.equal(calls[1].init.headers['mcp-session-id'], 'valid-session');
  assert.equal(JSON.parse(calls[2].init.body).params.name, 'cm_get_stock_quote');
  assert.deepEqual(JSON.parse(calls[2].init.body).params.arguments, { symbol: 'RELIANCE' });
});

test('wrong token, origin, unsupported symbol all fail before upstream access', async () => {
  const { fetchImpl, calls } = rpcResponses();
  assert.equal((await handleRequest(ownerRequest('RELIANCE', 'wrong'), env, fetchImpl, NOW)).status, 401);
  assert.equal((await handleRequest(ownerRequest('RELIANCE', env.MARKET_OWNER_TOKEN, 'https://evil.example'), env, fetchImpl, NOW)).status, 403);
  assert.equal((await handleRequest(ownerRequest('^NSEI'), env, fetchImpl, NOW)).status, 400);
  assert.equal(calls.length, 0);
});

test('preflight permits only the configured origin and does not expose credentials', async () => {
  const request = new Request('https://test-worker.example/quote', {
    method: 'OPTIONS', headers: { origin },
  });
  const response = await handleRequest(request, env, undefined, NOW);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('access-control-allow-origin'), origin);
  const denied = await handleRequest(new Request(request.url, { method: 'OPTIONS', headers: { origin: 'https://bad.example' } }), env, undefined, NOW);
  assert.equal(denied.status, 403);
  assert.equal(denied.headers.get('access-control-allow-origin'), null);
});

test('unverified, stale, future, cross-symbol prices never appear', () => {
  const valid = { updatedAt: '2026-11-23T08:00:00Z', stock: { symbol: 'RELIANCE', lastTradedPrice: 1500 } };
  assert.ok(normalizeNseQuote(valid, 'RELIANCE', NOW));
  assert.equal(normalizeNseQuote({ ...valid, updatedAt: '2026-11-01T08:00:00Z' }, 'RELIANCE', NOW), null);
  assert.equal(normalizeNseQuote({ ...valid, updatedAt: '2026-11-23T08:30:00Z' }, 'RELIANCE', NOW), null);
  assert.equal(normalizeNseQuote({ ...valid, updatedAt: '' }, 'RELIANCE', NOW), null);
  assert.equal(normalizeNseQuote({ ...valid, stock: { symbol: 'TCS', lastTradedPrice: 1500 } }, 'RELIANCE', NOW), null);
  assert.equal(normalizeNseQuote({ ...valid, stock: { symbol: 'RELIANCE', lastTradedPrice: 'NaN' } }, 'RELIANCE', NOW), null);
  const historical = normalizeNseQuote({ ...valid, updatedAt: '2026-11-22T08:00:00Z' }, 'RELIANCE', NOW);
  assert.equal(historical.freshness, 'HISTORICAL_OBSERVATION');
});

test('NSE soft error response does not convert to zero or a success result', async () => {
  const { fetchImpl } = rpcResponses({ error: 'unknown symbol' });
  const response = await handleRequest(ownerRequest(), env, fetchImpl, NOW);
  assert.equal(response.status, 502);
  assert.deepEqual(await response.json(), { error: 'NSE_UNAVAILABLE_OR_UNQUALIFIED' });
});

test('upstream HTTP failure does not expose external response or session', async () => {
  const response = await handleRequest(ownerRequest(), env, async () =>
    new Response('private upstream details', { status: 504 }), NOW);
  assert.equal(response.status, 502);
  assert.deepEqual(await response.json(), { error: 'NSE_UNAVAILABLE_OR_UNQUALIFIED' });
});
