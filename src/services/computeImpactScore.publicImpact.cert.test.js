import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { computeImpactScore } from './rssAggregator.js';
import { assessPublicImpact, calculateImpactScore } from '../utils/impactScorer.js';

const NOW = Date.parse('2026-11-14T17:01:00Z');
const SETTINGS = { enableNewScoring: true, rankingMode: 'smart' };

function score(title, section = 'india', description = '', ageHours = 1, source = 'The Hindu') {
    const item = {
        id: title,
        title,
        description,
        source,
        section,
        publishedAt: NOW - ageHours * 3_600_000,
    };
    item.impactScore = computeImpactScore(item, section, 0, SETTINGS);
    return item;
}

describe('regional ranking public consequences', () => {
    beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(NOW); });
    afterEach(() => vi.useRealTimers());

    it('ranks national trade and mass-casualty events ahead of a fresher isolated wildlife report', () => {
        const elephants = score('Two elephants found dead in Mysuru and Chamarajanagar districts', 'india', '', 0.1);
        const trade = score("Reaching Finishing Line: S Jaishankar On India-US Trade Deal Negotiations", 'india', 'The bulk of the issues were sorted out.', 4);
        const crash = score('Assam CM says minibus driver may have suffered heart attack before collision; toll rises to 26', 'india', 'Families of the deceased will receive compensation.', 4);
        expect(trade.impactScore).toBeGreaterThan(elephants.impactScore);
        expect(crash.impactScore).toBeGreaterThan(elephants.impactScore);
        expect(elephants._scoreBreakdown.severity).toBe(1);
        expect(elephants._publicImpact.priority).toBe(0);
    });

    it.each([
        'Three deer found dead near a forest village',
        'Tiger carcass discovered in district forest, officials investigate death',
        'Two endangered elephants die near Mysuru',
    ])('applies the same limited-impact reasoning to wildlife variants: %s', title => {
        const item = score(title);
        expect(item._publicImpact.incidentalAnimalMortality).toBe(true);
        expect(item._publicImpact.priority).toBe(0);
        expect(item._scoreBreakdown.severity).toBe(1);
        expect(item.impactScore).toBeGreaterThan(0);
    });

    it.each([
        ['Mass elephant deaths across three states spark national conservation crisis', 'conservation'],
        ['Supreme Court orders conservation law review after mass tiger deaths', 'conservation'],
        ['Wild elephant kills two villagers near Mysuru', 'public_safety'],
        ['Elephant kills man in Mysuru, animal later found dead', 'public_safety'],
        ['Tiger shot dead after killing woman in village', 'public_safety'],
        ['Elephant tramples two women before being shot dead', 'public_safety'],
        ['Tiger killed after attacking men outside village', 'public_safety'],
        ['Elephants found dead as toxic water contamination threatens village drinking water', 'civic_alert'],
    ])('preserves substantive conservation or public-safety coverage: %s', (title, kind) => {
        const item = score(title);
        expect(item._publicImpact.incidentalAnimalMortality).toBe(false);
        expect(item._publicImpact.priority).toBeGreaterThanOrEqual(2);
        expect(item._publicImpact.kind).toBe(kind);
        expect(item.impactScore).toBeGreaterThan(score('Two elephants found dead in district forests').impactScore);
    });

    it('puts older statewide emergency and household policy above fresh ceremonies and maintenance', () => {
        const routine = [
            score('Metrowater inspects RWH structures across Chennai', 'chennai', '', 0.1),
            score('Children’s Day celebrated at Govt. Stanley Hospital', 'chennai', '', 0.1),
            score('Tamil Nadu CM launches cakes, greeting cards and sweet pongal for Children’s Day', 'chennai', '', 0.1),
            score('Kattankulathur FOB needs a spruce-up', 'chennai', 'Maintenance sought for the footbridge on GST Road.', 0.1),
        ];
        const emergency = score('Bay of Bengal low-pressure system likely to intensify into cyclone; Tamil Nadu braces for rain', 'chennai', '', 4);
        const policy = score('Tamil Nadu government imposes stock limits on paddy, rice and pulses; excess stocks must be cleared by November 16', 'chennai', '', 4);
        for (const low of routine) {
            expect(emergency.impactScore, low.title).toBeGreaterThan(low.impactScore);
            expect(policy.impactScore, low.title).toBeGreaterThan(low.impactScore);
        }
        expect(emergency._publicImpact.priority).toBe(3);
        expect(policy._publicImpact.priority).toBe(3);
    });

    it('retains actionable local civic hazards and public accountability', () => {
        const drain = score('Watch out for this open SWD near MEPZ', 'chennai', 'A broken stormwater drain outside the bus terminus poses a hazard to commuters.');
        const waste = score('Heaps of biomedical waste dumped along Adyar river in Chennai', 'chennai');
        const corruption = score('CBI files cases over railway project irregularities', 'chennai', 'Probe into public funds and procurement.');
        for (const item of [drain, waste, corruption]) {
            expect(item._publicImpact.priority).toBeGreaterThanOrEqual(2);
            expect(item.impactScore).toBeGreaterThan(score('Programme held to celebrate mothers', 'chennai').impactScore);
        }
    });

    it.each([
        ['Delhi air quality turns severe as schools close', 'public_health'],
        ['India launches nationwide vaccination drive', 'public_health'],
        ['Terror attack kills two police officers in Jammu and Kashmir', 'public_security'],
    ])('prioritizes corroborated public health and security events: %s', (title, kind) => {
        const item = score(title, 'india', '', 4);
        expect(item._publicImpact.priority).toBe(3);
        expect(item._publicImpact.kind).toBe(kind);
        expect(item._publicImpact.evidence.length).toBeGreaterThan(0);
        expect(item.impactScore).toBeGreaterThan(score('Two elephants found dead in district forests', 'india', '', 0.1).impactScore);
    });

    it.each([
        'New movie depicts terror attack that kills two police officers',
        'Official trailer: terror attack kills two police officers in fictional thriller',
        'Annual vaccination awareness feature explains the history of nationwide campaigns',
        'India launches nationwide vaccination awareness programme with poster exhibition',
        'Delhi air quality monitoring equipment displayed at annual exhibition',
        'Conference discusses terrorism and security in Jammu and Kashmir',
    ])('requires real hazard, response, or vaccination delivery rather than keywords: %s', title => {
        expect(assessPublicImpact(title).priority).toBeLessThan(2);
    });

    it('does not turn metaphorical war or a familiar place name into public importance', () => {
        const feature = score('Deepavali diary: Escape to Tada and return to a war zone', 'chennai');
        const familiarPlace = score('New paintings on show in Chennai', 'chennai');
        expect(feature._publicImpact.priority).toBe(0);
        expect(feature._scoreBreakdown.severity).toBe(1);
        expect(familiarPlace._publicImpact.priority).toBe(0);
        expect(familiarPlace._scoreBreakdown.proximity).toBeLessThanOrEqual(1.3);
    });

    it('qualifies policy by action and domain, rather than election or minister keywords', () => {
        expect(assessPublicImpact('Minister mourns actor after hospital visit').priority).toBe(0);
        expect(assessPublicImpact('Minister visits Chennai school').priority).toBe(0);
        expect(assessPublicImpact('Over 74 lakh voters missing from Tamil Nadu electoral rolls').priority).toBe(3);
        expect(assessPublicImpact('Government amends order on polytechnic education').priority).toBe(2);
    });

    it('uses the requested regional feed even for a reclassified entertainment item', () => {
        const item = { id: 'ceremony', title: 'Children’s Day celebrated at hospital', source: 'The Hindu', publishedAt: NOW - 3_600_000 };
        computeImpactScore(item, 'entertainment', 0, SETTINGS, 'chennai');
        expect(item._publicImpact.priority).toBe(0);
        expect(item._scoreBreakdown.publicImpact).toBe(0.6);
    });

    it('replaces decisions when cached items are rescored', () => {
        const item = score('Two elephants found dead in district forest');
        const first = [...item._scoreBreakdown.decisions];
        computeImpactScore(item, 'india', 0, SETTINGS);
        expect(item._scoreBreakdown.decisions).toEqual(first);
    });

    it('matches geographic scale by tokens and ignores HTML attributes', () => {
        expect(calculateImpactScore('Elephants found dead near municipal stadium', '', {})).toBe(1);
        expect(calculateImpactScore('Community reading programme', '<a href="https://example.com/international">Read more</a>', {})).toBe(1);
        expect(calculateImpactScore('UN announces global humanitarian response', '', {})).toBe(1.5);
    });
});
