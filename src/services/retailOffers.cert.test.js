import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import policy from '../config/retailOfferSources.json';
import { normalizeRetailOffer, parseRetailOffers, mergeRetailOffers } from '../../scripts/retail-offers/parseRetailOffers.mjs';
import { validateRetailSnapshot, selectRetailOffers, retailOfferPlannerItem, formatRetailPrice } from './retailOffers.js';
import { buildExplicitPlannerSave } from '../utils/plannerIntelligenceBridge.js';

const now=Date.parse('2026-11-18T15:00:00Z');
const hour=3600000;
const source=id=>policy.sources.find(row=>row.id===id);
const offer=(id='lulu-oman',overrides={})=>normalizeRetailOffer({
  title:'Laundry detergent promotional pack',url:source(id).url+'?sku=42',price:1.690,previousPrice:2.130,discountPercent:21,...overrides,
},source(id),now);
const snapshot=(items=[offer()],overrides={})=>({schemaVersion:1,fetchedAt:now,items,retailers:{},...overrides});

describe('retailer offer extraction from product evidence',()=>{
  it('joins Amazon image and price links, preserving its real countdown',()=>{
    const html=`<article><a data-testid="product-card-link" href="/dp/B012345678?ref=tracking"><img alt="Wireless microphone offer" src="https://m.media-amazon.com/product.jpg"></a>
      <div><a data-testid="product-card-link" href="/dp/B012345678?ref=tracking"><span>61% off</span><span>Ends in 05:43:39</span><span>Deal Price: ₹784.00</span><span>M.R.P: ₹1,999</span></a></div></article>`;
    const rows=parseRetailOffers(html,source('amazon-in'),now);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({title:'Wireless microphone offer',price:784,previousPrice:1999,discountPercent:61,validUntil:now+(5*3600+43*60+39)*1000,validUntilSource:'retailer_countdown'});
    expect(rows[0].url).toBe('https://www.amazon.in/dp/B012345678');
  });
  it('does not concatenate Flipkart old prices and adjacent discount text',()=>{
    const html=`<article><a href="/phone/p/itm123?pid=MOB123&affid=track"><img alt="A smartphone with discount"></a><a href="/phone/p/itm123?pid=MOB123"><span>₹1,069</span><span>₹1,349</span><span>21%off</span></a></article>`;
    const rows=parseRetailOffers(html,source('flipkart-in'),now);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({price:1069,previousPrice:1349,discountPercent:21,currency:'INR'});
    expect(rows[0].url).toBe('https://www.flipkart.com/phone/p/itm123?pid=MOB123');
  });
  it('accepts LuLu current/old prices sharing product-price and a sibling title',()=>{
    const html=`<div class="app-product-card"><a href="/en-om/fabric-softener/p/560901/"><img src="https://cdn.luluhypermarket.com/product.jpg"></a><div class="app-card-content"><div class="app-card-name"><a href="/en-om/fabric-softener/p/560901/">Fabric Softener Value Pack 3 Litre</a></div><div><span data-testid="product-price">1.690 OMR</span><span class="line-through" data-testid="product-price">2.130</span><span>21<!-- -->% OFF</span></div></div></div>`;
    const rows=parseRetailOffers(html,source('lulu-oman'),now);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({price:1.69,previousPrice:2.13,discountPercent:21,currency:'OMR',validUntil:null});
    expect(rows[0].imageUrl).toBe('https://cdn.luluhypermarket.com/product.jpg');
    expect(parseRetailOffers(html.replace('OMR','AED'),source('lulu-oman'),now)).toEqual([]);
  });
  it('uses Sharaf product cards and discounts without inventing old prices',()=>{
    const rows=parseRetailOffers(`<a class="product-link" href="/product/honor-phone/"><span itemprop="name">Honor smartphone 256GB 8GB</span><span class="price">OMR 159.899</span><span>9% OFF</span></a>`,source('sharaf-oman'),now);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({price:159.899,previousPrice:null,discountPercent:9});
  });
  it('rejects an ordinary structured-data price with no discount evidence',()=>{
    const html='<script type="application/ld+json">{"@type":"Product","name":"Standard price appliance","url":"https://www.extra.com/en-om/p/123","offers":{"price":29.9,"priceCurrency":"OMR"}}</script>';
    expect(parseRetailOffers(html,source('extra-oman'),now)).toEqual([]);
  });
});

