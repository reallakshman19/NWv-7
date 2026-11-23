/**
 * Owner-only NSE MCP bridge for the static NWv-7 Market desk.
 *
 * This is NOT a public market-data publication service. Each request must
 * originate from a configured frontend origin and carry a separate owner secret.
 * No credentials, sessions, prices, or quote histories are persisted.
 *
 * NSE MCP: https://mcp.nseindia.in/cmmkt/mcp
 * Scope: one explicitly requested NSE equity quote, not index levels.
 */
const NSE_MCP = 'https://mcp.nseindia.in/cmmkt/mcp';
const PROTOCOL = '2025-06-18';
const ALLOWED_SYMBOLS = new Set([
  'RELIANCE', 'TCS', 'HDFCBANK', 'INFY', 'ICICIBANK', 'SBIN',
  'ITC', 'BHARTIARTL', 'KOTAKBANK', 'LT', 'HINDUNILVR',
  'AXISBANK', 'BAJFINANCE', 'MARUTI', 'WIPRO', 'SUNPHARMA',
]);
const INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/i;
const MAX_RESPONSE_CHARS = 140000;

function json(value, status = 200, origin = null) {
  const headers = {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'private, no-store, max-age=0',
    'x-content-type-options': 'nosniff',
    'vary': 'Origin',
  };
  if (origin) {
    headers['access-control-allow-origin'] = origin;
    headers['access-control-allow-methods'] = 'POST, OPTIONS';
    headers['access-control-allow-headers'] = 'Authorization, Content-Type';
    headers['access-control-max-age'] = '300';
  }
  return new Response(JSON.stringify(value), { status, headers });
}

function secretEquals(a, b) {
  if (!a || !b) return false;
  const e = new TextEncoder();
  const x = e.encode(a), y = e.encode(b);
  let difference = x.length ^ y.length;
  const length = Math.max(x.length, y.length);
  for (let i = 0; i < length; i++) difference |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return difference === 0;
}

function rpcBody(id, method, params) {
  return JSON.stringify({
    jsonrpc: '2.0', id, method, ...(params === undefined ? {} : { params }),
  });
}

function decodeRpc(text, contentType) {
  if (text.length > MAX_RESPONSE_CHARS) throw new Error('NSE_RESPONSE_TOO_LARGE');
  if (contentType.includes('text/event-stream')) {
    const messages = text.split(/\r?\n\r?\n/);
    for (const event of messages) {
      const data = event.split(/\r?\n/)
        .filter(line => line.startsWith('data:'))
        .map(line => line.slice(5).trimStart()).join('\n');
      if (data && data !== '[DONE]') {
        const candidate = JSON.parse(data);
        if ('result' in candidate || 'error' in candidate) return candidate;
      }
    }
    throw new Error('NSE_EMPTY_STREAM');
  }
  return JSON.parse(text);
}

async function mcpPost(fetchImpl, body, session = '') {
  const headers = {
    accept: 'application/json, text/event-stream',
    'content-type': 'application/json',
    'mcp-protocol-version': PROTOCOL,
  };
  if (session) headers['mcp-session-id'] = session;
  const response = await fetchImpl(NSE_MCP, {
    method: 'POST', headers, body,
    signal: AbortSignal.timeout(12000),
    redirect: 'error',
    cache: 'no-store',
  });
  if (!response.ok) throw new Error('NSE_HTTP_' + response.status);
  const sessionId = response.headers.get('mcp-session-id') || session;
  if (response.status === 202 || response.status === 204) return { sessionId, packet: null };
  const raw = await response.text();
  return { sessionId, packet: decodeRpc(raw, response.headers.get('content-type') || '') };
}

function finitePrice(raw) {
  if (typeof raw !== 'number' && typeof raw !== 'string') return null;
  const number = Number(typeof raw === 'string' ? raw.replaceAll(',', '') : raw);
  return Number.isFinite(number) && number > 0 ? number : null;
}
function finiteChange(raw) {
  if (typeof raw !== 'number' && typeof raw !== 'string') return null;
  if (raw === '') return null;
  const number = Number(typeof raw === 'string' ? raw.replaceAll(',', '').replace('%', '') : raw);
  return Number.isFinite(number) ? number : null;
}

