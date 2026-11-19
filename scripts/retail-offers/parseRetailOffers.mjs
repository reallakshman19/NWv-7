import { createHash } from 'node:crypto';
import { JSDOM, VirtualConsole } from 'jsdom';
import { validateRetailOffer, retailProductKey, retailSnapshotContent } from '../../src/utils/retailOfferContract.js';
import { mergeRetailFlyers } from './collectRetailFlyers.mjs';

const HOUR=3600000;
const clean=value=>String(value??'').replace(/\s+/g,' ').trim();
function domText(node){
  if(!node)return '';
  const walker=node.ownerDocument.createTreeWalker(node,4);const parts=[];let text;
  while((text=walker.nextNode()))if(!['SCRIPT','STYLE'].includes(text.parentElement?.tagName))parts.push(text.textContent);
  return clean(parts.join(' '));
}
export function money(value) {
  const text=clean(value).replace(/,/g,'');
  if(/(?:^|\s)-\s*\d/.test(text))return null;
  const match=text.match(/(?:^|[^\d.])([0-9]+(?:\.[0-9]{1,3})?)(?![\d.])/);
  return match?Number(match[1]):null;
}
function safeUrl(value,base) {
  if(!value||typeof value!=='string')return null;
  try{const url=new URL(value,base);return url.protocol==='https:'&&!url.username&&!url.password?url.href:null;}catch{return null;}
}
function productUrl(value,source) {
  const resolved=safeUrl(value,source.url);if(!resolved)return null;
  const url=new URL(resolved);
  if(!source.domains.some(host=>url.hostname===host||url.hostname.endsWith('.'+host)))return null;
  for(const key of [...url.searchParams.keys()])if(!['pid','sku','variant'].includes(key))url.searchParams.delete(key);
  url.hash='';return url.href;
}
const priceText=node=>node?clean(node.textContent):'';
function itemImage(node,base){const image=node.querySelector('img');return safeUrl(image?.getAttribute('data-src')||image?.getAttribute('src'),base);}

export function normalizeRetailOffer(raw,source,observedAt) {
  if (!Number.isFinite(observedAt) || observedAt <= 0) return null;
  const url=productUrl(raw.url,source);
  const title=clean(raw.title);
  const price=Number(raw.price);
  const previousPrice=Number(raw.previousPrice);
  const discountPercent=Number(raw.discountPercent);
  const validUntil=raw.validUntil==null?null:Number(raw.validUntil);
  if(!url||title.length<5||title.length>400||!Number.isFinite(price)||price<=0||price>10000000)return null;
  if(raw.currency&&raw.currency!==source.currency)return null;
  if(validUntil!==null&&(!Number.isFinite(validUntil)||validUntil<=observedAt))return null;
  if(raw.availability&&/outofstock|soldout|discontinued/i.test(raw.availability))return null;
  const old=Number.isFinite(previousPrice)&&previousPrice>price?previousPrice:null;
  const percent=Number.isFinite(discountPercent)&&discountPercent>0&&discountPercent<100?discountPercent:old?Math.round((1-price/old)*100):null;
  if(old&&percent&&Math.abs((1-price/old)*100-percent)>2)return null;
  if(!old&&!percent)return null;
  const channel=raw.channel||'online';
  // An online price is not proof that a local physical shop honours it.
  if(!['online','offline'].includes(channel)||channel==='offline'&&(!validUntil||!raw.storeScopeVerified))return null;
  const stable=retailProductKey({retailerId:source.id,url,channel});
  return validateRetailOffer({
    id:'retail-'+createHash('sha256').update(stable).digest('hex').slice(0,20),
    retailerId:source.id,retailer:source.name,market:source.market,cities:source.cities,
    channel,title,url,price,currency:source.currency,previousPrice:old,discountPercent:percent,
    imageUrl:safeUrl(raw.imageUrl,source.url),checkedAt:observedAt,
    validUntil,validUntilSource:validUntil?raw.validUntilSource||'retailer':null,
    expiresAt:Math.min(observedAt+24*HOUR,validUntil||Infinity),
    sourceUrl:raw.sourceUrl||source.url,sourceKind:raw.sourceKind||'retailer',
    sourceName:raw.sourceName||source.name,storeScopeVerified:Boolean(raw.storeScopeVerified),
    availability:raw.availability||'Not verified for your delivery address',
  },source,observedAt);
}

function schemaProducts(document) {
  const products=[];
  function walk(value){
    if(!value||typeof value!=='object')return;
    if(value['@type']==='Product'){
      const offer=Array.isArray(value.offers)?value.offers[0]:value.offers;
      if(offer)products.push({title:value.name,url:value.url||offer.url,price:offer.price,
        currency:offer.priceCurrency,availability:offer.availability,
        imageUrl:Array.isArray(value.image)?value.image[0]:value.image,
        validUntil:offer.priceValidUntil?Date.parse(offer.priceValidUntil):null});
    }
    for(const child of Object.values(value))if(Array.isArray(child))child.forEach(walk);else if(child&&typeof child==='object')walk(child);
  }
  for(const script of document.querySelectorAll('script[type="application/ld+json"]'))try{walk(JSON.parse(script.textContent));}catch{/* invalid publisher JSON is not offer evidence */}
  return products;
}

