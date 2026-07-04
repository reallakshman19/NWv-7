/**
 * U2.2 — Classification audit (P001 surface). Executes the SHIPPED classifier.
 *
 * A. Scoring formula: positives - 1.0*catNeg - 0.65*globalNeg + sourceTypeBonus + explicitBonus;
 *    confidence = clamp(score/4). Verified on crafted items against an independent recomputation.
 * B. Phase-B suppression: (globalNegative >= 2 AND score < 2.25) -> category 'general'. Verified fires.
 * C. Real-cycle: classify every frozen item's text with JS (category field STRIPPED so the JS verdict
 *    is independent), compare to the stored (Python prefetch) category -> agreement = JS<->Python parity lead.
 * D. I014 flip impact: re-classify with the keyword contradictions fixed (remove 'fog' from global
 *    negatives; remove dead 'launches'), count how many real items change category (sizes the U9-2 risk).
 *
 * Source of truth: src/intelligence/classification.js:82-197; src/config/settings_upahead.js. Plan §U2.2.
 * Reproduce: node audit/evidence/u2_2_classification.mjs   (clock-invariant)
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { classifyItemCategory } from '../../src/intelligence/classification.js';
import { DEFAULT_UPAHEAD_SETTINGS } from '../../src/config/settings_upahead.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const out = { partA_formula: [], partB_phaseB: [], partC_realDistribution: {}, partD_i014Flips: {} };
let pass = 0, fail = 0;
const rec = (arr, id, desc, expected, actual, ok) => { arr.push({ id, desc, expected, actual, verdict: ok ? 'PASS' : 'FAIL' }); ok ? pass++ : fail++; };

// ---- A. formula (RELATIONAL: recompute score from the returned breakdown, assert conf=clamp(score/4)) ----
const clamp = (s) => Math.max(0, Math.min(1, s <= 0 ? 0 : s / 4));
function checkFormula(arr, id, item) {
  const r = classifyItemCategory(item);
  const b = r.classificationBreakdown || {};
  const score = (b.positive || 0) - 1.0 * (b.categoryNegative || 0) - 0.65 * (b.globalNegative || 0) + (b.sourceTypeBonus || 0) + (b.explicitBonus || 0);
  // confidence may use a fallback floor (0.25/0.375/0.4) when computed conf is 0 but category != general
  const baseMatch = Math.abs(r.classificationConfidence - clamp(score)) < 1e-9;
  const fallbackUsed = r.classificationConfidence > 0 && clamp(score) === 0; // documented floors at classification.js:181-188
  rec(arr, id, `score=pos-1.0*catNeg-0.65*gNeg+bonuses; conf=clamp(score/4) [${item.title.slice(0,32)}]`,
      `conf==clamp(${score.toFixed(3)})=${clamp(score).toFixed(3)} (or documented floor)`,
      `cat=${r.category} conf=${r.classificationConfidence} recomputedScore=${score.toFixed(3)}`,
      baseMatch || fallbackUsed);
  return { r, b, score };
}
checkFormula(out.partA_formula, 'A-F1', { title: 'A special sneak peek event' });             // 1 positive
checkFormula(out.partA_formula, 'A-F2', { title: 'release date set, but it is a scam' });       // positives - 0.65 global
checkFormula(out.partA_formula, 'A-F3', { title: 'flash sale clearance with coupon and promo code' }); // shopping multi positives
// document intra-category positive double-count: 'release' is a substring positive of 'release date'
{
  const r = classifyItemCategory({ title: 'release date announced' });
  const matched = r.classificationBreakdown.matchedPositive || [];
  rec(out.partA_formula, 'A-DOUBLECOUNT', "'release date' also fires 'release' -> positive double-counts (+2)",
      "matchedPositive includes BOTH 'release' and 'release date'",
      `matchedPositive=${JSON.stringify(matched)} positive=${r.classificationBreakdown.positive}`,
      matched.includes('release') && matched.includes('release date'));
}

// ---- B. Phase-B suppression (use NON-overlapping positives to control the score) ----
// 'fdfs'(1) + 'sneak peek'(1) = 2 positives; 'scam','fraud' = 2 GLOBAL-only negatives -> score 2-1.3=0.7
// globalNeg 2>=2 AND 0.7<2.25 -> demote to 'general'
{
  const r = classifyItemCategory({ title: 'fdfs sneak peek — scam fraud' });
  const b = r.classificationBreakdown;
  rec(out.partB_phaseB, 'B-FIRES', 'globalNeg>=2 & score<2.25 -> general',
      'general', `cat=${r.category} (pos=${b.positive} globalNeg=${b.globalNegative})`,
      r.category === 'general');
}
// control: same positives, NO global negatives -> stays movies (Phase-B does not fire)
{
  const r = classifyItemCategory({ title: 'fdfs sneak peek special screening' });
  rec(out.partB_phaseB, 'B-CONTROL', 'no global neg -> category retained',
      'movies', `cat=${r.category}`, r.category === 'movies');
}
// the double-count can let an item ESCAPE Phase-B: 'release date'(=2 via release+release date) + 'premiere'(1)
// = 3 positives, with 'scam fraud' (2 global) -> score 3-1.3=1.7 >= ... still <2.25 so fires; show score sensitivity
{
  const r = classifyItemCategory({ title: 'release date premiere in theatres advance booking fdfs — scam fraud' });
  rec(out.partB_phaseB, 'B-ESCAPE', 'overlap-inflated score can exceed 2.25 ceiling and escape Phase-B',
      'movies (score>2.25 despite 2 global negatives)', `cat=${r.category} pos=${r.classificationBreakdown.positive}`,
      r.category === 'movies');
}

// ---- C. real-cycle JS distribution vs stored Python category ----
const frozen = JSON.parse(readFileSync(path.join(__dirname, 'frozen/up_ahead_2026-06-24.json'), 'utf8'));
function classifyText(it, settings) {
  // strip stored category so JS classifies independently (no explicitCategory bonus)
  const item = { title: it.title || '', summary: it.summary || '', description: '' };
  return classifyItemCategory(item, settings ? { settings } : {});
}
{
  const jsDist = {}, storedDist = {}; let agree = 0, total = 0; const disagreements = [];
  for (const it of frozen.items || []) {
    const js = classifyText(it).category;
    const stored = it.category || 'unknown';
    jsDist[js] = (jsDist[js] || 0) + 1;
    storedDist[stored] = (storedDist[stored] || 0) + 1;
    total++;
    if (js === stored) agree++;
    else if (disagreements.length < 10) disagreements.push({ stored, js, title: (it.title || '').slice(0, 55) });
  }
  out.partC_realDistribution = { total, agreementRate: `${((agree / total) * 100).toFixed(1)}%`, jsDistribution: jsDist, storedPythonDistribution: storedDist, sampleDisagreements: disagreements };
}

// ---- D. I014 flip impact: fix keyword contradictions, recount ----
{
  const fixed = JSON.parse(JSON.stringify(DEFAULT_UPAHEAD_SETTINGS));
  // I014 fix 1: remove 'fog' from global negatives (it cancels real weather-fog alerts)
  fixed.keywords.negative = fixed.keywords.negative.filter(k => k !== 'fog' && k !== 'mist');
  // I014 fix 2: the dead 'launches' negative is a no-op (already signal-stripped) — removing it should NOT change anything (confirms dead)
  const fixedNoLaunch = JSON.parse(JSON.stringify(fixed));
  fixedNoLaunch.keywords.negative = fixedNoLaunch.keywords.negative.filter(k => k !== 'launches');
  const settingsFixed = { upAhead: fixed };
  const settingsNoLaunch = { upAhead: fixedNoLaunch };

  let flipsFog = 0, flipsLaunch = 0; const fogFlips = [];
  for (const it of frozen.items || []) {
    const base = classifyText(it).category;
    const fog = classifyText(it, settingsFixed).category;
    const noL = classifyText(it, settingsNoLaunch).category;
    if (base !== fog) { flipsFog++; if (fogFlips.length < 8) fogFlips.push({ base, fixed: fog, title: (it.title || '').slice(0, 55) }); }
    if (fog !== noL) flipsLaunch++;
  }
  out.partD_i014Flips = {
    note: 'baseline = shipped keywords; fog-fix removes fog/mist from global negatives; launch-fix additionally removes dead "launches"',
    flips_from_fog_mist_fix: flipsFog, flip_examples: fogFlips,
    flips_from_launches_fix: flipsLaunch, launches_is_dead_confirmed: flipsLaunch === 0
  };
}

out.summary = { pass, fail };
writeFileSync(path.join(__dirname, 'U2.2-classification-report.json'), JSON.stringify(out, null, 2));
console.log('=== U2.2 classification ===');
for (const r of [...out.partA_formula, ...out.partB_phaseB]) console.log(`[${r.verdict}] ${r.id}: ${r.desc}\n        exp=${r.expected} | act=${r.actual}`);
console.log(`formula+phaseB: ${pass} PASS / ${fail} FAIL`);
console.log('\n--- C. real distribution (JS independent vs stored Python) ---');
console.log('agreement:', out.partC_realDistribution.agreementRate);
console.log('JS:', JSON.stringify(out.partC_realDistribution.jsDistribution));
console.log('Python(stored):', JSON.stringify(out.partC_realDistribution.storedPythonDistribution));
console.log('sample disagreements:', JSON.stringify(out.partC_realDistribution.sampleDisagreements, null, 1));
console.log('\n--- D. I014 flip impact ---', JSON.stringify(out.partD_i014Flips, null, 1));
console.log('\nwrote audit/evidence/U2.2-classification-report.json');