export function normalizeNseQuote(content, expectedSymbol, nowMs = Date.now()) {
  if (!content || typeof content !== 'object' || content.error) return null;
  const stock = content.stock || content.data?.stock || content;
  const actualSymbol = String(stock.symbol || content.symbol || '').trim().toUpperCase();
  if (actualSymbol !== expectedSymbol) return null;
  const price = finitePrice(stock.lastTradedPrice);
  const rawTime = content.updatedAt || content.lastCrawled || stock.updatedAt;
  if (!price || typeof rawTime !== 'string' || !INSTANT.test(rawTime)) return null;
  const observed = Date.parse(rawTime);
  if (!Number.isFinite(observed) || observed > nowMs + 300000 || nowMs - observed > 7 * 86400000) return null;
  const freshness = nowMs - observed <= 15 * 60000 ? 'RECENT_PROVIDER_OBSERVATION' : 'HISTORICAL_OBSERVATION';
  return {
    symbol: actualSymbol,
    value: price,
    change: finiteChange(stock.change),
    changePercent: finiteChange(stock.perChange),
    quoteAt: new Date(observed).toISOString(),
    requestedAt: new Date(nowMs).toISOString(),
    freshness,
    source: 'NSE CM Market Live MCP',
    delayNote: 'NSE advertises approximately 1–3 minutes intraday delay; the original observation time is shown.',
  };
}

export async function handleRequest(request, env, fetchImpl = fetch, now = Date.now()) {
  const expectedOrigin = env?.ALLOWED_ORIGIN;
  const origin = request.headers.get('origin');
  if (!expectedOrigin || !env?.MARKET_OWNER_TOKEN || origin !== expectedOrigin) {
    return json({ error: 'NOT_AUTHORIZED' }, 403);
  }
  if (request.method === 'OPTIONS') return json({ ok: true }, 200, origin);
  if (request.method !== 'POST' || new URL(request.url).pathname !== '/quote') {
    return json({ error: 'NOT_FOUND' }, 404, origin);
  }
  const auth = request.headers.get('authorization') || '';
  if (!auth.startsWith('Bearer ') || !secretEquals(auth.slice(7), env.MARKET_OWNER_TOKEN)) {
    return json({ error: 'NOT_AUTHORIZED' }, 401, origin);
  }
  if (Number(request.headers.get('content-length')) > 1000) {
    return json({ error: 'INVALID_REQUEST' }, 400, origin);
  }
  let symbol;
  try {
    const input = await request.json();
    symbol = typeof input?.symbol === 'string' ? input.symbol.toUpperCase().trim() : '';
  } catch {
    return json({ error: 'INVALID_REQUEST' }, 400, origin);
  }
  if (!ALLOWED_SYMBOLS.has(symbol)) return json({ error: 'UNSUPPORTED_SYMBOL' }, 400, origin);

  try {
    const init = await mcpPost(fetchImpl, rpcBody(1, 'initialize', {
      protocolVersion: PROTOCOL,
      capabilities: {},
      clientInfo: { name: 'NWv7-personal-market', version: '1.0.0' },
    }));
    if (!init.packet?.result || !init.sessionId) throw new Error('NSE_INITIALIZE_FAILED');
    await mcpPost(fetchImpl, JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }), init.sessionId);
    const tool = await mcpPost(fetchImpl, rpcBody(2, 'tools/call', {
      name: 'cm_get_stock_quote', arguments: { symbol },
    }), init.sessionId);
    if (tool.packet?.error || tool.packet?.result?.isError) throw new Error('NSE_TOOL_FAILED');
    const block = tool.packet?.result?.content?.find(item => item.type === 'text');
    const payload = block?.text ? JSON.parse(block.text) : null;
    const quote = normalizeNseQuote(payload, symbol, now);
    if (!quote) throw new Error('NSE_QUOTE_UNQUALIFIED');
    return json({ quote }, 200, origin);
  } catch {
    // Do not return upstream stack traces, credentials, sessions or payloads.
    return json({ error: 'NSE_UNAVAILABLE_OR_UNQUALIFIED' }, 502, origin);
  }
}

export default { fetch: (request, env) => handleRequest(request, env) };
