/**
 * U2.4 — Location awareness probes (Up Ahead audit). Executes the SHIPPED matcher.
 *
 * Adjudicates the I018 alias risks against the REAL scoreMatch (which uses a word-boundary
 * regex `(^|\s)alias(\s|$)` for BOTH the 0.95 and 0.82 rungs — there is NO substring rung,
 * contrary to plan §U2.4's "0.82 substring"). Three parts:
 *   A. deterministic alias-collision probes (cantonment / omr / al hail / nagar / cross-locale)
 *   B. online-bypass matrix (bypass must fire ONLY for online-friendly categories)
 *   C. real-cycle: detectCanonicalLocation over frozen items vs stored city
 *
 * Source of truth: src/intelligence/locationAware.js:23-122; src/config/locationLibrary.js.
 * Reproduce: TZ=Asia/Kolkata node audit/evidence/u2_4_location_probes.mjs   (clock-invariant)
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { detectCanonicalLocation, evaluateLocationEligibility } from '../../src/intelligence/locationAware.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const out = { partA_aliasProbes: [], partB_onlineBypass: [], partC_realCycle: {} };
let pass = 0, fail = 0;
function rec(arr, id, desc, expected, actual, ok) { arr.push({ id, desc, expected, actual, verdict: ok ? 'PASS' : 'FAIL' }); if (ok) pass++; else fail++; }

// ===== A. alias-collision probes (offline, strict) =====
const probe = (text) => { const m = detectCanonicalLocation(text, { mode: 'offline' }); return { city: m.locationCanonical, conf: m.locationConfidence, alias: m.matchedAlias }; };

// cantonment: mechanism-INDEPENDENT generic-word collision -> any cantonment maps to Trichy
{ const r = probe('Heavy traffic near Delhi Cantonment railway station');
  rec(out.partA_aliasProbes, 'A-CANTONMENT', "'Delhi Cantonment' mis-maps to Trichy (generic word alias)",
      'Trichy @0.82', `${r.city} @${r.conf} (alias=${r.alias})`, r.city === 'Trichy'); }

// short alias as a whole token -> matches (real, but only whole-token)
{ const r = probe('Massive jam on OMR this evening');
  rec(out.partA_aliasProbes, 'A-OMR-TOKEN', "'OMR' as a standalone token -> Chennai (whole-token match, expected)",
      'Chennai', `${r.city} @${r.conf}`, r.city === 'Chennai'); }

// short alias INSIDE another word -> must NOT match (word-boundary, NOT substring) -> nullifies I018 tail
{ const r = probe('The genomresearch lab and ecru fabrics expo');   // contains 'omr' inside genomresearch, 'ecr' inside ecru
  rec(out.partA_aliasProbes, 'A-OMR-SUBSTRING', "'omr'/'ecr' inside other words -> NO match (boundary, not substring)",
      'no match', `${r.city || 'none'} @${r.conf}`, !r.city); }

// 'al hail' must be contiguous -> a weather 'hail' alert must NOT match Muscat -> nullifies I018 'al hail' risk
{ const r = probe('IMD warns of hail storm and heavy rain tonight');
  rec(out.partA_aliasProbes, 'A-HAIL', "weather 'hail' does NOT match Muscat alias 'al hail' (contiguous required)",
      'no match', `${r.city || 'none'} @${r.conf}`, r.city !== 'Muscat'); }

// bare 'nagar' is NOT an alias -> 'Gandhi Nagar' (unlisted) must NOT contaminate Chennai/Trichy
{ const r = probe('Gandhi Nagar residents report water shortage');
  rec(out.partA_aliasProbes, 'A-NAGAR', "unlisted 'X Nagar' does NOT match (no bare 'nagar' alias)",
      'no match', `${r.city || 'none'} @${r.conf}`, !r.city); }

// listed neighbourhood alias still works (control)
{ const r = probe('Power cut in Anna Nagar and T Nagar tomorrow');
  rec(out.partA_aliasProbes, 'A-CONTROL', "listed 'Anna Nagar'/'T Nagar' -> Chennai @0.82 (control)",
      'Chennai @0.82', `${r.city} @${r.conf}`, r.city === 'Chennai' && r.conf === 0.82); }

// exact whole-text city name -> 1.0
{ const r = probe('chennai');
  rec(out.partA_aliasProbes, 'A-EXACT', "whole-text 'chennai' -> 1.0", 'Chennai @1', `${r.city} @${r.conf}`, r.city === 'Chennai' && r.conf === 1); }

// ===== B. online-bypass matrix: bypass only for online-friendly categories =====
const onlineFriendly = new Set(['offer', 'airline_offer', 'shopping', 'airlines']);
for (const cat of ['shopping', 'airlines', 'movies', 'events', 'civic', 'alerts']) {
  // bare city mention in ONLINE mode: online-friendly -> bypass (accept, location null); others -> strict (must still match a city)
  const m = detectCanonicalLocation('Great fare sale from Chennai this week', { mode: 'online', category: cat });
  const bypassed = m.decisionTrace?.includes('online_location_bypass');
  const expectBypass = onlineFriendly.has(cat);
  rec(out.partB_onlineBypass, `B-${cat}`, `online '${cat}' bare-city: bypass=${expectBypass}`,
      `bypass=${expectBypass}`, `bypass=${bypassed} city=${m.locationCanonical}`, bypassed === expectBypass);
}
// neighbourhood alias vetoes the bypass even for online-friendly category
{ const m = detectCanonicalLocation('Flat 50% off at our T Nagar store', { mode: 'online', category: 'shopping' });
  const vetoed = m.decisionTrace?.some(t => t.startsWith('online_bypass_vetoed'));
  rec(out.partB_onlineBypass, 'B-VETO', "neighbourhood 'T Nagar' vetoes online bypass (keeps location)",
      'vetoed + Chennai', `vetoed=${vetoed} city=${m.locationCanonical}`, vetoed && m.locationCanonical === 'Chennai'); }

// ===== C. real-cycle: detectCanonicalLocation vs stored city =====
{
  const frozen = JSON.parse(readFileSync(path.join(__dirname, 'frozen/up_ahead_2026-06-24.json'), 'utf8'));
  let accept = 0, agree = 0, disagree = 0, noText = 0; const mismatches = [];
  for (const it of frozen.items || []) {
    const text = `${it.title || ''} ${it.summary || ''}`.trim();
    if (!text) { noText++; continue; }
    const m = detectCanonicalLocation(text, { mode: 'offline' });
    if (m.locationCanonical) {
      accept++;
      const stored = it.city || it.region || null;
      if (stored && m.locationCanonical.toLowerCase() === String(stored).toLowerCase()) agree++;
      else { disagree++; if (mismatches.length < 6) mismatches.push({ stored, detected: m.locationCanonical, alias: m.matchedAlias, title: (it.title||'').slice(0,55) }); }
    }
  }
  out.partC_realCycle = { total: frozen.items.length, offline_accept: accept, agree_with_stored: agree, disagree: disagree, mismatches };
}

out.summary = { probes_pass: pass, probes_fail: fail };
writeFileSync(path.join(__dirname, 'U2.4-location-probes-report.json'), JSON.stringify(out, null, 2));
console.log('=== U2.4 location probes ===');
for (const r of out.partA_aliasProbes) console.log(`[${r.verdict}] ${r.id}: ${r.desc}\n        exp=${r.expected} | act=${r.actual}`);
console.log('--- online bypass matrix ---');
for (const r of out.partB_onlineBypass) console.log(`[${r.verdict}] ${r.id}: exp=${r.expected} | act=${r.actual}`);
console.log(`\nprobes: ${pass} PASS / ${fail} FAIL`);
console.log('--- real cycle (offline, frozen up_ahead) ---', JSON.stringify(out.partC_realCycle, null, 2));
console.log('wrote audit/evidence/U2.4-location-probes-report.json');