describe('qualified offer snapshots and append/dedup/expiry',()=>{
  it('retains an unexpired observation when its provider fails without refreshing its age',()=>{
    const row=offer();
    const merged=mergeRetailOffers(snapshot([row]),[],now+hour,[],policy);
    expect(merged.items).toHaveLength(1);
    expect(merged.items[0].checkedAt).toBe(now);
    expect(mergeRetailOffers(merged,[],now+25*hour,[],policy).items).toEqual([]);
  });
  it('replaces a product price revision, appends a distinct product and drops corrupt retained prices',()=>{
    const old=offer();
    const updated={...old,price:1.8,previousPrice:2,discountPercent:10,checkedAt:now+hour,expiresAt:now+25*hour};
    const another=offer('lulu-oman',{url:'https://gcc.luluhypermarket.com/en-om/another/p/123/'});
    const corrupt={...offer('flipkart-in'),previousPrice:134921,discountPercent:21};
    const merged=mergeRetailOffers(snapshot([old,corrupt]),[updated,another],now+hour,['lulu-oman'],policy);
    expect(merged.items).toHaveLength(2);
    expect(merged.items.find(row=>row.id===old.id).price).toBe(1.8);
  });
  it('deduplicates renamed Amazon slugs and tracking links while retaining distinct product variants',()=>{
    const first=offer('amazon-in',{url:'https://www.amazon.in/old-title/dp/B012345678?ref=first'});
    const renamed=offer('amazon-in',{url:'https://www.amazon.in/new-title/dp/B012345678?ref=second',price:1.8,previousPrice:2,discountPercent:10});
    expect(renamed.id).toBe(first.id);
    const variant=offer('flipkart-in',{url:'https://www.flipkart.com/phone/p/itm123?pid=VARIANT1'});
    const otherVariant=offer('flipkart-in',{url:'https://www.flipkart.com/renamed-phone/p/itm123?pid=VARIANT2'});
    expect(variant.id).not.toBe(otherVariant.id);
    const legacy={...first,id:'retail-00000000000000000000'};
    const updated={...renamed,checkedAt:now+1000,expiresAt:now+24*hour+1000};
    const merged=mergeRetailOffers(snapshot([legacy]),[updated,variant,otherVariant],now+1000,[],policy);
    expect(merged.items).toHaveLength(3);
    expect(validateRetailSnapshot(snapshot([legacy,updated]),now+1000).items).toHaveLength(1);
    expect(validateRetailSnapshot(snapshot([legacy,updated]),now+1000).items[0].price).toBe(1.8);
  });
  it.each([
    {currency:'AED'}, {url:'https://luluhypermarket.com.evil.example/p/42'},
    {url:'https://fake-luluhypermarket.com/p/42'}, {url:'https://user:password@gcc.luluhypermarket.com/p/42'},
    {checkedAt:now+hour}, {expiresAt:now+25*hour}, {expiresAt:NaN},
    {validUntil:now-hour}, {validUntil:now+hour,expiresAt:now+24*hour},
    {price:0}, {price:NaN}, {previousPrice:134921}, {discountPercent:99}, {channel:'offline',storeScopeVerified:false},
  ])('rejects unsafe, wrong-market or stale record %j',overrides=>{
    expect(validateRetailSnapshot(snapshot([{...offer(),...overrides}]),now).items).toEqual([]);
  });
  it('requires an advertised end and store verification for physical-store prices',()=>{
    const store={...source('hypermax-oman'),channels:['offline']};
    const raw={title:'In-store weekend appliance sale',url:store.url,price:9,previousPrice:10,channel:'offline'};
    expect(normalizeRetailOffer(raw,store,now)).toBeNull();
    expect(normalizeRetailOffer({...raw,validUntil:now+hour,storeScopeVerified:true},store,now)).toMatchObject({channel:'offline',expiresAt:now+hour});
  });
  it('deduplicates snapshot IDs, enforces city and channel filters, and drops expired advertised offers',()=>{
    const oman=offer();const india=offer('flipkart-in');
    const data=snapshot([oman,india,oman]);
    expect(selectRetailOffers(data,{locations:['Chennai'],now}).map(row=>row.retailerId)).toEqual(['flipkart-in']);
    expect(selectRetailOffers(data,{locations:['Muscat'],now})).toHaveLength(1);
    expect(selectRetailOffers(data,{locations:['Muscat'],channel:'offline',now})).toEqual([]);
    expect(selectRetailOffers(data,{now:now+25*hour})).toEqual([]);
  });
  it('keeps the shopping action date separate from unknown retailer dates and price freshness',()=>{
    const row=offer();const adapted=retailOfferPlannerItem(row);
    const saved=buildExplicitPlannerSave(adapted,'2026-11-20',now);
    expect(saved).toMatchObject({planDate:'2026-11-20',eventDateKey:null,datePrecision:'unknown',price:1.69,priceFreshUntil:now+24*hour,expiryAt:null,sourceMode:'snapshot'});
    expect(saved).not.toHaveProperty('expiresAt');
    expect(saved).not.toHaveProperty('publishedAt');
    expect(formatRetailPrice(1.69,'OMR')).toContain('1.690');
    expect(formatRetailPrice(1069,'INR')).toContain('1,069');
  });
});

describe('bounded retailer snapshot loading and last good cache',()=>{
  let store;
  beforeEach(()=>{
    vi.resetModules();vi.useFakeTimers();vi.setSystemTime(now);
    store=new Map();
    vi.stubGlobal('localStorage',{getItem:key=>store.get(key)||null,setItem:(key,value)=>store.set(key,value)});
  });
  afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();});
  const response=data=>({ok:true,headers:new Headers(),text:async()=>JSON.stringify(data)});
  it('uses one file request, coalesces concurrent callers and preserves checkedAt across fetch failure',async()=>{
    const fetch=vi.fn().mockResolvedValue(response(snapshot()));vi.stubGlobal('fetch',fetch);
    const {loadRetailOffers}=await import('./retailOffers.js');
    const [first,second]=await Promise.all([loadRetailOffers(),loadRetailOffers()]);
    expect(fetch).toHaveBeenCalledTimes(1);expect(first).toEqual(second);
    vi.setSystemTime(now+hour);fetch.mockRejectedValue(Error('offline'));
    const cached=await loadRetailOffers({force:true});
    expect(cached).toMatchObject({fromCache:true,error:'offline'});
    expect(cached.snapshot.items[0].checkedAt).toBe(now);
    vi.setSystemTime(now+25*hour);
    expect((await loadRetailOffers({force:true})).snapshot.items).toEqual([]);
  });
  it('does not roll the last good update back to an older served snapshot',async()=>{
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(response(snapshot())));
    const {loadRetailOffers}=await import('./retailOffers.js');await loadRetailOffers();
    globalThis.fetch.mockResolvedValue(response(snapshot([],{fetchedAt:now-hour})));
    expect(await loadRetailOffers({force:true})).toMatchObject({fromCache:true,error:'An older retailer update was received',snapshot:{fetchedAt:now}});
  });
});
