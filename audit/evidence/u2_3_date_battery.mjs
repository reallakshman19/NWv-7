/**
 * U2.3 — Date awareness boundary battery + real-cycle extraction (Up Ahead audit)
 *
 * Executes the SHIPPED date engine at FIXED injected clocks. Two parts:
 *  (A) boundary battery — synthetic minimal texts placed exactly AT each edge, asserted
 *      against an independently-computed expectation;
 *  (B) real-cycle extraction rate — every frozen up_ahead item's (title+summary) run through
 *      analyzeDateText at a fixed asOfDate; % that yield an event date, per category.
 *
 * Source of truth: src/intelligence/dateAware.js, src/utils/dateExtractor.js (legacy),
 *   src/intelligence/eligibilityWindowing.js. Plan §U2.3.
 *
 * MUST run under TZ=Asia/Kolkata (IST week math / getDay()). Reproduce:
 *   TZ=Asia/Kolkata node audit/evidence/u2_3_date_battery.mjs
 * Emits audit/evidence/U2.3-date-battery-report.json + stdout summary.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { analyzeDateText, classifyPlannerWindow } from '../../src/intelligence/dateAware.js';
import { evaluateEligibility } from '../../src/intelligence/eligibilityWindowing.js';
import { extractDate } from '../../src/utils/dateExtractor.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const results = { tz: process.env.TZ || '(unset)', battery: [], realCycle: {}, parity: {} };
let pass = 0, fail = 0;

function rec(id, invariant, expected, actual, ok, note) {
  results.battery.push({ id, invariant, expected, actual, verdict: ok ? 'PASS' : 'FAIL', note: note || null });
  if (ok) pass += 1; else fail += 1;
}
const isoLocal = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const addDays = (d, n) => { const x = new Date(d); x.setHours(0,0,0,0); x.setDate(x.getDate()+n); return x; };

// ---- fixed clocks ----
const REF = new Date(2026, 5, 24); REF.setHours(0,0,0,0);   // Wed 2026-06-24 (frozen snapshot date), IST
const REF_DEC = new Date(2026, 11, 28); REF_DEC.setHours(0,0,0,0); // for Dec->Jan rollover
const asOf = (d) => ({ asOfDate: d });

// helper: run text -> dateAnalysis -> eligibility windowStatus at a clock
function windowOf(text, ref, extra = {}) {
  const da = analyzeDateText(text, { ...asOf(ref), ...extra });
  const item = { ...da, eventDate: da.eventDate, dateConfidence: da.dateConfidence, category: extra.category || 'events', locationEligible: true, classificationConfidence: 0.6, routeHint: da.routeHint, sourceTrust: 'high' };
  const elig = evaluateEligibility(item, { ...asOf(ref), mode: extra.mode || 'offline' });
  return { da, elig };
}

// ================= (A) BOUNDARY BATTERY =================
// --- planner-window edges: window is inclusive [asOf, asOf+6]; +7 is OUTSIDE ---
for (const off of [-1, 0, 6, 7, 13, 14]) {
  const text = `Event on ${isoLocal(addDays(REF, off))}`;
  const { da, elig } = windowOf(text, REF);
  const expected =
    off < 0 ? 'before_window' :
    off <= 6 ? 'inside_window' : 'after_window';
  rec(`B-WIN${off>=0?'+':''}${off}d`, `ISO date at asOf${off>=0?'+':''}${off}d -> ${expected}`,
      expected, elig.windowStatus, elig.windowStatus === expected,
      `eventDateKey=${da.eventDateKey} plannerEligible=${elig.plannerEligible} upAhead=${elig.upAheadEligible}`);
}

// --- year-inference -30d boundary (short DD/MM, no year) ---
for (const off of [-30, -31]) {
  const target = addDays(REF, off);             // a date `off` days before REF, same year (2026)
  const ddmm = `${String(target.getDate()).padStart(2,'0')}/${String(target.getMonth()+1).padStart(2,'0')}`;
  const da = analyzeDateText(`Offer valid ${ddmm}`, asOf(REF));
  // at exactly -30: NO flip -> stays in past (this year) -> key == target year. at -31: flip +1yr -> future.
  const flipped = da.eventDate && da.eventDate.getFullYear() > REF.getFullYear();
  const expectedFlip = off === -31;            // documented intent: >30d in past => next year
  rec(`B-YEAR${off}d`, `short DD/MM at exactly ${off}d: year-flip=${expectedFlip}`,
      `flip=${expectedFlip}`, `flip=${flipped} key=${da.eventDateKey}`, flipped === expectedFlip,
      `parser=${da.parsedDateEvidence?.parser}`);
}

// --- Feb 29 in a non-leap context (2026 not leap) ---
{
  const da = analyzeDateText('Sale on 29/02', asOf(REF));
  rec('B-FEB29', 'short 29/02 in non-leap year -> JS overflow behavior (documented, not asserted-correct)',
      '2027-03-01 (overflow Feb29->Mar1 + year flip)', da.eventDateKey, da.eventDateKey === '2027-03-01',
      'documents silent Feb29->Mar1 rollover');
}

// --- Dec->Jan short-date rollover (ref in late Dec) ---
{
  const da = analyzeDateText('Event 05/01', asOf(REF_DEC));    // 5 Jan, ref 28 Dec 2026 -> next Jan 2027
  rec('B-ROLL-JAN', 'short 05/01 with ref 2026-12-28 -> 2027-01-05', '2027-01-05', da.eventDateKey,
      da.eventDateKey === '2027-01-05', 'Dec->Jan rollover');
  const da2 = analyzeDateText('Event 28/12', asOf(REF_DEC));   // today by DD/MM -> stays 2026
  rec('B-ROLL-TODAY', 'short 28/12 with ref 2026-12-28 -> 2026-12-28 (no flip at 0d)', '2026-12-28', da2.eventDateKey,
      da2.eventDateKey === '2026-12-28', 'boundary at 0d: not in past');
}

// --- DMY-vs-MDY policy (stated? consistent?) ---
{
  const a = analyzeDateText('Deal 03/02', asOf(REF));   // DMY => 3 Feb (past->2027). MDY would be Mar 2.
  rec('B-DMY-1', '"03/02" parsed DMY (3 Feb), NOT MDY (Mar 2)', 'month=02 (Feb)',
      `month=${a.eventDateKey?.slice(5,7)} key=${a.eventDateKey}`, a.eventDateKey?.slice(5,7) === '02', 'DMY day-first');
  const b = analyzeDateText('Deal 02/13', asOf(REF));   // 02/13: day=2,month=13 invalid -> null (no MDY fallback)
  rec('B-DMY-2', '"02/13" rejected (no MDY fallback to Feb 13)', 'no eventDate',
      `eventDate=${b.eventDate ? b.eventDateKey : 'null'}`, b.eventDate === null, 'month>12 rejected, not reinterpreted');
}

// --- "ends Friday" resolves against asOfDate, not wall clock (worked sample U2.3-DTE-04) ---
{
  const r1 = analyzeDateText('Offer ends Friday', asOf(REF));         // Wed 2026-06-24
  const r2 = analyzeDateText('Offer ends Friday', asOf(addDays(REF, 3))); // Sat 2026-06-27
  const f1 = r1.eventDateEndKey, f2 = r2.eventDateEndKey;
  const bothFriday = r1.eventDateEnd?.getDay() === 5 && r2.eventDateEnd?.getDay() === 5;
  rec('B-ENDS-FRI', '"ends Friday" is asOfDate-relative: two clocks -> two different Fridays',
      'both Friday(getDay=5) AND f1!=f2', `f1=${f1} f2=${f2} bothFri=${bothFriday}`,
      bothFriday && f1 !== f2, 'proves wall-clock independence when asOfDate injected');
}

// --- "this week" window = [today, Saturday]; "next week" = [next Mon, +6] ---
{
  const tw = analyzeDateText('Festival this week', asOf(REF));
  const expEnd = addDays(REF, 6 - REF.getDay());   // Saturday
  rec('B-THISWEEK', '"this week" -> [today, Saturday], tentative', `${isoLocal(REF)}..${isoLocal(expEnd)} tentative`,
      `${tw.eventDateKey}..${tw.eventDateEndKey} ${tw.dateConfidence}`,
      tw.eventDateKey === isoLocal(REF) && tw.eventDateEndKey === isoLocal(expEnd) && tw.dateConfidence === 'tentative');
}

// ================= (PARITY) two JS engines diverge on "next week" Sundays =================
{
  // find a Sunday ref
  const sun = new Date(REF); while (sun.getDay() !== 0) sun.setDate(sun.getDate() + 1); sun.setHours(0,0,0,0);
  const daWeek = analyzeDateText('Show next week', asOf(sun));    // dateAware parser
  const legacy = extractDate('Show next week', sun);             // legacy extractor
  const daStart = daWeek.eventDateKey;
  const lgStart = legacy?.start ? isoLocal(new Date(legacy.start)) : null;
  results.parity.next_week_sunday = { ref: isoLocal(sun), dateAware_start: daStart, legacy_start: lgStart, agree: daStart === lgStart };
}

// ================= (B) REAL-CYCLE EXTRACTION RATE =================
{
  const frozen = JSON.parse(readFileSync(path.join(__dirname, 'frozen/up_ahead_2026-06-24.json'), 'utf8'));
  const byCat = {};
  for (const it of frozen.items || []) {
    const cat = it.category || 'unknown';
    const text = `${it.title || ''} ${it.summary || ''}`.trim();
    const da = analyzeDateText(text, asOf(REF));
    byCat[cat] = byCat[cat] || { total: 0, extracted: 0, examples: [] };
    byCat[cat].total += 1;
    if (da.eventDate) { byCat[cat].extracted += 1; if (byCat[cat].examples.length < 2) byCat[cat].examples.push({ title: (it.title||'').slice(0,60), key: da.eventDateKey, parser: da.parsedDateEvidence?.parser }); }
  }
  for (const [cat, v] of Object.entries(byCat)) v.rate = `${((v.extracted / v.total) * 100).toFixed(1)}%`;
  results.realCycle = { source: 'frozen/up_ahead_2026-06-24.json', asOfDate: isoLocal(REF), tz: process.env.TZ, byCategory: byCat,
    overall: `${Object.values(byCat).reduce((a,v)=>a+v.extracted,0)}/${Object.values(byCat).reduce((a,v)=>a+v.total,0)}` };
}

results.summary = { battery_pass: pass, battery_fail: fail };
writeFileSync(path.join(__dirname, 'U2.3-date-battery-report.json'), JSON.stringify(results, null, 2));

console.log(`=== U2.3 date battery (TZ=${results.tz}) ===`);
for (const b of results.battery) console.log(`[${b.verdict}] ${b.id}: ${b.invariant}\n        expected=${b.expected} | actual=${b.actual}`);
console.log(`\nbattery: ${pass} PASS / ${fail} FAIL`);
console.log(`\nparity next_week@Sunday:`, JSON.stringify(results.parity.next_week_sunday));
console.log(`\nreal-cycle extraction (frozen up_ahead, asOf ${isoLocal(REF)}):`);
console.log(`  overall: ${results.realCycle.overall}`);
for (const [cat, v] of Object.entries(results.realCycle.byCategory)) console.log(`  ${cat}: ${v.extracted}/${v.total} (${v.rate})`);
console.log(`\nwrote audit/evidence/U2.3-date-battery-report.json`);
