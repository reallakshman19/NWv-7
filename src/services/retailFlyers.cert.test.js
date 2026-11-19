import { describe, expect, it } from 'vitest';
import policy from '../config/retailOfferSources.json';
import { collectRetailFlyers, discoverRetailFlyers, flyerDateKey, mergeRetailFlyers, parseRetailFlyer } from '../../scripts/retail-offers/collectRetailFlyers.mjs';
import { validateRetailFlyer } from '../utils/retailOfferContract.js';
import { retailOfferPlannerItem, selectRetailOffers, validateRetailSnapshot } from './retailOffers.js';
import { buildExplicitPlannerSave } from '../utils/plannerIntelligenceBridge.js';

const now=Date.parse('2026-11-18T15:00:00Z');
const source=policy.sources.find(value=>value.id==='hypermax-oman');
const url='https://www.clicoffer.com/en/oman/muscat/offers/139413/hypermax/hypermax-oman-offers-max-friday-30-nov-2026';
const image='https://app.clicoffer.com/uploads/flyers/139413/page-1.webp';
const html=(changes={})=>`<main><div><article><div><h1>${changes.title||'Max Friday at HyperMax Oman'}</h1><p>${changes.description||'Savings on household products at local stores.'}</p></div><p>Published • ${changes.published||'Nov 18, 2026'}</p></article><section><div>Valid until ${changes.end||'Nov 30, 2026'}</div><div>${changes.channel||'In-store offer'}</div><div><p>Available Stores</p><div><p>${changes.stores||'Oman'}</p></div></div></section></div><img src="${changes.image||image}"><img src="https://app.clicoffer.com/uploads/flyers/139413/page-2.webp"></main>`;
const flyer=()=>parseRetailFlyer(html(),url,source,now);
const snapshot=flyers=>({schemaVersion:1,fetchedAt:now,items:[],flyers,retailers:{}});

