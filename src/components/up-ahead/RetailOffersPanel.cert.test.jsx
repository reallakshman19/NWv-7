/** @vitest-environment jsdom */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import RetailOffersPanel from './RetailOffersPanel.jsx';
import { useRetailOffers } from '../../hooks/useRetailOffers.js';
import { normalizeRetailOffer } from '../../../scripts/retail-offers/parseRetailOffers.mjs';
import policy from '../../config/retailOfferSources.json';
import { parseRetailFlyer } from '../../../scripts/retail-offers/collectRetailFlyers.mjs';

vi.mock('../../hooks/useRetailOffers.js',()=>({useRetailOffers:vi.fn()}));
let now;
const row=id=>{
 const source=policy.sources.find(source=>source.id===id);
 return normalizeRetailOffer({title:`Current ${source.name} product deal`,url:source.url+'?sku=42',price:1.69,previousPrice:2.13,discountPercent:21},source,now);
};
beforeEach(()=>{
 vi.clearAllMocks();
 now=Date.now();
 useRetailOffers.mockReturnValue({snapshot:{schemaVersion:1,fetchedAt:now,items:[row('lulu-oman'),row('flipkart-in')],retailers:{'lulu-oman':{status:'ok'}}},loading:false,error:null,fromCache:false,refresh:vi.fn()});
});
afterEach(()=>{cleanup();vi.restoreAllMocks();});

