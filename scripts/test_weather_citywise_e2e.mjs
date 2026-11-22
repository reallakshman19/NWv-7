// Controlled-provider browser acceptance for Weather tab and Quick Weather.
// No forecast values are sourced from a real provider in this test.
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const HOST='127.0.0.1', PORT=4179, BASE='http://'+HOST+':'+PORT;
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const server=spawn('npm',['run','dev','--','--host',HOST,'--port',String(PORT)],{
  stdio:'ignore',env:{...process.env,BROWSER:'none'}
});
function currentLocalParts(epoch,timezone){
  const parts=new Intl.DateTimeFormat('en-GB',{timeZone:timezone,year:'numeric',
    month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'}).formatToParts(new Date(epoch));
  const v=key=>parts.find(x=>x.type===key)?.value;
  return v('year')+'-'+v('month')+'-'+v('day')+'T'+v('hour')+':00';
}
function dataFor(url){
  const lat=Number(new URL(url).searchParams.get('latitude')||0);
  const timezone=lat>40?'Europe/London':lat>20&&lat<27?'Asia/Muscat':'Asia/Kolkata';
  const now=Date.now(), local=currentLocalParts(now,timezone), date=local.slice(0,10);
  const first=Date.parse(date+'T00:00:00Z');
  const times=Array.from({length:168},(_,i)=>new Date(first+i*3600000).toISOString().slice(0,16));
  const dates=Array.from({length:7},(_,i)=>new Date(first+i*86400000).toISOString().slice(0,10));
  const all=(n,v)=>Array.from({length:n},()=>v);
  return {
    latitude:lat, longitude:Number(new URL(url).searchParams.get('longitude')||0),
    timezone,utc_offset_seconds:timezone==='Asia/Muscat'?14400:timezone==='Asia/Kolkata'?19800:0,
    current:{time:local,temperature_2m:29,weather_code:2,apparent_temperature:31,
      relative_humidity_2m:65,wind_speed_10m:18,wind_direction_10m:110},
    hourly:{time:times,temperature_2m:all(168,29),precipitation_probability:all(168,35),
      precipitation:all(168,0.2),weather_code:all(168,2),apparent_temperature:all(168,31),
      relative_humidity_2m:all(168,65),wind_speed_10m:all(168,18),wind_direction_10m:all(168,110),
      uv_index:all(168,5),cloud_cover:all(168,38),visibility:all(168,12000),dew_point_2m:all(168,21)},
    daily:{time:dates,precipitation_probability_max:all(7,35),precipitation_sum:all(7,1.2),
      uv_index_max:all(7,6),temperature_2m_max:all(7,32),temperature_2m_min:all(7,25),
      apparent_temperature_max:all(7,34),relative_humidity_2m_mean:all(7,65),
      weather_code:all(7,2),wind_speed_10m_max:all(7,20)},
  };
}
async function serverReady(){
  for(let i=0;i<90;i++){try{const r=await fetch(BASE);if(r.ok)return;}catch{}await sleep(500);}
  throw Error('Vite server did not start');
}
async function waitFor(page,selector,timeout=20000){
  await page.locator(selector).first().waitFor({state:'visible',timeout});
}
async function ensureNoOverflow(page,label){
  const dims=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,width:window.innerWidth}));
  if(dims.scroll>dims.width+5)throw Error(label+' horizontal overflow '+JSON.stringify(dims));
}
const shots = 'artifacts/weather-ui-compact';
let browser;
try {
  mkdirSync(shots,{recursive:true});
  await serverReady();
  browser=await chromium.launch({headless:true});
  for(const width of [1366,390]){
    const context=await browser.newContext({viewport:{width,height:844}});
    const page=await context.newPage();
    await page.route(/^https:\/\/api\.open-meteo\.com\/v1\/(ecmwf|gfs|dwd-icon)\?/,async route=>{
      await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(dataFor(route.request().url()))});
    });
    await page.goto(BASE+'/#/weather',{waitUntil:'domcontentloaded'});
    await waitFor(page,'[data-weather-focus-header]');
    await waitFor(page,'[data-weather-city-strip]');
    await waitFor(page,'[data-weather-hour-intervals]');
    const headerBox=await page.locator('[data-weather-focus-header]').boundingBox();
    const desktopNav=page.locator('.bottom-nav--desktop').first();
    if(await desktopNav.isVisible().catch(()=>false)){
      const navBox=await desktopNav.boundingBox();
      if(!headerBox || !navBox || headerBox.y < navBox.y + navBox.height - 2)
        throw Error('Weather current-city header hidden underneath desktop navigation: '+JSON.stringify({headerBox,navBox}));
    }
    await waitFor(page,'.whi-period');
    await page.screenshot({path:shots+'/weather-'+width+'-2h.png',fullPage:true});
    await page.getByRole('button',{name:'4h',exact:true}).first().click();
    const intervalText=await page.locator('[data-weather-hour-intervals]').first().textContent();
    const firstPeriod = page.locator('[data-weather-hour-intervals] .whi-period').first();
    const accessible = await firstPeriod.getAttribute('aria-label');
    if(!accessible?.includes('4h rain') || !accessible?.includes('peak hourly rain chance') ||
      !intervalText.includes('peak hourly rain chance'))
      throw Error('4h rainfall interval semantics unavailable');
    if(intervalText.includes('Today + tomorrow'))throw Error('Two-day merged risk returned');
    if(width===390){
      const rainBox=await page.locator('[data-weather-hour-intervals] .whi-period__rain').first().evaluate(el=>({
        scroll:el.scrollWidth,width:el.clientWidth
      }));
      if(rainBox.scroll>rainBox.width+2)throw Error('Mobile rainfall values clipped: '+JSON.stringify(rainBox));
      const manage=page.getByRole('button',{name:'Manage',exact:true});
      const manageBox=await manage.boundingBox();
      if(!manageBox || manageBox.width>150)throw Error('Manage button too wide on mobile: '+JSON.stringify(manageBox));
    }
    if(await page.locator('[data-weather-city-strip] svg').count()<3)throw Error('SVG weather icons missing');
    if(await page.locator('[data-weather-city-strip]').first().getByText(/model feeds|cached|snapshot|source unverified/i).count())
      throw Error('Technical diagnostics are displayed in city tiles');
    if(await page.locator('[data-weather-hour-intervals]').first().getByText(/model feeds|cached forecast|source unverified/i).count())
      throw Error('Technical diagnostics are displayed in interval cards');
    await page.screenshot({path:shots+'/weather-'+width+'-4h.png',fullPage:true});
    const health = page.locator('[data-weather-health-icon]').first();
    await health.click();
    await waitFor(page,'[data-weather-source-details]');
    await page.getByRole('button',{name:'Close data source details'}).first().click();
    if(width===1366){
      await page.getByRole('button',{name:'Manage',exact:true}).click();
      await page.getByRole('searchbox',{name:'Search weather city library'}).fill('London');
      await page.getByRole('combobox',{name:'Select weather city to add'}).selectOption('london');
      await page.getByRole('button',{name:'Add',exact:true}).click();
      await waitFor(page,'[data-weather-city-strip] button:has-text("London")');
      await page.locator('[data-weather-city-strip] button').filter({hasText:'London'}).click();
      await page.waitForFunction(()=>JSON.parse(localStorage.getItem('dailyEventAI_settings')||'{}')?.weather?.activeCity==='london');
      await page.goto(BASE+'/#/',{waitUntil:'domcontentloaded'});
      await waitFor(page,'[data-quick-weather]');
      await waitFor(page,'[data-weather-city-strip]');
      const selected=await page.locator('[data-quick-weather] [aria-current="true"]').textContent();
      if(!selected?.includes('London'))throw Error('Quick Weather did not retain Weather tab selection');
      await page.locator('[data-quick-weather]').first().screenshot({path:shots+'/quickweather-desktop.png'});
      const quickHealth = page.locator('[data-quick-weather] [data-weather-health-icon]').first();
      await quickHealth.click();
      const sourceBox = await page.locator('[data-quick-weather] [data-weather-source-details]').first().boundingBox();
      if(!sourceBox || sourceBox.x < 0 || sourceBox.x+sourceBox.width > width + 1)
        throw Error('Desktop Quick Weather source details clipped to viewport: '+JSON.stringify(sourceBox));
      await page.locator('[data-quick-weather]').getByRole('button',{name:'Close data source details'}).click();
      await page.goto(BASE+'/#/weather',{waitUntil:'domcontentloaded'});
      await page.getByRole('button',{name:'Manage',exact:true}).click();
      await page.getByRole('button',{name:'Remove London'}).click();
      await page.waitForFunction(()=>!JSON.parse(localStorage.getItem('dailyEventAI_settings')||'{}')?.weather?.cities?.includes('london'));
      if(await page.locator('[data-weather-city-strip] button:has-text("London")').count())throw Error('Removed city remained in Weather tab');
    }
    await ensureNoOverflow(page,'Weather '+width+'px');
    if(width===390){
      await page.goto(BASE+'/#/',{waitUntil:'domcontentloaded'});
      await waitFor(page,'[data-quick-weather]');
      await page.locator('[data-quick-weather]').first().screenshot({path:shots+'/quickweather-mobile.png'});
      await page.locator('[data-quick-weather] [data-weather-health-icon]').first().click();
      const sourceBox = await page.locator('[data-quick-weather] [data-weather-source-details]').first().boundingBox();
      if(!sourceBox || sourceBox.x < 0 || sourceBox.x+sourceBox.width > width + 1)
        throw Error('Mobile Quick Weather source details clipped to viewport: '+JSON.stringify(sourceBox));
      await page.locator('[data-quick-weather]').getByRole('button',{name:'Close data source details'}).click();
      await ensureNoOverflow(page,'Quick Weather mobile');
    }
    await context.close();
  }
  console.log('PASS: Chromium desktop/mobile 2h/4h weather, SVG rendering, city persistence, add/remove');
} finally {
  await browser?.close().catch(()=>{});
  server.kill('SIGTERM');
}
