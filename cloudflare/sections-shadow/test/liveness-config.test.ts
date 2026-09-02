import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';

describe('Sections shadow liveness deployment contract', () => {
  it('keeps hourly acquisition live without making Browser Run a required dependency', () => {
    expect(env.SHADOW_SCHEDULE_ENABLED).toBe('true');
    expect(env.SHADOW_LIVE_ACQUISITION_ENABLED).toBe('true');
    expect(env.SHADOW_BROWSER_FALLBACK_ENABLED).toBe('false');
    expect(env.SHADOW_PREVIEW_READ_ENABLED).toBe('true');
  });
});
