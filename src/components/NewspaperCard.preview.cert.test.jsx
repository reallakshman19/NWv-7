import React from 'react';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import NewspaperCard from './NewspaperCard.jsx';

const makeArticle = (overrides = {}) => ({
  title: 'New transport services announced',
  link: 'https://www.thehindu.com/news/example.ece',
  publishedAt: Date.parse('2026-11-21T02:00:00Z'),
  preview: 'Officials detailed an expanded public transport network, with additional routes scheduled to begin operating next month.',
  ...overrides,
});

describe('NewspaperCard per-story preview', () => {
  it('renders the source-specific excerpt, link and requested line count', () => {
    const html = renderToStaticMarkup(
      <NewspaperCard article={makeArticle()} sourceName="The Hindu" isTranslated={false} previewLines={4} />
    );
    expect(html).toContain('New transport services announced');
    expect(html).toContain('Officials detailed an expanded public transport');
    expect(html).toContain('Publisher RSS excerpt');
    expect(html).toContain('Read Full Story');
    expect(html).toContain('--preview-lines:4');
  });

  it('does not invent a preview when only an original headline exists', () => {
    const html = renderToStaticMarkup(
      <NewspaperCard article={makeArticle({ preview: undefined })} sourceName="The Hindu" isTranslated={false} />
    );
    expect(html).not.toContain('newspaper-card__excerpt');
    expect(html).not.toContain('Publisher RSS excerpt');
    expect(html).toContain('Read Full Story');
  });

  it('bounds invalid preference inputs to three lines', () => {
    const html = renderToStaticMarkup(
      <NewspaperCard article={makeArticle()} sourceName="The Hindu" isTranslated={false} previewLines={99} />
    );
    expect(html).toContain('--preview-lines:3');
  });
});
