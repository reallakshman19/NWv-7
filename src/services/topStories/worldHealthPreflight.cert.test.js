import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { mapPreflightAssetUrl, evaluatePrepublicationWorldHealth } from '../../../scripts/verify_world_health_deployment.mjs';

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


describe('prepublication World committed-epoch negative challenges', () => {
  const checkedAt = '2026-10-23T08:30:00.000Z';
  const healthy = {
    badgeStatus: 'ok', sectionId: 'world',
    storyCount: 30, sourceGroupCount: 2, topSourcesText: 'Two observed publishers',
  };
  const response = {
    url: 'https://nw-sections-shadow.reallaksh19.workers.dev/preview/sections/latest',
    responseStatus: 200, epochId: 'live-' + Date.parse('2026-10-23T08:00:00.000Z'),
  };

  it('accepts only a healthy badge and fresh observed committed Cloudflare epoch', () => {
    expect(evaluatePrepublicationWorldHealth(healthy, [response], checkedAt))
      .toEqual(expect.objectContaining({ ok: true, errors: [], epochId: response.epochId }));
  });

  it('blocks critical, warning, zero World stories and missing source evidence', () => {
    for (const broken of [
      { ...healthy, badgeStatus: 'critical' },
      { ...healthy, badgeStatus: 'warning' },
      { ...healthy, storyCount: 0 },
      { ...healthy, sourceGroupCount: 0 },
      { ...healthy, topSourcesText: 'none recorded' },
    ]) {
      expect(evaluatePrepublicationWorldHealth(broken, [response], checkedAt).ok).toBe(false);
    }
  });

  it('fails closed for stale/missing/failed/future committed World authority', () => {
    const bad = [
      [],
      [{ ...response, responseStatus: 503 }],
      [{ ...response, epochId: 'live-' + Date.parse('2026-10-22T08:00:00.000Z') }],
      [{ ...response, epochId: 'live-' + Date.parse('2026-10-23T09:00:00.000Z') }],
      [{ ...response, epochId: 'staged-' + Date.parse('2026-10-23T08:00:00.000Z') }],
    ];
    for (const observed of bad) {
      expect(evaluatePrepublicationWorldHealth(healthy, observed, checkedAt).ok).toBe(false);
    }
  });

  it('rejects encoded path traversal instead of routing it to local preview', () => {
    expect(mapPreflightAssetUrl(PAGES + '%2e%2e/secrets', PAGES, PREVIEW)).toBeNull();
    expect(mapPreflightAssetUrl(PAGES + '%2f%2fevil.example/', PAGES, PREVIEW)).toBeNull();
  });

  it('requires real-source preflight and a second current-main check before Pages upload', () => {
    const yaml = fs.readFileSync('.github/workflows/deploy.yml', 'utf8');
    const pre = yaml.indexOf('Check built Pages World health before publication');
    const immutable = yaml.indexOf('Reject superseded source before publication for every release trigger');
    const upload = yaml.indexOf('actions/upload-pages-artifact@v3');
    expect(yaml).toContain("PREFLIGHT_REQUIRE_FRESH_WORLD: 'true'");
    expect(yaml).toContain('Certify data-refresh or operator checkout before publishing');
    expect(yaml).not.toMatch(/^ {2}push:$/m);
    expect(pre).toBeGreaterThan(0);
    expect(immutable).toBeGreaterThan(pre);
    expect(immutable).toBeLessThan(upload);
  });
});
