import { describe, expect, it } from 'vitest';
import { mapPreflightAssetUrl } from '../../../scripts/verify_world_health_deployment.mjs';

const PAGES = 'https://reallakshman19.github.io/NWv-7/';
const PREVIEW = 'http://127.0.0.1:4173';

describe('Pages-origin World health prepublication asset proxy', () => {
  it('serves the Pages document from local preview while preserving a Pages browser URL', () => {
    expect(mapPreflightAssetUrl(PAGES + '?world-health-smoke=123', PAGES, PREVIEW))
      .toBe(PREVIEW + '/?world-health-smoke=123');
    expect(mapPreflightAssetUrl(PAGES + 'assets/index-42.js', PAGES, PREVIEW))
      .toBe(PREVIEW + '/assets/index-42.js');
  });

  it('does not rewrite remote Cloudflare authority URLs or sibling Pages paths', () => {
    expect(mapPreflightAssetUrl(
      'https://nw-sections-shadow.reallaksh19.workers.dev/preview/sections/latest',
      PAGES, PREVIEW,
    )).toBeNull();
    expect(mapPreflightAssetUrl('https://reallakshman19.github.io/other/', PAGES, PREVIEW))
      .toBeNull();
    expect(mapPreflightAssetUrl('https://reallakshman19.github.io/NWv-7x/', PAGES, PREVIEW))
      .toBeNull();
  });

  it('disallows remote or non-HTTP preflight sources', () => {
    expect(() => mapPreflightAssetUrl(PAGES, PAGES, 'https://example.org'))
      .toThrow(/localhost HTTP origin/);
    expect(() => mapPreflightAssetUrl(PAGES, PAGES, 'http://10.0.0.1:4173'))
      .toThrow(/localhost HTTP origin/);
  });

  it('returns null when no preview source is configured (real deployed Pages check)', () => {
    expect(mapPreflightAssetUrl(PAGES, PAGES, '')).toBeNull();
  });
});
