/**
 * U2.6 — Eligibility windowing & age caps. Drives the REAL static display projection
 * (sanitizeUpAheadData -> getVisibleUpAheadProjection), same entry as U0. Runs under vitest
 * because the viewModel imports React contexts (extensionless) that plain node cannot resolve.
 *
 * Boundary battery for per-tab age caps (plan §U2.6): weather 36h (+>=2 ctx kw), alerts 48h,
 * civic 365d / cap 20, online offers 30d. Ages are RELATIVE to Date.now() so the relative cap is
 * exercised without faking the clock (the clock-injection gap itself is I012). Also verifies the
 * Suggested cross-category dedupe + cap 24, and documents that movies/events/festivals are NOT
 * date-windowed in this static projection.
 *
 * Source of truth: src/viewModels/useUpAheadPageViewModel.js:39-43 (caps), :277-394 (projection),
 *   :244-275 (Suggested); src/services/upAheadService.js (sanitizeUpAheadData).
 * Reproduce: TZ=Asia/Kolkata node_modules/.bin/vitest run --config audit/evidence/u2.vitest.config.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { sanitizeUpAheadData } from '../../src/services/upAheadService.js';
import { __upAheadPageViewModelInternalsForTest } from '../../src/viewModels/useUpAheadPageViewModel.js';

const { getVisibleUpAheadProjection } = __upAheadPageViewModelInternalsForTest;
const OUT = path.resolve('audit/evidence/U2.6-windowing-report.json');
const out = { tz: process.env.TZ || 'unset', caps: [], suggested: {}, unwindowed: {} };
const H = 60 * 60 * 1000, D = 24 * H;
const agoISO = (ms) => new Date(Date.now() - ms).toISOString();
const settings = {};
let uid = 0;
const mk = (over) => ({ id: `t${uid++}`, title: 'x', summary: 'x', publishedAt: agoISO(H), ...over });
function project(items) {
  const data = sanitizeUpAheadData({ items, schemaVersion: 1, contractVersion: 'upahead-lifecycle-v1', horizon: { lookaheadDays: 7 } });
  return getVisibleUpAheadProjection({ data, settings });
}
const rec = (id, desc, expected, actual, ok) => out.caps.push({ id, desc, expected, actual, verdict: ok ? 'PASS' : 'FAIL' });

describe('U2.6 windowing & age caps', () => {
  it('alerts 48h boundary', () => {
    const v = project([
      mk({ category: 'alerts', title: 'Power cut keep', publishedAt: agoISO(48 * H - 5 * 60 * 1000) }),
      mk({ category: 'alerts', title: 'Power cut drop', publishedAt: agoISO(48 * H + H) }),
    ]);
    const t = v.generalAlerts.map(i => i.title);
    const ok = t.includes('Power cut keep') && !t.includes('Power cut drop');
    rec('CAP-ALERT-48h', 'alert <48h kept, >48h dropped', 'keep present & drop absent', `kept=${t.includes('Power cut keep')} dropAbsent=${!t.includes('Power cut drop')}`, ok);
    expect(ok).toBe(true);
  });

  it('weather 36h boundary (>=2 context keywords)', () => {
    const v = project([
      mk({ category: 'weather_alerts', title: 'Cyclone warning heavy rain keep', description: 'imd storm flood', publishedAt: agoISO(36 * H - 5 * 60 * 1000) }),
      mk({ category: 'weather_alerts', title: 'Cyclone warning heavy rain drop', description: 'imd storm flood', publishedAt: agoISO(36 * H + 2 * H) }),
    ]);
    const t = v.weatherAlerts.map(i => i.title);
    const ok = t.includes('Cyclone warning heavy rain keep') && !t.includes('Cyclone warning heavy rain drop');
    rec('CAP-WEATHER-36h', 'weather (>=2 ctx kw) <36h kept, >36h dropped', 'keep present & drop absent', `kept=${t.includes('Cyclone warning heavy rain keep')} dropAbsent=${!t.includes('Cyclone warning heavy rain drop')}`, ok);
    expect(ok).toBe(true);
  });

  it('weather text gate is defeated by keyword-list overlap (DEFECT reproduces)', () => {
    // 'warning'/'alert'/'advisory'/'watch' are in BOTH ambiguousKeywords AND the weather_alerts
    // positive list, so a SINGLE ambiguous word counts as 2 substring matches -> clears minimumMatches:2.
    const v = project([mk({ category: 'weather_alerts', title: 'Cyber scam warning issued', description: 'beware of fraud', publishedAt: agoISO(H) })]);
    const defectReproduces = v.weatherAlerts.length === 1; // non-weather 'warning' admitted
    rec('CAP-WEATHER-TEXT', "INVARIANT: weather needs >=2 weather-context kw -> FAILS (1 ambiguous word admitted via list overlap)",
        'exclude non-weather "scam warning" (invariant)', `weatherAlerts=${v.weatherAlerts.length} (defect reproduces=${defectReproduces})`, false);
    expect(defectReproduces).toBe(true); // harness asserts the DEFECT reproduces; the invariant verdict is FAIL
    // control: text with NO ambiguous/context/weather word at all -> correctly excluded
    const c = project([mk({ category: 'weather_alerts', title: 'School holiday list released', description: 'academic calendar', publishedAt: agoISO(H) })]);
    rec('CAP-WEATHER-CONTROL', 'item with zero weather words excluded (control)', '0 weatherAlerts', `count=${c.weatherAlerts.length}`, c.weatherAlerts.length === 0);
    expect(c.weatherAlerts.length).toBe(0);
  });

  it('online offers 30d boundary', () => {
    const v = project([
      mk({ category: 'shopping', title: 'Flash sale keep', description: 'flash sale discount', publishedAt: agoISO(30 * D - H) }),
      mk({ category: 'shopping', title: 'Flash sale drop', description: 'flash sale discount', publishedAt: agoISO(30 * D + 2 * D) }),
    ]);
    const t = v.onlineOffers.map(i => i.title);
    const ok = t.includes('Flash sale keep') && !t.includes('Flash sale drop');
    rec('CAP-OFFER-30d', 'online offer <30d kept, >30d dropped', 'keep present & drop absent', `kept=${t.includes('Flash sale keep')} dropAbsent=${!t.includes('Flash sale drop')}`, ok);
    expect(ok).toBe(true);
  });

  it('civic cap 20', () => {
    const items = Array.from({ length: 25 }, (_, i) => mk({ category: 'civic', title: `Chennai civic notice ${i}`, summary: 'Chennai corporation notice', city: 'Chennai', publishedAt: agoISO((i + 1) * H) }));
    const v = project(items);
    rec('CAP-CIVIC-20', '25 civic items -> capped 20', '<=20', `count=${v.civicItems.length}`, v.civicItems.length === 20);
    expect(v.civicItems.length).toBe(20);
  });

  it('Suggested cap 24 + cross-category dedupe', () => {
    const items = [];
    for (let i = 0; i < 15; i++) items.push(mk({ category: 'movies', title: `Movie ${i}`, publishedAt: agoISO((i + 1) * H) }));
    for (let i = 0; i < 15; i++) items.push(mk({ category: 'events', title: `Event ${i}`, publishedAt: agoISO((i + 1) * H) }));
    items.push({ ...items[0] }); // duplicate id
    const v = project(items);
    const unique = new Set(v.suggestedItems.map(i => i.id)).size === v.suggestedItems.length;
    out.suggested = { count: v.suggestedItems.length, capOK: v.suggestedItems.length <= 24, unique };
    rec('SUGGESTED-CAP24', 'Suggested capped 24 & deduped', 'count<=24 & unique ids', `count=${v.suggestedItems.length} unique=${unique}`, v.suggestedItems.length <= 24 && unique);
    expect(v.suggestedItems.length).toBeLessThanOrEqual(24);
    expect(unique).toBe(true);
  });

  it('movies have NO upper (14d) display window — far-future items leak (DEFECT)', () => {
    const v = project([
      mk({ category: 'movies', title: 'Far future movie', eventStartAt: new Date(Date.now() + 5 * 365 * D).toISOString(), publishedAt: agoISO(H) }),
      mk({ category: 'movies', title: 'Old movie', eventStartAt: new Date(Date.now() - 5 * 365 * D).toISOString(), publishedAt: agoISO(400 * D) }),
    ]);
    const titles = v.movieCards.map(c => c.title || c.headline || '');
    const farFuturePresent = titles.some(t => t.includes('Far future movie'));
    const oldFilteredUpstream = !titles.some(t => t.includes('Old movie')); // sanitizeUpAheadData past-date filter
    out.unwindowed = { movieCount: v.movieCards.length, farFuturePresent, oldFilteredUpstream,
      note: 'static projection applies NO upper 7/14d window to movies/events/festivals: a movie dated 5 YEARS out passes. Past-dated items ARE dropped upstream by sanitizeUpAheadData. Plan §U2.6 "display 14d" is NOT enforced for these categories on the static path.' };
    rec('NO-WINDOW-MOVIES', 'INVARIANT: display window 14d -> FAILS for movies (5yr-future item present)', 'far-future excluded (invariant)', `farFuturePresent=${farFuturePresent} oldDroppedUpstream=${oldFilteredUpstream}`, false);
    expect(farFuturePresent).toBe(true); // harness asserts the defect (far-future leaks) reproduces
  });

  it('writes report', () => {
    out.summary = { pass: out.caps.filter(c => c.verdict === 'PASS').length, fail: out.caps.filter(c => c.verdict === 'FAIL').length };
    fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
    for (const r of out.caps) console.log(`[${r.verdict}] ${r.id}: exp=${r.expected} | act=${r.actual}`);
    console.log('suggested:', JSON.stringify(out.suggested), 'unwindowed:', JSON.stringify(out.unwindowed));
  });
});
