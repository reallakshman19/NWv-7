// Isolated Node tests for historical quote-reconciliation behavior. The public
// app never imports this loader: only these test processes replace the policy.
import { registerHooks } from 'node:module';

export async function importLegacyMarketServiceForTests() {
  const hooks = registerHooks({
    load(url, context, nextLoad) {
      const result = nextLoad(url, context);
      if (!url.endsWith('/src/services/marketFreeOpenPolicy.js')) return result;
      const original = String(result.source);
      const marker = 'export const MARKET_FREE_OPEN_ONLY = true;';
      if (!original.includes(marker)) throw new Error('Free-only policy marker changed; update the isolated legacy test loader.');
      return { ...result, source: original.replace(marker, 'export const MARKET_FREE_OPEN_ONLY = false;') };
    },
  });
  try {
    return await import('../src/services/indianMarketStableService.js');
  } finally {
    hooks.deregister();
  }
}
