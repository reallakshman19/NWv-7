import { describe, expect, it } from 'vitest';
import { evaluateS1PrepublicationWorldHealth } from '../../../scripts/evaluate_s1_prepublication.mjs';

const CHECKED = Date.parse('2026-10-28T06:00:00.000Z');
const SHA = 'a'.repeat(64);
const URL = 'https://reallakshman19.github.io/NWv-7/newsdata/sections_latest.json?t=1';
const STORIES = Array.from({ length: 10 }, (_, i) => ({
  id: 'world-' + i,
  title: 'World headline ' + i,
  url: 'https://publisher.example/story/' + i,
  sourceGroup: i % 2 ? 'publisher-family-a' : 'publisher-family-b',
  publishedAt: CHECKED - (i + 1) * 60_000,
}));
const RESPONSE = {
  url: URL, responseStatus: 200, bytesSha256: SHA,
  body: { schemaVersion: 2, fetchedAt: CHECKED - 60_000,
    sections: { world: STORIES },
    sectionQuality: { world: { storyCount: 10, sourceGroupCount: 2 } } },
};
const REPORT = {
  badgeStatus: 'ok', sectionId: 'world', storyCount: 10, sourceGroupCount: 2,
  topSourcesText: 'Publisher families a / b',
  selectedSourceEvents: [{
    requested: 'github_static', effective: 'github_static', fallback: false,
  }],
  visibleWorldCards: STORIES.slice(0, 3).map(row => ({ id: row.id, url: row.url })),
};
const check = (report = REPORT, observed = [RESPONSE], rest = {}) =>
  evaluateS1PrepublicationWorldHealth({
    report, observed, checkedAt: CHECKED, expectedByteSha256: SHA, ...rest,
  });

describe('S1 static-primary Pages candidate source-to-DOM prepublication contract', () => {
  it('accepts fresh candidate bytes the actual static browser selected and rendered', () => {
    expect(check()).toMatchObject({
      ok: true, errors: [], selectedAuthority: 'github_static',
      renderedWorldCards: 3, eligibleWorldItems: 10,
    });
  });

  it('denies a healthy Cloudflare shadow as production authority', () => {
    expect(check({
      ...REPORT, selectedSourceEvents: [{ requested: 'cloudflare_preview',
        effective: 'cloudflare_preview', fallback: false }],
    }).errors).toContain('browser_not_using_authorized_s1_static');
  });

  it('denies a static fallback after the browser ever selected Cloudflare', () => {
    expect(check({
      ...REPORT, selectedSourceEvents: [
        { requested: 'cloudflare_preview', effective: 'cloudflare_preview', fallback: false },
        { requested: 'cloudflare_preview', effective: 'github_static', fallback: true },
      ],
    }).ok).toBe(false);
  });

  it('denies current data whose served bytes do not match the frozen candidate', () => {
    expect(check(REPORT, [{ ...RESPONSE, bytesSha256: 'b'.repeat(64) }]).errors)
      .toContain('selected_public_named_bytes_do_not_match_candidate');
  });

  it('denies stale or future-dated acquisition timestamps', () => {
    for (const timestamp of [CHECKED - 13 * 60 * 60_000, CHECKED + 60_000, 0]) {
      expect(check(REPORT, [{ ...RESPONSE, body: {
        ...RESPONSE.body, fetchedAt: timestamp,
      } }]).errors).toContain('s1_generation_expired_or_time_invalid');
    }
  });

  it('denies missing, duplicated or unrelated DOM card IDs and publisher URLs', () => {
    for (const cards of [[], [REPORT.visibleWorldCards[0], REPORT.visibleWorldCards[0]],
      [{ id: 'world-0', url: 'https://evil.example/impostor' }],
      [{ id: 'invented', url: STORIES[0].url }]]) {
      expect(check({ ...REPORT, visibleWorldCards: cards }).errors)
        .toContain('rendered_world_card_identity_not_bound_to_selected_source');
    }
  });

  it('rejects World with insufficient independent source families or stale items', () => {
    const singleSource = STORIES.map(row => ({ ...row, sourceGroup: 'one-family' }));
    const expired = STORIES.map(row => ({ ...row,
      publishedAt: CHECKED - 40 * 60 * 60_000 }));
    for (const world of [singleSource, expired]) {
      expect(check(REPORT, [{ ...RESPONSE, body: {
        ...RESPONSE.body, sections: { world },
      } }]).errors).toContain('world_qualified_coverage_insufficient');
    }
  });

  it('denies response from a different host or path even with matching bytes', () => {
    for (const url of ['https://nw-sections-shadow.reallaksh19.workers.dev/preview/sections/latest',
      'https://other.example/NWv-7/newsdata/sections_latest.json',
      'https://reallakshman19.github.io/NWv-7/private.json']) {
      expect(check(REPORT, [{ ...RESPONSE, url }]).errors)
        .toContain('s1_static_snapshot_missing_or_invalid');
    }
  });
});
