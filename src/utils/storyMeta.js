const SOURCE_OVERRIDES = [
    { match: /al jazeera/i, label: 'Al Jazeera' },
    { match: /the hollywood reporter/i, label: 'Hollywood' },
    { match: /hollywood reporter/i, label: 'Hollywood' },
    { match: /times of india|\btoi\b/i, label: 'TOI' },
    { match: /the hindu/i, label: 'Hindu' },
    { match: /india today/i, label: 'India Today' },
    { match: /oman observer/i, label: 'Observer' },
    { match: /moneycontrol/i, label: 'Moneycontrol' },
    { match: /reuters/i, label: 'Reuters' },
    { match: /bbc/i, label: 'BBC' },
    { match: /ndtv/i, label: 'NDTV' },
    { match: /variety/i, label: 'Variety' },
    { match: /deadline/i, label: 'Deadline' },
    { match: /behindwoods/i, label: 'Behindwoods' },
    { match: /filmibeat/i, label: 'Filmibeat' },
    { match: /hindustan times/i, label: 'HT' },
    { match: /the news minute/i, label: 'TNM' }
];

export function shortenSourceLabel(source) {
    if (!source) return 'Source';

    const cleaned = String(source)
        .replace(/\s*[-\u2013\u2014].*$/, '')
        .replace(/\s*-\s*breaking news.*$/i, '')
        .trim();

    for (const override of SOURCE_OVERRIDES) {
        if (override.match.test(cleaned)) {
            return override.label;
        }
    }

    const words = cleaned.split(/\s+/).filter(Boolean);
    if (words.length <= 2) {
        return cleaned;
    }

    return words.slice(0, 2).join(' ');
}

export function getStoryUrl(item) {
    return item?.url || item?.link || item?.sourceUrl || item?.sourceLink || '';
}

function appendTopStoryBreakdown(lines, rank = {}) {
    const f = (value, digits = 2) => Number(value ?? 0).toFixed(digits);
    lines.push('');
    lines.push('Top Stories Diagnostics');
    lines.push('Contract: _topStoryRank');
    lines.push(`Top Stories Score: ${f(rank.normalizedScore)}`);
    lines.push(`Raw Weighted Score: ${f(rank.score)}`);
    lines.push(`Event: ${rank.eventType || 'unknown'}`);
    lines.push(`Context Qualified: ${rank.eventQualified !== false ? 'Yes' : 'No'}`);
    lines.push(`Slot Band: ${rank.slotBand || 'unknown'}`);
    lines.push(`Admission: ${rank.admissionReason || 'unknown'}`);
    lines.push(`Timestamp Confidence: ${rank.timestampConfidence || 'unknown'}`);
    lines.push(`Age Hours: ${f(rank.ageHours)}`);
    lines.push(`Freshness: ${f(rank.freshnessScore)}`);
    lines.push(`Public Interest: ${f(rank.publicInterestScore)}`);
    lines.push(`Consensus: ${f(rank.consensusScore)} (${Number(rank.sourceCount || 0)} source${Number(rank.sourceCount || 0) === 1 ? '' : 's'})`);
    lines.push(`Top Feed Membership Hits: ${f(rank.topFeedHits)}`);
    lines.push(`Top Feed Corroboration Hits: ${f(rank.topFeedCorroborationHits)}`);
    lines.push(`Independent Evidence: ${f(rank.independentEvidenceCount)}`);
    lines.push(`Penalties: ${f(rank.penalties, 1)}`);
    if (rank.explanation) lines.push(`Why this rank: ${rank.explanation}`);
}

function appendLegacyBreakdown(lines, item, breakdown, { referenceOnly = false } = {}) {
    const f = (value, digits = 2) => Number(value ?? 0).toFixed(digits);
    lines.push('');
    if (referenceOnly) lines.push('Legacy Section Score — reference only');
    lines.push(`Ranking Score: ${f(item.impactScore)}`);
    lines.push('Formula: (freshness + keyword + sentiment) x sourceMult x [impact*severity*novelty*visual*humanInterest] x section x breaking x live x seen');
    lines.push(`Freshness: ${f(breakdown.freshness)}`);
    lines.push(`Source Tier: ${f(breakdown.sourceScore)} (cat ${f(breakdown.categoryWeight)})`);
    lines.push(`Impact/Geo: ${f(breakdown.impact)}`);
    lines.push(`Severity: ${f(breakdown.severity, 2)}`);
    lines.push(`Novelty: ${f(breakdown.novelty)}  Visual: ${f(breakdown.visual)}  HumanInterest: ${f(breakdown.humanInterest)}`);
    lines.push(`Section x: ${f(breakdown.sectionPriority)}  Breaking x: ${f(breakdown.breakingBoost)}  Live x: ${f(breakdown.liveBoost)}  Seen x: ${f(breakdown.seenPenalty)}`);
    const decisions = [...new Set(Array.isArray(breakdown.decisions) ? breakdown.decisions : [])];
    if (decisions.length) {
        lines.push('');
        lines.push('Why this rank:');
        decisions.forEach(decision => lines.push(`• ${decision}`));
    }
}

function appendMissingTopStoryRank(lines, item) {
    lines.push('');
    lines.push('Top Stories Diagnostics');
    lines.push('Status: unavailable');
    lines.push('Reason: authoritative _topStoryRank is missing');
    if (item?._scoreBreakdown) {
        appendLegacyBreakdown(lines, item, item._scoreBreakdown, { referenceOnly: true });
    }
}

export function buildStoryInfoText(
    item,
    { includeScoreBreakdown = false, expectTopStoryRank = false } = {}
) {
    const storyUrl = getStoryUrl(item);
    const lines = [];

    if (item?.source) lines.push(`Source: ${shortenSourceLabel(item.source)}`);
    if (storyUrl) lines.push(`Source Link: ${storyUrl}`);
    if (item?.headline || item?.title) lines.push(`Story: ${item.headline || item.title}`);

    if (includeScoreBreakdown && item?._topStoryRank) {
        appendTopStoryBreakdown(lines, item._topStoryRank);
    } else if (expectTopStoryRank) {
        appendMissingTopStoryRank(lines, item);
    } else if (includeScoreBreakdown && item?._scoreBreakdown) {
        appendLegacyBreakdown(lines, item, item._scoreBreakdown);
    }

    return lines.join('\n');
}
