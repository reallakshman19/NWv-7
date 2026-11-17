/**
 * A10 read-only Cloudflare evidence + candidate UI runtime validation.
 * GET public sections Preview body; preserve SHA-256 and exact bytes; no D1 auth,
 * no writes. Render candidate Vite production build with remote traffic blocked.
 * This is a freshness-fail-closed replay, not a fabricated fresh Worker result.
 */
import fs from 'node:fs';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
const root='artifacts/a10-fix';
fs.mkdirSync(root,{recursive:true});
const output={classification:'LIVE_HTTP_RECEIPT_PLUS_CONTROLLED_CANDIDATE_BROWSER',
  revision:process.env.GITHUB_SHA||'local',at:new Date().toISOString(),
  cloudflare:null,browser:[],gates:{},errors:[]};
const save=()=>fs.writeFileSync(root+'/a10_cloudflare_replay_and_candidate_browser.json',JSON.stringify(output,null,2));
const sha256=data=>crypto.createHash('sha256').update(data).digest('hex');
const cf='https://nw-sections-shadow.reallaksh19.workers.dev/preview/sections/latest';
try{
 const response=await fetch(cf,{signal:AbortSignal.timeout(25000)});
 const bytes=Buffer.from(await response.arrayBuffer());
 const payload=JSON.parse(bytes.toString('utf-8'));
 const fetchedAt=Number(payload?.fetchedAt||0);
 const ageMs=Date.now()-fetchedAt;
 const rowCounts=Object.fromEntries(Object.entries(payload.sections||{}).map(([k,rows])=>[k,Array.isArray(rows)?rows.length:0]));
 const total=Object.values(rowCounts).reduce((a,b)=>a+b,0);
 const fresherThan12h=Number.isFinite(ageMs)&&ageMs>=0&&ageMs<=43200000;
 output.cloudflare={
   url:cf,httpStatus:response.status,serverDate:response.headers.get('date'),
   sizeBytes:bytes.length,sha256:sha256(bytes),rowCounts,total,
   epoch:payload?.preview?.epochId||null,
   authority:payload?.preview?.servingAuthority||'unknown',
   fetchedAt,ageHours:Math.round(ageMs/36000)/100,
   gateFresh12h:fresherThan12h,
   gateReason:fresherThan12h?'fresh_current_epoch':'stale_or_missing_epoch',
   producerEvidenceIsHttp200Only:response.ok&&!fresherThan12h,
 };
 fs.writeFileSync(root+'/a10_cloudflare_public_origin_raw.json',bytes);
 output.gates.cloudflare12h=fresherThan12h?'PASS':'HOLD_STALE';
 output.gates.sourceNotFaked=payload.preview?.servingAuthority!=='cloudflare' ? 'provider_not_claimed':'provider_reported';
 save();
 console.log('A10_LIVE_CLOUDFLARE_RECEIPT',JSON.stringify(output.cloudflare));
 if(!response.ok||total===0)output.errors.push('Cloudflare HTTP unavailable or empty');
}catch(e){output.cloudflare={error:String(e)};output.gates.cloudflare12h='HOLD_NO_RECEIPT';output.errors.push(String(e));save()}
const host='127.0.0.1',port=4192,base=`http://${host}:${port}/`;
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','preview','--host',host,'--port',String(port),'--strictPort'],{stdio:'ignore'});
const pause=t=>new Promise(r=>setTimeout(r,t));
let browser;
try{
 let ready=false;
 for(let i=0;i<100;i++){try{const r=await fetch(base);if(r.ok){ready=true;break}}catch{}await pause(220)}
 if(!ready)throw Error('candidate vite preview not ready');
 browser=await chromium.launch({headless:true});
 for(const mode of ['hybrid','live']){
   const ctx=await browser.newContext({viewport:{width:1380,height:900},serviceWorkers:'block'});
   const blocked=[],pageErrors=[];
   await ctx.addInitScript(value=>{try{localStorage.setItem('nw_fetch_mode',value)}catch{}},mode);
   await ctx.route('**/*',route=>{
     let u;try{u=new URL(route.request().url())}catch{return route.abort()}
     if(u.hostname===host||u.hostname==='localhost')return route.continue();
     blocked.push(u.hostname+u.pathname);
     return route.abort('blockedbyclient');
   });
   const page=await ctx.newPage();
   page.on('pageerror',error=>pageErrors.push(String(error)));
   for(const [name,hash] of [['main','/'],['insight','/insight'],['up-ahead','/up-ahead'],['newspaper','/newspaper'],['data-health','/data-health']]){
     try{
       await page.goto(base+'#'+hash,{waitUntil:'domcontentloaded',timeout:20000});
       await pause(name==='insight'?5500:2500);
       const body=await page.evaluate(()=>document.body?.innerText||'');
       const pageRow={mode,name,url:page.url(),text:body.slice(0,9500),sha256:sha256(body),
         blockedExternalRequests:blocked.length,pageErrors:[...pageErrors]};
       const text=body;
       pageRow.falseLiveSnapshotClaim=name==='insight'&&/SNAPSHOT FEED/i.test(text)&&/Live\s*·\s*Degraded/.test(text);
       pageRow.unknownValidationMislabel=name==='data-health'&&/Validation: passed/.test(text)&&/not evaluated/.test(text);
       output.browser.push(pageRow);
       await page.screenshot({path:`${root}/candidate_${mode}_${name}.png`,fullPage:false,timeout:8000,animations:'disabled'}).catch(()=>{});
       save();
       console.log('A10_CANDIDATE_ROUTE',mode,name,JSON.stringify({falseLiveSnapshotClaim:pageRow.falseLiveSnapshotClaim,articles:(text.match(/Read Full Story/g)||[]).length,errors:pageErrors.length}));
     }catch(e){output.errors.push(mode+':'+name+':'+String(e));save()}
   }
   await ctx.close();
 }
 output.gates.candidateChromium=output.browser.length===10?'PASS':'FAIL_INCOMPLETE';
 output.gates.insightSnapshotTruth=output.browser.some(x=>x.falseLiveSnapshotClaim)?'FAIL':'PASS';
}catch(e){output.errors.push(String(e));output.gates.candidateChromium='FAIL'}
finally{if(browser)await browser.close().catch(()=>{});server.kill('SIGTERM');save()}
if(output.gates.candidateChromium!=='PASS'||output.gates.insightSnapshotTruth!=='PASS')process.exitCode=1;
console.log('A10_COMPLETE',JSON.stringify(output.gates));
