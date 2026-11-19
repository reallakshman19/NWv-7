const KEY = /^\d{4}-\d{2}-\d{2}$/;
export function isCalendarDateKey(value) {
  if(typeof value!=='string'||!KEY.test(value)||value.startsWith('0000'))return false;
  const date=new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===value;
}
export function localDateFromKey(value){
  if(!isCalendarDateKey(value))return null;
  const [y,m,d]=value.split('-').map(Number);
  const date=new Date(0);date.setFullYear(y,m-1,d);date.setHours(0,0,0,0);
  return date.getFullYear()===y&&date.getMonth()===m-1&&date.getDate()===d?date:null;
}
function asDate(value){
  if(!value)return null;
  const normalized=typeof value==='string'&&/^\d+$/.test(value)?Number(value):value;
  const date=normalized instanceof Date?normalized:new Date(normalized);
  return Number.isFinite(date.getTime())?date:null;
}
export function toLocalDateKey(value) {
  if(typeof value==='string'&&KEY.test(value))return isCalendarDateKey(value)?value:null;
  const date=asDate(value);if(!date)return null;
  const y=String(date.getFullYear()).padStart(4,'0'),m=String(date.getMonth()+1).padStart(2,'0'),d=String(date.getDate()).padStart(2,'0');
  const key=`${y}-${m}-${d}`;return isCalendarDateKey(key)?key:null;
}
// UTC calendar encoding, NOT the general local-time formatter. Use only at
// the publisher calendar-day boundary or for an explicitly chosen UTC clock.
export function toUtcCalendarDateKey(value){
  if(typeof value==='string'&&KEY.test(value))return isCalendarDateKey(value)?value:null;
  const date=asDate(value);if(!date)return null;
  const key=date.toISOString().slice(0,10);return isCalendarDateKey(key)?key:null;
}

export function addCalendarDays(key, days) {
  if (!isCalendarDateKey(key)) return null;
  return toUtcCalendarDateKey(Date.parse(`${key}T00:00:00Z`) + days * 86_400_000);
}

// Publication inputs are instants; numeric seconds and millisecond strings
// follow the collector/Up Ahead timestamp convention. Calendar-only strings
// are validated and deliberately interpreted as UTC, never host-local.
export function parsePublicationDate(value) {
  if(!value)return null;
  if(typeof value==='string'&&KEY.test(value))return isCalendarDateKey(value)?new Date(`${value}T00:00:00Z`):null;
  if(typeof value==='number'||(typeof value==='string'&&/^\d+$/.test(value))){
    const n=Number(value);return Number.isFinite(n)&&n>0?asDate(n<10000000000?n*1000:n):null;
  }
  return asDate(value);
}
