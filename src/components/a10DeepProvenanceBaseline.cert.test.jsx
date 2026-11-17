// @vitest-environment jsdom
/**
 * A10 DEEP AUDIT: immutable main baseline diagnostics, not a fix.
 * These tests intentionally reproduce counterexamples. PASS = the historical
 * behavior is present; it DOES NOT certify production correctness.
 * Repo base: 695e27c64b42d2220449936792792b68e87a1375.
 */
import React from 'react';
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { makeEnvelope, ENVELOPE_SOURCES, ENVELOPE_FRESHNESS, isUsableEnvelope, fnv1aHex } from '../data/dataEnvelope.js';
import { __dataStateBoundaryInternalsForTest as boundary } from '../components/DataStateBoundary.internals.js';
import DataStateBoundary from '../components/DataStateBoundary.jsx';
import DataHealthPanel from '../components/DataHealthPanel.jsx';
import { __upAheadPageViewModelInternalsForTest as upAhead } from '../viewModels/useUpAheadPageViewModel.js';
import { resolveRuntimeCapabilities } from '../runtime/runtimeCapabilities.js';
import { isPublisherArticle, normalizeNewspaperEdition, NEWSPAPER_MAX_AGE_MS } from '../services/newspaperEditionService.js';
import { listDatasetCache, __getDatasetCacheForTest, __clearDatasetCacheForTest } from '../data/orchestrator/useDataset.js';
import { clearDiagnostics, recordDiagnostic } from '../data/diagnosticsStore.js';
import { getSourceLabel, getSourceTone } from '../components/data-state/DataSourceBadge.internals.js';
import { buildRuntimeSectionHealthSummary, resolveSectionHealthSummary } from '../services/runtimeSectionHealthFallback.js';

const source = path => readFileSync(path, 'utf8');
const ssrHealth = envelope => {
  __clearDatasetCacheForTest();
  if (envelope) __getDatasetCacheForTest().set('a10-deep', envelope);
  return renderToStaticMarkup(<DataHealthPanel />);
};
const state = (env, error = null, loading = false, allowDegraded = true) => boundary.getBoundaryState({
  envelope:env,error,loading,allowDegraded,treatEmptyAsReady:false,
});
const getBody = (sourceText, name) => {
  const p = sourceText.indexOf('function '+name+'(');
  if(p<0) throw Error(name+' absent');
  const a=sourceText.indexOf('{',p);
  let depth=0;
  for(let i=a;i<sourceText.length;i++){
    if(sourceText[i]==='{') depth++;
    if(sourceText[i]==='}'&&--depth===0)return sourceText.slice(a+1,i);
  }
  throw Error('unterminated '+name);
};
const readFunction=(path,name,...params)=>new Function(...params,getBody(source(path),name));

afterEach(()=>{__clearDatasetCacheForTest();clearDiagnostics()});

describe('A10 U2 envelope default-fail-open matrix: direct native execution',()=>{
  it('01 empty envelope wrongly claims ok, live, fresh, valid and SLO success',()=>{
    const e=makeEnvelope();
    expect([e.ok,e.source,e.freshness,e.validation.passed,e.slo.passed])
      .toEqual([true,'live','fresh',true,true]);
    expect(e.data).toBeNull();
  });
  it('02 incomplete failed envelope still claims LIVE and FRESH if source omitted',()=>{
    const e=makeEnvelope({ok:false,error:'provider 503'});
    expect(e.source).toBe('live');
    expect(e.freshness).toBe('fresh');
    expect(e.validation.passed).toBe(true);
  });
  it('03 unknown timestamps rewritten to now, lastGoodAt now',()=>{
    const begin=Date.now();
    const e=makeEnvelope({data:{items:[1]},source:'snapshot'});
    expect(e.fetchedAt).toBeGreaterThanOrEqual(begin);
    expect(e.lastGoodAt).toBeGreaterThanOrEqual(begin);
    expect(e.generatedAt).toBeNull();
  });
  it('04 absent freshness and validation on non-null cache data still affirm fresh/passed',()=>{
    const e=makeEnvelope({data:{hello:'world'},source:'cache'});
    expect(e.freshness).toBe('fresh');
    expect(e.validation.passed).toBe(true);
  });
  it('05 explicit stale, failed validation and failed SLO are preserved',()=>{
    const e=makeEnvelope({ok:false,source:'failed',freshness:'stale',validation:{passed:false},slo:{passed:false}});
    expect([e.ok,e.source,e.freshness,e.validation.passed,e.slo.passed])
      .toEqual([false,'failed','stale',false,false]);
  });
  it('06 weak payload hash is 8-char FNV, not a cryptographic producer signature',()=>{
    const e=makeEnvelope({data:{a:1}});
    expect(e.payloadHash).toMatch(/^[0-9a-f]{8}$/);
    expect(e.payloadHash).toBe(fnv1aHex('{"a":1}'));
  });
  it('07 isUsableEnvelope does not require validation or freshness',()=>{
    const e=makeEnvelope({data:{headline:'H'},validation:{passed:false},freshness:'expired'});
    expect(isUsableEnvelope(e)).toBe(true);
  });
  it('08 negative control: null content is not usable to isUsableEnvelope',()=>{
    expect(isUsableEnvelope(makeEnvelope())).toBe(false);
  });
});

