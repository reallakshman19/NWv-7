/**
 * A03 — GET-only production Cloudflare Preview audit.
 * Captures exact response bytes and compares exact original baseline vs current
 * source functions on the same response. Never writes to Cloudflare.
 *
 * From a full checkout with Node 22:
 *   node audit/evidence/a03_cloudflare_live_e2e.mjs
 *
 * HTTP failures, stale epochs and missing rows are explicit NOT_VERIFIED, never
 * silently replaced by the GitHub static fixture.
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { PRODUCTION_RUNTIME_ENDPOINTS } from '../../src/config/runtimeEndpoints.js';
import { scoreAreaRelevance as fixedAreaScore } from '../../src/services/areaRelevanceScorer.js';
import { applyTravelLocationPriority as fixedProject, scoreStoryForLocation as fixedTravelScore } from '../../src/services/storyLocationPriority.js';
import { getTravelLocationProfile as fixedProfile } from '../../src/services/travelLocationProfile.js';
import { getLocationRelevanceSignal as fixedTopSignal } from '../../src/services/topStories/topStoriesLocationSignals.js';

const BASE = '695e27c64b42d2220449936792792b68e87a1375';
const url = process.env.A03_CLOUDFLARE_URL || PRODUCTION_RUNTIME_ENDPOINTS.sectionsAuthorityUrl;
const dir = resolve(process.env.A03_EVIDENCE_DIR || 'artifacts/a03');
mkdirSync(dir, { recursive: true });
const save = (name, data) => writeFileSync(resolve(dir, name), typeof data === 'string' ? data : JSON.stringify(data, null, 2));
const digest = x => createHash('sha256').update(x).digest('hex');
const gitBase = path => execFileSync('git', ['show', BASE + ':' + path], { encoding: 'utf8', maxBuffer: 6 * 1024 * 1024 });
const moduleUrl = source => 'data:text/javascript;base64,' + Buffer.from(source).toString('base64');
const readBaseline = async () => {
  const area = moduleUrl(gitBase('src/services/areaRelevanceScorer.js'));
  const profile = moduleUrl(gitBase('src/services/travelLocationProfile.js'));
  const travelSource = gitBase('src/services/storyLocationPriority.js')
    .replace("'./travelLocationProfile.js'", "'" + profile + "'")
    .replace("'./areaRelevanceScorer.js'", "'" + area + "'");
  return {
    area: await import(area),
    profile: await import(profile),
    travel: await import(moduleUrl(travelSource)),
    top: await import(moduleUrl(gitBase('src/services/topStories/topStoriesLocationSignals.js'))),
  };
};
function sectionKey(key) {
  return ({ topStories: 'frontPage', tn: 'chennai', muscat: 'local', technology: 'tech' })[key] || key;
}
function rowFields(item, rawKey) {
  return {
    ...item, title: item.title || item.headline || '',
    headline: item.headline || item.title || '', summary: item.summary || item.description || '',
    description: item.description || item.summary || '', source: item.source || item.sourceGroup || '',
    sourceGroup: item.sourceGroup || item.source || '', section: sectionKey(rawKey), sourceSection: rawKey,
  };
}
function c(row) {
  return JSON.stringify(String(row ?? ''));
}
function csv(rows, keys) {
  return [keys.join(','), ...rows.map(r => keys.map(k => c(r[k])).join(','))].join('\n') + '\n';
}
function indexRows(snapshot) {
  const original = [];
  const grouped = {};
  for (const [section, rows] of Object.entries(snapshot.sections || {})) {
    if (!Array.isArray(rows)) continue;
    const key = sectionKey(section);
    if (!grouped[key]) grouped[key] = [];
    for (let index = 0; index < rows.length; index++) {
      const item = rowFields(rows[index], section);
      original.push({ acquisitionSection: section, outputSection: key, ordinal: index + 1, item });
      grouped[key].push(item);
    }
  }
  return { original, grouped };
}
function differences(a, b) {
  const aIds = a.map((row, index) => String(row.id || row.url || row.title || index));
  const bIds = b.map((row, index) => String(row.id || row.url || row.title || index));
  return {
    oldIds: aIds, newIds: bIds,
    sameOrder: JSON.stringify(aIds) === JSON.stringify(bIds),
    oldCount: aIds.length, newCount: bIds.length,
    common: aIds.filter(id => bIds.includes(id)).length,
    firstFiveCommon: aIds.slice(0, 5).filter(id => bIds.slice(0, 5).includes(id)).length,
  };
}
const trace = {
  kind: 'A03_CLOUDFLARE_LIVE_READ_ONLY_PROBE',
  baseline: BASE,
  candidate: process.env.GITHUB_SHA || 'local_candidate',
  url,
  fetchedAtObserver: new Date().toISOString(),
  verifiedCloudflare: false,
  browserExecuted: false,
};
try {
  const response = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(20_000),
    cache: 'no-store',
  });
  const bytes = Buffer.from(await response.arrayBuffer());
  trace.httpStatus = response.status;
  trace.responseBytes = bytes.length;
  trace.responseSha256 = digest(bytes);
  trace.cloudflareEpochHeader = response.headers.get('x-nw-epoch-id') || null;
  trace.cloudflareSourceHeader = response.headers.get('x-nw-data-source') || null;
  trace.responseDateHeader = response.headers.get('date') || null;
  save('cloudflare_http_receipt.json', trace);
  if (!response.ok) throw new Error('Cloudflare preview returned HTTP ' + response.status);
  const snapshot = JSON.parse(bytes.toString('utf8'));
  if (![1, 2].includes(Number(snapshot.schemaVersion))) throw new Error('Unknown Cloudflare snapshot schema');
  if (!snapshot.sections || typeof snapshot.sections !== 'object' || Array.isArray(snapshot.sections)) {
    throw new Error('Cloudflare response lacks Sections object');
  }
  if (trace.cloudflareSourceHeader !== 'cloudflare-preview') {
    throw new Error('Cloudflare preview source response header absent or invalid');
  }
  const { original, grouped } = indexRows(snapshot);
  if (original.length < 1) throw new Error('Cloudflare supplied no usable stories');
  const fetchedAt = Number(snapshot.fetchedAt || 0);
  const ageMs = Date.now() - fetchedAt;
  trace.snapshotFetchedAt = fetchedAt;
  trace.snapshotAgeMs = ageMs;
  trace.snapshotSchemaVersion = snapshot.schemaVersion;
  trace.sectionCounts = Object.fromEntries(Object.entries(snapshot.sections).map(([k, v]) => [k, Array.isArray(v) ? v.length : 0]));
  trace.rowCount = original.length;
  trace.uniqueIds = new Set(original.map(x => x.item.id).filter(Boolean)).size;
  trace.previewEpoch = snapshot.preview?.epochId || null;
  trace.liveUsable = Number.isFinite(fetchedAt) && fetchedAt > 0
    && ageMs >= -60_000 && ageMs <= 12 * 60 * 60 * 1000;
  trace.stalenessReason = trace.liveUsable ? null
    : 'cloudflare_snapshot_older_than_12h_or_invalid_timestamp';
  trace.committedEpoch = Boolean(snapshot.preview?.evidenceVerified);
  trace.servingAuthority = snapshot.preview?.servingAuthority || null;
  // Public-read D1 projection, exact response bytes. No GitHub fallback.
  save('cloudflare_raw_capture.json', bytes.toString('utf8'));
  const baseline = await readBaseline();
  const oldMuscat = baseline.profile.getTravelLocationProfile({ travelLocation: { city: 'muscat' } });
  const oldChennai = baseline.profile.getTravelLocationProfile({ travelLocation: { city: 'chennai' } });
  const newMuscat = fixedProfile({ travelLocation: { city: 'muscat' } });
  const newChennai = fixedProfile({ travelLocation: { city: 'chennai' } });
  const rows = original.map(({ acquisitionSection, outputSection, ordinal, item }) => {
    const target = outputSection === 'local' ? 'muscat' : outputSection === 'chennai' ? 'chennai' : '';
    const beforeArea = target ? baseline.area.scoreAreaRelevance(item, target) : null;
    const afterArea = target ? fixedAreaScore(item, target) : null;
    const oldSignal = baseline.top.getLocationRelevanceSignal(item);
    const newSignal = fixedTopSignal(item);
    const oldMuscatScore = baseline.travel.scoreStoryForLocation(item, oldMuscat);
    const newMuscatScore = fixedTravelScore(item, newMuscat);
    const oldChennaiScore = baseline.travel.scoreStoryForLocation(item, oldChennai);
    const newChennaiScore = fixedTravelScore(item, newChennai);
    const metamorph = { ...item, source: 'Unrelated Publisher', sourceGroup: '', section: 'world', sourceSection: 'world', url: 'https://example.invalid/not-event' };
    assert.equal(newMuscatScore, fixedTravelScore(metamorph, newMuscat), 'source-invariance travel muscat');
    assert.equal(newChennaiScore, fixedTravelScore(metamorph, newChennai), 'source-invariance travel chennai');
    if (target) assert.deepEqual(
      [afterArea.score, afterArea.label],
      Object.values({ score: fixedAreaScore(metamorph, target).score, label: fixedAreaScore(metamorph, target).label }),
      'source-invariance area ' + target,
    );
    assert.equal(newSignal.score, fixedTopSignal({ ...item, region: 'Unknown Acquisition Market', section: 'unrelated' }).score, 'Top signal acquisition invariance');
    return {
      acquisitionSection, outputSection, ordinal, id: item.id || '', title: item.title || '',
      originalSource: item.source || '', originalRegion: item.region || '',
      originalCountry: item.country || '', originalCity: item.city || '',
      beforeAreaScore: beforeArea?.score ?? '', afterAreaScore: afterArea?.score ?? '',
      beforeAreaLabel: beforeArea?.label ?? '', afterAreaLabel: afterArea?.label ?? '',
      beforeMuscatTravel: oldMuscatScore, afterMuscatTravel: newMuscatScore,
      beforeChennaiTravel: oldChennaiScore, afterChennaiTravel: newChennaiScore,
      beforeTopSignal: oldSignal.score, afterTopSignal: newSignal.score,
    };
  });
  const oldView = baseline.travel.applyTravelLocationPriority(grouped, oldMuscat);
  const newView = fixedProject(grouped, newMuscat);
  trace.projection = {
    local: differences(oldView.local || [], newView.local || []),
    chennai: differences(oldView.chennai || [], newView.chennai || []),
    travelLocal: differences(oldView.travelLocal || [], newView.travelLocal || []),
    travelPanelFive: differences((oldView.travelLocal || []).slice(0,5),(newView.travelLocal || []).slice(0,5)),
  };
  trace.measured = {
    areaScoreChanged: rows.filter(x => x.beforeAreaScore !== x.afterAreaScore).length,
    areaLabelChanged: rows.filter(x => x.beforeAreaLabel !== x.afterAreaLabel).length,
    muscatTravelScoreChanged: rows.filter(x => x.beforeMuscatTravel !== x.afterMuscatTravel).length,
    chennaiTravelScoreChanged: rows.filter(x => x.beforeChennaiTravel !== x.afterChennaiTravel).length,
    topSignalChanged: rows.filter(x => x.beforeTopSignal !== x.afterTopSignal).length,
  };
  trace.negativeControls = {
    sourceOnlyTokyoBaseline: baseline.travel.scoreStoryForLocation({
      title: 'Global arts festival opens in Tokyo', source: 'Muscat Daily',
    }, oldMuscat),
    sourceOnlyTokyoCorrected: fixedTravelScore({
      title: 'Global arts festival opens in Tokyo', source: 'Muscat Daily',
    }, newMuscat),
    substringWomanBaseline: baseline.travel.scoreStoryForLocation({
      title: 'Woman wins global architecture prize',
    }, oldMuscat),
    substringWomanCorrected: fixedTravelScore({
      title: 'Woman wins global architecture prize',
    }, newMuscat),
  };
  assert.equal(trace.negativeControls.sourceOnlyTokyoCorrected, 0);
  assert.equal(trace.negativeControls.substringWomanCorrected, 0);
  assert(trace.negativeControls.sourceOnlyTokyoBaseline > 0);
  assert(trace.negativeControls.substringWomanBaseline > 0);
  trace.verifiedCloudflare = true; // Exact public Cloudflare response verified; freshness separate.
  trace.result = trace.liveUsable
    ? 'LIVE_CLOUDFLARE_SOURCE_PROJECTION_PASS_NOT_BROWSER'
    : 'HISTORICAL_CLOUDFLARE_SOURCE_PROJECTION_PASS_LIVE_UNQUALIFIED';
  save('cloudflare_row_replay.csv', csv(rows, [
    'acquisitionSection','outputSection','ordinal','id','title','originalSource','originalRegion',
    'originalCountry','originalCity','beforeAreaScore','afterAreaScore','beforeAreaLabel','afterAreaLabel',
    'beforeMuscatTravel','afterMuscatTravel','beforeChennaiTravel','afterChennaiTravel','beforeTopSignal','afterTopSignal',
  ]));
  save('cloudflare_geographic_replay.json', trace);
  console.log(JSON.stringify(trace, null, 2));
  // A stale real Cloudflare epoch may validate the semantic hypothesis but must
  // never satisfy the current-live freshness or deployed-browser acceptance gate.
  if (!trace.liveUsable) process.exitCode = 1;
} catch (error) {
  trace.result = 'CLOUDFLARE_NOT_VERIFIED';
  trace.error = String(error?.stack || error);
  save('cloudflare_geographic_replay.json', trace);
  console.error(trace.error);
  process.exitCode = 1;
}