export function parseRetailOffers(html,source,observedAt) {
  const dom=new JSDOM(html,{url:source.url,virtualConsole:new VirtualConsole()});
  const d=dom.window.document;
  let raw=[];
  if(source.adapter==='amazon'){
    raw=[...d.querySelectorAll('a[data-testid="product-card-link"]')].slice(0,160).map(a=>{
      let card=a;
      for(let depth=0;card&&depth<5;depth++,card=card.parentElement){
        if(/₹/.test(card.textContent)&&new Set([...card.querySelectorAll('a[data-testid="product-card-link"]')].map(n=>productUrl(n.href,source))).size<=1)break;
      }
      card??=a;
      const text=domText(card);
      const current=text.match(/Deal Price:\s*₹\s*([\d,.]+)/i)||text.match(/₹\s*([\d,.]+)/);
      const old=text.match(/M\.R\.P:\s*(?:M\.R\.P:\s*)?₹\s*([\d,.]+)/i);
      const duration=text.match(/Ends in\s*(\d{1,2}):(\d{2}):(\d{2})/i);
      return{title:card.querySelector('[data-testid="product-card-title"],[class*="productTitle"],[class*="ProductTitle"]')?.textContent||card.querySelector('img')?.getAttribute('alt'),
        url:a.href,price:current?money(current[1]):null,previousPrice:old?money(old[1]):null,
        discountPercent:Number(text.match(/(\d{1,2})%\s*off/i)?.[1]),imageUrl:itemImage(card,source.url),
        validUntil:duration?observedAt+(Number(duration[1])*3600+Number(duration[2])*60+Number(duration[3]))*1000:null,
        validUntilSource:duration?'retailer_countdown':null};
    });
  }else if(source.adapter==='flipkart'){
    for(const a of d.querySelectorAll('a[href*="/p/itm"]')){
      let card=a;
      for(let depth=0;card&&depth<7;depth++,card=card.parentElement){
        const text=domText(card);
        const values=[...text.matchAll(/₹\s*([\d,.]+)/g)].map(match=>money(match[1]));
        const links=new Set([...card.querySelectorAll('a[href*="/p/itm"]')].map(n=>productUrl(n.href,source)));
        if(!values.length||links.size>1)continue;
        raw.push({title:a.title||card.querySelector('img[alt]')?.alt,
          url:a.href,price:values[0],previousPrice:values[1],currency:'INR',
          discountPercent:Number(text.match(/(\d{1,2})%\s*off/i)?.[1]),imageUrl:itemImage(card,source.url)});break;
      }
    }
  }else if(source.adapter==='lulu'){
    for(const priceNode of d.querySelectorAll('[data-testid="product-price"]')){
      const currency=priceNode.textContent.match(/\b(INR|OMR|AED|SAR)\b/)?.[1];
      if(!currency||priceNode.classList.contains('line-through'))continue;
      const card=priceNode.closest('.app-product-card')||priceNode.closest('.app-card-content');
      const a=card?.querySelector('.app-card-name a[href*="/p/"]');
      if(!a)continue;
      raw.push({title:a.getAttribute('title')||a.textContent,url:a.href,
        price:money(priceNode.textContent),previousPrice:money(priceText(card.querySelector('[class*="line-through"]'))),
        currency,discountPercent:Number(domText(card).match(/(\d{1,2})\s*%\s*OFF/i)?.[1]),imageUrl:itemImage(card,source.url)});
    }
  }else if(source.adapter==='sharaf'){
    for(const a of d.querySelectorAll('a.product-link')){
      raw.push({title:a.querySelector('[itemprop="name"]')?.textContent||a.title,url:a.href,
        price:money(priceText(a.querySelector('.price'))),
        previousPrice:money(priceText(a.querySelector('.old-price,.price-old,.regular-price,del'))),
        discountPercent:Number(domText(a).match(/(?:^|[^\d.])(\d{1,2})\s*%\s*OFF/i)?.[1]),imageUrl:itemImage(a,source.url)});
    }
  }else{
    raw=schemaProducts(d);
  }
  const items=raw.map(row=>normalizeRetailOffer(row,source,observedAt)).filter(Boolean);
  dom.window.close();return [...new Map(items.map(row=>[row.id,row])).values()];
}

export function mergeRetailOffers(previous,incoming,now,successfulRetailers=[],policy,incomingFlyers=[]) {
  const map=new Map();
  // No fetch-time timestamp is substituted into retained records.
  for(const raw of [...(previous?.items||[]),...incoming]){
    const source=policy.sources.find(source=>source.id===raw?.retailerId);
    const row=validateRetailOffer(raw,source,now,policy.freshHours);
    if(!row||now-row.checkedAt>policy.retentionDays*24*HOUR)continue;
    const key=retailProductKey(row);
    const old=map.get(key);if(!old||row.checkedAt>=old.checkedAt)map.set(key,row);
  }
  const counts=new Map();
  const items=[...map.values()].sort((a,b)=>b.checkedAt-a.checkedAt||a.id.localeCompare(b.id)).filter(row=>{
    const count=counts.get(row.retailerId)||0;
    if(count>=policy.maxOffersPerRetailer)return false;
    counts.set(row.retailerId,count+1);return true;
  }).slice(0,140);
  const flyers=mergeRetailFlyers(previous?.flyers,incomingFlyers,now,policy);
  return {schemaVersion:1,fetchedAt:now,items,flyers,successfulRetailers,
    contentHash:createHash('sha256').update(retailSnapshotContent({items,flyers})).digest('hex')};
}
