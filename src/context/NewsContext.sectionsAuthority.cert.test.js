import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { __newsContextInternalsForTest } from './NewsContext.jsx';

const src = fs.readFileSync('src/context/NewsContext.jsx', 'utf8');

const {
  SECTION_IDS,
  RESUME_SYNC_MIN_AGE_MS,
  projectSectionsEnvelope,
  hasRenderableNews,
  envelopeErrors,
  deriveClientBreaking,
} = __newsContextInternalsForTest;

describe('NewsContext single Sections authority', () => {
  it('does not independently fetch section RSS feeds', () => {
    expect(src).toContain("load as loadSectionsDataset");
    expect(src).not.toContain('fetchSectionNews');
    expect(src).not.toContain('clearNewsCache');
  });

  it('uses one forced full-epoch sync for boot, interval, resume, online and manual refresh', () => {
    expect(src).toContain('forceRefresh: force');
    expect(src).toContain("reason: 'boot'");
    expect(src).toContain("reason: 'interval'");
    expect(src).toContain("'visibility-resume'");
    expect(src).toContain("'pageshow-bfcache'");
    expect(src).toContain("'network-online'");
    expect(src).toContain("document.addEventListener('visibilitychange'");
    expect(src).toContain("window.addEventListener('pageshow'");
    expect(src).toContain("window.addEventListener('online'");
  });

  it('retains last-known-good news instead of replacing it with an empty refresh', () => {
    expect(src).toContain('if (!hasNext && hasPrevious)');
    expect(src).toContain('retainedLastKnownGood: true');
    expect(src).toContain('sections_refresh_empty');
  });

  it('projects the canonical sections envelope', () => {
    const projected = projectSectionsEnvelope({
      data: {
        sections: { world: [{ id: 'w1' }], india: [{ id: 'i1' }] },
        frontPage: [{ id: 'top1' }],
      },
    });
    expect(projected.frontPage).toEqual([{ id: 'top1' }]);
    expect(projected.world).toEqual([{ id: 'w1' }]);
    expect(hasRenderableNews(projected)).toBe(true);
    expect(hasRenderableNews({ world: [] })).toBe(false);
  });

  it('preserves the complete canonical section set and a bounded resume threshold', () => {
    expect(SECTION_IDS).toContain('topStories');
    expect(SECTION_IDS).toContain('world');
    expect(SECTION_IDS).toContain('india');
    expect(SECTION_IDS).toContain('technology');
    expect(RESUME_SYNC_MIN_AGE_MS).toBe(60_000);
  });

  it('normalizes section failures and breaking projection', () => {
    expect(envelopeErrors({ data: { failedSections: [{ section: 'world', error: 'down' }] } }))
      .toEqual({ world: 'down' });
    expect(deriveClientBreaking({
      frontPage: [
        { id: 'a', isBreaking: true, breakingScore: 1 },
        { id: 'b', breakingScore: 2 },
        { id: 'c', breakingScore: 0 },
      ],
    }).map(item => item.id)).toEqual(['b', 'a']);
  });
});
