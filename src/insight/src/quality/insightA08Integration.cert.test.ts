import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_CONFIG, SNAPSHOT_SLOTS, type InsightStory } from '../types';
import { invalidateSlot } from '../cache/cacheManager';
import { runInsightPipeline, applyIncrementalUpdate } from '../pipeline/pipeline';
import { recoverInsightRuntimeQuality } from '../diagnostics/insightRuntimeQualityGate';
import { canonicalPublisherFamily, publisherEvidenceFamily } from '../pipeline/publisherIdentity';
import { isGenericPublisherPage } from '../cluster/eventOccurrenceIdentity';

it('excludes multi-event roundups and empty price trackers while keeping dedicated event updates', () => {
  expect(isGenericPublisherPage({ title: 'India news Live Updates, 19 November 2026: Cyclone Akvan nears coast', summary: '' })).toBe(true);
  expect(isGenericPublisherPage({ title: 'HT Morning News Brief: Summit, cyclone and more', summary: 'Several separate news developments.' })).toBe(true);
  expect(isGenericPublisherPage({ title: 'Letters to the Editor — November 17, 2026', summary: 'Several unrelated letters.' })).toBe(true);
  expect(isGenericPublisherPage({ title: 'India News, 18 November 2026: School closure updates', summary: '' })).toBe(true);
  expect(isGenericPublisherPage({ title: "L&T Share Price Live Updates: L&T's Market Update", summary: '' })).toBe(true);
  expect(isGenericPublisherPage({ title: 'Cyclone Akvan live updates: Schools close as storm nears coast', summary: 'Odisha authorities order local evacuations.' })).toBe(false);
  expect(isGenericPublisherPage({ title: 'L&T shares gain as company wins bridge contract', summary: 'The company disclosed the contract value.' })).toBe(false);
});

const now = Date.parse('2026-11-16T12:00:00Z');
function story(id: string, extra: Partial<InsightStory> = {}): InsightStory {
  return {
    id, title: 'Oman Bank lending rises after regulatory financing changes',
    summary: 'Oman Bank lending and financing rose 13.8 percent after a new central-bank policy.',
    source: 'Oman Observer', sourceGroup: 'oman_observer', sourceDistributionType: 'direct',
    url: `https://publisher.test/${id}`, canonicalUrl: `https://publisher.test/${id}`,
    canonicalText: id, canonicalTextHash: id, publishedAt: now - 1000,
    category: 'business', region: 'om', language: 'en', capturedAtSnapshot: 'now',
    embedding: [1, 0], entities: {people: [], orgs: ['Oman Bank'], places: ['Muscat'], products: [], symbols: []},
    keywords: ['banking', 'financing'], numbers: ['13.8'], eventVerbs: ['rises'],
    sourceTier: 'A', sourceAuthority: 0.9, freshnessScore: 1, rawProminence: 0.8,
    factualDensity: 0.8, summaryQuality: 0.9, sentiment: 0,
    ...extra,
  } as InsightStory;
}

describe('A08 integration: observed Cloudflare evidence gaps', () => {
  beforeEach(() => {
    vi.spyOn(Date, 'now').mockReturnValue(now);
    SNAPSHOT_SLOTS.forEach(invalidateSlot);
  });
  afterEach(() => vi.restoreAllMocks());

  it.each(['google_news_oman', 'google_news_muscat', 'Google News Chennai', 'googlenews_india'])(
    'keeps %s as wrapper identity without independent publisher credit', sourceGroup => {
      const wrapped = story('wrapper', { sourceGroup, sourceDistributionType: 'unknown' });
      expect(canonicalPublisherFamily(wrapped)).toBe('google_news');
      expect(publisherEvidenceFamily(wrapped)).toBeNull();
    },
  );

  it('preserves an identified publisher and explicit wire-origin credit', () => {
    expect(publisherEvidenceFamily(story('outlet', {sourceGroup:'timesofoman'}))).toBe('times_of_oman');
    expect(publisherEvidenceFamily(story('wire', {sourceGroup:'google_news_oman', summary:'Reuters - Banking regulator changes lending rules.'}))).toBe('reuters');
  });

  it('excludes the observed generic ONA landing page before clustering and recovery', async () => {
    const generic = story('2e233713386f1706', {
      title: 'News - وكالة الأنباء العمانية (العمانية)',
      summary: 'News &nbsp;&nbsp; وكالة الأنباء العمانية (العمانية)',
      sourceGroup: 'google_news', sourceDistributionType: 'aggregator',
    });
    const result = await runInsightPipeline(async slot => slot === 'now' ? [story('bank'), generic] : [], DEFAULT_CONFIG);
    expect(result.storiesById.has(generic.id)).toBe(false);
    expect(result.excludedEvidence?.get(generic.id)?.reason).toBe('GENERIC_PUBLISHER_PAGE');
    expect(result.parents.flatMap(parent => parent.childStoryIds)).not.toContain(generic.id);
    const recovered = recoverInsightRuntimeQuality(result, 'snapshot', DEFAULT_CONFIG).result;
    expect(recovered.storiesById.has(generic.id)).toBe(false);
    expect(recovered.parents.flatMap(parent => parent.childStoryIds)).not.toContain(generic.id);
    const incremental = applyIncrementalUpdate([generic], recovered, DEFAULT_CONFIG);
    expect(incremental.storiesById.has(generic.id)).toBe(false);
    const clean = await runInsightPipeline(async slot => slot === 'now' ? [story('bank')] : [], DEFAULT_CONFIG);
    const newIncremental = applyIncrementalUpdate([generic], clean, DEFAULT_CONFIG);
    expect(newIncremental.excludedEvidence?.get(generic.id)?.reason).toBe('GENERIC_PUBLISHER_PAGE');
  });

  it('keeps actual Arabic and English reporting eligible', () => {
    expect(isGenericPublisherPage(story('arabic', {title:'وكالة الأنباء العمانية: البنك المركزي يعلن قواعد جديدة',summary:'اعتمد البنك المركزي قواعد الإقراض الجديدة اليوم.'}))).toBe(false);
    expect(isGenericPublisherPage(story('english', {title:'News - Oman News Agency reports new bank lending rules',summary:'New lending limits apply from Monday.'}))).toBe(false);
  });
});
