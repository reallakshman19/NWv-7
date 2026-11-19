// @vitest-environment jsdom
import React from 'react';
import { describe, expect, it, afterEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ENVELOPE_SOURCES, makeEnvelope, isUsableEnvelope } from '../data/dataEnvelope.js';
import { __dataStateBoundaryInternalsForTest as boundary } from './DataStateBoundary.internals.js';
import { __dataStateBannerInternalsForTest as banner } from './data-state/DataStateBanner.internals.js';
import { __getDatasetCacheForTest, __clearDatasetCacheForTest } from '../data/orchestrator/useDataset.js';
import { clearDiagnostics, listDiagnostics } from '../data/diagnosticsStore.js';
import { publishPageProvenance, getPageProvenanceEntries } from '../data/pageProvenance.js';
import { __upAheadPageViewModelInternalsForTest as upAhead } from '../viewModels/useUpAheadPageViewModel.js';
import { __upAheadDatasetInternalsForTest as upAheadDataset } from '../data/datasets/upAheadDataset.js';
import DataHealthPanel from './DataHealthPanel.jsx';

afterEach(() => { __clearDatasetCacheForTest(); clearDiagnostics(); });
const state = (envelope, error) => boundary.getBoundaryState({
  envelope, error, loading:false, allowDegraded:true, treatEmptyAsReady:false,
});

describe('A10 R2 fail-closed evidence contract and retained-display gate', () => {
  it('empty envelope cannot invent ok/live/fresh/validation/SLO/last-good', () => {
    const e=makeEnvelope();
    expect(e.ok).toBe(false);
    expect(e.source).toBe(ENVELOPE_SOURCES.UNKNOWN);
    expect(e.freshness).toBe('unknown');
    expect(e.validation.passed).toBeNull();
    expect(e.slo.passed).toBeNull();
    expect(e.slo.score).toBeNull();
    expect(e.lastGoodAt).toBeNull();
    expect(e.fetchedAt).toBeNull();
  });
  it('content without explicit success remains unverified', () => {
    const e=makeEnvelope({data:{stories:[{title:'retained'}]}});
    expect(e.ok).toBe(false);
    expect(e.validation.passed).toBeNull();
    expect(isUsableEnvelope(e)).toBe(false);
  });
  it('explicit fresh/validated producer evidence remains success', () => {
    const e=makeEnvelope({ok:true,source:'live',freshness:'fresh',fetchedAt:1234,
      data:{items:[1]},validation:{passed:true,errors:[],warnings:[]},
      slo:{passed:true,score:100,reasons:[]}});
    expect(e.ok).toBe(true);
    expect(e.source).toBe('live');
    expect(e.validation.passed).toBe(true);
    expect(e.slo.passed).toBe(true);
    expect(e.fetchedAt).toBe(1234);
  });
  it('retained stale content remains rendered but never classified ready', () => {
    const e=makeEnvelope({ok:true,source:'snapshot',freshness:'stale',data:{articles:[{title:'A'}]},
      validation:{passed:true},slo:{passed:true}});
    expect(state(e)).toBe('degraded');
    expect(banner.getBannerMessage({envelope:e,label:'News'})).toMatch(/stale/);
  });
  it('validation failure with readable content means degraded',()=>{
    const e=makeEnvelope({ok:true,data:{headline:'A'},freshness:'fresh',validation:{passed:false}});
    expect(state(e)).toBe('degraded');
    expect(banner.getBannerMessage({envelope:e,label:'News'})).toMatch(/validation failed/);
  });
  it('failed SLO with readable data means degraded',()=>{
    const e=makeEnvelope({ok:true,data:{headline:'A'},freshness:'fresh',slo:{passed:false}});
    expect(state(e)).toBe('degraded');
  });
  it('refresh error plus previously good envelope stays visible but degraded',()=>{
    const e=makeEnvelope({ok:true,data:{headline:'Old'},freshness:'fresh',validation:{passed:true}});
    expect(state(e,'provider 503')).toBe('degraded');
    expect(state(e)).toBe('ready');
  });
  it('missing validation cannot show Ready simply because source and freshness look good',()=>{
    const e=makeEnvelope({ok:true,source:'live',data:{headline:'A'},freshness:'fresh'});
    expect(e.validation.passed).toBeNull();
    expect(state(e)).toBe('degraded');
  });
  it('unverified freshness cannot show Ready simply because content exists',()=>{
    const e=makeEnvelope({ok:true,data:{headline:'A'},freshness:'unknown'});
    expect(state(e)).toBe('degraded');
  });
  it('unknown validation displays not evaluated in actual Data Health SSR',()=>{
    __getDatasetCacheForTest().set('a10-unverified',{datasetId:'sections',
      ok:true,source:'snapshot',freshness:'unknown',payloadHash:'local-only-1234'});
    const html=renderToStaticMarkup(<DataHealthPanel />);
    expect(html).toContain('unknown / not evaluated');
    expect(html).toContain('Local payload checksum');
    expect(html).not.toMatch(/Validation:<\/strong>\s*passed/);
  });
  it('positive completed validation still displays passed',()=>{
    __getDatasetCacheForTest().set('a10-verified',{datasetId:'insight',
      ok:true,source:'snapshot',freshness:'fresh',validation:{passed:true}});
    expect(renderToStaticMarkup(<DataHealthPanel />)).toMatch(/Validation:<\/strong>\s*passed/);
  });
});

