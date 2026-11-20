/**
 * Isolated built-browser certification of the Market shell and independent tools.
 * All financial values in this script are deterministic fixtures, never live feeds.
 * Run from a built Vite preview at MARKET_PREVIEW_URL (default port 4173).
 */
import { chromium } from 'playwright';
import fs from 'node:fs/promises';

const base = process.env.MARKET_PREVIEW_URL || 'http://127.0.0.1:4173';
const outputDir = 'reports/market-browser';
await fs.mkdir(outputDir, { recursive: true });

const now = Date.now();
const date = new Date(now - 86400000).toLocaleDateString('en-GB', { timeZone: 'Asia/Kolkata' }).replaceAll('/', '-');
const report = { fixtureOnly: true, base, checks: [], screenshots: [], requests: {}, errors: [] };
const check = (name, condition, detail) => {
  report.checks.push({name, pass:Boolean(condition), detail: detail ?? null});
  if (!condition) throw new Error(name + (detail ? ': ' + JSON.stringify(detail) : ''));
};

const browser = await chromium.launch({
  headless: true,
  ...(process.env.MARKET_BROWSER_EXECUTABLE ? { executablePath: process.env.MARKET_BROWSER_EXECUTABLE } : {}),
});
async function runViewport(width, height) {
  // The SW owns app-shell caching; disable it in this deterministic network fixture.
  // Its market-publication bypass is verified separately by test_market_sw_contract.mjs.
  const context = await browser.newContext({ viewport:{ width, height }, colorScheme:'dark', serviceWorkers:'block' });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  const external = [];
  let unrelatedProxyRequests = 0;
  let fxRequests = 0;
  let snapshotRequests = 0;
  await page.route(/\/data\/market_snapshot\.json(?:\?|$)/, async route => {
    snapshotRequests++;
    await route.fulfill({ status:503, contentType:'application/json', body:'{"error":"fixture source unavailable"}' });
  });
  await page.route('https://api.frankfurter.dev/v2/rate/omr/inr', async route => {
    fxRequests++;
    await route.fulfill({
      status:200, contentType:'application/json',
      body:JSON.stringify({date:new Date(now-3600000).toISOString().slice(0,10),base:'OMR',quote:'INR',rate:235.123456789})
    });
  });
  await page.route('https://api.mfapi.in/mf/search**', async route => {
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify([{schemeCode:100001,schemeName:'Fixture Nifty 50 Direct Growth'}])});
  });
  await page.route('https://api.mfapi.in/mf/100001/latest', async route => {
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({
      status:'SUCCESS',meta:{scheme_name:'Fixture Nifty 50 Direct Growth',scheme_category:'Index Fund'},
      data:[{nav:'123.45',date}]
    })});
  });
  page.on('request', request => {
    const url = request.url();
    // News/RSS pages can independently use cross-origin proxies. This gate
    // prohibits Market quote proxy cascades, not unrelated news acquisition.
    let expanded = url;
    try { expanded = decodeURIComponent(decodeURIComponent(url)); } catch { /* Keep original. */ }
    const isProxy = /api\.allorigins\.win|corsproxy\.io|api\.codetabs\.com/i.test(url);
    const isMarketProvider = /finance\.yahoo\.com|api\.bseindia\.com|portal\.amfiindia\.com|nseindia\.com\/api/i.test(expanded);
    if (isMarketProvider) external.push(url);
    else if (isProxy) unrelatedProxyRequests++;
  });
  page.on('pageerror', error => report.errors.push({width,message:error.message}));

  try {
    await page.goto(base + '/#/markets', { waitUntil:'domcontentloaded',timeout:20000 });
    await page.getByRole('heading',{name:'Markets',exact:true}).waitFor();
    // The shell can be interactive before asynchronous Market boot. Explicitly
    // exercise the actual failed publication request rather than assuming a
    // heading means acquisition has already been attempted.
    // In the built free/open-only product, even the former static quote
    // publication must not be requested or rehydrated from an old cache.
    await page.waitForFunction(() =>
      document.querySelector('#market-indices .market-workspace__panel-header button')?.disabled === true
    );
    check('free-only-source-status-'+width,
      (await page.locator('#market-workspace').textContent()).includes('no redistributed quotes'));
    check('free-only-official-index-link-'+width,
      (await page.getByRole('link',{name:'NSE indices'}).count())===1);
    check('free-only-does-not-offer-inert-index-filters-'+width,
      (await page.getByLabel('Index coverage').count())===0 && (await page.getByLabel('Find an index').count())===0);
    check('four-workspace-tabs-' + width,
      await page.locator('.market-workspace__tabs button').count() === 4);

    // A failed quote publication must not block the independent Funds workflow.
    await page.getByRole('button',{name:'Funds',exact:true}).click();
    await page.locator('#market-funds').waitFor();
    await page.getByRole('button',{name:'Find a fund',exact:true}).click();
    await page.getByPlaceholder('Nifty 50 Direct Growth').fill('Nifty 50');
    await page.getByRole('button',{name:'Search funds'}).click();
    await page.getByText('Fixture Nifty 50 Direct Growth').first().waitFor();
    await page.getByRole('button',{name:'View NAV'}).first().click();
    await page.getByText(/Source NAV date/).waitFor();
    check('independent-funds-' + width, (await page.locator('#market-funds').textContent()).includes('123.45'));

    // The rate comes only from a browser-held direct provider response, not the India feed.
    await page.getByRole('button',{name:'Currency',exact:true}).click();
    await page.locator('#market-currency').waitFor();
    await page.getByText(/1 OMR =/).waitFor();
    check('independent-currency-' + width, fxRequests===1);
    await page.getByLabel('Amount').fill('10');
    await page.getByRole('button',{name:'Swap pair'}).click();
    check('typing-does-not-refresh-rate-' + width, fxRequests===1);

    await page.getByRole('button',{name:'Equity',exact:true}).click();
    await page.getByPlaceholder('INFY').fill('INFY');
    await page.getByRole('button',{name:'Save symbol'}).click();
    check('saved-nse-quote-instructions-'+width,
      (await page.locator('#market-equity').textContent()).includes('Use the NSE link to verify its quote.'));
    check('uncovered-saved-symbol-not-fabricated-' + width,
      (await page.locator('#market-equity').textContent()).includes('No qualified quote in this publication'));

    await page.reload({waitUntil:'domcontentloaded'});
    await page.locator('#market-equity').waitFor();
    check('saved-watchlist-survives-reload-' + width,
      (await page.locator('#market-equity').textContent()).includes('INFY'));

    const size = await page.evaluate(() => {
      const shell = document.querySelector('#market-workspace');
      const edge = shell.getBoundingClientRect().right;
      const overflowing = [...shell.querySelectorAll('*')].map(node => {
        const box = node.getBoundingClientRect();
        return {
          selector: node.tagName.toLowerCase() + (typeof node.className === 'string' ? '.' + node.className.trim().split(/\s+/).slice(0,2).join('.') : ''),
          text: node.textContent?.replace(/\s+/g,' ').slice(0,55),
          left: Math.round(box.left), right: Math.round(box.right),
          client: node.clientWidth, scroll: node.scrollWidth,
        };
      }).filter(item => item.right > edge + 2 || item.scroll > item.client + 2)
        .sort((a,b) => b.right-a.right).slice(0,12);
      return {client:shell?.clientWidth, scroll:shell?.scrollWidth, viewport:document.documentElement.clientWidth, overflowing};
    });
    // Keep the failing viewport screenshot and element dimensions as evidence,
    // rather than stopping before its artifacts can be inspected.
    const png = outputDir + '/market-' + width + '.png';
    await page.screenshot({ path:png, fullPage:true });
    report.screenshots.push(png);
    check('no-workspace-overflow-' + width, size.scroll <= size.client+2, size);
    check('no-public-cors-waterfall-' + width, external.length===0, external);
    check('no-static-licensed-source-request-' + width, snapshotRequests===0, {snapshotRequests});
    await page.emulateMedia({media:'print'});
    check('print-hides-workspace-navigation-' + width,
      await page.locator('.market-workspace__tabs').evaluate(node=>getComputedStyle(node).display)==='none');

    report.requests[width]={snapshotRequests,fxRequests,marketSourceProxies:external.length,unrelatedProxyRequests};
  } finally {
    await context.close();
  }
}

