// @vitest-environment jsdom
/**
 * A10 STAGE 1 — frozen producer-independent counterexamples.
 *
 * IMPORTANT: PASS means the original baseline presentation defect reproduced,
 * not that the UI is correct. This is a diagnostic workpack, never a release
 * certification or a regression expected to survive the correction.
 */
import React from 'react';
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import DataHealthPanel from './DataHealthPanel.jsx';
import { __getDatasetCacheForTest, __clearDatasetCacheForTest } from '../data/orchestrator/useDataset.js';
import { __upAheadPageViewModelInternalsForTest as ua } from '../viewModels/useUpAheadPageViewModel.js';
import { isPublisherArticle, normalizeNewspaperEdition } from '../services/newspaperEditionService.js';

function renderDataHealth(envelope) {
  __clearDatasetCacheForTest();
  __getDatasetCacheForTest().set('a10:latest', envelope);
  return renderToStaticMarkup(<DataHealthPanel />);
}
afterEach(() => __clearDatasetCacheForTest());

describe('A10 Stage-1 baseline diagnosis: provenance claims in actual UI layers', () => {
  it('D01 shows Validation passed when a runtime envelope has NO validation result', () => {
    const html = renderDataHealth({ ok: true, source: 'snapshot', freshness: 'fresh' });
    expect(html).toContain('Data Health');
    expect(html).toMatch(/Validation:<\/strong>\s*passed/);
    expect(html).toMatch(/Source:<\/strong>\s*snapshot/);
    // Error reproduced: the rendered label overclaims missing evidence.
  });

  it('D01 positive control: actual failed validation remains visibly failed', () => {
    const html = renderDataHealth({ ok: false, source: 'snapshot', freshness: 'stale', validation: { passed: false } });
    expect(html).toMatch(/Validation:<\/strong>\s*failed/);
  });

  it('D02 labels snapshot-fed Up Ahead as Live when data sourceMode is inconsistent', () => {
    expect(ua.getSourceModeState({
      data: { sourceMode: 'dataset-api' },
      runtime: { isStaticHost: false },
      envelope: { source: 'snapshot', freshness: 'fresh' },
    })).toEqual({ modeStr: 'live', modeLabel: 'Live' });
    // This is a sentinel envelope, not a claim that the deployed Worker did so.
  });

  it('D03 claims offers verified and ready even when the supplied snapshot freshness is stale', () => {
    expect(ua.deriveOfferCapability({
      offers: [{ id: 'historical-offer', title: 'Old snapshot offer' }],
      enabled: true, categories: ['shopping'], sourceMode: 'snapshot', freshness: 'stale',
    })).toMatchObject({ status: 'ready', verified: true });
    // Evidence is the actual exported source function, not a reimplementation.
  });

  it('D04 unknown Insight source is labeled Live by exact unmodified page function body', () => {
    const source = readFileSync('src/pages/InsightPage.jsx', 'utf8');
    const match = source.match(/function getInsightSourceLabel\(source\)\s*\{([\s\S]*?)\n\}/);
    expect(match).toBeTruthy();
    const originalSourceFunction = new Function('source', match[1]);
    expect(originalSourceFunction('custom-feed-not-yet-qualified')).toBe('Live');
    expect(originalSourceFunction('snapshot')).toBe('Snapshot');
  });

  it('D05 existing page recovery tests are mocked; cannot alone certify live provider', () => {
    const existing = readFileSync('src/pages/UpAheadPage.recovery.cert.test.jsx', 'utf8');
    expect(existing).toContain("vi.mock('../data/datasets/upAheadDataset'");
    expect(existing).toContain("fixture from '../services/fixtures/upAheadRecovery.json'");
    // This is an evidence-class boundary, not an accusation of mock production data.
  });

  it('P01 Newspaper retains publisher-domain and 48-hour validation controls', () => {
    expect(isPublisherArticle({ link: 'https://www.thehindu.com/news/national/story.html' }, 'THE_HINDU')).toBe(true);
    expect(isPublisherArticle({ link: 'https://www.bbc.com/news/story.html' }, 'THE_HINDU')).toBe(false);
    expect(() => normalizeNewspaperEdition({ sources: {}, fetchedAt: Date.now() - 60 * 60 * 1000 })).toThrow('No verified newspaper headlines');
  });

  it('P02 five actual routes exist and Main does not import a checked-in test fixture directly', () => {
    const app = readFileSync('src/App.jsx','utf8');
    for (const route of ['/', '/insight', '/up-ahead', '/newspaper', '/data-health']) {
      expect(app).toContain(`path="${route}"`);
    }
    const main = readFileSync('src/pages/MainPage.jsx','utf8');
    expect(main).not.toMatch(/from ['"][^'"]*fixtures\//);
  });
});
