/**
 * A10 LIVE READ-ONLY observation (not unit-test fixture, not release gate).
 * Public Cloudflare preview + deployed GitHub Pages. No writes, no credentials.
 * Records returned HTTP receipts and actual Chromium DOM plus unhandled errors.
 * A 200 response is not trusted freshness/identity evidence without validation.
 */
import { chromium } from 'playwright';
import crypto from 'node:crypto';
import fs from 'node:fs';
const root='artifacts/a10-live-observe';
fs.mkdirSync(root,{recursive:true});
const sha256=s=>crypto.createHash('sha256').update(s).digest('hex');
const timeout=setTimeout(()=>{fs.writeFileSync(root+'/TIMEOUT.txt','A10 LIVE observer timeout');process.exit(124)},260000);
timeout.unref();
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const cf='https://nw-sections-shadow.reallaksh19.workers.dev/preview/sections/latest';
const site='https://reallakshman19.github.io/NWv-7/';
const report={classification:'READ_ONLY_DEPLOYED_BROWSER_AND_HTTP_OBSERVATION',runAtUtc:new Date().toISOString(),originUrls:[cf,site],http:[],browser:[],errors:[],limits:['No credentials or D1 admin audit','Site deployment SHA unverified unless resolved independently','Cloudflare preview is not automatically selected UI authority','No producer writes or retries that modify state']};
const save=()=>fs.writeFileSync(root+'/a10_live_http_and_route_observations.json',JSON.stringify(report,null,2));
async function observe(url,name){
 const at=Date.now();
 try{
   const response=await fetch(url,{method:'GET',signal:AbortSignal.timeout(20000),headers:{Accept:'application/json,text/html,*/*'}});
   const bytes=Buffer.from(await response.arrayBuffer());
   const headers=Object.fromEntries(['date','content-type','cache-control','etag','last-modified','x-nw-epoch','x-nw-sections-epoch','x-nw-source','x-nw-sections-source','x-nw-upahead-source','x-nw-upahead-reason','x-nw-upahead-freshness','x-nw-upahead-age-seconds'].map(k=>[k,response.headers.get(k)]).filter(x=>x[1]));
   const o={name,url,responseUrl:response.url,status:response.status,headers,responseBytes:bytes.length,responseSha256:sha256(bytes),elapsedMs:Date.now()-at};
   if(response.ok&&/json/.test(headers['content-type']||'')){
     try{
       const data=JSON.parse(bytes.toString());
       if(data&&data.sections){
        const sections=Object.fromEntries(Object.entries(data.sections).map(([k,v])=>[k,Array.isArray(v)?v.length:0]));
        const ids=Object.values(data.sections).flat().map(x=>x?.id).filter(Boolean);
        o.snapshot={schemaVersion:data.schemaVersion,fetchedAt:data.fetchedAt,contentHash:data.contentHash,epochId:data.preview?.epochId,
          servingAuthority:data.preview?.servingAuthority,previewMode:data.preview?.mode,sections,
          rowCount:ids.length,uniqueIds:new Set(ids).size,
          ageHours:(Date.now()-Number(data.fetchedAt||0))/3600000,within12h:(Date.now()-Number(data.fetchedAt||0))>=0&&(Date.now()-Number(data.fetchedAt||0))<=12*3600000};
       }
       fs.writeFileSync(root+'/a10_http_'+name+'.json',bytes);
     }catch(e){o.parseError=String(e)}
   }else if(name==='pages'){
    const html=bytes.toString('utf8');
    o.htmlAssets=[...html.matchAll(/(?:src|href)=["']([^"']+\.(?:js|css))["']/g)].map(m=>m[1]);
   }
   report.http.push(o);save();
   console.log('A10_LIVE_HTTP',JSON.stringify(o));
 }catch(e){
   const x={name,url,error:String(e),elapsedMs:Date.now()-at};
   report.http.push(x);report.errors.push(x);save();
   console.log('A10_LIVE_HTTP_ERROR',JSON.stringify(x));
 }
}
await observe(cf,'cloudflare-preview');
await observe(site,'pages');
let browser;
try{
 browser=await chromium.launch({headless:true});
 const modes=[
   {id:'desktop',viewport:{width:1440,height:900}},
   {id:'mobile',viewport:{width:400,height:844},isMobile:true,hasTouch:true},
 ];
 const routes=[['main','/'],['up-ahead','/up-ahead'],['insight','/insight'],['newspaper','/newspaper'],['data-health','/data-health']];
 for(const mode of modes){
   const context=await browser.newContext({viewport:mode.viewport,isMobile:!!mode.isMobile,hasTouch:!!mode.hasTouch,serviceWorkers:'block'});
   const requests=[];const failed=[];const responseErrors=[];const pages=[];
   context.on('request',r=>{
      try{const u=new URL(r.url());if(/github|cloudflare|workers\.dev|news\.google|pages\.dev/i.test(u.hostname))requests.push({host:u.hostname,path:u.pathname,method:r.method()})}catch{}
   });
   context.on('requestfailed',r=>{try{const u=new URL(r.url());failed.push({host:u.hostname,path:u.pathname,reason:r.failure()?.errorText})}catch{}});
   context.on('response',r=>{if(r.status()>=400){try{const u=new URL(r.url());responseErrors.push({host:u.hostname,path:u.pathname,status:r.status()})}catch{}}});
   const page=await context.newPage();
   const pageErrors=[];
   page.on('pageerror',e=>pageErrors.push(String(e)));
   for(const [name,hash]of routes){
    const at=Date.now();
    try{
      await page.goto(site+'#'+hash,{waitUntil:'domcontentloaded',timeout:26000});
      await wait(name==='insight'?8000:4400);
      const dom=await page.evaluate(()=>{
        const text=document.body?.innerText||'';
        return{
          text:text.slice(0,10000),
          headings:[...document.querySelectorAll('h1,h2')].map(n=>n.innerText).slice(0,30),
          statuses:[...document.querySelectorAll('[role=status]')].map(n=>n.innerText).slice(0,15),
          alerts:[...document.querySelectorAll('[role=alert]')].map(n=>n.innerText).slice(0,15),
          badges:[...document.querySelectorAll('.data-pill,.data-state-badge,.fmt-btn,[data-testid=data-source-badge]')].map(n=>n.innerText).slice(0,25),
          articleCount:document.querySelectorAll('article').length,
          loading:/Running AI pipeline|Scanning horizon|Fetching Today.s Brief|Main is loading/i.test(text),
          healthPanel:!!document.querySelector('[data-testid=data-health-panel]'),
          anchors:[...document.querySelectorAll('a[href]')].slice(0,30).map(a=>({label:(a.innerText||'').slice(0,60),href:a.href.replace(/\?.*/, '')})),
        }
      });
      const row={mode:mode.id,route:name,url:page.url(),elapsedMs:Date.now()-at,domSha256:sha256(dom.text),...dom,
        requestsObserved:requests.length,failedRequests:failed.length,responseErrors:responseErrors.length,pageErrors:[...pageErrors]};
      pages.push(row);report.browser.push(row);
      await page.screenshot({path:`${root}/a10_live_${mode.id}_${name}.png`,fullPage:false,timeout:8000,animations:'disabled'}).catch(e=>{row.screenshotError=String(e)});
      save();
      console.log('A10_LIVE_ROUTE',mode.id,name,JSON.stringify({headings:dom.headings.slice(0,8),badges:dom.badges.slice(0,6),loading:dom.loading,articles:dom.articleCount,errors:pageErrors.length}));
    }catch(e){const x={mode:mode.id,route:name,error:String(e)};report.browser.push(x);report.errors.push(x);save();console.log('A10_LIVE_ROUTE_ERROR',JSON.stringify(x))}
   }
   report[mode.id+'Transport']={requests:requests.slice(0,200),failed:failed.slice(0,100),responseErrors:responseErrors.slice(0,80),pageErrors};
   save();await context.close().catch(()=>{});
 }
}catch(e){report.browserError=String(e);report.errors.push({stage:'browser',error:String(e)})}
finally{if(browser)await browser.close().catch(()=>{});save();clearTimeout(timeout)}
report.complete=report.browser.length===10;
save();
console.log('A10_LIVE_COMPLETE',JSON.stringify({pages:report.browser.length,http:report.http.length,errors:report.errors.length,complete:report.complete}));
process.exit(0);
