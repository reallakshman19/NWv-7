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

  it('rechecks the exact frozen SHA in the deploy job before publication', () => {
    const yaml = fs.readFileSync('.github/workflows/deploy.yml', 'utf8');
    const late = yaml.indexOf('Recheck frozen source immediately before Pages publication');
    const deploy = yaml.indexOf('actions/deploy-pages@v4');
    expect(late).toBeGreaterThan(0);
    expect(late).toBeLessThan(deploy);
    expect(yaml).toContain('EXPECTED_SHA: ${{ needs.build.outputs.source_sha }}');
    expect(yaml.slice(late, deploy)).toContain('git ls-remote');
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


describe('PR-only nonpublishing Chromium rehearsal contract', () => {
  const rehearsal = fs.readFileSync('.github/workflows/pages-prepublication-rehearsal.yml', 'utf8');
  const headExpression = '$' + '{{ github.event.pull_request.head.sha }}';

  it('restricts execution to pull requests and cannot publish Pages', () => {
    expect(rehearsal).toMatch(/^  pull_request:\s*$/m);
    expect(rehearsal).toMatch(/^permissions:\n  contents: read\s*$/m);
    expect(rehearsal).not.toMatch(/^  (?:push|workflow_run|workflow_dispatch):/m);
    expect(rehearsal).not.toMatch(/(?:pages: write|id-token: write|contents: write)/);
    expect(rehearsal).not.toMatch(/actions\/(?:deploy-pages|upload-pages-artifact|configure-pages)@/);
    expect(rehearsal).not.toContain('environment: github-pages');
    expect(rehearsal).toContain('github.event.pull_request.head.repo.full_name == github.repository');
    expect(rehearsal).toContain('persist-credentials: false');
  });

  it('pins the candidate to the exact PR head before running the production-mode build', () => {
    expect(rehearsal).toContain('ref: ' + headExpression);
    expect(rehearsal).toContain('EXPECTED_HEAD_SHA: ' + headExpression);
    expect(rehearsal).toContain('git rev-parse HEAD');
    expect(rehearsal).toContain('VITE_SECTIONS_AUTHORITY: cloudflare');
    expect(rehearsal).toContain('VITE_SECTIONS_AUTHORITY_URL: https://nw-sections-shadow.reallaksh19.workers.dev/preview/sections/latest');
    expect(rehearsal).toContain('VITE_SECTIONS_CLOUDFLARE_PREVIEW_URL: https://nw-sections-shadow.reallaksh19.workers.dev/preview/sections/latest');
    expect(rehearsal.indexOf('git rev-parse HEAD')).toBeLessThan(rehearsal.indexOf('run: npm run build'));
  });

  it('fails the hosted job if real preflight refuses and always uploads its diagnostic artifact', () => {
    expect(rehearsal).toContain('npx playwright install --with-deps chromium');
    expect(rehearsal).toContain('DEPLOYED_BASE_URL: https://reallakshman19.github.io/NWv-7/');
    expect(rehearsal).toContain('PREFLIGHT_ASSET_ORIGIN: http://127.0.0.1:4173/');
    expect(rehearsal).toContain("PREFLIGHT_REQUIRE_FRESH_WORLD: 'true'");
    expect(rehearsal).toContain('set -euo pipefail');
    expect(rehearsal).toContain('node scripts/verify_world_health_deployment.mjs 2>&1 | tee');
    expect(rehearsal).toMatch(/- name: Upload diagnostic report and screenshot on any outcome\n        if: always\(\)/);
    expect(rehearsal).toContain('path: artifacts/world-health-prepublish/');
    expect(rehearsal).toContain('candidateHeadSha');
    expect(rehearsal).toContain('publishingEnabled');
  });
});