describe('A10 U1/D1 boundary state, loading and error propagation',()=>{
  const ok={ok:true,data:{title:'retained'},source:'snapshot',freshness:'fresh'};
  it('09 stale but nonempty envelope is classified ready, not degraded',()=>{
    expect(state({...ok,freshness:'stale'})).toBe('ready');
  });
  it('10 failed validation with ok=true still classified ready',()=>{
    expect(state({...ok,validation:{passed:false}})).toBe('ready');
  });
  it('11 SLO failure with ok=true still classified ready',()=>{
    expect(state({...ok,slo:{passed:false,score:0}})).toBe('ready');
  });
  it('12 refresh error plus retained ok=true envelope still classified ready',()=>{
    expect(state(ok,'refresh provider failed 503')).toBe('ready');
  });
  it('13 refresh is displayed if loading true and retained envelope present',()=>{
    expect(state(ok,null,true)).toBe('refreshing');
  });
  it('14 explicit envelope ok=false with content is degraded',()=>{
    expect(state({...ok,ok:false})).toBe('degraded');
  });
  it('15 explicit envelope ok=false and no content is error',()=>{
    expect(state({...ok,ok:false,data:null})).toBe('error');
  });
  it('16 no envelope + loading -> loading',()=>{
    expect(state(null,null,true)).toBe('loading');
  });
  it('17 no envelope + error -> error',()=>{
    expect(state(null,'timeout')).toBe('error');
  });
  it('18 DataStateBoundary SSR actually renders retained text and ready under error',()=>{
    const html=renderToStaticMarkup(<DataStateBoundary envelope={ok} error="force-failed" label="Main">
      <span data-testid="a10-retained">RETAINED</span>
    </DataStateBoundary>);
    expect(html).toContain('data-state="ready"');
    expect(html).toContain('RETAINED');
    expect(html).not.toContain('force-failed');
  });
});

describe('A10 D2/D3 Data Health: actual SSR, uncorrelated diagnostic and cache gaps',()=>{
  it('19 undefined validation is shown passed on an otherwise valid-looking card',()=>{
    expect(ssrHealth({datasetId:'sections',ok:true,source:'snapshot',freshness:'fresh'}))
      .toMatch(/Validation:<\/strong>\s*passed/);
  });
  it('20 undefined SLO yields -- while validation still passed',()=>{
    const html=ssrHealth({datasetId:'upAhead',ok:true,source:'snapshot'});
    expect(html).toMatch(/SLO score:<\/strong>\s*--/);
    expect(html).toMatch(/Validation:<\/strong>\s*passed/);
  });
  it('21 explicit validation false displays failed',()=>{
    expect(ssrHealth({datasetId:'sections',ok:false,validation:{passed:false}}))
      .toMatch(/Validation:<\/strong>\s*failed/);
  });
  it('22 no shared-cache entries show empty-state even if other pages load independently',()=>{
    expect(listDatasetCache()).toHaveLength(0);
    expect(ssrHealth(null)).toContain('No cached dataset envelopes yet');
    const upSource=source('src/viewModels/useUpAheadPageViewModel.js');
    expect(upSource).toContain("load as loadUpAhead");
    expect(upSource).not.toContain('useDataset(');
    const newspaper=source('src/viewModels/useNewspaperPageViewModel.js');
    expect(newspaper).not.toContain('useDataset(');
    const newsContext=source('src/context/NewsContext.jsx');
    expect(newsContext).toContain('loadSectionsDataset(');
    expect(newsContext).not.toContain('loadDataset(');
  });
  it('23 Old edge diagnostic is displayed beside a new snapshot card without epoch binding',()=>{
    recordDiagnostic({datasetId:'upAhead',event:'upAheadDataset.api_edge_diagnostics',
      ts:Date.now()-86400000,details:{source:'cloudflare-api-old',reason:'old-preview',freshness:'stale',ageSeconds:86400}});
    const html=ssrHealth({datasetId:'upAhead',ok:true,source:'snapshot',freshness:'fresh',
      validation:{passed:true},fetchedAt:Date.now(),payloadHash:'new-abc'});
    expect(html).toContain('cloudflare-api-old');
    expect(html).toContain('old-preview');
    expect(html).toContain('new-abc');
    expect(html).toContain('Latest edge source');
  });
  it('24 Latest diagnostic event is chosen globally by event label, without dataset request ID',()=>{
    const sourceText=source('src/components/DataHealthPanel.jsx');
    expect(sourceText).toContain("item?.event === EDGE_DIAGNOSTIC_EVENT");
    expect(sourceText).not.toContain('getLatestUpAheadEdgeDiagnosticEvent(diagnostics, envelope)');
  });
  it('25 source pill calls fallback on snapshot, losing authoritative provider identity',()=>{
    expect(getSourceLabel('snapshot',true)).toBe('fallback');
    expect(getSourceTone('snapshot',true)).toBe('warning');
  });
  it('26 normal live label with no fallback remains live',()=>{
    expect(getSourceLabel('live',false)).toBe('live');
  });
});

