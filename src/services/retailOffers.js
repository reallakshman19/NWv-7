import policy from '../config/retailOfferSources.json';
import { validateRetailOffer, retailProductKey, validateRetailFlyer, retailFlyerKey } from '../utils/retailOfferContract.js';

const CACHE_KEY='nw_retail_offers_v1';
const CACHE_TTL=10*60000;
let memory=null;
let pending=null;
let lastRequestAt=0;

export function validateRetailSnapshot(raw,now=Date.now()){
  if(raw?.schemaVersion!==1||!Number.isFinite(raw.fetchedAt)||raw.fetchedAt<=0||raw.fetchedAt>now+300000||!Array.isArray(raw.items)||raw.items.length>140)throw Error('Offer update is invalid');
  const products=new Map();const ids=new Map();
  for(const row of raw.items){
    const source=policy.sources.find(source=>source.id===row?.retailerId);
    const item=validateRetailOffer(row,source,now,policy.freshHours);
    if(!item)continue;
    const key=retailProductKey(item);
    if(ids.has(item.id)&&ids.get(item.id)!==key)continue;
    ids.set(item.id,key);
    const existing=products.get(key);
    if(!existing||item.checkedAt>existing.checkedAt)products.set(key,item);
  }
  if(raw.flyers!==undefined&&(!Array.isArray(raw.flyers)||raw.flyers.length>16))throw Error('Flyer update is invalid');
  const campaigns=new Map();
  for(const row of raw.flyers||[]){
    const source=policy.sources.find(source=>source.id===row?.retailerId);
    const flyer=validateRetailFlyer(row,source,now,policy.freshHours);if(!flyer)continue;
    const key=retailFlyerKey(flyer,source);const existing=campaigns.get(key);
    if(!existing||flyer.checkedAt>existing.checkedAt)campaigns.set(key,flyer);
  }
  const counts=new Map();
  const flyers=[...campaigns.values()].filter(row=>{const count=counts.get(row.retailerId)||0;if(count>=policy.maxFlyersPerRetailer)return false;counts.set(row.retailerId,count+1);return true;});
  return{schemaVersion:1,fetchedAt:raw.fetchedAt,items:[...products.values()],flyers,retailers:raw.retailers||{},contentHash:String(raw.contentHash||'')};
}

export function selectRetailOffers(snapshot,{locations=['Chennai','Muscat'],channel='online',retailerId='all',now=Date.now()}={}){
  const data=validateRetailSnapshot(snapshot,now);
  return [...data.items,...data.flyers].filter(row=>row.channel===channel&&(retailerId==='all'||row.retailerId===retailerId)
    &&row.cities.some(city=>locations.some(value=>String(value).toLowerCase()===city.toLowerCase())))
    .sort((a,b)=>b.checkedAt-a.checkedAt||a.id.localeCompare(b.id));
}

export function formatRetailPrice(amount,currency){
  return new Intl.NumberFormat(currency==='INR'?'en-IN':'en-OM',{style:'currency',currency,
    minimumFractionDigits:currency==='OMR'?3:0,maximumFractionDigits:currency==='OMR'?3:2}).format(amount);
}

function readCache(){
  try{if(memory)return validateRetailSnapshot(memory);}catch{memory=null;}
  try{const raw=JSON.parse(localStorage.getItem(CACHE_KEY)||'null');if(raw)memory=validateRetailSnapshot(raw);}catch{/* damaged or expired cached rows are not promoted */}
  return memory;
}

export async function loadRetailOffers({force=false}={}){
  if(pending)return pending;
  const cached=readCache();
  if(!force&&cached&&Date.now()-lastRequestAt<CACHE_TTL)return{snapshot:validateRetailSnapshot(cached),error:null,fromCache:true};
  pending=(async()=>{
    const location=globalThis.window?.location;
    const base=(import.meta.env.BASE_URL||'/').replace(/\/$/,'');
    const url=location?.hostname==='reallakshman19.github.io'
      ?'https://raw.githubusercontent.com/reallakshman19/NWv-7/main/public/data/retail_offers.json'
      :`${base}/data/retail_offers.json`;
    try{
      const response=await fetch(url,{cache:'no-cache',signal:AbortSignal.timeout(12000)});
      if(!response.ok)throw Error('Retailer update is unavailable');
      if(Number(response.headers?.get('content-length'))>500000)throw Error('Retailer update is too large');
      const text=await response.text();if(text.length>500000)throw Error('Retailer update is too large');
      const snapshot=validateRetailSnapshot(JSON.parse(text));
      if(cached&&snapshot.fetchedAt<cached.fetchedAt)throw Error('An older retailer update was received');
      memory=snapshot;lastRequestAt=Date.now();
      try{localStorage.setItem(CACHE_KEY,JSON.stringify(snapshot));}catch{/* prices remain usable without storage */}
      return{snapshot,error:null,fromCache:false};
    }catch(error){
      let snapshot=null;try{if(cached)snapshot=validateRetailSnapshot(cached);}catch{/* no usable last good update */}
      return{snapshot,error:error.message||'Retailer update is unavailable',fromCache:Boolean(snapshot)};
    }finally{pending=null;}
  })();
  return pending;
}

export function retailOfferPlannerItem(row){
  const {expiresAt:priceFreshUntil,...offer}=row;
  if(row.kind==='flyer')return {...offer,priceFreshUntil,category:'shopping',type:'offer',eventDateKey:null,datePrecision:'unknown',dateConfidence:'unknown',
    link:row.url,source:`${row.retailer} · ClicOffer flyer`,sourceMode:'snapshot',location:row.city,observedAt:row.checkedAt,
    expiryAt:row.validUntil,eventEndPrecision:'day',offerChannel:'offline',offerMarket:row.market,isOffer:true,
    description:`${row.description} Listed stores: ${row.storeScope}. Source-reported end: ${row.endDateKey} (Muscat). Check branch terms in the flyer.`};
  return {...offer,priceFreshUntil,category:'shopping',type:'offer',eventDateKey:null,datePrecision:'unknown',dateConfidence:'unknown',
    link:row.url,source:row.retailer,sourceMode:'snapshot',location:row.cities?.join(' / ')||'',observedAt:row.checkedAt,
    expiryAt:row.validUntil||null,offerChannel:row.channel,offerMarket:row.market,isOffer:true,
    description:`Observed price ${formatRetailPrice(row.price,row.currency)} on ${new Date(row.checkedAt).toLocaleDateString()}. ${row.validUntil?'Advertised offer end: '+new Date(row.validUntil).toLocaleString()+'.':'The retailer has not advertised an end date.'}`};
}
