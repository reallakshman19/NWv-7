// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import DailyDigestSection from './DailyDigestSection.jsx';
import { digestPublishedAt, digestSnippet } from '../utils/digestCardContent.js';

afterEach(() => cleanup());

describe('DailyDigestSection availability states', () => {
  it('offers a retry for unavailable current stories and disables it during recovery', () => {
    const refresh = vi.fn();
    const view = render(<DailyDigestSection availability="SECTIONS_UNAVAILABLE" onRefresh={refresh} />);
    expect(screen.getByText('Daily Digest could not load current stories')).toBeTruthy();
    expect(screen.queryByText(/backend is not configured/i)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Retry Daily Digest' }));
    expect(refresh).toHaveBeenCalledTimes(1);
    view.rerender(<DailyDigestSection availability="SECTIONS_UNAVAILABLE" loading onRefresh={refresh} />);
    const button = screen.getByRole('button', { name: 'Checking Daily Digest…' });
    expect(button.disabled).toBe(true);
    fireEvent.click(button);
    expect(refresh).toHaveBeenCalledTimes(1);
  });
  it('renders snapshot-derived publisher tabs and source metadata without Live or curated claims',()=>{
    render(<DailyDigestSection deliveryMode="SNAPSHOT" availability="READY" cards={[{slot:'L1',canonicalId:'published-1',
      title:'Published city update',canonicalUrl:'https://example.com/story',source:'The Hindu',sourceGroup:'the_hindu',section:'tn',
      publishedAt:'2026-11-18T13:20:00Z',snippet:'A genuine publisher excerpt.'}]}/>);
    expect(screen.getByRole('tab',{name:/The Hindu/})).toBeTruthy();
    expect(screen.getByText('The Hindu · Tamil Nadu')).toBeTruthy();
    expect(screen.getByText('Snapshot · Auto-selected')).toBeTruthy();
    expect(screen.queryByText('Publisher-curated')).toBeNull();expect(screen.queryByText('LIVE')).toBeNull();
  });
  it('shows the article publication time and plain-text snippet on the selected story', () => {
    render(<DailyDigestSection deliveryMode="LIVE" cards={[{
      slot:'L1',canonicalId:'oman-theatre',source:'Times of Oman',section:'muscat',
      title:'Oman participates in Gulf Theatre Festival',canonicalUrl:'https://timesofoman.com/article/example',
      publishedAt:'2026-11-18T13:20:00Z',
      summary:'<p>Muscat: The delegation presents <strong>new theatre</strong> &amp; meets regional artists.</p><script>unwantedCode()</script>',
    }]} />);
    const time = screen.getByText(/^Published /);
    expect(time.tagName).toBe('TIME');
    expect(time.getAttribute('datetime')).toBe('2026-11-18T13:20:00.000Z');
    expect(screen.getByText('Muscat: The delegation presents new theatre & meets regional artists.')).toBeTruthy();
    expect(screen.queryByText(/unwantedCode/)).toBeNull();
  });

  it('does not invent a publication time from snapshot or freeze metadata', () => {
    const card = {slot:'I1',canonicalId:'missing-meta',publisherFamily:'AKASHVANI',title:'Morning News',canonicalUrl:'https://newsonair.gov.in/example',fetchedAt:1795003200000};
    render(<DailyDigestSection cards={[card]} frozenAt="2026-11-18T04:45:00Z"/>);
    expect(screen.getByText('Publication time unavailable')).toBeTruthy();
    expect(document.querySelector('time')).toBeNull();
    expect(document.querySelector('.daily-digest-snippet')).toBeNull();
  });

  it('accepts publisher seconds/RFC timestamps and omits repeated-headline snippets', () => {
    expect(digestPublishedAt({pubDate:'Wed, 18 Nov 2026 13:20:00 GMT'})).toBe(Date.parse('2026-11-18T13:20:00Z'));
    expect(digestPublishedAt({publishedAt:1795008000})).toBe(1795008000000);
    expect(digestPublishedAt({publishedAt:'invalid',fetchedAt:1795008000000})).toBeNull();
    expect(digestPublishedAt({publishedAt:'2026-11-18'})).toBeNull();
    expect(digestPublishedAt({publishedAt:'2026-11-18T13:20:00'})).toBeNull();
    expect(digestSnippet({title:'Morning News',source:'Publisher',summary:'<a>Morning News</a> Publisher'})).toBe('');
    expect(digestSnippet({title:'Morning News',summary:'Morning News',description:'A real summary of the stories in this edition.'})).toBe('A real summary of the stories in this edition.');
    expect(digestSnippet({summary:'The source supplies a shortened introduction...'})).toBe('The source supplies a shortened introduction…');
  });
  it('switches between source tabs by click and keyboard and displays ten stories per tab', () => {
    const cards = ['BBC', 'The Hindu', 'Times of Oman'].flatMap(source =>
      Array.from({ length: 10 }, (_, index) => ({
        slot: 'L' + (index + 1),
        canonicalId: source + index,
        canonicalUrl: 'https://example.com/' + encodeURIComponent(source) + '/' + index,
        title: source + ' story ' + index,
        source,
        sourceGroup: source,
        section: 'world',
      })));
    render(<DailyDigestSection cards={cards} deliveryMode="LIVE" availability="READY" />);

    expect(screen.getAllByRole('tab')).toHaveLength(3);
    expect(within(screen.getByRole('tabpanel')).getAllByRole('link')).toHaveLength(10);
    const hindu = screen.getByRole('tab', { name: /The Hindu/ });
    fireEvent.click(hindu);
    expect(hindu.getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('link', { name: /The Hindu story 0/ })).toBeTruthy();
    expect(screen.queryByRole('link', { name: /BBC story 0/ })).toBeNull();

    fireEvent.keyDown(hindu, { key: 'ArrowRight' });
    const oman = screen.getByRole('tab', { name: /Times of Oman/ });
    expect(document.activeElement).toBe(oman);
    expect(oman.getAttribute('aria-selected')).toBe('true');
    expect(within(screen.getByRole('tabpanel')).getAllByRole('link')).toHaveLength(10);
  });

  it('keeps the section visible before the 10:15 IST freeze', () => {
    render(
      <DailyDigestSection
        cards={[]}
        digestDate="2026-09-13"
        availability="NOT_FROZEN"
      />
    );

    expect(screen.getByText('Daily Digest')).toBeTruthy();
    expect(screen.getByText('Scheduled')).toBeTruthy();
    expect(screen.getByText('Today’s Daily Digest is scheduled')).toBeTruthy();
    expect(screen.getByText(/Publishes at 10:15 IST/i)).toBeTruthy();
    expect(screen.getByRole('status')).toBeTruthy();
  });

  it('shows a delayed state instead of scheduled after a missed freeze', () => {
    render(
      <DailyDigestSection
        cards={[]}
        digestDate="2026-09-13"
        availability="MISSED_FREEZE"
      />
    );

    expect(screen.getByText('Delayed')).toBeTruthy();
    expect(screen.getByText('Today’s Daily Digest is delayed')).toBeTruthy();
    expect(screen.getByText(/after the scheduled 10:15 IST freeze/i)).toBeTruthy();
    expect(screen.queryByText('Today’s Daily Digest is scheduled')).toBeNull();
  });

  it('does not mislabel an unconfigured backend as a pre-freeze state', () => {
    render(
      <DailyDigestSection
        cards={[]}
        digestDate="2026-09-13"
        availability="BACKEND_NOT_CONFIGURED"
      />
    );

    expect(screen.getByText('Daily Digest service unavailable')).toBeTruthy();
    expect(screen.getByText(/backend is not configured/i)).toBeTruthy();
    expect(screen.queryByText(/Publishes at 10:15 IST/i)).toBeNull();
  });

  it('preserves the publisher-card rendering contract after freeze', () => {
    render(
      <DailyDigestSection
        cards={[{
          slot: 'I1',
          canonicalId: 'akashvani-2026-09-13',
          publisherFamily: 'AKASHVANI',
          product: 'morning_news',
          title: 'Morning News',
          canonicalUrl: 'https://newsonair.gov.in/example',
        }]}
        digestDate="2026-09-13"
        frozenAt="2026-09-13T04:45:00.000Z"
        compositionState="DEGRADED_GLOBAL_UNAVAILABLE"
        availability="READY"
      />
    );

    expect(screen.getByRole('link', { name: /Morning News/i })).toBeTruthy();
    expect(screen.getByText('Publisher-curated')).toBeTruthy();
    expect(screen.getByText('(1)')).toBeTruthy();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('labels live fallback cards as auto-selected rather than publisher-curated', () => {
    render(
      <DailyDigestSection
        cards={[{
          slot: 'L1',
          canonicalId: 'live-1',
          source: 'BBC',
          sourceGroup: 'bbc',
          section: 'world',
          title: 'Live world headline',
          canonicalUrl: 'https://example.com/live-world',
          deliveryMode: 'LIVE',
        }]}
        digestDate="2026-10-18"
        compositionState="LIVE_SECTIONS_AUTHORITY"
        deliveryMode="LIVE"
        availability="READY"
      />
    );

    expect(screen.getByText('LIVE')).toBeTruthy();
    expect(screen.getByText('Live · Auto-selected')).toBeTruthy();
    expect(screen.getByText('BBC · World')).toBeTruthy();
    expect(screen.getByText('Live digest · current Sections authority')).toBeTruthy();
    expect(screen.queryByText('Publisher-curated')).toBeNull();
  });
});