async function runFreeOpenIpoScenario() {
  const context = await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
  const page = await context.newPage();
  let marketRequests=0;
  await page.route(/\/data\/market_snapshot\.json(?:\?|$)/,async route=>{
    marketRequests++;
    await route.abort();
  });
  try {
    await page.goto(base+'/#/markets',{waitUntil:'domcontentloaded'});
    await page.getByRole('heading',{name:'Markets',exact:true}).waitFor();
    await page.getByRole('button',{name:'Equity',exact:true}).click();
    await page.getByRole('button',{name:'IPO / FPO'}).click();
    const evidence=page.locator('.market-workspace__ipo-evidence');
    await evidence.waitFor();
    await page.waitForFunction(()=>
      document.querySelector('.market-workspace__ipo-evidence')?.dataset.ipoState === 'unverified'
    );
    check('ipo-free-only-unverified',await evidence.getAttribute('data-ipo-state')==='unverified');
    check('ipo-free-only-not-empty',!(await evidence.textContent()).includes('no qualifying current IPO'));
    check('ipo-free-only-NSE-link',await evidence.getByRole('link',{name:/Verify current public issues/}).count()===1);
    check('ipo-free-only-BSE-link',await evidence.getByRole('link',{name:/BSE public issues/}).count()===1);
    check('ipo-free-only-no-published-feed',marketRequests===0,{marketRequests});
    const png=outputDir+'/market-ipo-free-open.png';
    await page.screenshot({path:png,fullPage:true});report.screenshots.push(png);
  }finally{await context.close();}
}

try {
  await runViewport(1366, 768);
  await runViewport(390, 844);
  await runViewport(320, 640);
  await runFreeOpenIpoScenario();
} catch(error) {
  report.errors.push({critical:error.message});
} finally {
  await browser.close();
  await fs.writeFile(outputDir+'/result.json',JSON.stringify(report,null,2)+'\n');
}

const failures = report.checks.filter(c=>!c.pass);
console.log(JSON.stringify({pass:failures.length===0&&report.errors.length===0,checks:report.checks.length,failures,errors:report.errors,screenshots:report.screenshots},null,2));
if(failures.length || report.errors.length) process.exitCode=1;
