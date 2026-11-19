import { describe, expect, it } from 'vitest';
import fixtures from './relativeDates.fixture.json';
import { analyzeDateText } from './dateAware.js';
import { buildCanonicalItem } from './canonicalItemBuilder.js';

describe('event date evidence', () => {
    it.each(fixtures)('$text from $publishedAt at $location gives $day', ({ text, publishedAt, location, day }) => {
        const analysis = analyzeDateText(text, { publishDate: publishedAt, locationCanonical: location });
        expect(analysis.eventDateKey ?? null).toBe(day);
        if (!day) expect(analysis.routeHint).toBe('drop');
    });

    it('routes newly parsed events by the venue calendar and keeps undated input undated', () => {
        const raw = { title: 'Chennai concert tomorrow', publishedAt: '2026-11-14T18:30:00Z' };
        const options = { asOfDate: '2026-11-15', selectedCities: ['Chennai'] };
        expect(buildCanonicalItem(raw, options).eventDateKey).toBe('2026-11-16');
        expect(buildCanonicalItem({ ...raw, publishedAt: null }, options).eventDateKey).toBeNull();
    });
});
