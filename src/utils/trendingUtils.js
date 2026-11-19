import { temporalScore } from '../services/temporalScorer.js';
import { assessPublicImpact } from './impactScorer.js';
import { getTopStoriesPolicy } from '../services/topStories/topStoriesPolicy.js';
import { getCorroborationParts, isTopStoryTimeEligible } from '../services/topStories/topStoriesSignals.js';

export function computeTrending(item, policy, now = Date.now()) {
    const admissionPolicy = getTopStoriesPolicy();
    if (item.isBreaking || !isTopStoryTimeEligible(item, now, admissionPolicy)) return false;
    const evidence = getCorroborationParts(item, { nowMs: now }, admissionPolicy);
    if (evidence.sourceCount < policy.trending.minSourceCount) return false;
    const impact = assessPublicImpact(item.title, item.description || item.summary).priority;
    // Keep the configured 0–30 threshold on a provider-independent impact scale.
    const score = temporalScore(impact * 10, item.publishedAt, now, policy.freshness.halfLifeHours);
    return score > policy.trending.minDecayedScore;
}
