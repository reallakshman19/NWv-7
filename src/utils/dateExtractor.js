import { localDateFromKey, parsePublicationDate, toLocalDateKey, toUtcCalendarDateKey } from './dateKey.js';

// Parse in a UTC day carrier. Callers can supply the event's local calendar day
// as the reference without changing the explicit day keys used on the wire.
// A Date returned here is a calendar carrier, not a wire timestamp.
export const DATE_EXTRACTION_PATTERNS = [
  { type: 'iso', label: 'ISO / Numeric', example: '2026-02-14, 14/02/2026' },
  { type: 'named', label: 'Named Dates', example: 'February 14, 14th Feb' },
  { type: 'range', label: 'Date Ranges', example: 'Feb 10-24, 10th to 12th March' },
  { type: 'relative', label: 'Relative', example: 'Tomorrow, Next Friday, This Weekend' },
  { type: 'deadline', label: 'Deadline', example: 'Ends on Feb 12, Last date March 1' },
];
const MS = 86400000;
const names = 'january february march april may june july august september october november december'.split(' ');
const months = Object.fromEntries(names.flatMap((name, i) => [[name, i + 1], [name.slice(0, 3), i + 1]]));
months.sept = 9;
const MONTH = `(?:${Object.keys(months).sort((a,b) => b.length-a.length).join('|')})\\.?`;
const DAY = '\\d{1,2}(?:st|nd|rd|th)?';
const SEP = '\\s*(?:to|through|until|[–—-])\\s*';
const MDY = `${MONTH}[-\\s]+${DAY}(?:[,\\s-]+\\d{4})?`;
const DMY = `${DAY}[-\\s]+${MONTH}(?:[,\\s-]+\\d{4})?`;
const ISO = '\\d{4}-\\d{1,2}-\\d{1,2}';
const NUM = '\\d{1,2}(?:/\\d{1,2}(?:/(?:\\d{4}|\\d{2}))?|-\\d{1,2}-(?:\\d{4}|\\d{2}))';
const TOKEN = `(?:${ISO}|${MDY}|${DMY}|${NUM})`;
// Do not match a suffix of a date, a slash fragment, or an adjacent word.
const LEFT = '(?<![\\p{L}\\p{N}_/-])';
const RIGHT = '(?![\\p{L}\\p{N}_/-])';
const re = (s, flags='iu') => new RegExp(s, flags);
const weekdays = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
const deadline = /\b(?:ends?|last date|deadline|valid (?:till|until)|expires?|before|book by)\s+(?:on\s+)?$/i;

