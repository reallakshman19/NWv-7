import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_CONFIG, SNAPSHOT_SLOTS, type InsightStory } from '../types';
import { invalidateSlot } from '../cache/cacheManager';
import { classifyAngle, applyClusterOverrides, eventSimilarity } from '../dedup/dedup';
import { hasSharedNamedEventSignature } from '../cluster/topicCohesion';
import { clusterIntoParentEvents } from '../cluster/cluster';
import { inferEvolutionRole } from '../pipeline/temporalTier';
import { normalizeStory } from '../pipeline/normalize';
import { runInsightPipeline } from '../pipeline/pipeline';
import { getEmbeddings } from '../../../adapters/embeddingsAdapter.js';
import { extractEntities, extractKeywords, extractNumbers, extractVerbs } from '../../../adapters/nlpAdapter.js';

const now = Date.parse('2026-11-18T12:00:00Z');
async function report(id: string, title: string, summary = '', sourceGroup = 'the_hindu', ageHours = 1): Promise<InsightStory> {
  const text = `${title} ${summary}`;
  const [embeddings, entities, keywords, verbs, numbers] = await Promise.all([
    getEmbeddings([text]), extractEntities(text), extractKeywords(text), extractVerbs(text), extractNumbers(text),
  ]);
  return normalizeStory({id,title,summary,source:sourceGroup,sourceGroup,
    url:`https://${sourceGroup === 'ndtv' ? 'ndtv.com' : 'thehindu.com'}/${id}`,
    publishedAt:now-ageHours*3600000,category:'world',region:'IN'},
    ageHours<4?'now':'minus4h',DEFAULT_CONFIG,embeddings[0],entities,keywords,verbs,numbers,now);
}

