import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

// Static invariants at the exact combined source revision. These tests are
// supplemental: a passing source inspection cannot replace real Chromium.
const read = path => fs.readFileSync(path, 'utf8');

describe('S1 static-primary integrated nonpublishing release rehearsal', () => {
  const deploy = read('.github/workflows/deploy.yml');
  const rehearsal = read('.github/workflows/pages-prepublication-rehearsal.yml');
  const renderer = read('src/components/NewsSection.jsx');
  const authority = read('src/utils/sectionsDataSource.js');
  const browser = read('scripts/verify_world_health_deployment.mjs');
  const falsifier = read('scripts/verify_world_epoch_negative_browser.mjs');

  it('never lets Cloudflare shadow become production Sections authority', () => {
    expect(deploy).toContain('VITE_SECTIONS_AUTHORITY: github');
    expect(deploy).not.toContain('VITE_SECTIONS_AUTHORITY: cloudflare');
    expect(authority).toContain('if (import.meta.env.PROD) return SECTIONS_DATA_SOURCES.GITHUB;');
    expect(browser).toContain('evaluateS1PrepublicationWorldHealth');
    expect(falsifier).toContain('evaluateS1PrepublicationWorldHealth');
  });

  it('binds browser-selected Pages JSON bytes to visible publisher identities', () => {
    expect(renderer).toContain('data-story-id={item.id == null');
    expect(renderer).toContain('data-story-url={storyUrl ||');
    expect(browser).toContain('observedS1Responses.push(response)');
    expect(browser).toContain('data-story-id');
    expect(browser).toContain('data-story-url');
    expect(browser).toContain("createHash('sha256')");
    expect(browser).toContain("dist/newsdata/sections_latest.json");
  });

  it('runs real-browser qualification before any Pages artifact or deployment', () => {
    const build = deploy.indexOf('run: npm run build');
    const browserStep = deploy.indexOf('Check built Pages World health before publication');
    const artifact = deploy.indexOf('actions/upload-pages-artifact@v3');
    const publish = deploy.indexOf('actions/deploy-pages@v4');
    expect(build).toBeGreaterThan(0);
    expect(browserStep).toBeGreaterThan(build);
    expect(artifact).toBeGreaterThan(browserStep);
    expect(publish).toBeGreaterThan(artifact);
    expect(deploy).toContain("PREFLIGHT_REQUIRE_S1_STATIC: 'true'");
    expect(deploy).not.toMatch(/^  push:/m);
  });

  it('keeps PR Chromium rehearsal entirely nonpublishing', () => {
    expect(rehearsal).toContain('VITE_SECTIONS_AUTHORITY: github');
    expect(rehearsal).toContain("PREFLIGHT_REQUIRE_S1_STATIC: 'true'");
    expect(rehearsal).toContain('node scripts/verify_world_epoch_negative_browser.mjs');
    expect(rehearsal).toContain('node scripts/verify_world_health_deployment.mjs');
    expect(rehearsal).not.toMatch(/actions\/(?:deploy-pages|upload-pages-artifact|configure-pages)@/);
    expect(rehearsal).not.toContain('pages: write');
    expect(rehearsal).not.toContain('id-token: write');
  });

  it('refuses to count either synthetic shadow scenario as S1 acceptance', () => {
    expect(falsifier).toContain("await run('static-fallback-empty-worker', brokenWorkerBody, false)");
    expect(falsifier).toContain("await run('shadow-worker-alone-not-release-proof', committedBody, false)");
    expect(falsifier).not.toContain('evaluatePrepublicationWorldHealth(report, observed');
  });
});
