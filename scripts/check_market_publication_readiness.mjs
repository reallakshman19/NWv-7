/** Read-only publication gate. No network, data mutation or permission inference. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const HOUR=3600000, DAY=24*HOUR, OFFSET=/^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d(?:\.\d{1,9})?)?(?:Z|[+-]\d\d:\d\d)$/i;
const timestamp=value=>{
  if(typeof value==='number')return Number.isSafeInteger(value)&&value>946684800000?value:null;
  if(typeof value!=='string'||!OFFSET.test(value))return null;
  const t=Date.parse(value);return Number.isFinite(t)&&t>946684800000?t:null;
};
const positive=value=>typeof value==='number'?(Number.isFinite(value)&&value>0):
 typeof value==='string'&&/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/.test(value.trim())&&Number(value.replaceAll(',',''))>0;
const eligible=(row,now)=>{
  const time=timestamp(row?.quoteAt);
  return time!==null&&time<=now+300000&&now-time<=5*DAY&&positive(row?.value)&&
    !['seed','sample','fake'].includes(String(row?.sourceMode||row?.source||'').toLowerCase());
};
export function assessMarketPublication(data,{nowMs=Date.now(),symbols=[],maxAgeMs=DAY,rightsVerified=false}={}){
  const blocks=[],notes=[],manualBlocks=[];
  const bad=(code,detail)=>blocks.push({code,detail});
  const s=data&&typeof data==='object'&&!Array.isArray(data)?data:{};
  if(s.schemaVersion!=='market-india-1')bad('SCHEMA_UNKNOWN','Expected market-india-1');
  const gen=timestamp(s.generatedAt),fetched=timestamp(s.fetchedAt);
  if(gen===null||fetched===null)bad('CLOCK_MISSING','Need offset-aware generatedAt and millisecond fetchedAt');
  else{
    if(Math.abs(gen-fetched)>60000)bad('CLOCK_CONFLICT','Generated and fetched clocks disagree');
    if(gen>nowMs+300000)bad('FUTURE_PUBLICATION','Collection timestamp is future-dated');
    if(nowMs-gen>maxAgeMs)bad('STALE_PUBLICATION','Collection is older than 24h');
  }
  const indices=Array.isArray(s.indices)?s.indices:[];
  const goodIndices=indices.filter(row=>eligible(row,nowMs));
  const indexNames=goodIndices.map(row=>row.symbol);
  if(goodIndices.length<3||!indexNames.includes('^NSEI'))bad('INDEX_COVERAGE','Need three qualified India indices including NIFTY 50');
  if(goodIndices.length!==indices.length)bad('INVALID_INDEX','Some index rows are stale, untimed or nonpositive');
  if(new Set(indexNames).size!==indexNames.length)bad('DUPLICATE_INDEX','Source index symbols must be unique');
  const unique=new Set(symbols);
  if(!Array.isArray(symbols)||symbols.length===0||unique.size!==symbols.length||symbols.some(x=>!(/^[A-Z0-9&-]{1,20}$/.test(x))))
    bad('TRACKED_REGISTRY','Invalid, duplicate or absent tracked symbol registry');
  if(!Array.isArray(s.equities))bad('EQUITIES_MISSING','Published snapshot lacks tracked equities');
  const entries=Array.isArray(s.equities)?s.equities:[],covered=new Set();
  for(const row of entries){
    const key=row?.symbol;
    if(!unique.has(key)||row.id!=='equity:NSE:'+key||row.exchange!=='NSE'||row.currency!=='INR'||
       row.sourceAuthority!=='third-party'||!row.sourceProvider||covered.has(key)||!eligible(row,nowMs))
      bad('INVALID_EQUITY','Unqualified, duplicate or unknown '+String(key||'unknown'));
    else covered.add(key);
  }
  if(covered.size===0)bad('NO_EQUITY_COVERAGE','No qualified NSE share');
  if(covered.size<unique.size)notes.push({code:'PARTIAL_EQUITY_COVERAGE',detail:covered.size+'/'+unique.size+' qualified'});
  if(entries.length||s.equityCoverage){
    const expected=symbols.filter(symbol=>!covered.has(symbol));
    const c=s.equityCoverage;
    if(!c||c.universeSize!==symbols.length||c.quotedCount!==covered.size||
       !Array.isArray(c.unavailableSymbols)||JSON.stringify(c.unavailableSymbols)!==JSON.stringify(expected))
      bad('COVERAGE_RECEIPT','Coverage counts/unavailable symbols disagree with source-dated equities');
    const expectedStatus=covered.size===unique.size?'snapshot':covered.size?'partial':'failed';
    if(s.sourceHealth?.equities?.status!==expectedStatus)bad('SOURCE_STATUS','Equity source health inconsistent with coverage');
  }
  if(!rightsVerified)manualBlocks.push({code:'RIGHTS_UNVERIFIED',detail:'No verified public redistribution permission for source datasets'});
  const technicalStatus=blocks.length?'HOLD':'PASS';
  return {technicalStatus,releaseStatus:technicalStatus==='PASS'&&manualBlocks.length===0?'READY_FOR_OWNER_DECISION':'HOLD',
    checkedAt:new Date(nowMs).toISOString(),snapshotGeneratedAt:s.generatedAt??null,
    collectionAgeHours:gen===null?null:Number(((nowMs-gen)/HOUR).toFixed(2)),
    counts:{indices:indices.length,qualifiedIndices:goodIndices.length,trackedEquities:unique.size,qualifiedEquities:covered.size},
    blocks,manualBlocks,notes};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const args=process.argv.slice(2),get=(k,v)=>{const i=args.indexOf(k);return i<0?v:args[i+1]||v;};
  const data=JSON.parse(fs.readFileSync(get('--snapshot','public/data/market_snapshot.json'),'utf8'));
  const config=JSON.parse(fs.readFileSync(get('--universe','src/config/marketEquityUniverse.json'),'utf8'));
  const now=get('--now',null),ms=now?timestamp(now):Date.now();if(ms===null)throw Error('Invalid --now instant');
  const result=assessMarketPublication(data,{nowMs:ms,symbols:config.symbols});
  const json=JSON.stringify(result,null,2)+'\n',output=get('--out',null);
  if(output){fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,json);}
  process.stdout.write(json);
  if(args.includes('--enforce-technical')&&result.technicalStatus!=='PASS')process.exitCode=1;
  if(args.includes('--enforce-release')&&result.releaseStatus!=='READY_FOR_OWNER_DECISION')process.exitCode=1;
}
