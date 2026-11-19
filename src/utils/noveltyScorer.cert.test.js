import { describe, expect, it } from 'vitest';
import { calculateNoveltyScore, createNoveltyCorpus } from './noveltyScorer.js';

describe('novelty batch stability', () => {
    it('uses distinct rows once and returns identical scores after repeated or reversed passes', () => {
        const rows = [
            { url: 'https://example.org/a', title: 'Airport expansion opens today' },
            { url: 'https://example.org/b', title: 'Airport runway closes today' },
            { url: 'https://example.org/c', title: 'Airport workers strike today' },
        ];
        const corpus = createNoveltyCorpus([...rows, rows[0]]);
        expect(corpus.get('airport')).toBe(3);
        const score = row => calculateNoveltyScore(row.title, '', 'india', corpus);
        const baseline = rows.map(score);
        for (let i = 0; i < 4; i++) expect(rows.map(score)).toEqual(baseline);
        expect([...rows].reverse().map(score)).toEqual([...baseline].reverse());
        expect([...corpus]).toEqual([...createNoveltyCorpus(rows)]);
        const variants = [...rows, { ...rows[0], title: 'Airport expansion extended tonight' }];
        const first = createNoveltyCorpus(variants);
        const reversed = createNoveltyCorpus([...variants].reverse());
        expect(variants.map(row => calculateNoveltyScore(row.title, '', 'india', first)))
            .toEqual(variants.map(row => calculateNoveltyScore(row.title, '', 'india', reversed)));
    });
});
