/**
 * A10 stage-1 controlled DOM evidence: actual production Vite build, Chromium.
 * External requests blocked, localhost static assets allowed. This is not a
 * Cloudflare-live or GitHub Pages production observation.
 * Script never changes source data; emitted JSON and PNG are evidence.
 */
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';
const absoluteTimeout = setTimeout(() => { console.error('A10 hard timeout: route evidence incomplete'); process.exit(124); }, 150000);
absoluteTimeout.unref();
const host = '127.0.0.1';
const port = 4176;
const base = `http://${host}:${port}/`;
const routes = [
  ['main','/'], ['insight','/insight'], ['up-ahead','/up-ahead'],
  ['newspaper','/newspaper'], ['data-health-direct','/data-health'],
];
const out = 'artifacts/a10';
mkdirSync(out, { recursive:true });
const app = spawn(process.execPath,['node_modules/vite/bin/vite.js','preview','--host',host,'--port',String(port)],{stdio:'ignore'});
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const results={type:'A10_CONTROLLED_BROWSER_STAGE1',baseline:'695e27c64b42d2220449936792792b68e87a1375',mode:'production-vite-preview-with-remote-network-blocked',browser:'Chromium',timestamp:new Date().toISOString(),routes:[],errors:[]};
try {
  let ready=false;
  for(let i=0;i<90;i++){
    if(app.exitCode!==null)throw new Error('Preview exited '+app.exitCode);
    try{const r=await fetch(base);if(r.ok){ready=true;break}}catch{}
    await wait(500);
  }
  if(!ready)throw new Error('Production Vite preview not reachable');
  const browser=await chromium.launch({headless:true});
  let context;
  try{
    context=await browser.newContext({viewport:{width:1366,height:900},serviceWorkers:'block'});
    const requests=[];
    await context.route('**/*',async route=>{
      try{
        const u=new URL(route.request().url());
        if (u.hostname===host||u.hostname==='localhost') return route.continue();
        requests.push({url:u.origin+u.pathname,method:route.request().method()});
        return route.abort('blockedbyclient');
      }catch{return route.abort('blockedbyclient')}
    });
    const page=await context.newPage();
    page.on('pageerror',error=>results.errors.push({route:page.url(),error:String(error)}));
    for(const [name,hash]of routes){
      await page.goto(base+'#'+hash,{waitUntil:'domcontentloaded',timeout:15000});
      await wait(1400);
      const dom=await page.evaluate(()=>({
        text:document.body?.innerText?.slice(0,9000)||'',
        mainText:(document.querySelector('main')?.innerText||'').slice(0,3000),
        title:document.title,
        headings:Array.from(document.querySelectorAll('h1,h2')).map(n=>n.innerText).slice(0,35),
        alerts:Array.from(document.querySelectorAll('[role=alert]')).map(n=>n.innerText).slice(0,10),
        statuses:Array.from(document.querySelectorAll('[role=status]')).map(n=>n.innerText).slice(0,10),
        articleCount:document.querySelectorAll('article').length,
        dataHealthPresent:Boolean(document.querySelector('[data-testid=data-health-panel]')),
        sourceBadges:Array.from(document.querySelectorAll('[data-testid=data-source-badge]')).map(n=>n.innerText).slice(0,15),
      }));
      await page.screenshot({path:`${out}/a10_${name}.png`,fullPage:false,animations:'disabled',timeout:7500});
      results.routes.push({name,url:page.url(),...dom,blockedExternalCount:requests.length});
      writeFileSync(`${out}/a10_route_render_evidence.json`, JSON.stringify(results,null,2));
      console.log('A10_CAPTURED_ROUTE '+name);
    }
    results.blockedExternalRequests=requests.slice(0,35);
    results.allFiveRendered=results.routes.length===5&&results.routes.every(r=>r.text.length>0);
    // Take a separate screenshot after multiple route navigations to assess the
    // in-memory diagnostics cache in the same browser session.
    await page.goto(base+'#/data-health',{waitUntil:'domcontentloaded'});
    await wait(1600);
    results.dataHealthAfterRoutes={text:(await page.locator('body').innerText()).slice(0,9000)};
    await page.screenshot({path:`${out}/a10_data_health_after_routes.png`,fullPage:false,animations:'disabled',timeout:7500});
  }finally{if(context) await context.close().catch(()=>{}); await browser.close()}
} catch(error){results.fatal=String(error);process.exitCode=1}
finally{app.kill('SIGTERM')}
writeFileSync(`${out}/a10_route_render_evidence.json`,JSON.stringify(results,null,2));
console.log(JSON.stringify({routes:results.routes.map(x=>({name:x.name,headings:x.headings,alerts:x.alerts,statuses:x.statuses,articleCount:x.articleCount,dataHealthPresent:x.dataHealthPresent,blockedExternalCount:x.blockedExternalCount,sourceBadges:x.sourceBadges})),allFiveRendered:results.allFiveRendered,fatal:results.fatal||null,errors:results.errors.length},null,2));
if(!results.allFiveRendered)process.exitCode=1;
clearTimeout(absoluteTimeout);
process.exit(process.exitCode || 0);
