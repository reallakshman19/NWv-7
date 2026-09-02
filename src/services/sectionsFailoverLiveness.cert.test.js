import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

function read(path) {
  return fs.readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
}

describe('NW-CF-HYBRID-002 failover liveness contract', () => {
  it('keeps hourly shadow acquisition enabled without Browser Run as a hard dependency', () => {
    const config = JSON.parse(read('cloudflare/sections-shadow/wrangler.jsonc'));
    expect(config.triggers.crons).toEqual(['0 * * * *']);
    expect(config.vars.SHADOW_SCHEDULE_ENABLED).toBe('true');
    expect(config.vars.SHADOW_LIVE_ACQUISITION_ENABLED).toBe('true');
    expect(config.vars.SHADOW_BROWSER_FALLBACK_ENABLED).toBe('false');
    expect(config.vars.SHADOW_PREVIEW_READ_ENABLED).toBe('true');
    expect(config.vars.SHADOW_MODE).toBe('S1_GITHUB_PRIMARY_CF_SHADOW');
  });

  it('keeps Cloudflare Preview opt-in and surfaces the concrete fallback reason', () => {
    const source = read('src/components/SectionsDataSourceToggle.jsx');
    expect(source).toContain('Cloudflare <span>(Preview)</span>');
    expect(source).toContain('runtimeStatus.fallbackReason');
    expect(source).toContain('preview snapshot stale/incomplete');
    expect(source).toContain('preview request timed out');
    expect(source).toContain('showing GitHub');
  });

  it('does not change browser serving authority or add a public Worker write route', () => {
    const worker = read('cloudflare/sections-shadow/src/index.ts');
    expect(worker).toContain("servingAuthority: 'github_static'");
    expect(worker).toContain('cloudflareBrowserServingAuthority: false');
    expect(worker).toContain("if (request.method !== 'GET')");
    expect(worker).not.toContain("request.method === 'POST'");
  });
});
