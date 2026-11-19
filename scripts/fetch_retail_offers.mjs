import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { parseRetailOffers, mergeRetailOffers } from './retail-offers/parseRetailOffers.mjs';
import { collectRetailFlyers } from './retail-offers/collectRetailFlyers.mjs';

const config=JSON.parse(fs.readFileSync(new URL('../src/config/retailOfferSources.json',import.meta.url),'utf8'));
const output=path.resolve(process.argv.includes('--output')?process.argv[process.argv.indexOf('--output')+1]:'public/data/retail_offers.json');
const captureArg=process.argv.indexOf('--capture-dir');
const captureDir=captureArg>=0?path.resolve(process.argv[captureArg+1]):null;
const executable=process.env.RETAIL_CHROMIUM_EXECUTABLE;
const limit=config.maxOffersPerRetailer;
const offlineOnly=process.argv.includes('--offline-only');
let previous={};try{previous=JSON.parse(fs.readFileSync(output,'utf8'));}catch{/* first publication */}
let browser;
async function readFlyerPage(url){
  const signal=AbortSignal.timeout(12000);
  for(let redirects=0;redirects<=3;redirects++){
    const target=new URL(url);
    if(target.protocol!=='https:'||target.username||target.password||!['www.clicoffer.com','clicoffer.com'].includes(target.hostname))throw Error('FOREIGN_MARKET_REDIRECT');
    const response=await fetch(target,{signal,redirect:'manual',headers:{'User-Agent':'NWv7-RetailOffers/1.0 (public flyer preview)','Accept':'text/html'}});
    if(response.status>=300&&response.status<400){await response.body?.cancel();url=new URL(response.headers.get('location'),target).href;continue;}
    if(!response.ok){await response.body?.cancel();throw Error(`HTTP_${response.status}`);}
    const reader=response.body.getReader();const parts=[];let size=0;
    try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>400000){await reader.cancel();throw Error('BODY_LIMIT');}parts.push(value);}}
    finally{reader.releaseLock();}
    const html=Buffer.concat(parts).toString('utf8');
    if(captureDir){fs.mkdirSync(captureDir,{recursive:true});const key=Buffer.from(target.pathname).toString('base64url');fs.writeFileSync(path.join(captureDir,`flyer-${key}.html`),html);}
    return html;
  }
  throw Error('REDIRECT_LIMIT');
}
async function readHtml(source){
  if(source.mode==='http-python'){
    const {stdout}=await promisify(execFile)(process.env.RETAIL_PYTHON||'python',[
      fileURLToPath(new URL('./retail-offers/read_public_page.py',import.meta.url)),source.url,
    ],{encoding:'utf8',maxBuffer:3100000,timeout:20000,windowsHide:true});
    return stdout;
  }
  if(source.mode==='browser'){
    browser??=await chromium.launch({headless:true,...(executable?{executablePath:executable}:{})});
    const context=await browser.newContext({serviceWorkers:'block'});
    await context.route('**/*',route=>['image','media','font'].includes(route.request().resourceType())?route.abort():route.continue());
    try{
      const page=await context.newPage();
      const response=await page.goto(source.url,{waitUntil:'domcontentloaded',timeout:20000});
      if(!response?.ok())throw Error(`HTTP_${response?.status()}`);
      const host=new URL(page.url()).hostname;
      if(!source.domains.some(domain=>host===domain||host.endsWith('.'+domain)))throw Error('FOREIGN_MARKET_REDIRECT');
      await page.locator('a[data-testid="product-card-link"]').filter({hasText:/₹/}).first().waitFor({timeout:15000});
      const html=await page.content();if(Buffer.byteLength(html)>3000000)throw Error('BODY_LIMIT');
      return html;
    }finally{await context.close();}
  }
  const response=await fetch(source.url,{signal:AbortSignal.timeout(15000),headers:{
    'User-Agent':'NWv7-RetailOffers/1.0 (public offer preview)','Accept':'text/html, application/xhtml+xml',
  }});
  if(!response.ok){await response.body?.cancel();throw Error(`HTTP_${response.status}`);}
  const url=new URL(response.url);
  if(!source.domains.some(host=>url.hostname===host||url.hostname.endsWith('.'+host))){await response.body?.cancel();throw Error('FOREIGN_MARKET_REDIRECT');}
  const reader=response.body.getReader();const parts=[];let size=0;
  try{
    while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;
      if(size>3000000){await reader.cancel();throw Error('BODY_LIMIT');}parts.push(value);}
  }finally{reader.releaseLock();}
  return Buffer.concat(parts).toString('utf8');
}
const items=[];const retailers={...previous.retailers};const successful=[];
function publicError(error){
  const message=String(error.message||error);
  if(/^(HTTP_\d{3}|ACCESS_BLOCKED|NO_READABLE_DISCOUNTED_PRODUCTS|BODY_LIMIT|FOREIGN_MARKET_REDIRECT)$/.test(message))return message;
  if(/timeout|timed out|aborted/i.test(message))return 'FETCH_TIMEOUT';
  if(/executable|browserType.launch/i.test(message))return 'BROWSER_UNAVAILABLE';
  return 'SOURCE_UNAVAILABLE';
}
try{
  for(const source of offlineOnly?[]:config.sources){
    try{
      const html=await readHtml(source);
      const checkedAt=Date.now();
      const found=parseRetailOffers(html,source,checkedAt).slice(0,limit);
      if(captureDir){fs.mkdirSync(captureDir,{recursive:true});fs.writeFileSync(path.join(captureDir,source.id+'.html'),html);}
      if(!found.length)throw Error(/verify you are human|robot check|sorry, you have been blocked/i.test(html)?'ACCESS_BLOCKED':'NO_READABLE_DISCOUNTED_PRODUCTS');
      items.push(...found);successful.push(source.id);
      retailers[source.id]={status:'ok',checkedAt,lastSuccessAt:checkedAt,offers:found.length};
      console.log(`${source.id}: ${found.length} priced offers`);
    }catch(error){
      retailers[source.id]={status:'unavailable',checkedAt:Date.now(),lastSuccessAt:previous.retailers?.[source.id]?.lastSuccessAt||null,
        offers:0,error:publicError(error)};
      console.log(`${source.id}: ${retailers[source.id].error}`);
    }
  }
}finally{await browser?.close();}
const offline=await collectRetailFlyers(config,readFlyerPage);
for(const [id,health] of Object.entries(offline.health)){
  const parent=retailers[id];
  const {channels:previousChannels,...legacy}=parent||{};
  const online=previousChannels?.online||legacy;
  retailers[id]={...online,channels:{online:{...online},offline:health}};
  if(health.offers&&!successful.includes(id))successful.push(id);
  console.log(`${id}: ${health.offers} in-store flyers (${health.status})`);
}
const snapshot={...mergeRetailOffers(previous,items,Date.now(),successful,config,offline.flyers),retailers};
fs.mkdirSync(path.dirname(output),{recursive:true});
fs.writeFileSync(output,JSON.stringify(snapshot,null,2)+'\n');
console.log(JSON.stringify({output,offers:snapshot.items.length,flyers:snapshot.flyers.length,flyerRequests:offline.requests,successful,bytes:fs.statSync(output).size}));
if(!successful.length)process.exitCode=1;