describe('A10 Main/Newspaper operator receipts and source classification',()=>{
  it('never writes raw stories, private planner data or credentials into operator receipts',()=>{
    publishPageProvenance('main',{ok:true,source:'context',freshness:'unknown',
      data:{stories:[{title:'Private test headline'}]},validation:{passed:null}},
    {transport:'news-context-projection',provider:'context'});
    const events=listDiagnostics();
    expect(events).toHaveLength(1);
    expect(JSON.stringify(events)).not.toContain('Private test headline');
    expect(getPageProvenanceEntries(events)[0].envelope.source).toBe('context');
  });
  it('deduplicates identical Main refresh/React render observations',()=>{
    const env={ok:true,source:'snapshot',freshness:'fresh',payloadHash:'h-1'};
    publishPageProvenance('main',env,{provider:'github'});
    publishPageProvenance('main',env,{provider:'github'});
    expect(listDiagnostics().length).toBe(1);
  });
  it('records new provider epoch or changed source separately',()=>{
    publishPageProvenance('newspaper',{ok:true,source:'snapshot',payloadHash:'epoch-a'});
    publishPageProvenance('newspaper',{ok:true,source:'snapshot',payloadHash:'epoch-b'});
    expect(listDiagnostics().length).toBe(2);
    expect(getPageProvenanceEntries(listDiagnostics())).toHaveLength(1);
    expect(getPageProvenanceEntries(listDiagnostics())[0].envelope.payloadHash).toBe('epoch-b');
  });
  it('Data Health includes direct Main/Newspaper entries and missing-page disclosure',()=>{
    publishPageProvenance('main',{ok:true,source:'snapshot',freshness:'fresh',payloadHash:'main-c'});
    publishPageProvenance('newspaper',{ok:true,source:'snapshot',freshness:'unknown',payloadHash:'paper-c'});
    const html=renderToStaticMarkup(<DataHealthPanel />);
    expect(html).toContain('main (page)');
    expect(html).toContain('newspaper (page)');
    expect(html).toContain('Page coverage (this browser session)');
    expect(html).toContain('upAhead: not observed');
    expect(html).toContain('insight: not observed');
  });
  it('unrelated older edge diagnostic is not attached to newer shared-cache Up Ahead card',()=>{
    __getDatasetCacheForTest().set('upAhead',{datasetId:'upAhead',ok:true,
      source:'snapshot',freshness:'fresh',payloadHash:'fresh-data',validation:{passed:true}});
    const html=renderToStaticMarkup(<DataHealthPanel />);
    expect(html).toContain('fresh-data');
    expect(html).toContain('Latest edge source');
    expect(html).toContain('unknown');
  });
  it('unknown Up Ahead source modes never become Live provenance',()=>{
    expect(upAheadDataset.getSource('calendar')).toBe('seed');
    expect(upAheadDataset.getSource('failed')).toBe('failed');
    expect(upAheadDataset.getSource('dataset-api')).toBe('snapshot');
    expect(upAheadDataset.getSource('third-party-unknown')).toBe('unknown');
    expect(upAheadDataset.getSource('live')).toBe('live');
  });
  it('stale offers may render but are not verified availability',()=>{
    const r=upAhead.deriveOfferCapability({offers:[{title:'Old'}],freshness:'stale',
      sourceMode:'snapshot'});
    expect(r).toMatchObject({status:'ready',verified:false,reason:'retained_results_stale'});
  });
  it('disabled category cannot claim verified availability even with retained offers',()=>{
    const r=upAhead.deriveOfferCapability({offers:[{title:'Old'}],enabled:false});
    expect(r).toMatchObject({status:'disabled',verified:false});
  });
  it('fresh offers without successful acquisition are not verified',()=>{
    const r=upAhead.deriveOfferCapability({offers:[{title:'A'}],freshness:'fresh',
      acquisitionSummary:{status:'failed'},categories:['shopping']});
    expect(r).toMatchObject({status:'ready',verified:false});
  });
  it('fresh offers with verified successful acquisition stay ready and verified',()=>{
    const r=upAhead.deriveOfferCapability({offers:[{title:'A'}],freshness:'fresh',
      acquisitionSummary:{status:'success',byCategory:{shopping:{
        attemptedSources:2,successfulSources:2,failedSources:0}}},categories:['shopping']});
    expect(r).toMatchObject({status:'ready',verified:true});
  });
});

describe('A10 explicit source-envelope disagreement controls',()=>{
  it('never promotes retained snapshot envelope to live because payload says live',()=>{
    const r=upAhead.getSourceModeState({data:{sourceMode:'live'},
      runtime:{isStaticHost:false},envelope:{source:'snapshot',freshness:'fresh'}});
    expect(r).toMatchObject({modeStr:'snapshot',modeLabel:'Snapshot'});
  });
  it('unknown payload source is unverified, not live',()=>{
    const r=upAhead.getSourceModeState({data:{sourceMode:'calendar'},
      runtime:{isStaticHost:false},envelope:{freshness:'fresh'}});
    expect(r).toMatchObject({modeStr:'degraded',modeLabel:'Source unverified'});
  });
  it('mismatched Worker API and live envelope emits explicit source conflict',()=>{
    const r=upAhead.getSourceModeState({data:{sourceMode:'dataset-api'},
      runtime:{isStaticHost:false},envelope:{source:'live',freshness:'fresh'}});
    expect(r).toMatchObject({modeStr:'degraded',modeLabel:'Source mismatch'});
  });
  it('authentic Worker API snapshot transport retains R3 label',()=>{
    const r=upAhead.getSourceModeState({data:{sourceMode:'dataset-api'},
      runtime:{isStaticHost:true},envelope:{source:'snapshot',freshness:'fresh'}});
    expect(r).toMatchObject({modeStr:'snapshot',modeLabel:'Worker API'});
  });
});
