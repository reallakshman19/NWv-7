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

const browser = await chromium.launch({ headless: true });
async function runViewport(width, height) {
  // The SW owns app-shell caching; disable it in this deterministic network fixture.
  // Its market-publication bypass is verified separately by test_market_sw_contract.mjs.
  const context = await browser.newContext({ viewport:{ width, height }, colorScheme:'dark', serviceWorkers:'block' });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  const external = [];
  let fxRequests = 0;
  let snapshotRequests = 0;
  await page.route(/\/data\/market_snapshot\.json(?:\?|$)/, async route => {
    snapshotRequests++;
    await route.fulfill({ status:503, contentType:'application/json', body:'{"error":"fixture source unavailable"}' });
  });
  await page.route('https://open.er-api.com/v6/latest/OMR', async route => {
    fxRequests++;
    await route.fulfill({
      status:200, contentType:'application/json',
      body:JSON.stringify({result:'success',base_code:'OMR',rates:{INR:235.123456789},time_last_update_unix:Math.floor((now-3600000)/1000)})
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
    if (/finance\.yahoo\.com|allorigins\.win|corsproxy\.io|codetabs\.com/i.test(url)) external.push(url);
  });
  page.on('pageerror', error => report.errors.push({width,message:error.message}));

  try {
    await page.goto(base + '/#/markets', { waitUntil:'domcontentloaded',timeout:20000 });
    await page.getByRole('heading',{name:'Markets',exact:true}).waitFor();
    // The shell can be interactive before asynchronous Market boot. Explicitly
    // exercise the actual failed publication request rather than assuming a
    // heading means acquisition has already been attempted.
    const quoteFailure = page.waitForResponse(response =>
      /\/data\/market_snapshot\.json(?:\?|$)/.test(response.url()) && response.status() === 503,
      { timeout:15000 });
    await page.getByRole('button',{name:'Refresh indices'}).click();
    await quoteFailure;
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
    check('quote-source-was-actually-failed-' + width, snapshotRequests>0, {snapshotRequests});
    await page.emulateMedia({media:'print'});
    check('print-hides-workspace-navigation-' + width,
      await page.locator('.market-workspace__tabs').evaluate(node=>getComputedStyle(node).display)==='none');

    report.requests[width]={snapshotRequests,fxRequests,proxies:external.length};
  } finally {
    await context.close();
  }
}

async function runIpoReceiptScenario(status, expectedState) {
  const context = await browser.newContext({
    viewport:{width:390,height:844}, serviceWorkers:'block', colorScheme:'dark',
  });
  const page = await context.newPage();
  const quoteAt = new Date(now - 120000).toISOString();
  const checkedAt = new Date(now - 60000).toISOString();
  const day = n => new Date(now + n*86400000).toISOString().slice(0,10);
  const issue = {name:'Fixture Authorized Issue',openDate:day(-1),closeDate:day(6)};
  const ipo = {live:status === 'snapshot' ? [issue] : [],upcoming:[],recent:[]};
  const publication = {
    schemaVersion:'market-india-1', sourceMode:'snapshot',
    generatedAt:checkedAt, fetchedAt:now-60000, ipoLastCheckedAt:checkedAt,
    indices:[
      {name:'NIFTY 50',symbol:'^NSEI',value:'25000',quoteAt,sourceMode:'yahoo-free-daily'},
      {name:'SENSEX',symbol:'^BSESN',value:'82000',quoteAt,sourceMode:'yahoo-free-daily'},
      {name:'BANK NIFTY',symbol:'^NSEBANK',value:'56000',quoteAt,sourceMode:'yahoo-free-daily'},
    ],
    equities:[],ipo,
    sourceHealth:{ipo:{status,provider:'BSE'}},
  };
  let requests=0;
  await page.route(/\/data\/market_snapshot\.json(?:\?|$)/,async route=>{
    requests++;
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(publication)});
  });
  try {
    await page.goto(base+'/#/markets',{waitUntil:'domcontentloaded',timeout:20000});
    await page.getByRole('heading',{name:'Markets',exact:true}).waitFor();
    await page.getByRole('button',{name:'Equity',exact:true}).click();
    await page.getByRole('button',{name:'IPO / FPO'}).click();
    const evidence=page.locator('.market-workspace__ipo-evidence');
    await evidence.waitFor();
    await page.waitForFunction(state=>{
      return document.querySelector('.market-workspace__ipo-evidence')?.dataset.ipoState === state;
    },expectedState,{timeout:15000});
    check('ipo-source-'+status,await evidence.getAttribute('data-ipo-state')===expectedState);
    check('ipo-publication-request-'+status,requests>=1);
    check('ipo-official-verification-'+status,
      (await evidence.getByRole('link',{name:/Verify current public issues/}).count())===1);
    check('ipo-bse-manual-verification-'+status,
      (await evidence.getByRole('link',{name:/BSE public issues/}).count())===1);
    const text=await evidence.textContent();
    check('ipo-observations-not-fabricated-'+status,
      status==='snapshot' ? text.includes('Fixture Authorized Issue') :
        (!text.includes('Fixture Authorized Issue') && (
          status==='failed' ? text.includes('source unavailable') : text.includes('no qualifying current IPO')
        )));
    const png=outputDir+'/market-ipo-'+status+'.png';
    await page.screenshot({path:png,fullPage:true});
    report.screenshots.push(png);
  } finally {
    await context.close();
  }
}

try {
  await runViewport(1366, 768);
  await runViewport(390, 844);
  await runViewport(320, 640);
  await runIpoReceiptScenario('failed', 'unavailable');
  await runIpoReceiptScenario('empty', 'verified-empty');
  await runIpoReceiptScenario('snapshot', 'available');
} catch(error) {
  report.errors.push({critical:error.message});
} finally {
  await browser.close();
  await fs.writeFile(outputDir+'/result.json',JSON.stringify(report,null,2)+'\n');
}

const failures = report.checks.filter(c=>!c.pass);
console.log(JSON.stringify({pass:failures.length===0&&report.errors.length===0,checks:report.checks.length,failures,errors:report.errors,screenshots:report.screenshots},null,2));
if(failures.length || report.errors.length) process.exitCode=1;
