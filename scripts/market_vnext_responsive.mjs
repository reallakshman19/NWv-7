/** MP14 built-app responsive proof; synthetic browser context, no third-party data. */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';

const base='http://127.0.0.1:4173/';
const widths=[320,360,390,430,768,1280];
const ids=['overview','indices','equity','portfolio','funds','ipo-events','currency-macro','lab','health'];
const labels=['Overview','Indices & sectors','Equity','Portfolio','Mutual funds','IPO & events','Currency & macro','Investment lab','Data health'];
const directory='reports/market-vnext-responsive';
const results=[];
let preview,browser;
let controls = null;
function requireProof(condition,reason){if(!condition)throw new Error(reason);}
async function checkWarmUsdCache(browser) {
  // Fully synthetic response: this is a cache/mount integration control, not live FX evidence.
  const cases = [
    { name: 'fresh-ecb', referenceProvider: 'ecb', ageDays: 0, calls: 0 },
    { name: 'fresh-unqualified', ageDays: 0, calls: 1 },
    { name: 'expired-ecb', referenceProvider: 'ecb', ageDays: 4, calls: 1 }
  ];
  const results = [];
  for (const fixture of cases) {
    const context = await browser.newContext({ viewport: { width: 320, height: 900 }, serviceWorkers: 'block' });
    try {
      const today = new Date().toISOString().slice(0, 10);
      const date = new Date(Date.now() - fixture.ageDays * 86400000).toISOString().slice(0, 10);
      await context.addInitScript(({ date, referenceProvider }) => {
        localStorage.setItem('nw7.usd-inr.frankfurter.v1', JSON.stringify({
          payload: { base: 'USD', quote: 'INR', rate: 81, date,
            ...(referenceProvider ? { referenceProvider } : {}) }, checkedAt: Date.now()
        }));
      }, { date, referenceProvider: fixture.referenceProvider });
      let requests = 0;
      const unexpected = [];
      await context.route('**/*', route => {
        const url = new URL(route.request().url());
        if (url.hostname === '127.0.0.1') return route.continue();
        if (url.hostname === 'api.frankfurter.dev') {
          if (url.pathname + url.search === '/v2/rate/usd/inr?providers=ecb') {
            requests++;
            return route.fulfill({ json: { base: 'USD', quote: 'INR', rate: 83, date: today },
              headers: { 'access-control-allow-origin': '*' } });
          }
          unexpected.push(url.pathname);
        }
        return route.abort();
      });
      const page = await context.newPage();
      await page.goto(base + '#/markets?view=overview', { waitUntil: 'domcontentloaded' });
      const row = page.getByRole('list', { name: 'Dated currency references' })
        .getByRole('listitem').filter({ has: page.getByText('USD / INR', { exact: true }) });
      await row.getByText('ECB-derived cross via Frankfurter', { exact: true }).waitFor();
      await row.getByRole('button', { name: 'Refresh USD / INR', exact: true }).waitFor();
      requireProof(await row.locator('time').getAttribute('datetime') === today, 'USD_CACHE_WRONG_DATE');
      // Verify displayed result against the synthetic input, never publish the rate.
      const value = await row.locator('.md3-fx-value').textContent();
      requireProof(value.includes(fixture.calls ? '83' : '81'), 'USD_CACHE_WRONG_VALUE');
      requireProof(requests === fixture.calls && unexpected.length === 0, 'USD_CACHE_WRONG_REQUEST_COUNT');
      results.push({ case: fixture.name, expectedRequests: fixture.calls, requests, status: 'PASS' });
    } finally { await context.close(); }
  }
  return results;
}
async function checkProviderRecovery(browser) {
  // The outer srcdoc loads in both cases. The provider script is either
  // intercepted with a harmless synthetic marker or blocked entirely.
  // No real third-party requests, prices, scraping or widget success claim.
  const results = [];
  for (const mode of ['synthetic-content', 'blocked-content']) {
    const context = await browser.newContext({ viewport: { width: 320, height: 900 }, serviceWorkers: 'block' });
    try {
      let attempts = 0;
      await context.route('**/*', route => {
        const url = new URL(route.request().url());
        if (url.hostname === '127.0.0.1') return route.continue();
        if (url.hostname === 's3.tradingview.com' && url.pathname === '/external-embedding/embed-widget-market-quotes.js') {
          attempts++;
          if (mode === 'synthetic-content') {
            return route.fulfill({ contentType: 'application/javascript', body:
              "document.querySelector('.tradingview-widget-container__widget').textContent = 'SYNTHETIC PROVIDER CONTENT';" });
          }
        }
        return route.abort();
      });
      const page = await context.newPage();
      await page.goto(base + '#/markets?view=overview', { waitUntil: 'domcontentloaded' });
      // DeskCard assigns this ID to its h2, not to the containing section.
      const board = page.locator('section[aria-labelledby="md3-provider"]');
      requireProof(await board.count() === 1, 'PROVIDER_CARD_IDENTITY');
      await board.getByRole('button', { name: 'Load BSE indices prices', exact: true }).waitFor();
      requireProof(attempts === 0 && await board.locator('iframe').count() === 0, 'PROVIDER_BEFORE_CONSENT');
      await page.getByRole('button', { name: 'BSE closing prices', exact: true }).click();
      requireProof(await page.locator('#md3-provider').evaluate(node => document.activeElement === node), 'PROVIDER_JUMP_WRONG_TARGET');
      requireProof(attempts === 0 && await board.locator('iframe').count() === 0, 'PROVIDER_JUMP_BYPASSED_CONSENT');
      await board.getByRole('button', { name: 'Load BSE indices prices', exact: true }).click();
      const reload = board.getByRole('button', { name: 'Reload provider display', exact: true });
      await reload.waitFor({ timeout: 15000 });
      const frame = board.locator('iframe');
      const content = board.frameLocator('iframe').getByText('SYNTHETIC PROVIDER CONTENT', { exact: true });
      if (mode === 'synthetic-content') await content.waitFor();
      else requireProof(await content.count() === 0, 'BLOCKED_PROVIDER_HAS_CONTENT');
      const srcdoc = await frame.getAttribute('srcdoc');
      requireProof(srcdoc.includes('BSE:SENSEX') && srcdoc.includes('BSE:BSE500') && !srcdoc.includes('NSE:'), 'PROVIDER_WRONG_IDENTITY');
      requireProof(await frame.getAttribute('sandbox') === 'allow-scripts allow-popups' &&
        await frame.getAttribute('referrerpolicy') === 'no-referrer', 'PROVIDER_ISOLATION');
      requireProof(await board.getByText(/quote rendering is unverified/i).isVisible(), 'PROVIDER_FALSE_SUCCESS');
      requireProof(attempts === 1 && await frame.count() === 1, 'PROVIDER_ATTEMPT_COUNT');
      const firstFrame = await frame.elementHandle();
      await reload.click();
      await reload.waitFor({ timeout: 15000 });
      requireProof(attempts === 2 && await frame.count() === 1, 'PROVIDER_RETRY_COUNT');
      requireProof(firstFrame && await firstFrame.evaluate(node => !node.isConnected), 'PROVIDER_RETRY_REUSED_FRAME');
      await firstFrame.dispose();
      if (mode === 'synthetic-content') await content.waitFor();
      else requireProof(await content.count() === 0, 'BLOCKED_PROVIDER_RETRY_HAS_CONTENT');
      requireProof(await board.getByText(/quote rendering is unverified/i).isVisible(), 'PROVIDER_RETRY_FALSE_SUCCESS');
      requireProof(await board.getByRole('link', { name: /S&P BSE SENSEX on TradingView/ }).isVisible(), 'PROVIDER_FALLBACK_MISSING');
      await board.getByRole('button', { name: 'Hide TradingView Board', exact: true }).click();
      await frame.waitFor({ state: 'detached' });
      results.push({ mode, status: 'PASS', attempts, actualProviderRendering: 'NOT_RUN' });
    } finally { await context.close(); }
  }
  return results;
}
async function ready(){
  for(let n=0;n<80;n++){
    try{if((await fetch(base,{signal:AbortSignal.timeout(1000)})).ok)return;}catch{/* local boot */}
    await new Promise(resolve=>setTimeout(resolve,250));
  }
  throw new Error('PREVIEW_NOT_READY');
}
try{
  await fs.mkdir(directory,{recursive:true});
  preview=spawn(process.execPath,['node_modules/vite/bin/vite.js','preview','--host','127.0.0.1','--port','4173','--strictPort'],{stdio:'ignore'});
  await ready();
  browser=await chromium.launch({headless:true});
  for(const width of widths){
    const context=await browser.newContext({viewport:{width,height:900},serviceWorkers:'block'});
    try{
      await context.route('**/*',route=>{
        const url=new URL(route.request().url());
        return url.hostname==='127.0.0.1' ? route.continue() : route.abort();
      });
      const page=await context.newPage();
      await page.goto(base+'#/markets',{waitUntil:'domcontentloaded'});
      await page.locator('#market-overview-content').waitFor();
      const mobile=width<768;
      const navigation=page.locator(mobile?'.market-nav__mobile':'.market-nav__desktop');
      requireProof(await navigation.isVisible(),'NAVIGATION_NOT_VISIBLE');
      requireProof(await navigation.locator('button').count()===(mobile?4:9),'NAVIGATION_COUNT');
      requireProof(await page.locator('.md3-grid > section').count()===9,'OVERVIEW_CARD_COUNT');
      const order=await page.locator('.md3-grid > section').evaluateAll(nodes=>nodes.map(n=>n.dataset.layout));
      requireProof(order.slice(0,4).join(',')==='md3-pulse,md3-provider,md3-currency,md3-watchlist','OVERVIEW_ORDER');
      requireProof(await page.locator('.md3-section-shortcuts').getAttribute('open')===null,'SHORTCUTS_NOT_COLLAPSED');
      const geometry=await page.evaluate(()=>({
        documentWidth:document.documentElement.scrollWidth,viewport:window.innerWidth,
        marketWidth:document.querySelector('#market-workspace').scrollWidth,
        marketClient:document.querySelector('#market-workspace').clientWidth
      }));
      await page.screenshot({path:directory+'/overview-'+width+'.png',fullPage:true});
      requireProof(geometry.documentWidth<=width+1 && geometry.marketWidth<=geometry.marketClient+1,'HORIZONTAL_OVERFLOW:'+JSON.stringify(geometry));
      const layout = await page.locator('.md3-grid').evaluate(grid => {
        const cards = [...grid.querySelectorAll(':scope > section')];
        const controls = [...grid.querySelectorAll('button,input,select,.market-watchlist-summary,.portfolio-summary-card')];
        return {
          minimumCard:Math.min(...cards.map(card=>card.getBoundingClientRect().width)),
          requiredCard:Math.min(260,grid.clientWidth),
          clippedControls:controls.filter(node=>node.clientWidth>0 && node.scrollWidth>node.clientWidth+2).length
        };
      });
      requireProof(layout.minimumCard>=layout.requiredCard-2,'COMPRESSED_CARDS:'+JSON.stringify(layout));
      requireProof(layout.clippedControls===0,'CLIPPED_CONTROLS:'+JSON.stringify(layout));
      if(width===320||width===1280){
        for(let i=0;i<ids.length;i++){
          const id=ids[i];
          if(mobile){
            if(['overview','equity','funds'].includes(id)){
              await navigation.locator('#market-mobile-tab-'+id).click();
            }else{
              await navigation.locator('#market-mobile-more-btn').click();
              await page.getByRole('menuitem',{name:new RegExp('^'+labels[i].replace('&','&'),'i')}).click();
            }
          }else await navigation.locator('#market-tab-'+id).click();
          await page.locator('#market-'+id+'-content').waitFor();
        }
      }
      results.push({width,status:'PASS',geometry,allRoutesChecked:width===320||width===1280});
    }catch(error){results.push({width,status:'FAIL',reason:String(error.message||error)});}
    finally{await context.close();}
  }
  // Preserve completed cache evidence even if the provider control fails later.
  controls = { usdCache: await checkWarmUsdCache(browser), providerRecovery: null };
  controls.providerRecovery = await checkProviderRecovery(browser);
}catch(error){results.push({status:'FAIL',reason:String(error.message||error)});}
finally{
  await browser?.close().catch(()=>{});
  preview?.kill('SIGTERM');
  const status=controls?.usdCache?.length===3&&controls?.providerRecovery?.length===2&&results.length===widths.length&&results.every(row=>row.status==='PASS')?'PASS':'HOLD';
  await fs.mkdir(directory,{recursive:true});
  const report={status,checkedAt:new Date().toISOString(),verification:'built preview, external requests blocked or synthetic, fresh and seeded browser storage',results,controls};
  await fs.writeFile(directory+'/report.json',JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report,null,2));
  if(status!=='PASS')process.exitCode=1;
}