describe('A10 Up Ahead U3->U2->U1->D2 provenance and offers',()=>{
  const modes=[
    ['calendar',false,'live'],['failed',false,'live'],['dataset-api',false,'live'],
    ['snapshot',false,'snapshot'],['cache',false,'cached'],['live',false,'live'],
    ['dataset-api',true,'degraded'],['snapshot',true,'snapshot'],
  ];
  for(const [value,staticHost,expected] of modes)it('27 mode '+value+' @ static='+staticHost+' -> '+expected,()=>{
    expect(upAhead.getSourceModeState({data:{sourceMode:value},runtime:{isStaticHost:staticHost},envelope:{freshness:'fresh'}}).modeStr).toBe(expected);
  });
  it('35 Up Ahead unknown source modes are returned as LIVE by dataset resolver',()=>{
    const fn=readFunction('src/data/datasets/upAheadDataset.js','getSource','sourceMode','ENVELOPE_SOURCES');
    expect(fn('calendar',ENVELOPE_SOURCES)).toBe('live');
    expect(fn('failed',ENVELOPE_SOURCES)).toBe('live');
    expect(fn('cache',ENVELOPE_SOURCES)).toBe('cache');
    expect(fn('snapshot',ENVELOPE_SOURCES)).toBe('snapshot');
  });
  it('36 stale retained offers can be marked verified=true before freshness checked',()=>{
    const r=upAhead.deriveOfferCapability({offers:[{title:'old'}],sourceMode:'snapshot',freshness:'stale'});
    expect(r).toMatchObject({status:'ready',verified:true,reason:'results'});
  });
  it('37 disabled category with old offers is marked ready before enabled checked',()=>{
    const r=upAhead.deriveOfferCapability({offers:[{title:'old'}],enabled:false,freshness:'stale'});
    expect(r).toMatchObject({status:'ready',verified:true});
  });
  it('38 stale no-offers reports snapshot_unknown, not verified zero',()=>{
    expect(upAhead.deriveOfferCapability({offers:[],enabled:true,freshness:'stale'}))
      .toMatchObject({status:'snapshot_unknown',verified:false});
  });
  it('39 fresh successful zero-results is verified_zero only with acquisition proof',()=>{
    expect(upAhead.deriveOfferCapability({offers:[],enabled:true,freshness:'fresh',
      acquisitionSummary:{status:'success',byCategory:{shopping:{attemptedSources:2,successfulSources:2,failedSources:0}}},categories:['shopping']}))
      .toMatchObject({status:'verified_zero',verified:true});
  });
  it('40 zero successful sources is unavailable',()=>{
    expect(upAhead.deriveOfferCapability({offers:[],freshness:'fresh',
      acquisitionSummary:{status:'failed',byCategory:{shopping:{attemptedSources:2,successfulSources:0,failedSources:2}}},categories:['shopping']}))
      .toMatchObject({status:'unavailable',verified:false});
  });
});

