import { matchesEntertainmentGuard, geoScaleScore, DEFAULT_RANKING_POLICY } from '../config/rankingPolicy.js';

/**
 * Calculates a bounded impact score from geographic scale and magnitude.
 * Keyword matches are retained only as explainability evidence; a single word
 * must never create a direct multiplicative ranking boost.
 */
export function calculateImpactScore(title, description, settings) {
    void settings;
    const text = `${title} ${description}`;

    // 1. Scale Detection — uses policy geoScale lexicon.
    const scaleScore = geoScaleScore(text);

    // 2. Magnitude Detection (Population/Financial Impact).
    let magnitudeScore = 1.0;
    const textLow = text.toLowerCase();

    if (/\b(billions?|trillions?)\b/.test(textLow)) {
        magnitudeScore = 1.5;
    } else if (/\b(millions?|lakhs?|crores?)\b/.test(textLow)) {
        magnitudeScore = 1.3;
    } else if (/\b(thousands?|hundreds of thousands?)\b/.test(textLow)) {
        magnitudeScore = 1.1;
    }

    // 3. High-impact words are evidence only. Event qualification and Top
    // Stories eligibility are handled by the contextual Top Stories ranker.
    const decisions = [];
    const guarded = matchesEntertainmentGuard(text);

    for (const entry of DEFAULT_RANKING_POLICY.highImpactKeywords) {
        const term = (entry.term || '').toLowerCase();
        if (!term) continue;
        const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        if (!new RegExp(`\\b${escaped}\\b`, 'i').test(text)) continue;

        decisions.push(
            guarded
                ? `keyword '${term}' suppressed: entertainment guard`
                : `keyword evidence '${term}' (no direct multiplier)`
        );
        break;
    }

    calculateImpactScore._lastDecisions = [...new Set(decisions)];
    return scaleScore * magnitudeScore;
}
