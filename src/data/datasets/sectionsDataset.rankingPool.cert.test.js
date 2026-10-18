import { describe, expect, it } from 'vitest';
import {
  getTopStoriesCandidateLimit,
  summarizeSection,
} from './sectionsDataset.js';

function row(index) {
  return {
    id: `story-${index}`,
    title: `Story ${index}`,
    source: `Source ${index}`,
    sourceGroup: `source-${index}`,
    publishedAt: Date.UTC(2026, 9, 18, 12, 0, 0) - index * 60_000,
  };
}

describe('Sections dataset Top Stories candidate pool', () => {
  it('requests a substantially wider ranking pool than the section display slice', () => {
    expect(getTopStoriesCandidateLimit(15)).toBe(45);
    expect(getTopStoriesCandidateLimit(5)).toBe(30);
  });

  it('keeps the section display bounded while preserving the wider candidate population', () => {
    const result = Array.from({ length: 40 }, (_, index) => row(index));
    result.prefetchSourceSection = 'world';

    const summary = summarizeSection('world', result, 15);

    expect(summary.items).toHaveLength(15);
    expect(summary.candidateItems).toHaveLength(40);
    expect(summary.count).toBe(15);
    expect(summary.candidateCount).toBe(40);
    expect(summary.items[0].sourceSection).toBe('world');
    expect(summary.candidateItems[39].id).toBe('story-39');
  });
});
