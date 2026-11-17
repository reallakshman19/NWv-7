/**
 * A10 deep controlled browser: actual production-bundled React routes;
 * three configurations; no privileged network / no fake Cloudflare receipt.
 * Any PASS indicates renderability only. All provider claims remain UNVERIFIED.
 * Results and screenshots are persisted before exit even on failure.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { chromium } from 'playwright';
const root='artifacts/a10-deep';
fs.mkdirSync(root,{recursive:true});
const host='127.0.0.1',port=4189,base=`http://${host}:${port}/`;
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','preview','--host',host,'--port',String(port),'--strictPort'],{stdio:'ignore'});
const timeout=setTimeout(()=>{console.error('A10 deep browser hard deadline');fs.writeFileSync(root+'/DEADLINE.txt','TIMEOUT');process.exit(124)},220000);
timeout.unref();
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const runs=[{id:'hybrid-blocked-remote',mode:'hybrid',localOutage:false},
 {id:'live-blocked-remote',mode:'live',localOutage:false},
 {id:'hybrid-all-datasets-failed',mode:'hybrid',localOutage:true}];
const routes=[['main','/'],['insight','/insight'],['up-ahead','/up-ahead'],['newspaper','/newspaper'],['data-health','/data-health']];
const report={classification:'CONTROLLED_BROWSER_ONLY_NOT_LIVE',sourceBase:'695e27c64b42d2220449936792792b68e87a1375',runAt:new Date().toISOString(),matrix:[],error:[],metrics:{}};
const save=()=>fs.writeFileSync(root+'/a10_deep_dom_matrix.json',JSON.stringify(report,null,2));
let browser;
try{
 let ready=false;
 for(let i=0;i<80;i++){
  if(server.exitCode!==null)throw Error('Vite preview exited '+server.exitCode);
  try{const r=await fetch(base);if(r.ok){ready=true;break}}catch{}
  await wait(250);
 }
 if(!ready)throw Error('Vite not ready');
 browser=await chromium.launch({headless:true});
 for(const cfg of runs){
  const ctx=await browser.newContext({viewport:{width:1380,height:820},serviceWorkers:'block'});
  const blocked=[];
  const errors=[];
  await ctx.addInitScript(mode=>{try{localStorage.setItem('nw_fetch_mode',mode)}catch{}},cfg.mode);
  await ctx.route('**/*',async(route)=>{
   const url=route.request().url();
   try{
    const u=new URL(url);
    if(u.hostname!==host&&u.hostname!=='localhost'){
      blocked.push({host:u.hostname,path:u.pathname,method:route.request().method()});
      return route.abort('blockedbyclient');
    }
    if(cfg.localOutage&&(/\/(newsdata|data)\/.*\.json$/i.test(u.pathname))){
      blocked.push({host:u.hostname,path:u.pathname,method:route.request().method(),reason:'controlled-local-outage'});
      return route.fulfill({status:503,contentType:'application/json',body:'{"error":"A10 forced local outage"}'});
    }
    return route.continue();
   }catch{return route.abort('blockedbyclient')}
  });
  const page=await ctx.newPage();
  page.on('pageerror',e=>errors.push(String(e)));
  const subset=[];
  for(const [name,hash] of routes){
    const at=Date.now();
    try{
      await page.goto(base+'#'+hash,{waitUntil:'domcontentloaded',timeout:18000});
      await wait(name==='insight'?6500:3000);
      const dom=await page.evaluate(()=>{
        const text=document.body?.innerText||'';
        return{
          title:document.title,
          text:text.slice(0,12500),
          headings:[...document.querySelectorAll('h1,h2')].map(x=>x.innerText).slice(0,28),
          rolesStatus:[...document.querySelectorAll('[role=status]')].map(x=>x.innerText).slice(0,18),
          rolesAlert:[...document.querySelectorAll('[role=alert]')].map(x=>x.innerText).slice(0,18),
          sourceBadges:[...document.querySelectorAll('.data-state-badge,[data-testid=data-source-badge],.data-pill,.fmt-btn')].map(x=>x.innerText).slice(0,45),
          counters:{articles:document.querySelectorAll('article').length,links:document.querySelectorAll('a[href]').length,sections:document.querySelectorAll('section').length},
          loadingVisible:/Running AI pipeline|Scanning horizon|Fetching Today.s Brief|Main is loading/i.test(text),
          dataHealthPresent:!!document.querySelector('[data-testid=data-health-panel]'),
        }
      });
      const sha=crypto.createHash('sha256').update(dom.text).digest('hex');
      const row={config:cfg.id,route:name,url:page.url(),durationMs:Date.now()-at,domSha256:sha,
        ...dom,blockedExternalTotal:blocked.filter(x=>x.reason!=='controlled-local-outage').length,
        blockedLocalTotal:blocked.filter(x=>x.reason==='controlled-local-outage').length,
        errorCount:errors.length};
      subset.push(row);report.matrix.push(row);
      await page.screenshot({path:`${root}/a10_${cfg.id}_${name}.png`,fullPage:false,timeout:8000,animations:'disabled'}).catch(e=>{row.screenshotError=String(e)});
      save();
      console.log('A10_DEEP_ROUTE',cfg.id,name,JSON.stringify({headings:dom.headings,articles:dom.counters.articles,sourceBadges:dom.sourceBadges.slice(0,8),loading:dom.loadingVisible,errors:row.errorCount}));
    }catch(e){
      const fail={config:cfg.id,route:name,error:String(e)};
      subset.push(fail);report.matrix.push(fail);report.error.push(fail);save();
    }
  }
  report.metrics[cfg.id]={routes:subset.length,errors,blockedRequests:blocked.slice(0,120)};
  save();
  await ctx.close().catch(()=>{});
 }
 report.allRoutesPainted=report.matrix.length===15&&report.matrix.every(x=>Boolean(x.text?.length));
 console.log('A10_DEEP_COMPLETE',JSON.stringify({rendered:report.matrix.filter(x=>x.text?.length).length,total:report.matrix.length,allRoutesPainted:report.allRoutesPainted,errors:report.error.length}));
}catch(e){report.fatal=String(e);process.exitCode=1}
finally{if(browser)await browser.close().catch(()=>{});server.kill('SIGTERM');save();clearTimeout(timeout)}
if(!report.allRoutesPainted)process.exitCode=1;
process.exit(process.exitCode||0);
