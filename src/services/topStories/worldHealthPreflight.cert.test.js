import fs from 'node:fs';
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

  it('fails closed before any Pages artifact upload or deploy job', () => {
    const workflow = fs.readFileSync('.github/workflows/deploy.yml', 'utf8');
    const build = workflow.indexOf('run: npm run build');
    const preflight = workflow.indexOf('Check built Pages World health before publication');
    const manifest = workflow.indexOf('Write pages data manifest');
    const artifactUpload = workflow.indexOf('actions/upload-pages-artifact@v3');
    const deploy = workflow.indexOf('actions/deploy-pages@v4');

    expect(build).toBeGreaterThan(0);
    expect(preflight).toBeGreaterThan(build);
    expect(preflight).toBeLessThan(manifest);
    expect(manifest).toBeLessThan(artifactUpload);
    expect(artifactUpload).toBeLessThan(deploy);
    expect(workflow).toContain('PREFLIGHT_ASSET_ORIGIN: http://127.0.0.1:4173/');
    expect(workflow).toContain('DEPLOYED_BASE_URL: https://reallakshman19.github.io/NWv-7/');
    expect(workflow).toContain('node scripts/verify_world_health_deployment.mjs');
    expect(workflow).toContain('world-health-prepublish-');
  });

  it('returns null when no preview source is configured (real deployed Pages check)', () => {
    expect(mapPreflightAssetUrl(PAGES, PAGES, '')).toBeNull();
  });
});
