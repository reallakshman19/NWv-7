/**
 * NW-RANK-001 validation rebase — Main Top Stories order-preservation guardrail.
 *
 * Runs standalone via `node src/viewModels/useMainTabViewModel.recency.cert.test.mjs`
 * (see .github/workflows/data_freshness_contracts.yml).
 *
 * Contract certified here:
 *   - rankTopStories (src/services/topStories) is the Top Stories ranking
 *     authority for both the browser/context path (NewsContext.jsx) and the
 *     hybrid/static path (sectionsDataset.js).
 *   - useMainTabViewModel preserves the supplied frontPage order, caps the
 *     rail to 25, and under customSortTopStories only demotes read/heavily
 *     viewed stories — it never re-ranks by recency or impact.
 *   - The retired rankTopStoriesByRecency helper must not return as the final
 *     Main ViewModel ordering authority.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { rankTopStories } from '../services/topStories/topStoriesRanker.js';

const read = relative => readFileSync(new URL(relative, import.meta.url), 'utf8');

const vmSource = read('./useMainTabViewModel.js');
const newsContextSource = read('../context/NewsContext.jsx');
const sectionsDatasetSource = read('../data/datasets/sectionsDataset.js');

// --- Static ownership-boundary checks -------------------------------------

function testMainViewModelIsNotASecondRanker() {
  assert.ok(!vmSource.includes('rankTopStoriesByRecency'),
    'useMainTabViewModel.js must not reintroduce rankTopStoriesByRecency');
  assert.ok(!vmSource.includes('topStoriesRecency'),
    'useMainTabViewModel.js must not import the retired topStoriesRecency helper');
  assert.ok(!vmSource.includes('composeBalancedFeed'),
    'useMainTabViewModel.js must not route Top Stories through composeBalancedFeed');
  assert.ok(vmSource.includes('slice(0, 25)'),
    'useMainTabViewModel.js must cap Top Stories to 25');
}

function testRankTopStoriesIsTheFrontPageAuthority() {
  assert.ok(newsContextSource.includes('rankTopStories'),
    'NewsContext.jsx must build frontPage with rankTopStories');
  assert.ok(!newsContextSource.includes('composeBalancedFeed'),
    'NewsContext.jsx must not use composeBalancedFeed as the Top Stories authority');
  assert.ok(sectionsDatasetSource.includes('rankTopStories'),
    'sectionsDataset.js must build frontPage with rankTopStories');
  assert.ok(!sectionsDatasetSource.includes('composeBalancedFeed'),
    'sectionsDataset.js must not use composeBalancedFeed as the Top Stories authority');
}

function testTopStoriesModulesDoNotFetchFromBrowser() {
  const modules = [
    '../services/topStories/topStoriesRanker.js',
    '../services/topStories/topStoriesPolicy.js',
    '../services/topStories/topStoriesSignals.js',
    '../services/topStories/topStoriesEventClassifier.js',
  ].map(read).join('\n');
  assert.ok(!/\bfetch\s*\(/.test(modules), 'topStories modules must not fetch');
  assert.ok(!/XMLHttpRequest|WebSocket/.test(modules),
    'topStories modules must not open network connections');
}

// --- Behavioral checks on filterLatestStories ------------------------------
// useMainTabViewModel.js imports React contexts and cannot be imported by
// plain node, so the pure display filter is extracted from source and
// evaluated with injected read/view-count stubs.

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `useMainTabViewModel.js must define ${name}`);
  let depth = 0;
  let index = source.indexOf('{', start);
  for (; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') {
      depth -= 1;
      if (depth === 0) break;
    }
  }
  return source.slice(start, index + 1);
}

function extractConstant(source, name) {
  const match = source.match(new RegExp(`const ${name} = (\\d+);`));
  assert.ok(match, `useMainTabViewModel.js must define ${name}`);
  return Number(match[1]);
}

const MIN_CUSTOM_TOP_STORIES = extractConstant(vmSource, 'MIN_CUSTOM_TOP_STORIES');
const MAX_VIEW_COUNT = extractConstant(vmSource, 'MAX_VIEW_COUNT_FOR_CUSTOM_TOP_STORIES');

function makeFilterLatestStories({ readIds = new Set(), viewCounts = new Map() } = {}) {
  const factory = new Function('isArticleRead', 'getViewCount', [
    `const MIN_CUSTOM_TOP_STORIES = ${MIN_CUSTOM_TOP_STORIES};`,
    `const MAX_VIEW_COUNT_FOR_CUSTOM_TOP_STORIES = ${MAX_VIEW_COUNT};`,
    extractFunction(vmSource, 'asArray'),
    extractFunction(vmSource, 'filterLatestStories'),
    'return filterLatestStories;',
  ].join('\n'));
  return factory(id => readIds.has(id), id => viewCounts.get(id) ?? 0);
}

const now = Date.UTC(2026, 6, 4, 12, 0, 0);
const hoursAgo = hours => now - hours * 60 * 60 * 1000;
const ids = rows => rows.map(row => row.id);

function testSuppliedOrderIsPreserved() {
  const filterLatestStories = makeFilterLatestStories();
  // Adversarial recency order: a recency re-ranker would flip these.
  const frontPage = [
    { id: 'ranker-first', impactScore: 5, publishedAt: hoursAgo(30) },
    { id: 'ranker-second', impactScore: 100, publishedAt: hoursAgo(1) },
    { id: 'ranker-third', impactScore: 50 },
  ];
  assert.deepEqual(ids(filterLatestStories(frontPage, false)),
    ['ranker-first', 'ranker-second', 'ranker-third']);
}

function testTopStoriesCapIs25() {
  const filterLatestStories = makeFilterLatestStories();
  const frontPage = Array.from({ length: 40 }, (_, i) => ({ id: `story-${i}` }));
  const result = filterLatestStories(frontPage, false);
  assert.equal(result.length, 25);
  assert.deepEqual(ids(result), ids(frontPage.slice(0, 25)));
}

function testCustomSortDoesNotRecencyRank() {
  const filterLatestStories = makeFilterLatestStories();
  const frontPage = Array.from({ length: 12 }, (_, i) => ({
    id: `story-${i}`,
    impactScore: i,
    publishedAt: hoursAgo(12 - i),
  }));
  assert.deepEqual(ids(filterLatestStories(frontPage, true)), ids(frontPage));
}

function testCustomSortOnlyDemotesReadOrHeavilyViewed() {
  const filterLatestStories = makeFilterLatestStories({
    readIds: new Set(['story-2']),
    viewCounts: new Map([['story-5', MAX_VIEW_COUNT + 1]]),
  });
  const frontPage = Array.from({ length: 12 }, (_, i) => ({ id: `story-${i}` }));
  assert.deepEqual(ids(filterLatestStories(frontPage, true)),
    ids(frontPage).filter(id => id !== 'story-2' && id !== 'story-5'));
}

function testCustomSortBackfillsToMinimum() {
  const readIds = new Set(['story-0', 'story-1', 'story-2', 'story-3', 'story-4']);
  const filterLatestStories = makeFilterLatestStories({ readIds });
  const frontPage = Array.from({ length: 12 }, (_, i) => ({ id: `story-${i}` }));
  const result = filterLatestStories(frontPage, true);
  assert.equal(result.length, MIN_CUSTOM_TOP_STORIES);
  assert.deepEqual(ids(result), [
    'story-5', 'story-6', 'story-7', 'story-8', 'story-9', 'story-10', 'story-11',
    'story-0', 'story-1', 'story-2',
  ]);
}

// --- Ranker determinism guard ----------------------------------------------

function testRankTopStoriesIsDeterministicAndBounded() {
  const fixture = Array.from({ length: 40 }, (_, i) => ({
    id: `story-${i}`,
    title: `Flood evacuation alert ${i}`,
    section: 'world',
    source: `Source ${i}`,
    sourceGroup: `source-${i % 8}`,
    publishedAt: hoursAgo(1 + (i % 6)),
    timestampConfidence: 'high',
  }));
  const first = rankTopStories({ sectionItems: { world: fixture }, nowMs: now });
  const second = rankTopStories({ sectionItems: { world: fixture }, nowMs: now });
  assert.deepEqual(ids(first), ids(second), 'rankTopStories must be deterministic');
  assert.ok(first.length <= 25, 'rankTopStories must stay bounded to the policy limit');
}

testMainViewModelIsNotASecondRanker();
testRankTopStoriesIsTheFrontPageAuthority();
testTopStoriesModulesDoNotFetchFromBrowser();
testSuppliedOrderIsPreserved();
testTopStoriesCapIs25();
testCustomSortDoesNotRecencyRank();
testCustomSortOnlyDemotesReadOrHeavilyViewed();
testCustomSortBackfillsToMinimum();
testRankTopStoriesIsDeterministicAndBounded();

console.log('PASS: Main Top Stories order-preservation guardrail (NW-RANK-001)');
