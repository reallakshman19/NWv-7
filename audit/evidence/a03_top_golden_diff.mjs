import { buildTopStoriesAuditSnapshot, buildTopStoriesGoldenReviewSnapshot, compareTopStoriesAuditSnapshots } from '../../src/services/topStories/topStoriesAuditHarness.js';
const actual = buildTopStoriesAuditSnapshot();
const expected = buildTopStoriesGoldenReviewSnapshot();
const diff = compareTopStoriesAuditSnapshots(actual, expected);
console.log(JSON.stringify({ status: diff.ok ? 'IDENTICAL' : 'GOLDEN_VARIANCE', errors: diff.errors, warnings: diff.warnings, actual, expected }, null, 2));
if (!diff.ok) process.exitCode = 0; // Diagnostic only; actual Vitest gate must fail until resolved.
