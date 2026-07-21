import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildStoryInfoText } from '../../utils/storyMeta.js';

const componentUrl = new URL('../../components/NewsSection.jsx', import.meta.url);
const componentSource = readFileSync(componentUrl, 'utf8');

function makeTopStory() {
  return {
    id: 'fitbit-air',
    source: 'Google News',
    url: 'https://example.test/fitbit-air',
    title: 'Google Fitbit Air Screenless Fitness Tracker',
    _topStoryRank: {
      normalizedScore: 0.51,
      score: 62.1,
      eventType: 'routine_business',
      eventQualified: true,
      slotBand: 'primary',
      admissionReason: 'admitted',
      timestampConfidence: 'high',
      ageHours: 1.08,
      freshnessScore: 0.91,
      publicInterestScore: 0.24,
      consensusScore: 0.36,
      sourceCount: 2,
      topFeedHits: 0,
      topFeedCorroborationHits: 0,
      independentEvidenceCount: 1,
      penalties: 0,
    },
  };
}

describe('Story Intelligence group position', () => {
  it('adds the exact group title and one-based full-group position', () => {
    const text = buildStoryInfoText(makeTopStory(), {
      includeScoreBreakdown: true,
      expectTopStoryRank: true,
      groupTitle: 'Top Stories',
      groupPosition: 1,
      groupTotal: 6,
    });

    expect(text).toContain('Group: Top Stories');
    expect(text).toContain('Position in Group: 1 of 6');
    expect(text).toContain('Top Stories Score: 0.51');
    expect(text).toContain('Event: routine_business');
    expect(text).toContain('Admission: admitted');
    expect(text).toContain('Consensus: 0.36 (2 sources)');
  });

  it('uses the supplied full group count rather than a visible slice count', () => {
    const text = buildStoryInfoText(makeTopStory(), {
      groupTitle: 'World',
      groupPosition: 3,
      groupTotal: 12,
    });

    expect(text).toContain('Group: World');
    expect(text).toContain('Position in Group: 3 of 12');
    expect(text).not.toContain('3 of 3');
  });

  it.each([
    { groupPosition: 0, groupTotal: 6 },
    { groupPosition: 2.5, groupTotal: 6 },
    { groupPosition: 7, groupTotal: 6 },
    { groupPosition: 1, groupTotal: 0 },
    { groupPosition: null, groupTotal: null },
  ])('does not fabricate invalid position metadata: %o', metadata => {
    const text = buildStoryInfoText(makeTopStory(), {
      groupTitle: 'Top Stories',
      ...metadata,
    });

    expect(text).toContain('Group: Top Stories');
    expect(text).not.toContain('Position in Group:');
  });
});

describe('NewsSection Story Intelligence source contract', () => {
  it('passes section title, one-based index, and full news length', () => {
    expect(componentSource).toMatch(/groupTitle:\s*title/);
    expect(componentSource).toMatch(/groupPosition:\s*idx\s*\+\s*1/);
    expect(componentSource).toMatch(/groupTotal:\s*news\.length/);
    expect(componentSource).not.toMatch(/groupTotal:\s*displayNews\.length/);
  });

  it('provides an accessible copy-all control with visible result states', () => {
    expect(componentSource).toContain('aria-label="Copy story intelligence"');
    expect(componentSource).toContain("'Copy all details'");
    expect(componentSource).toContain("copyStatus === 'copied' ? '✓'");
    expect(componentSource).toContain("copyStatus === 'failed' ? '!'");
    expect(componentSource).toContain("setCopyStatus('idle')");
  });

  it('copies the complete infoText and has a cleaned-up fallback', () => {
    expect(componentSource).toContain('writeStoryInfoToClipboard(infoText)');
    expect(componentSource).toContain('clipboard?.writeText');
    expect(componentSource).toContain("document.createElement('textarea')");
    expect(componentSource).toContain('document.body.appendChild(textArea)');
    expect(componentSource).toMatch(/finally\s*\{\s*textArea\.remove\(\);\s*\}/s);
  });

  it('keeps copy and close actions separate and propagation-safe', () => {
    expect(componentSource).toMatch(/const handleCopyInfo = async \(event\) => \{\s*event\.stopPropagation\(\)/s);
    expect(componentSource).toMatch(/aria-label="Close dialog"/);
    expect(componentSource).toMatch(/event\.stopPropagation\(\);\s*setInfoText\(''\)/s);
  });

  it('preserves card ordering, display depth, expansion, and row rendering', () => {
    expect(componentSource).toContain('key={item.id || idx}');
    expect(componentSource).toContain('const displayCount = expanded ? news.length : Math.min(maxDisplay, news.length);');
    expect(componentSource).toContain('const displayNews = news.slice(0, displayCount);');
    expect(componentSource).toContain('onClick={() => setExpanded(!expanded)}');
    expect(componentSource).toContain("infoText.split('\\n').map");
    expect(componentSource).toContain('className="nim-link"');
    expect(componentSource).toContain('onClick={() => handleStoryClick(item)}');
  });

  it('does not import or alter ranking authorities in the component', () => {
    expect(componentSource).not.toContain('topStoriesRanker');
    expect(componentSource).not.toContain('topStoriesEventClassifier');
    expect(componentSource).not.toContain('topStoriesSignals');
    expect(componentSource).not.toContain('topStoriesPolicy');
  });
});
