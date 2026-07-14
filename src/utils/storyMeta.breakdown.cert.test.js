import { describe, expect, it } from 'vitest';
import { buildStoryInfoText } from './storyMeta.js';

describe('buildStoryInfoText — score breakdown rendering', () => {
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
          admissionReason: 'admitted',
          timestampConfidence: 'high',
          ageHours: 9,
          freshnessScore: 0.25,
          publicInterestScore: 0.76,
          consensusScore: 0.35,
          sourceCount: 2,
          topFeedHits: 2.4,
          topFeedCorroborationHits: 1,
          independentEvidenceCount: 2,
          penalties: 0,
          explanation: 'event=governance; band=fallback; reason=admitted',
        },
      },
      { includeScoreBreakdown: true, expectTopStoryRank: true },
    );
    expect(text).toContain('Top Stories Diagnostics');
    expect(text).toContain('Contract: _topStoryRank');
    expect(text).toContain('Top Stories Score: 0.44');
    expect(text).toContain('Context Qualified: Yes');
    expect(text).toContain('Admission: admitted');
    expect(text).toContain('Top Feed Membership Hits: 2.40');
    expect(text).toContain('Top Feed Corroboration Hits: 1.00');
    expect(text).toContain('Independent Evidence: 2.00');
    expect(text).not.toContain('high-impact election x2.5');
    expect(text).not.toContain('Ranking Score: 25.00');
  });

  it('shows an explicit integrity warning when Top Stories rank is missing', () => {
    const text = buildStoryInfoText(
      {
        title: 'Legacy-only row',
        impactScore: 18,
        _scoreBreakdown: {
          freshness: 2,
          severity: 1,
          decisions: ['legacy decision'],
        },
      },
      { includeScoreBreakdown: true, expectTopStoryRank: true },
    );

    expect(text).toContain('Top Stories Diagnostics');
    expect(text).toContain('Status: unavailable');
    expect(text).toContain('Reason: authoritative _topStoryRank is missing');
    expect(text).toContain('Legacy Section Score — reference only');
    expect(text).toContain('Ranking Score: 18.00');
  });

  it('shows missing Top Stories diagnostics even when no legacy score exists', () => {
    const text = buildStoryInfoText(
      { title: 'Unranked row' },
      { includeScoreBreakdown: true, expectTopStoryRank: true },
    );

    expect(text).toContain('Status: unavailable');
    expect(text).toContain('authoritative _topStoryRank is missing');
    expect(text).not.toContain('Legacy Section Score');
  });

  it('shows Formula line for non-Top-Stories legacy breakdown', () => {
    const text = buildStoryInfoText(
      { title: 'Y', impactScore: 5, _scoreBreakdown: { freshness: 2, severity: 1, decisions: [] } },
      { includeScoreBreakdown: true },
    );
    expect(text).toContain('Formula:');
    expect(text).not.toContain('reference only');
  });

  it('does not render breakdown when flags are false', () => {
    const text = buildStoryInfoText(
      { title: 'Z', impactScore: 9, _topStoryRank: { normalizedScore: 0.8 } },
      { includeScoreBreakdown: false, expectTopStoryRank: false },
    );
    expect(text).not.toContain('Top Stories Score');
    expect(text).not.toContain('Top Stories Diagnostics');
  });
});