describe('dated in-store flyers, independent from online price evidence',()=>{
  it('extracts the source description, pages, true calendar end and day-only publication',()=>{
    expect(flyer()).toMatchObject({kind:'flyer',channel:'offline',city:'Muscat',storeScope:'Oman',sourceName:'ClicOffer',
      sourceKind:'flyer_listing',storeScopeVerified:false,publishedDateKey:'2026-11-18',endDateKey:'2026-11-30',
      validUntil:Date.parse('2026-11-30T20:00:00Z'),expiresAt:now+86400000});
    expect(flyer().pages).toHaveLength(2);
    expect(flyer()).not.toHaveProperty('price');
    expect(flyer()).not.toHaveProperty('publishedAt');
  });
  it.each([
    {end:'Nov 17, 2026'}, {published:'Nov 19, 2026'}, {end:'Feb 31, 2027'},
    {stores:'Salalah only'}, {channel:'Online offer'}, {description:'Online only discounts'},
  ])('rejects expired, future, invalid, off-area and online-only evidence: %o',changes=>{
    expect(parseRetailFlyer(html(changes),url,source,now)).toBeNull();
  });
  it('requires the named merchant and actual city in the listing URL',()=>{
    expect(parseRetailFlyer(html(),url.replace('/muscat/','/sohar/'),source,now)).toBeNull();
    expect(parseRetailFlyer(html(),url.replace('/hypermax/','/lulu-hypermarket/'),source,now)).toBeNull();
    expect(parseRetailFlyer(html(),url.replace('www.clicoffer.com','clicoffer.com.evil.test'),source,now)).toBeNull();
  });
  it('takes only this issue’s pages and never recommended or foreign flyer images',()=>{
    const row=parseRetailFlyer(html({image:'https://foreign.test/uploads/flyers/139413/page-1.webp'}),url,source,now);
    expect(row.pages).toEqual(['https://app.clicoffer.com/uploads/flyers/139413/page-2.webp']);
    expect(parseRetailFlyer(html().replaceAll('/139413/','/999999/'),url,source,now)).toBeNull();
  });
  it('keeps a valid flyer with images and dates when the publisher supplies no excerpt',()=>{
    const row=parseRetailFlyer(html().replace('<p>Savings on household products at local stores.</p>',''),url,source,now);
    expect(row).toMatchObject({kind:'flyer',description:'',endDateKey:'2026-11-30'});
  });
  it('never borrows a recommendation’s dates or store applicability for the primary flyer',()=>{
    const recommended='<section><p>Published • Nov 18, 2026</p><div>Valid until Nov 30, 2026</div><p>In-store offer</p><div><p>Available Stores</p><div><p>Muscat</p></div></div></section>';
    const expired=html().replace('Valid until Nov 30, 2026','Expired').replace('</main>',recommended+'</main>');
    expect(parseRetailFlyer(expired,url,source,now)).toBeNull();
    const offArea=html({stores:'Salalah only'}).replace('</main>',recommended+'</main>');
    expect(parseRetailFlyer(offArea,url,source,now)).toBeNull();
  });
  it('does not interpret malformed month names or roll calendar dates forward',()=>{
    expect(flyerDateKey('30 Novemberish 2026')).toBeNull();
    expect(flyerDateKey('Feb 31, 2026')).toBeNull();
    expect(flyerDateKey('Dec 31, 2026')).toBe('2026-12-31');
    expect(validateRetailFlyer({...flyer(),publishedDateKey:'2026-02-31'},source,now)).toBeNull();
  });
  it('discovers only dated active issues and collapses duplicate campaign parts before fetching',()=>{
    const listing=`<h1>HyperMax Muscat Offers</h1>${[url,url.replace('139413','139412'),url.replaceAll('30-nov','17-nov')].map((href,i)=>`<a href="${href}"><img alt="Max Friday | ${i===2?'17':'30'} Nov 2026 flyer cover"></a>`).join('')}`;
    expect(discoverRetailFlyers(listing,source,now)).toEqual([url]);
    expect(()=>discoverRetailFlyers('<h1>Bot verification</h1>',source,now)).toThrow('UNRECOGNISED');
  });
  it('appends and replaces actual campaigns, retaining original timestamps on failure',()=>{
    const first=flyer(); const updated={...first,checkedAt:now+3600000,expiresAt:now+90000000};
    expect(mergeRetailFlyers([first],[updated],now+3600000,policy)).toEqual([updated]);
    expect(mergeRetailFlyers([first],[],now+3600000,policy)[0].checkedAt).toBe(now);
    expect(mergeRetailFlyers([first],[],now+25*3600000,policy)).toEqual([]);
    expect(mergeRetailFlyers([first],[],Date.parse('2026-11-30T20:00:00Z'),policy)).toEqual([]);
  });
  it('deduplicates campaign IDs across URL variants and filters by city and channel',()=>{
    const row=flyer();
    const another=parseRetailFlyer(html(),url.replace('139413','139412'),source,now);
    // A different issue needs its own images, even when its campaign title is the same.
    expect(another).toBeNull();
    const duplicate={...row,id:'flyer-00000000000000000000'};
    expect(validateRetailSnapshot(snapshot([row,duplicate]),now).flyers).toHaveLength(1);
    expect(selectRetailOffers(snapshot([row]),{channel:'offline',locations:['Muscat'],now})).toHaveLength(1);
    expect(selectRetailOffers(snapshot([row]),{channel:'online',now})).toEqual([]);
    expect(selectRetailOffers(snapshot([row]),{channel:'offline',locations:['Chennai'],now})).toEqual([]);
  });
  it('keeps price observation freshness separate from advertised sale expiry when explicitly planned',()=>{
    const row=flyer();const item=retailOfferPlannerItem(row);
    const saved=buildExplicitPlannerSave(item,'2026-11-18',now);
    expect(saved).toMatchObject({planDate:'2026-11-18',expiryAt:Date.parse('2026-11-30T20:00:00Z'),priceFreshUntil:now+86400000,eventDateKey:null,sourceMode:'snapshot',eventEndPrecision:'day'});
    expect(saved).not.toHaveProperty('price');
    expect(item.description).toContain('Check branch terms');
  });
  it('bounds collection and distinguishes listing failure from a checked listing with no current issue',async()=>{
    const local={...policy,sources:[source],maxFlyersPerRetailer:4};
    const failed=await collectRetailFlyers(local,async()=>{throw Error('timeout');},()=>now);
    expect(failed.health[source.id].status).toBe('unavailable');
    const empty=await collectRetailFlyers(local,async()=>'<h1>HyperMax Muscat Offers</h1>',()=>now);
    expect(empty.health[source.id].status).toBe('empty');
    expect(empty.requests).toBe(1);
  });
});
