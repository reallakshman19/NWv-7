import { describe, expect, it } from 'vitest';
import { __insightDatasetInternalsForTest } from './insightDataset.js';

const { getInsightStoryRows, summarizeInsight } = __insightDatasetInternalsForTest;

describe('Insight dataset quality summary', () => {
  it('counts source stories from storiesById rather than parent count', () => {
    const insight = {
      parents: [{ parentId: 'p1' }],
      storiesById: new Map([
        ['s1', { id: 's1', sourceGroup: 'wire' }],
        ['s2', { id: 's2', sourceGroup: 'regional' }],
        ['s3', { id: 's3', sourceGroup: 'wire' }],
      ]),
    };

    expect(getInsightStoryRows(insight)).toHaveLength(3);

    const summary = summarizeInsight(insight);
    expect(summary.storyCount).toBe(3);
    expect(summary.sourceGroupCount).toBe(2);
    expect(summary.usableParentCount).toBe(1);
  });

  it('keeps nonzero source-story evidence when clustering yields zero parents', () => {
    const summary = summarizeInsight({
      parents: [],
      storiesById: {
        a: { id: 'a', sourceGroup: 'source-a' },
        b: { id: 'b', sourceGroup: 'source-b' },
      },
    });

    expect(summary.storyCount).toBe(2);
    expect(summary.sourceGroupCount).toBe(2);
    expect(summary.usableParentCount).toBe(0);
  });
});