describe('populated retailer offers',()=>{
 it('honours the shopping category setting without acquiring an unwanted offer feed',()=>{
  render(<RetailOffersPanel enabled={false}/>);
  expect(screen.getByText('Shopping offers are disabled in Up Ahead settings.')).toBeTruthy();
  expect(useRetailOffers).not.toHaveBeenCalled();
 });
 it('shows product prices, discounts and true unknown expiry instead of a source directory',()=>{
  render(<RetailOffersPanel/>);
  expect(screen.getAllByRole('article')).toHaveLength(2);
  expect(screen.getByRole('heading',{name:'Current LuLu Oman product deal'})).toBeTruthy();
  expect(screen.getByText(/1\.690/)).toBeTruthy();
  expect(screen.getAllByText('21% off')).toHaveLength(2);
  expect(screen.getAllByText('End date not advertised')).toHaveLength(2);
  expect(screen.queryByText('Online retailer sources')).toBeNull();
  expect(screen.getAllByRole('link',{name:'View offer ↗'})).toHaveLength(2);
 });
 it('filters by retailer and resets an inapplicable selection when cities or channels change',()=>{
  const {rerender}=render(<RetailOffersPanel/>);
  fireEvent.click(screen.getByRole('button',{name:'LuLu Oman (1)'}));
  expect(screen.getAllByRole('article')).toHaveLength(1);
  rerender(<RetailOffersPanel locations={['Chennai']}/>);
  expect(screen.getByRole('heading',{name:'Current Flipkart India product deal'})).toBeTruthy();
  expect(screen.queryByRole('button',{name:/LuLu Oman/})).toBeNull();
  rerender(<RetailOffersPanel channel="offline"/>);
  expect(screen.queryByRole('article')).toBeNull();
  expect(screen.getByText(/No current in-store offers could be verified/)).toBeTruthy();
 });
 it('passes a manual shopping intent to Planner without inventing an event date',async()=>{
  const save=vi.fn().mockReturnValue({ok:true});render(<RetailOffersPanel locations={['Muscat']} onAddToPlan={save}/>);
  fireEvent.click(screen.getByRole('button',{name:'+ Plan today'}));
  await waitFor(()=>expect(screen.getByRole('button',{name:'✓ Saved'}).disabled).toBe(true));
  expect(save).toHaveBeenCalledWith(expect.objectContaining({eventDateKey:null,datePrecision:'unknown',expiryAt:null,price:1.69,currency:'OMR'}));
  expect(save.mock.calls[0][0]).not.toHaveProperty('expiresAt');
 });
 it('reports a failed save and refuses an expired price at the action boundary',async()=>{
  const save=vi.fn().mockReturnValue({ok:false});render(<RetailOffersPanel locations={['Muscat']} onAddToPlan={save}/>);
  fireEvent.click(screen.getByRole('button',{name:'+ Plan today'}));
  await waitFor(()=>expect(screen.getByRole('alert').textContent).toContain('could not be saved'));
  vi.spyOn(Date,'now').mockReturnValue(now+25*3600000);
  fireEvent.click(screen.getByRole('button',{name:'+ Plan today'}));
  expect(screen.getByRole('alert').textContent).toContain('price has expired');
  expect(save).toHaveBeenCalledTimes(1);
 });
 it('labels a failed update with unexpired cached data and requests a bounded refresh',()=>{
  const refresh=vi.fn();useRetailOffers.mockReturnValue({...useRetailOffers(),error:'offline',fromCache:true,refresh});
  render(<RetailOffersPanel/>);
  expect(screen.getByRole('status').textContent).toContain('unexpired cached prices');
  fireEvent.click(screen.getByRole('button',{name:'Refresh offers'}));
  expect(refresh).toHaveBeenCalledTimes(1);
 });
 it('populates dated offline flyers, pages and Planner actions without relabelling online prices',async()=>{
  const source=policy.sources.find(value=>value.id==='hypermax-oman');
  const endKey=new Date(now+4*86400000).toISOString().slice(0,10);
  const publishedKey=new Date(now-86400000).toISOString().slice(0,10);
  const pretty=key=>new Date(key+'T00:00:00Z').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'});
  const flyer=parseRetailFlyer(`<main><div><article><div><h1>HyperMax current in-store promotion</h1><p>Dated offers across household products.</p></div><p>Published • ${pretty(publishedKey)}</p></article><section><div>Valid until ${pretty(endKey)}</div><p>In-store offer</p><div><p>Available Stores</p><div><p>Muscat, Seeb</p></div></div></section></div><img src="https://app.clicoffer.com/uploads/flyers/123/page1.webp"><img src="https://app.clicoffer.com/uploads/flyers/123/page2.webp"></main>`,
    'https://www.clicoffer.com/en/oman/muscat/offers/123/hypermax/current-promo',source,now);
  const state=useRetailOffers();
  useRetailOffers.mockReturnValue({...state,snapshot:{...state.snapshot,flyers:[flyer],retailers:{'hypermax-oman':{status:'unavailable',channels:{offline:{status:'ok',checkedAt:now}}}}}});
  const save=vi.fn().mockReturnValue({ok:true});
  const {rerender}=render(<RetailOffersPanel channel="offline" onAddToPlan={save}/>);
  expect(screen.getAllByRole('article')).toHaveLength(1);
  expect(screen.getByRole('heading',{name:'HyperMax current in-store promotion'})).toBeTruthy();
  expect(screen.queryByText('Current LuLu Oman product deal')).toBeNull();
  expect(screen.getByText(/Flyer via ClicOffer/)).toBeTruthy();
  expect(screen.getByText(/HyperMax Oman: 1 current offer/)).toBeTruthy();
  expect(screen.queryByText(/Amazon India:/)).toBeNull();
  expect(screen.queryByText(/Flipkart India:/)).toBeNull();
  expect(screen.getByRole('button',{name:'LuLu Oman (0)'})).toBeTruthy();
  fireEvent.click(screen.getByRole('button',{name:'Next page'}));
  expect(screen.getByRole('img').getAttribute('src')).toContain('page2.webp');
  fireEvent.click(screen.getByRole('button',{name:'+ Plan today'}));
  await waitFor(()=>expect(screen.getByRole('button',{name:'✓ Saved'}).disabled).toBe(true));
  expect(save).toHaveBeenCalledWith(expect.objectContaining({sourceMode:'snapshot',expiryAt:flyer.validUntil,eventEndPrecision:'day',priceFreshUntil:flyer.expiresAt}));
  useRetailOffers.mockReturnValue({...useRetailOffers(),error:'offline',fromCache:true});
  rerender(<RetailOffersPanel channel="offline" onAddToPlan={save}/>);
  expect(screen.getByRole('status').textContent).toContain('unexpired cached offers');
 });
});
