/** One absolute deadline from request through body read; no retry/proxy waterfall. */
export async function boundedMarketJson(url, {
  fetchImpl = fetch, signal, timeoutMs = 8000, maxBytes = 2 * 1024 * 1024,
} = {}) {
  if (signal?.aborted) throw Object.assign(new Error('Request cancelled'), { name: 'AbortError' });
  const controller = new AbortController();
  const externalAbort = () => controller.abort();
  signal?.addEventListener('abort', externalAbort, { once: true });
  let timer;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(Object.assign(new Error('Market source deadline exceeded'), { name: 'TimeoutError' }));
    }, timeoutMs);
  });
  try {
    const transaction = (async () => {
      const response = await fetchImpl(url, { signal: controller.signal });
      if (!response?.ok) {
        const error = new Error(`Source returned HTTP ${response?.status ?? 'unavailable'}`);
        error.status = response?.status;
        throw error;
      }
      const size = Number(response.headers?.get?.('content-length'));
      if (Number.isFinite(size) && size > maxBytes) throw new Error('Market source response exceeds byte limit');
      const contentType = response.headers?.get?.('content-type') || '';
      if (/\btext\/html\b/i.test(contentType)) throw new Error('Source returned HTML rather than JSON');
      if (response.body?.getReader) {
        const reader = response.body.getReader();
        let length = 0;
        const chunks = [];
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            length += value?.byteLength || 0;
            if (length > maxBytes) throw new Error('Market source response exceeds byte limit');
            chunks.push(value);
          }
        } finally { reader.releaseLock?.(); }
        const bytes = new Uint8Array(length);
        let offset = 0;
        for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
        return JSON.parse(new TextDecoder().decode(bytes));
      }
      // Mocks without streamed bodies preserve the repository's response.json contract.
      // Real browser fetch responses have body streams and are byte-enforced above.
      if (typeof response.text === 'function') {
        const raw = await response.text();
        if (new TextEncoder().encode(raw).length > maxBytes) throw new Error('Market source response exceeds byte limit');
        return JSON.parse(raw);
      }
      return response.json();
    })();
    return await Promise.race([transaction, deadline]);
  } catch (error) {
    if (signal?.aborted && error?.name !== 'AbortError')
      throw Object.assign(new Error('Request cancelled'), { name: 'AbortError' });
    throw error;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', externalAbort);
    controller.abort();
  }
}
