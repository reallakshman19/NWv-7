import { describe, expect, it } from 'vitest';
import {
  FINANCIAL_TIMES_FIRSTFT_ASIA,
  parseFirstFtAsiaEditionEvidence,
  resolveFirstFtEdition,
} from './financialTimesFirstFtAsia.js';
import { resolvePublicationState } from '../publicationCalendar.js';

const ASIA_SAMPLE = `
  <div>August 3 2026</div>
  <div>Good morning and welcome to FirstFT.</div>
  <div>Markets at 0600 GMT+8</div>
  <div>How satisfied are you with FirstFT Asia?</div>
`;

describe('Financial Times FirstFT Asia resolver', () => {
  it('distinguishes the three registered FirstFT regional editions', () => {
    expect(resolveFirstFtEdition('<p>FirstFT Asia</p>').edition).toBe('ASIA');
    expect(resolveFirstFtEdition('<p>FirstFT Europe/Africa</p>').edition).toBe('EUROPE_AFRICA');
    expect(resolveFirstFtEdition('<p>FirstFT Americas</p>').edition).toBe('AMERICAS');
  });

  it('does not classify a generic FirstFT page from title alone', () => {
    expect(resolveFirstFtEdition('<p>Good morning and welcome to FirstFT.</p>').edition).toBeNull();
  });

  it('accepts the FT-owned Asia sample as exact edition evidence', () => {
    const evidence = parseFirstFtAsiaEditionEvidence({
      html: ASIA_SAMPLE,
      url: 'https://ep.ft.com/permalink/emails/sample?updatedTime=1785708012',
      requestedDigestDate: '2026-08-03',
      observedAt: '2026-08-03T03:35:00+05:30',
    });
    expect(evidence.canonicalId).toBe('financial-times:firstft:asia:2026-08-03');
    expect(evidence.editionState).toBe('CURRENT');
    expect(evidence.qualificationState).toBe('HOLD');
    expect(evidence.selectionEligible).toBe(false);
    expect(evidence.accessibilityState).toBe('UNKNOWN');
  });

  it('uses Asia/Kolkata calendar date for a direct FT article timestamp', () => {
    const html = `<script type="application/ld+json">{
      "@type":"NewsArticle",
      "headline":"FirstFT: Europe trails as AI drives US investment",
      "datePublished":"2026-08-23T21:27:00Z"
    }</script><p>FirstFT Asia</p>`;
    const evidence = parseFirstFtAsiaEditionEvidence({
      html,
      url: 'https://www.ft.com/content/example?shareType=nongift#section',
      requestedDigestDate: '2026-08-24',
      observedAt: '2026-08-24T03:00:00+05:30',
    });
    expect(evidence.digestDate).toBe('2026-08-24');
    expect(evidence.editionState).toBe('CURRENT');
    expect(evidence.canonicalUrl).toBe('https://www.ft.com/content/example');
  });

  it('marks conflicting explicit and published dates invalid', () => {
    const html = `<div>August 3 2026 FirstFT Asia</div><script type="application/ld+json">{
      "@type":"NewsArticle","headline":"FirstFT: x","datePublished":"2026-08-03T21:27:00Z"
    }</script>`;
    const evidence = parseFirstFtAsiaEditionEvidence({
      html, url: 'https://ft.com/content/x', requestedDigestDate: '2026-08-03', observedAt: 'x',
    });
    expect(evidence.editionState).toBe('INVALID');
  });

  it('rejects non-FT hosts', () => {
    expect(() => parseFirstFtAsiaEditionEvidence({
      html: ASIA_SAMPLE, url: 'https://example.com/x', requestedDigestDate: '2026-08-03', observedAt: 'x',
    })).toThrow('unexpected_publisher_host');
  });

  it('treats weekends as not scheduled and weekday pre-dawn as expected', () => {
    const sunday = resolvePublicationState(FINANCIAL_TIMES_FIRSTFT_ASIA, '2026-08-23', new Date('2026-08-23T03:00:00+05:30'));
    const monday = resolvePublicationState(FINANCIAL_TIMES_FIRSTFT_ASIA, '2026-08-24', new Date('2026-08-24T03:00:00+05:30'));
    expect(sunday.scheduleState).toBe('NOT_SCHEDULED');
    expect(monday.scheduleState).toBe('EXPECTED');
  });
});
