import { describe, expect, it } from 'vitest';
import {
  assessSectionsSnapshot,
  assessWorkerHealth,
  inspectSectionsSourceLiveness,
} from '../../../scripts/verify_sections_source_liveness.mjs';

const NOW = Date.UTC(2026, 9, 19, 7, 0, 0);
const HOUR = 60 * 60 * 1000;

function snapshot(overrides = {}) {
  return {
    schemaVersion: 2,
    fetchedAt: NOW - HOUR,
    preview: { epochId: 'live-epoch-1', evidenceVerified: true },
    sections: {
      world: [
        { publishedAt: NOW - HOUR, title: 'World event', sourceGroup: 'bbc' },
        { publishedAt: NOW - 2 * HOUR, title: 'Other event', sourceGroup: 'reuters' },
      ],
    },
    ...overrides,
  };
}

function health(overrides = {}) {
  return {
    status: 'ok',
    previewReadEnabled: true,
    shadowScheduleEnabled: true,
    liveAcquisitionEnabled: true,
    ...overrides,
  };
}

function fakeFetch({ worker = health(), primary = snapshot(), fallback = snapshot(), codes = {} } = {}) {
  const calls = [];
  const fn = async url => {
    calls.push(url);
    const key = url.endsWith('/health')
      ? 'health' : url.includes('workers.dev') ? 'preview' : 'fallback';
    const data = key === 'health' ? worker : key === 'preview' ? primary : fallback;
    const status = codes[key] || 200;
    return { ok: status === 200, status, json: async () => data };
  };
  fn.calls = calls;
  return fn;
}

describe('NW-OPS-001 public Sections liveness gate', () => {
  it('accepts a current committed worker epoch with independently fresh World stories', () => {
    expect(assessSectionsSnapshot(snapshot(), { nowMs: NOW })).toMatchObject({
      ok: true,
      failures: [],
      epochId: 'live-epoch-1',
      freshWorldRows: 2,
      freshWorldSourceGroups: 2,
    });
    expect(assessWorkerHealth(health()).ok).toBe(true);
  });

  it('rejects stale, future-dated or uncommitted preview even when World rows exist', () => {
    for (const broken of [
      snapshot({ fetchedAt: NOW - 13 * HOUR }),
      snapshot({ fetchedAt: NOW + 30 * 60 * 1000 }),
      snapshot({ fetchedAt: 1e25 }),
      snapshot({ preview: { epochId: 'latest', evidenceVerified: false } }),
      snapshot({ preview: null }),
    ]) {
      expect(assessSectionsSnapshot(broken, { nowMs: NOW }).ok).toBe(false);
    }
  });

  it('rejects empty and stale World even if a producer stamped a current fetchedAt', () => {
    const empty = snapshot({ sections: { world: [], india: [{ publishedAt: NOW }] } });
    const expired = snapshot({ sections: {
      world: [{ title: 'Old World event', publishedAt: NOW - 40 * HOUR, sourceGroup: 'wire' }],
    } });
    expect(assessSectionsSnapshot(empty, { nowMs: NOW }).failures).toContain('no_fresh_world_stories');
    expect(assessSectionsSnapshot(expired, { nowMs: NOW }).failures).toContain('no_fresh_world_stories');
  });

  it('rejects missing World publisher provenance', () => {
    const candidate = snapshot({ sections: {
      world: [{ title: 'Event', publishedAt: NOW - HOUR }],
    } });
    expect(assessSectionsSnapshot(candidate, { nowMs: NOW }).failures)
      .toContain('world_source_provenance_missing');
  });

  it('rejects unhealthy disabled Worker schedules and preview reads', () => {
    expect(assessWorkerHealth(health({
      previewReadEnabled: false,
      shadowScheduleEnabled: false,
    })).failures).toEqual(['preview_read_disabled', 'shadow_schedule_disabled']);
  });

  it('separates failed Cloudflare and stale Github fallback rather than silently passing', async () => {
    const fetchImpl = fakeFetch({
      codes: { preview: 503 },
      fallback: snapshot({ fetchedAt: NOW - 60 * 24 * HOUR }),
    });
    const result = await inspectSectionsSourceLiveness({ fetchImpl, nowMs: NOW });
    expect(result.status).toBe('FAIL');
    expect(result.failures).toContain('preview:preview_HTTP_503');
    expect(result.failures).toContain('pages_fallback:snapshot_not_fresh');
    expect(result.verifiedProductionBrowser).toBe(false);
    expect(fetchImpl.calls).toHaveLength(3);
  });

  it('passes when all independent public sources are fresh, without writing data', async () => {
    const fetchImpl = fakeFetch();
    const result = await inspectSectionsSourceLiveness({ fetchImpl, nowMs: NOW });
    expect(result.status).toBe('PASS');
    expect(result.primary.freshWorldRows).toBe(2);
    expect(result.fallback.freshWorldRows).toBe(2);
    expect(fetchImpl.calls).toHaveLength(3);
  });
});