function strictUtc(year, month, day) {
  if (year < 1 || year > 9999 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const d = new Date(0);
  d.setUTCFullYear(year, month-1, day); d.setUTCHours(0,0,0,0);
  return d.getUTCFullYear()===year && d.getUTCMonth()===month-1 && d.getUTCDate()===day ? d : null;
}
function calendar(year, month, day, ref) {
  if (year != null) return strictUtc(year, month, day);
  const candidates = [-1,0,1].map(delta=>strictUtc(ref.getUTCFullYear()+delta,month,day)).filter(Boolean);
  return candidates.sort((a,b)=>Math.abs(a-ref)-Math.abs(b-ref))[0] || null;
}
function parseToken(value, ref) {
  const t = value.toLowerCase().replace(/(\d)(?:st|nd|rd|th)\b/g,'$1').replace(/\./g,'');
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if(m) return { date:strictUtc(+m[1],+m[2],+m[3]), explicit:true, type:'iso', confidence:'exact' };
  m=t.match(/^(\d{1,2})([/-])(\d{1,2})(?:\2(\d{4}|\d{2}))?$/);
  if(m){
    const year=m[4]?(m[4].length===2?2000+Number(m[4]):Number(m[4])):null;
    const explicit=m[4]?.length===4;
    return {date:calendar(year,+m[3],+m[1],ref),explicit:Boolean(m[4]),type:'numeric',confidence:explicit?'exact':'inferred'};
  }
  m=t.match(re(`^(${MONTH})[-\\s]+(\\d{1,2})(?:[,\\s-]+(\\d{4}))?$`));
  if(!m){const d=t.match(re(`^(\\d{1,2})[-\\s]+(${MONTH})(?:[,\\s-]+(\\d{4}))?$`));if(d)m=[d[0],d[2],d[1],d[3]];}
  if(!m) return null;
  return {date:calendar(m[3]?+m[3]:null,months[m[1]],+m[2],ref),explicit:Boolean(m[3]),type:'named',confidence:m[3]?'exact':'inferred'};
}
const add=(d,n)=>new Date(+d+n*MS);
const dayStart=d=>strictUtc(d.getUTCFullYear(),d.getUTCMonth()+1,d.getUTCDate());
function result(start,end,type,confidence,matchedText){
  if(!start || (end && end<start)) return null;
  const startKey=toUtcCalendarDateKey(start),endKey=end?toUtcCalendarDateKey(end):null;
  return {start:localDateFromKey(startKey),end:endKey?localDateFromKey(endKey):null,type,confidence,matchedText,startKey,endKey,endExclusiveKey:end?toUtcCalendarDateKey(add(end,1)):null};
}
export function stripDatePublisherLabels(text) {
  // RSS titles and combined text use a separator before a publisher label.
  // An ordinary phrase such as "opens in India today" still carries a date.
  return String(text ?? '').replace(
    /(^|\s-\s+|[–—|•]\s*)(?:india|business|tamil nadu|oman)\s+today(?=\s*(?:$|\s-\s+|[–—|•]))/gi,
    '$1'
  );
}

function normalizeText(text){
  // Decode the entities that commonly occur in date separators, then strip markup.
  return String(text??'').replace(/&(?:nbsp|ndash|mdash|amp|lt|gt|quot|apos|#\d+|#x[\da-f]+);/gi,entity=>{
    const k=entity.slice(1,-1).toLowerCase();
    if(k[0]==='#'){const n=k[1]==='x'?parseInt(k.slice(2),16):Number(k.slice(1));return n>=0&&n<=0x10ffff?String.fromCodePoint(n):entity;}
    return ({nbsp:' ',ndash:'–',mdash:'—',amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"})[k]??entity;
  }).replace(/<[^>]+>/g,' ').toLowerCase();
}
export function extractDate(text,pubDate,{ allowRelative = true } = {}){
  if(!text) return null;
  const ref=pubDate==null?new Date():parsePublicationDate(pubDate);
  if(!ref||!Number.isFinite(+ref)) return null;
  let value=stripDatePublisherLabels(normalizeText(text));
  value=value.replace(re(`\\b(${MONTH})\\s+(${DAY})${SEP}(${DAY})(,?\\s+\\d{4})?\\b`,'giu'),(_,m,a,b,y='')=>`${m} ${a}${y} to ${m} ${b}${y}`);
  value=value.replace(re(`\\b(${DAY})${SEP}(${DAY})\\s+(${MONTH})(\\s+\\d{4})?\\b`,'giu'),(_,a,b,m,y='')=>`${a} ${m}${y} to ${b} ${m}${y}`);
  const range=value.match(re(`${LEFT}(${TOKEN})${SEP}(${TOKEN})${RIGHT}`));
  if(range){
    let a=parseToken(range[1],ref), b=a?.date?parseToken(range[2],a.date):null;
    if(b?.date&&b.explicit&&!a.explicit)a=parseToken(range[1],b.date);
    if(!a?.date||!b?.date||b.date<a.date||b.date-a.date>366*MS)return null;
    if(!allowRelative&&!a.explicit&&!b.explicit)return null;
    return result(a.date,b.date,'range','range',range[0]);
  }
  const token=value.match(re(`${LEFT}${TOKEN}${RIGHT}`));
  if(token){
    const p=parseToken(token[0],ref);
    if(!p?.date||(!allowRelative&&!p.explicit))return null;
    if(deadline.test(value.slice(0,token.index)))return result(dayStart(ref),p.date,'deadline',p.confidence,token[0]);
    return result(p.date,null,p.type,p.confidence,token[0]);
  }
  if(!allowRelative)return null;
  const base=dayStart(ref);
  const rel=value.match(/\b(today|tomorrow)\b/);
  if(rel){const target=add(base,rel[1]==='tomorrow'?1:0);return deadline.test(value.slice(0,rel.index))?result(base,target,'deadline','inferred',rel[0]):result(target,null,'relative','inferred',rel[0]);}
  const weekend=value.match(/\b(this|next|coming) weekend\b/);
  if(weekend){let n=(6-base.getUTCDay()+7)%7;if(weekend[1]!=='next'&&base.getUTCDay()===0)n=-1;if(weekend[1]==='next'&&n===0)n=7;return result(add(base,n),add(base,n+1),'relative','range',weekend[0]);}
  const week=value.match(/\b(this|next) week\b/);
  if(week){const n=(8-base.getUTCDay())%7||7;const start=week[1]==='next'?add(base,n):base;return result(start,week[1]==='next'?add(start,6):add(base,6-base.getUTCDay()),'relative','tentative',week[0]);}
  const nextN=value.match(/\bnext\s+(\d+)\s+(day|week)s?\b/);
  if(nextN){const n=Number(nextN[1])*(nextN[2]==='week'?7:1);return n>0&&n<=366?result(base,add(base,n),'relative','inferred',nextN[0]):null;}
  const weekday=value.match(re(`\\b(?:(this|next|coming)\\s+)?(${weekdays.join('|')})\\b`));
  if(weekday){const isDeadline=deadline.test(value.slice(0,weekday.index));if(!weekday[1]&&!isDeadline)return null;let n=(weekdays.indexOf(weekday[2])-base.getUTCDay()+7)%7;if((weekday[1]==='next'||isDeadline)&&n===0)n=7;return isDeadline?result(base,add(base,n),'deadline','tentative',weekday[0]):result(add(base,n),null,'relative','inferred',weekday[0]);}
  return null;
}

// The legacy expansion API includes the final advertised day. Convert to UTC
// day arithmetic first so DST cannot change the key sequence or cap.
export function expandDateKeys(dateResult,maxDays=14){
  if(!dateResult?.start)return [];
  const start=dateResult.startKey||toLocalDateKey(dateResult.start);
  const end=dateResult.endKey||toLocalDateKey(dateResult.end)||start;
  const a=Date.parse(`${start}T00:00:00Z`), b=Date.parse(`${end}T00:00:00Z`);
  const keys=[];
  for(let n=a;Number.isFinite(n)&&n<=b&&keys.length<maxDays;n+=MS)keys.push(toUtcCalendarDateKey(n));
  return keys;
}
