export function isLocalAppPreview() {
  const location = globalThis.window?.location;
  if (!location) return false;
  try {
    const url = new URL(location.href || location.origin);
    return ['http:', 'https:'].includes(url.protocol) && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  } catch { return false; }
}

// Current publications can outlive the app build that bundled an older copy.
// Bound actual response bytes before JSON parsing, including chunked responses.
export async function readPublishedSnapshot(response, maxBytes = 2000000) {
  if (!response?.ok) throw Error(`Publication HTTP ${response?.status || 'unavailable'}`);
  if (Number(response.headers?.get?.('content-length')) > maxBytes) {
    await response.body?.cancel?.();
    throw Error('Publication exceeds size limit');
  }
  if (response.body?.getReader) {
    const reader = response.body.getReader(); const decoder = new TextDecoder(); const parts = []; let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read(); if (done) break;
        size += value.byteLength;
        if (size > maxBytes) { await reader.cancel(); throw Error('Publication exceeds size limit'); }
        parts.push(decoder.decode(value, { stream: true }));
      }
      parts.push(decoder.decode());
    } finally { reader.releaseLock(); }
    return JSON.parse(parts.join(''));
  }
  // Compatibility with browser response doubles and non-streaming runtimes.
  const body = typeof response.text === 'function' ? await response.text() : JSON.stringify(await response.json());
  if (new TextEncoder().encode(body).byteLength > maxBytes) throw Error('Publication exceeds size limit');
  return JSON.parse(body);
}
