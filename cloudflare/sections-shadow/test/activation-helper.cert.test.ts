import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const SCRIPT = readFileSync(new URL('../scripts/activate-production.mjs', import.meta.url), 'utf8');
const PACKAGE = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

describe('NW-CF-ACT-001 production activation helper', () => {
  it('fails closed against accidental Cloudflare resource creation', () => {
    expect(SCRIPT).toContain("const NO_AUTO_CREATE = '--experimental-auto-create=false'");
    expect(SCRIPT).not.toMatch(/wrangler\(\[['\"](?:d1|queues)['\"],\s*['\"]create['\"]/);
    expect(SCRIPT).not.toContain('migrations apply');
  });

  it('discovers only the existing named D1 and never prints its UUID', () => {
    expect(SCRIPT).toContain("const DB_NAME = 'nw-sections-shadow'");
    expect(SCRIPT).toContain("['d1', 'list', '--json'");
    expect(SCRIPT).toContain('Expected exactly one existing D1 database');
    expect(SCRIPT).toContain('UUID intentionally not printed');
  });

  it('pins the S1 authority and P0 runtime flags before deployment', () => {
    for (const token of [
      "SHADOW_MODE === 'S1_GITHUB_PRIMARY_CF_SHADOW'",
      "SHADOW_SCHEDULE_ENABLED === 'true'",
      "SHADOW_LIVE_ACQUISITION_ENABLED === 'true'",
      "SHADOW_BROWSER_FALLBACK_ENABLED === 'false'",
      "SHADOW_PREVIEW_READ_ENABLED === 'true'",
      "cron === '0 * * * *'",
    ]) {
      expect(SCRIPT).toContain(token);
    }
  });

  it('requires a recent verified independent live epoch after deploy', () => {
    expect(SCRIPT).toContain("body?.preview?.evidenceVerified !== true");
    expect(SCRIPT).toContain("!epochId.startsWith('live-')");
    expect(SCRIPT).toContain('MAX_PREVIEW_AGE_MS');
    expect(SCRIPT).toContain("x-nw-data-source') !== 'cloudflare-preview'");
  });

  it('exposes prepare, deploy, and smoke entry points without Actions', () => {
    expect(PACKAGE.scripts['activate:prepare']).toContain('--prepare-only');
    expect(PACKAGE.scripts['activate:production']).toContain('activate-production.mjs');
    expect(PACKAGE.scripts['smoke:production']).toContain('--smoke-only');
    expect(PACKAGE.scripts['deploy:check']).toContain('--experimental-auto-create=false');
  });
});
