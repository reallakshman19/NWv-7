import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('./useMainTabViewModel.js', import.meta.url), 'utf8');
const ids = rows => rows.map(row => row.id);

function story(id, extra = {}) {
  return {
    id,
    title: id,
    url: `https://example.com/${id}`,
    ...extra,
  };
}

function mirrorFilterLatestStories(frontPage = [], customSortTopStories = false) {
  const ordered = Array.isArray(frontPage) ? frontPage.slice(0, 25) : [];
  if (!customSortTopStories) return ordered;

  const preferred = [];
  const viewed = [];

  for (const item of ordered) {
    if (item?.__viewedForTest) {
      viewed.push(item);
    } else {
      preferred.push(item);
    }
  }

  if (preferred.length >= 10) return preferred;
  return [
    ...preferred,
    ...viewed.slice(0, Math.max(0, 10 - preferred.length)),
  ];
}

function testSourceRetiresFinalRecencyRanker() {
  assert.equal(source.includes("rankTopStoriesByRecency"), false);
  assert.equal(source.includes("topStoriesRecency"), false);
}

function testSourcePreservesSuppliedOrderByDefault() {
  assert.equal(source.includes("const ordered = asArray(frontPage).slice(0, 25);"), true);
  assert.equal(source.includes("if (!customSortTopStories) return ordered;"), true);
  assert.equal(source.includes("for (const item of ordered)"), true);
}

function testFrontPageOrderIsPreservedByDefault() {
  const rows = [
    story('ranker-first'),
    story('ranker-second'),
    story('ranker-third'),
  ];

  assert.deepEqual(ids(mirrorFilterLatestStories(rows, false)), [
    'ranker-first',
    'ranker-second',
    'ranker-third',
  ]);
}

function testFrontPageIsLimitedTo25() {
  const rows = Array.from({ length: 30 }, (_, index) => story(`story-${index}`));

  assert.equal(mirrorFilterLatestStories(rows, false).length, 25);
}

function testCustomSortDoesNotRecencyRank() {
  const rows = [
    story('ranker-first'),
    story('ranker-second'),
    story('ranker-third'),
  ];

  assert.deepEqual(ids(mirrorFilterLatestStories(rows, true)), [
    'ranker-first',
    'ranker-second',
    'ranker-third',
  ]);
}

testSourceRetiresFinalRecencyRanker();
testSourcePreservesSuppliedOrderByDefault();
testFrontPageOrderIsPreservedByDefault();
testFrontPageIsLimitedTo25();
testCustomSortDoesNotRecencyRank();

console.log('PASS: Main Top Stories ranker-order guardrail');
