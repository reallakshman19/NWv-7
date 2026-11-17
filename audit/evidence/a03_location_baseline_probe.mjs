/**
 * Audit A03 — frozen, source-executing BASELINE characterization (NOT acceptance).
 * Node 22: node audit/evidence/a03_location_baseline_probe.mjs
 *
 * Intentional counterexamples document current defects and are expected to change
 * after an approved correction. No production files, timestamps or dedup are edited.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  rankStoriesForLocation,
  scoreStoryForLocation,
} from '../../src/services/storyLocationPriority.js';
import { scoreAreaRelevance } from '../../src/services/areaRelevanceScorer.js';
import {
  getTravelLocationProfile,
  resolveTravelLocationKey,
} from '../../src/services/travelLocationProfile.js';

const profile = getTravelLocationProfile({ travelLocation: { city: 'muscat' } });
const positive = getTravelLocationProfile({ travelLocation: { city: 'chennai' } });

const sourceOnly = {
  id: 'source-only',
  title: 'Global arts festival opens in Tokyo',
  summary: 'International exhibitions attract visitors',
  source: 'Muscat Daily',
};
const textSubstring = {
  id: 'woman',
  title: 'Woman wins global architecture prize',
  summary: 'Ceremony held in London',
  source: 'Global Wire',
};
const offArea = {
  id: 'dubai',
  title: 'Dubai conference opens',
  summary: 'New facilities in Dubai unveiled',
  source: 'Muscat Daily',
};

const cases = [
  { id: 'A03-G01', name: 'Source-only city score', actual: scoreStoryForLocation(sourceOnly, profile),
    expectedPolicy: '0 without event-location evidence' },
  { id: 'A03-G02', name: 'Substring Oman in woman', actual: scoreStoryForLocation(textSubstring, profile),
    expectedPolicy: '0 for non-boundary Oman' },
  { id: 'A03-G03', name: 'Off-area event assigned local tier',
    actual: scoreAreaRelevance(offArea, 'muscat'), expectedPolicy: 'Dubai is off-area; source alone cannot overrule' },
  { id: 'A03-G04', name: 'Partial country-code alias in location setting',
    actual: resolveTravelLocationKey('milk'), expectedPolicy: 'null, not Colombo via lk suffix' },
  { id: 'A03-P01', name: 'Positive local anchor', actual: scoreStoryForLocation({
    title: 'Muscat Municipality announces changes in Qurum', source: 'Global Wire',
  }, profile), expectedPolicy: 'positive Muscat location relevance' },
  { id: 'A03-P02', name: 'Positive Chennai anchor', actual: scoreAreaRelevance({
    title: 'Adyar and Velachery commuters affected by Chennai metro',
  }, 'chennai'), expectedPolicy: 'exact-area' },
];
assert(cases[0].actual > 0, 'Baseline mechanism changed: source-only city is no longer scored');
assert(cases[1].actual > 0, 'Baseline mechanism changed: substring alias no longer scores Oman');
assert(cases[2].actual.label !== 'off-area', 'Baseline mechanism changed: source-only city no longer overrides Dubai');
assert.equal(cases[3].actual, 'colombo', 'Baseline mechanism changed: milk country code false-match corrected');
assert(cases[4].actual > 0, 'Positive Muscat score lost');
assert.equal(cases[5].actual.label, 'exact-area', 'Positive Chennai relevance lost');
const selected = rankStoriesForLocation({ world: [sourceOnly, textSubstring] }, profile);
assert(selected.some(row => row.id === 'source-only'), 'Source-only false-positive no longer enters travelLocal');
assert(selected.some(row => row.id === 'woman'), 'Substring false-positive no longer enters travelLocal');

const snapshot = JSON.parse(fs.readFileSync(new URL('../../public/newsdata/sections_latest.json', import.meta.url), 'utf8'));
const terms = ['chennai', 'muscat', 'oman', 'india', 'colombo', 'sri lanka', 'tamil nadu'];
const normalize = s => String(s || '').toLowerCase().replace(/[^a-z0-9\\s]/g, ' ').replace(/\\s+/g, ' ').trim();
const has = (str, word) => (' ' + normalize(str) + ' ').includes(' ' + normalize(word) + ' ');
const rows = Object.entries(snapshot.sections || {}).flatMap(([section, list]) => (Array.isArray(list) ? list : [])
  .map(row => ({ ...row, auditSection: section })));
const candidates = rows.filter(row => terms.some(term =>
  (has(row.source, term) || has(row.sourceGroup, term)) &&
  !has([row.title, row.headline, row.summary, row.description,
    row.city, row.country, row.region, row.location].join(' '), term)
));
const result = {
  kind: 'A03_BASELINE_EXPOSURE_NOT_ACCEPTANCE',
  frozenProvider: 'checked-in GitHub snapshot',
  fetchedAt: snapshot.fetchedAt,
  snapshotRows: rows.length,
  publisherOnlyTermCandidateRows: candidates.length,
  semantics: 'Exposure only. Structured region codes, acquisition lanes and genuine local events can explain some cases.',
  cases,
  selectedIds: selected.map(row => row.id),
  sample: candidates.slice(0, 8).map(row => ({
    section: row.auditSection, source: row.source, title: row.title,
    region: row.region || null,
  })),
};
console.log(JSON.stringify(result, null, 2));
