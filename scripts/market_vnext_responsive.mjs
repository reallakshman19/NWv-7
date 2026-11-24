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
function requireProof(condition,reason){if(!condition)throw new Error(reason);}
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
}catch(error){results.push({status:'FAIL',reason:String(error.message||error)});}
finally{
  await browser?.close().catch(()=>{});
  preview?.kill('SIGTERM');
  const status=results.length===widths.length&&results.every(row=>row.status==='PASS')?'PASS':'HOLD';
  await fs.mkdir(directory,{recursive:true});
  const report={status,checkedAt:new Date().toISOString(),verification:'built preview, external requests blocked, fresh browser storage',results};
  await fs.writeFile(directory+'/report.json',JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report,null,2));
  if(status!=='PASS')process.exitCode=1;
}
