import { describe, expect, it } from 'vitest';
import {
  extractAkashvaniDigestQualityEvidence,
  extractIndianExpressDigestQualityEvidence,
} from './digestQualityEvidence.js';

describe('publisher digest quality evidence extraction', () => {
  it('extracts only the Akashvani headline block', () => {
    const html = `
      <h2>THE HEADLINES</h2>
      <ul>
        <li>Supreme Court issues a major verdict on constitutional rights.</li>
        <li>RBI reviews inflation and banking conditions.</li>
        <li>Cabinet approves a national infrastructure policy.</li>
        <li>Army reviews border security after ceasefire talks.</li>
      </ul>
      <h2>THE NEWS</h2>
      <p>This full bulletin paragraph must not become a quality item.</p>`;
    const evidence = extractAkashvaniDigestQualityEvidence(html);
    expect(evidence.state).toBe('OBSERVED');
    expect(evidence.items).toHaveLength(4);
    expect(evidence.items.join(' ')).not.toContain('full bulletin');
  });

  it('extracts direct Indian Express story links and rejects utility/external links', () => {
    const html = `
      <a href="/article/india/court-story-1/">Supreme Court issues a major constitutional verdict</a>
      <a href="/article/business/rbi-story-2/">RBI reviews inflation and banking conditions</a>
      <a href="/article/india/cabinet-story-3/">Cabinet approves a national infrastructure policy</a>
      <a href="/article/world/china-story-4/">China and India hold a bilateral summit</a>
      <a href="https://example.com/story">External publisher story must not qualify</a>
      <a href="/subscribe/">Subscribe now</a>`;
    const evidence = extractIndianExpressDigestQualityEvidence(
      html, 'https://indianexpress.com/article/live-news/daily-briefing-x/',
    );
    expect(evidence.state).toBe('OBSERVED');
    expect(evidence.items).toHaveLength(4);
    expect(evidence.items.join(' ')).not.toContain('External publisher');
  });
});
