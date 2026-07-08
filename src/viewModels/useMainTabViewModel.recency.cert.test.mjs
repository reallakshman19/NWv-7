import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { __mainViewModelInternalsForTest } from './useMainTabViewModel.js';

const ids = rows => rows.map(row => row.id);

function story(id, extra = {}) {
  return {
    id,
    title: id,
    url: `https://example.com/${id}`,
    ...extra,
  };
}

function testFrontPageOrderIsPreservedByDefault() {
  const { filterLatestStories } = __mainViewModelInternalsForTest;
  const rows = [
    story('ranker-first'),
    story('ranker-second'),
    story('ranker-third'),
  ];

  assert.deepEqual(ids(filterLatestStories(rows, false)), [
    'ranker-first',
    'ranker-second',
    'ranker-third',
  ]);
}

function testFrontPageIsLimitedTo25() {
  const { filterLatestStories } = __mainViewModelInternalsForTest;
  const rows = Array.from({ length: 30 }, (_, index) => story(`story-${index}`));

  assert.equal(filterLatestStories(rows, false).length, 25);
}

function testCustomSortOnlyDemotesReadOrHeavilyViewedRows() {
  const { filterLatestStories } = __mainViewModelInternalsForTest;
  const rows = [
    story('ranker-first'),
    story('ranker-second'),
    story('ranker-third'),
  ];

  assert.deepEqual(ids(filterLatestStories(rows, true)), [
    'ranker-first',
    'ranker-second',
    'ranker-third',
  ]);
}

function testMainViewModelNoLongerImportsFinalRecencyRanker() {
  const source = readFileSync(new URL('./useMainTabViewModel.js', import.meta.url), 'utf8');

  assert.equal(source.includes("rankTopStoriesByRecency"), false);
  assert.equal(source.includes("topStoriesRecency"), false);
  assert.equal(source.includes("asArray(frontPage).slice(0, 25)"), true);
}

testFrontPageOrderIsPreservedByDefault();
testFrontPageIsLimitedTo25();
testCustomSortOnlyDemotesReadOrHeavilyViewedRows();
testMainViewModelNoLongerImportsFinalRecencyRanker();

console.log('PASS: Main Top Stories ranker-order guardrail');
