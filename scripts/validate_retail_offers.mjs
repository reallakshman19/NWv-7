import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { validateRetailOffer, retailProductKey, validateRetailFlyer, retailFlyerKey, retailSnapshotContent } from '../src/utils/retailOfferContract.js';

const policy=JSON.parse(fs.readFileSync(new URL('../src/config/retailOfferSources.json',import.meta.url),'utf8'));
const file=process.argv[2]||'public/data/retail_offers.json';
const raw=fs.readFileSync(file,'utf8');
if(Buffer.byteLength(raw)>500000)throw Error('Retail snapshot exceeds 500 kB');
const snapshot=JSON.parse(raw);const now=Date.now();
if(policy.retentionDays>7||policy.freshHours>24||policy.maxOffersPerRetailer>20||policy.maxFlyersPerRetailer>4)throw Error('Retail retention/request bounds exceeded');
if(snapshot.schemaVersion!==1||!Number.isFinite(snapshot.fetchedAt)||snapshot.fetchedAt>now+300000||now-snapshot.fetchedAt>3600000)throw Error('Retail publication is not current');
if(!Array.isArray(snapshot.items)||snapshot.items.length>140||!Array.isArray(snapshot.flyers)||snapshot.flyers.length>16||!snapshot.items.length&&!snapshot.flyers.length)throw Error('No qualified offer publication');
if(!Array.isArray(snapshot.successfulRetailers)||!snapshot.successfulRetailers.length)throw Error('No successful retailer acquisition');
const ids=new Set();const products=new Set();const counts={};
for(const row of snapshot.items){
 const source=policy.sources.find(source=>source.id===row.retailerId);
 const item=validateRetailOffer(row,source,now,policy.freshHours);
 if(!item)throw Error('Unqualified product offer');
 const key=retailProductKey(row);
 if(ids.has(row.id)||products.has(key))throw Error('Duplicate product offer');
 ids.add(row.id);products.add(key);counts[row.retailerId]=(counts[row.retailerId]||0)+1;
 if(counts[row.retailerId]>policy.maxOffersPerRetailer)throw Error('Retailer count exceeds cap');
}
const flyerCounts={};
for(const row of snapshot.flyers){
 const source=policy.sources.find(source=>source.id===row.retailerId);
 if(!validateRetailFlyer(row,source,now,policy.freshHours))throw Error('Unqualified in-store flyer');
 const key=retailFlyerKey(row,source);
 if(ids.has(row.id)||products.has(key))throw Error('Duplicate in-store flyer');
 ids.add(row.id);products.add(key);flyerCounts[row.retailerId]=(flyerCounts[row.retailerId]||0)+1;
 if(flyerCounts[row.retailerId]>policy.maxFlyersPerRetailer)throw Error('Retailer flyer count exceeds cap');
}
const digest=createHash('sha256').update(retailSnapshotContent(snapshot)).digest('hex');
if(digest!==snapshot.contentHash)throw Error('Retail content digest mismatch');
console.log(JSON.stringify({status:'PASS',offers:snapshot.items.length,flyers:snapshot.flyers.length,counts,flyerCounts,contentHash:digest}));