describe('feed follow-up: sparse NLP and truthful event evidence', () => {
  beforeEach(() => { vi.spyOn(Date,'now').mockReturnValue(now); SNAPSHOT_SLOTS.forEach(invalidateSlot); });
  afterEach(() => vi.restoreAllMocks());

  it('clusters actual short-name cyclone headlines without reducing global thresholds', async () => {
    const a=await report('coast','Odisha steps up cyclone preparations as IMD forecasts Akvan landfall on Nov 20');
    const b=await report('forecast','Cyclone Akvan veers north and may cross anywhere from Narsapur to Puri, 10 Andhra districts on rain alert','','ndtv',6);
    // One explicit named hazard anchors the other headline's non-adjacent name.
    expect(hasSharedNamedEventSignature(a,b)).toBe(true);
    const named=await report('named','Cyclone Akvan slows to a crawl; IMD scales down landfall intensity');
    expect(eventSimilarity(named,b)).toBeLessThan(DEFAULT_CONFIG.POSSIBLE_EVENT_THRESHOLD);
    expect(applyClusterOverrides(named,b,eventSimilarity(named,b),DEFAULT_CONFIG)).toBe('SAME');
  });

  it('keeps different named storms apart even with identical sparse vectors and a roundup bridge', async () => {
    const a=await report('akvan','Cyclone Akvan brings heavy rain to the coast');
    const b=await report('other','Cyclone Burevi brings heavy rain to the coast','','ndtv');
    const roundup=await report('roundup','Cyclone Akvan and Cyclone Burevi bring heavy rain to the coast');
    b.embedding=[...a.embedding]; roundup.embedding=[...a.embedding];
    expect(applyClusterOverrides(a,b,1,DEFAULT_CONFIG)).toBe('DIFFERENT');
    const clusters=clusterIntoParentEvents([a,roundup,b],DEFAULT_CONFIG);
    expect(clusters.some(c=>c.stories.some(s=>s.id===a.id)&&c.stories.some(s=>s.id===b.id))).toBe(false);
  });

  it.each(['Cyclone Warning issued for heavy rain','Storm Threat grows along the coast','Intense storm expected near the coast'])(
    'does not invent a named event from %s', async title => {
      const a=await report('a',title); const b=await report('b',title);
      expect(hasSharedNamedEventSignature(a,b)).toBe(false);
    },
  );

  it('requires more than a shared person or institutional label', async () => {
    const a=await report('a','Arun Kumar opens the new science museum');
    const b=await report('b','Arun Kumar defends the annual transport budget');
    const c=await report('c','National News reports fresh policy details');
    expect(hasSharedNamedEventSignature(a,b)).toBe(false);
    expect(hasSharedNamedEventSignature(c,{...c,id:'d'})).toBe(false);
  });

  it('keeps a named storm together when its intensity label changes', async () => {
    const a=await report('hurricane','Hurricane Milton approaches the coast');
    const b=await report('storm','Storm Milton weakens as it moves inland','','ndtv');
    expect(applyClusterOverrides(a,b,0,DEFAULT_CONFIG)).toBe('SAME');
  });

  it('recognizes short personal names only with shared event wording', async () => {
    const a=await report('a','Lateef Bhat killed in Kulgam encounter');
    const b=await report('b','Kulgam encounter: Lateef Bhat killed after operation','','ndtv');
    expect(hasSharedNamedEventSignature(a,b)).toBe(true);
  });

  it('does not join different device announcements or separate incidents at a shared venue', async () => {
    const a=await report('device-a','Samsung Galaxy A55, Galaxy A35 One UI 9 Test Builds Reportedly Spotted Ahead of Android 17 Rollout');
    const b=await report('device-b','Samsung Galaxy S26 FE, Galaxy Tab S12 Reportedly Spotted in Google App Listing, Hinting at Imminent Launch');
    expect(hasSharedNamedEventSignature(a,b)).toBe(false);
    const c=await report('campus-a','TheMightyBA Streamer University 2026 controversy explained as Ludwig speaks about his future');
    const d=await report('campus-b','PayBae and Lacy controversy explained after questionable Streamer University 2026 interaction');
    expect(hasSharedNamedEventSignature(c,d)).toBe(false);
    const e=await report('region-a','United States protest blocks coastal road after election dispute');
    const f=await report('region-b','United States protest blocks coastal road over port wages');
    expect(hasSharedNamedEventSignature(e,f)).toBe(false);
  });

  it('vetoes conflicting occurrence IDs and old reports before named-event recovery', async () => {
    const a=await report('a','Cyclone Akvan brings heavy rain to the coast');
    const b=await report('b','Cyclone Akvan brings heavy rain to the coast','','ndtv');
    expect(applyClusterOverrides({...a,eventOccurrenceId:'first'} as InsightStory,
      {...b,eventOccurrenceId:'second'} as InsightStory,1,DEFAULT_CONFIG)).toBe('DIFFERENT');
    expect(applyClusterOverrides(a,{...b,publishedAt:now-40*3600000},0,DEFAULT_CONFIG)).not.toBe('SAME');
  });

  it.each(['An intense cyclone response is under way','The Observer describes coastal preparations','Consent for coastal shelters has been granted'])(
    'does not classify a word fragment as market evidence: %s', async title => {
      expect(classifyAngle(await report('a',title))).not.toBe('market_reaction');
    },
  );
  it.each(['NSE stocks jumped as investors bought bank shares','BSE shares rose during intraday trading'])(
    'retains actual financial evidence: %s', async title => {
      expect(classifyAngle(await report('a',title))).toBe('market_reaction');
    },
  );
  it('does not turn because, enterprises or an expert sharing a forecast into evolution evidence', async () => {
    const because=await report('because','The coast is quiet because the storm moved offshore');
    const enterprises=await report('firms','Small enterprises open their doors along the coast');
    const expert=await report('expert','Cyclone Akvan: an expert shares his forecast');
    expect(inferEvolutionRole(because,'breaking',[])).not.toBe('cause_claim');
    expect(inferEvolutionRole(enterprises,'breaking',[])).not.toBe('fact_update');
    expect(inferEvolutionRole(expert,'breaking',[])).not.toBe('market_reaction');
    const actual=await report('actual','Investigators confirmed the cause of the fire');
    expect(inferEvolutionRole(actual,'breaking',[])).toBe('cause_confirmed');
  });

  it('routes named-event reports through production normalization, clustering and child selection', async () => {
    const stories=await Promise.all([
      report('base','Cyclone Akvan approaches the coast','Heavy rain is forecast along the shoreline.','the_hindu',8),
      report('official','Cyclone Akvan: government orders evacuation','The ministry announced new shelters for coastal residents.','ndtv',2),
      report('expert','Cyclone Akvan: experts warn of flooding','Researchers said low lying areas face flood risk.','hindustan_times',1),
      report('separate','Cyclone Burevi approaches another coast','The storm is expected to turn away.','ndtv',3),
    ]);
    const result=await runInsightPipeline(async slot=>stories.filter(s=>s.capturedAtSnapshot===slot));
    const parent=result.parents.find(p=>p.clusterStoryIds.includes('base'))!;
    expect(parent.clusterStoryIds).toEqual(expect.arrayContaining(['base','official','expert']));
    expect(parent.clusterStoryIds).not.toContain('separate');
    expect(parent.childStoryIds.length).toBeGreaterThanOrEqual(2);
    const angles=parent.childStoryIds.map(id=>result.storiesById.get(id)?.angle);
    expect(new Set(angles).size).toBeGreaterThanOrEqual(2);
  });
});