describe('A10 Insight, Newspaper and provenance cross-route',()=>{
  it('41 normal Insight source strings: snapshot and stale snapshot distinguish',()=>{
    const fn=readFunction('src/pages/InsightPage.jsx','getInsightSourceLabel','source');
    expect(fn('snapshot')).toBe('Snapshot');
    expect(fn('stale-snapshot')).toBe('Stale snapshot');
  });
  it('42 live-sections and unrecognized sources both present as Live in Insight',()=>{
    const fn=readFunction('src/pages/InsightPage.jsx','getInsightSourceLabel','source');
    expect(fn('live-sections')).toBe('Live');
    expect(fn('new-unknown-provider')).toBe('Live');
    expect(source('src/adapters/insightFetcher.js')).toContain("source: liveMode ? 'live-sections' : 'snapshot'");
  });
  it('43 Insight dataset getSource also maps live-sections to live',()=>{
    const fn=readFunction('src/data/datasets/insightDataset.js','getSource','source','ENVELOPE_SOURCES');
    expect(fn('live-sections',ENVELOPE_SOURCES)).toBe('live');
  });
  it('44 Insight page empty result can display Live · Degraded for source snapshot without stale label',()=>{
    const s=source('src/pages/InsightPage.jsx');
    expect(s).toContain("source === 'failed' || source === 'unavailable' ? 'Unavailable' : 'Live · Degraded'");
  });
  it('45 Live mode button asserts bypass all caches, but Insight live mode can pick a snapshot',()=>{
    expect(source('src/components/FetchModeToggle.jsx')).toContain('bypass all caches');
    expect(source('src/adapters/insightFetcher.js')).toContain('loadSectionsAuthorityInsightFallback({ force: liveMode })');
  });
  it('46 Newspaper page does not render DataStateBoundary despite declarative comment',()=>{
    const s=source('src/pages/NewspaperPage.jsx');
    expect(s).toMatch(/\/\/ DataStateBoundary integration:/);
    expect(s).not.toMatch(/<DataStateBoundary(?:\s|>)/);
    expect(s).not.toMatch(/import DataStateBoundary/);
  });
  it('47 Newspaper publisher-domain safety positive control',()=>{
    expect(isPublisherArticle({link:'https://www.thehindu.com/news/story.html'},'THE_HINDU')).toBe(true);
    expect(isPublisherArticle({link:'https://example.org/fake.html'},'THE_HINDU')).toBe(false);
  });
  it('48 Newspaper rejects absent verified source rows and invalid timestamps',()=>{
    expect(()=>normalizeNewspaperEdition({sources:{},fetchedAt:Date.now()})).toThrow(/No verified newspaper headlines/);
    expect(()=>normalizeNewspaperEdition({sources:{},fetchedAt:Date.now()-NEWSPAPER_MAX_AGE_MS-60000})).toThrow(/older than 48 hours/);
  });
  it('49 runtime section health is warning without provider health, not an invented OK',()=>{
    const r=buildRuntimeSectionHealthSummary({sectionId:'muscat',stories:[{source:'P',title:'T'}]});
    expect(r.status).toBe('warning');
    expect(r.reasons).toContain('source_health_unavailable');
  });
  it('50 stored explicit health status is returned unchanged when stories exist',()=>{
    const injected={status:'ok',evidenceSource:'claimed-old',sourceGroupCount:4};
    expect(resolveSectionHealthSummary({healthSummary:injected,sectionId:'muscat',stories:[{id:1}]})).toEqual(injected);
  });
  it('51 empty served section downgrades even claimed stored OK',()=>{
    const r=resolveSectionHealthSummary({healthSummary:{status:'ok'},sectionId:'muscat',stories:[]});
    expect(r.status).toBe('critical');
    expect(r.reasons).toContain('stored_health_disagrees_with_served_data');
  });
  it('52 all five source routes in HashRouter, not independent standalone apps',()=>{
    const app=source('src/App.jsx');
    expect(app).toContain('<HashRouter>');
    for(const path of ['/', '/insight', '/up-ahead', '/newspaper', '/data-health'])expect(app).toContain(`path="${path}"`);
  });
  it('53 no direct page-level test fixture imports in actual five page components',()=>{
    for(const page of ['MainPage','InsightPage','UpAheadPage','NewspaperPage','DataHealthPage']){
      const s=source('src/pages/'+page+'.jsx');
      expect(s).not.toMatch(/import [^\n]*from\s+['"][^'"]*\/fixtures\//);
    }
  });
});
