import { describe, expect, it } from 'vitest';
import { buildStoryInfoText } from './storyMeta.js';

describe('buildStoryInfoText — score breakdown rendering (Phase 0.3)', () => {
  it('renders the legacy score breakdown and deduplicates decisions', () => {
    const text = buildStoryInfoText(
      {
        title: 'X',
        impactScore: 7.5,
        _scoreBreakdown: {
          freshness: 1.2,
          severity: 1.6,
          decisions: [
            'keyword evidence election',
            'keyword evidence election',
          ],
        },
      },
      { includeScoreBreakdown: true },
    );
    expect(text).toContain('Ranking Score: 7.50');
    expect(text).toContain('Severity: 1.60');
    expect(text.match(/keyword evidence election/g)).toHaveLength(1);
  });

  it('prefers the actual Top Stories rank over the legacy impact score', () => {
    const text = buildStoryInfoText(
      {
        title: 'Election update',
        impactScore: 25,
        _scoreBreakdown: { freshness: 2, decisions: ['high-impact election x2.5'] },
        _topStoryRank: {
          normalizedScore: 0.44,
          score: 53.2,
          eventType: 'governance',
          eventQualified: true,
          slotBand: 'fallback',
          timestampConfidence: 'high',
          ageHours: 9,
          freshnessScore: 0.25,
          publicInterestScore: 0.76,
          consensusScore: 0.35,
          sourceCount: 1,
          topFeedHits: 0,
          penalties: 0,
          explanation: 'event=governance; band=fallback',
        },
      },
      { includeScoreBreakdown: true },
    );
    expect(text).toContain('Top Stories Score: 0.44');
    expect(text).toContain('Context Qualified: Yes');
    expect(text).not.toContain('high-impact election x2.5');
    expect(text).not.toContain('Ranking Score: 25.00');
  });

  it('shows Formula line for non-Top-Stories legacy breakdown', () => {
    const text = buildStoryInfoText(
      { title: 'Y', impactScore: 5, _scoreBreakdown: { freshness: 2, severity: 1, decisions: [] } },
      { includeScoreBreakdown: true },
    );
    expect(text).toContain('Formula:');
  });

  it('does not render breakdown when flag is false', () => {
    const text = buildStoryInfoText(
      { title: 'Z', impactScore: 9, _topStoryRank: { normalizedScore: 0.8 } },
      { includeScoreBreakdown: false },
    );
    expect(text).not.toContain('Top Stories Score');
  });
});
