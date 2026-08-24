import { describe, expect, it, vi } from 'vitest';
import { discoverAkashvaniMorningNews, parseAkashvaniMorningNews } from './akashvaniMorningNews.js';

const CURRENT_SAMPLE = `
<html><body>
  <div>August 24, 2026 8:15 AM</div>
  <h2>Morning News</h2>
</body></html>`;

describe('Akashvani Morning News adapter', () => {
  it('builds a dated canonical identity from the rolling publisher product', () => {
    const candidate = parseAkashvaniMorningNews(
      CURRENT_SAMPLE, '2026-08-24', '2026-08-24T03:00:00Z',
    );
    expect(candidate.canonicalId).toBe('akashvani:morning-news:english-national:2026-08-24');
    expect(candidate.editionState).toBe('CURRENT');
    expect(candidate.linkSemantics).toBe('ROLLING_PRODUCT_URL');
    expect(candidate.accessibilityState).toBe('UNKNOWN');
  });

  it('marks an older rolling page stale rather than current', () => {
    const stale = CURRENT_SAMPLE.replace('August 24', 'August 23');
    expect(parseAkashvaniMorningNews(stale, '2026-08-24', '2026-08-24T03:00:00Z').editionState)
      .toBe('STALE');
  });

  it('does not fetch before the publication window', async () => {
    const fetchImpl = vi.fn();
    const result = await discoverAkashvaniMorningNews({
      digestDate: '2026-08-24', now: new Date('2026-08-24T02:00:00Z'), fetchImpl,
    });
    expect(result.status).toBe('BEFORE_WINDOW');
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
