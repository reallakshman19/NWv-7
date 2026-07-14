import React, { useMemo, useState } from 'react';
import { addReadArticle, getSettings } from '../utils/storage';
import { useNews } from '../context/NewsContext';
import ProgressBar from './ProgressBar';
import SectionHealthBadge from './SectionHealthBadge.jsx';
import SectionHealthPopover from './SectionHealthPopover.jsx';
import { buildStoryInfoText, getStoryUrl, shortenSourceLabel } from '../utils/storyMeta';
import { sanitizeHtmlText } from '../utils/htmlText.js';
import { getRankingPolicy } from '../config/rankingPolicy.js';
import { computeTrending } from '../utils/trendingUtils.js';
import { resolveSectionHealthSummary } from '../services/runtimeSectionHealthFallback.js';

const AREA_RELEVANCE_LABEL_GUIDANCE = {
    'exact-area': 'strong local/area evidence',
    city: 'city-level evidence',
    'state-region': 'state/governorate-level backfill',
    country: 'country-level backfill',
    backfill: 'weak regional fallback',
    weak: 'insufficient local evidence',
    'off-area': 'likely wrong-area story',
};

function formatAreaRelevanceList(value) {
    if (!Array.isArray(value)) return 'None';

    const clean = value
        .map(item => String(item || '').trim())
        .filter(Boolean);

    return clean.length > 0 ? clean.join(', ') : 'None';
}

function humanizeAreaRelevanceReason(value) {
    return String(value || '')
        .replace(/[_-]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function buildAreaRelevanceInfoText(areaRelevance) {
    if (!areaRelevance || typeof areaRelevance !== 'object') return '';

    const label = String(areaRelevance.label || 'unknown');
    const labelGuide = AREA_RELEVANCE_LABEL_GUIDANCE[label];
    const score = Number.isFinite(Number(areaRelevance.score))
        ? Number(areaRelevance.score)
        : 0;
    const reasons = Array.isArray(areaRelevance.reasons)
        ? areaRelevance.reasons.map(humanizeAreaRelevanceReason).filter(Boolean)
        : [];

    return [
        'Area Relevance',
        `Target: ${areaRelevance.target || 'unknown'}`,
        `Label: ${labelGuide ? `${label} — ${labelGuide}` : label}`,
        `Score: ${score}`,
        `Matched Terms: ${formatAreaRelevanceList(areaRelevance.matchedTerms)}`,
        `Matched Fields: ${formatAreaRelevanceList(areaRelevance.matchedFields)}`,
        `Source Evidence: ${formatAreaRelevanceList(areaRelevance.sourceEvidence)}`,
        `Reasons: ${reasons.length > 0 ? reasons.join(', ') : 'None'}`,
        `Version: ${areaRelevance.version || 'unknown'}`,
    ].join('\n');
}

function getCardRating(item, isTopStories) {
    if (isTopStories) {
        const rawScore = Number(item?._topStoryRank?.normalizedScore);
        if (!Number.isFinite(rawScore)) {
            return {
                stars: 0,
                label: 'Top Stories score unavailable; 0 of 5 stars',
            };
        }

        const score = Math.min(1, Math.max(0, rawScore));
        const stars = score >= 0.8 ? 5
            : score >= 0.65 ? 4
                : score >= 0.5 ? 3
                    : score >= 0.33 ? 2
                        : score > 0 ? 1 : 0;
        return {
            stars,
            label: `Top Stories score ${score.toFixed(2)} of 1; ${stars} of 5 stars`,
        };
    }

    const impactScore = Number(item?.impactScore || 0);
    const stars = impactScore >= 18 ? 5
        : impactScore >= 12 ? 4
            : impactScore >= 7 ? 3
                : impactScore >= 3 ? 2 : 1;
    return {
        stars,
        label: `Impact score ${impactScore.toFixed(2)}; ${stars} of 5 stars`,
    };
}

/**
 * News Section Component
 * Displays news items for a specific region (World/India/Chennai/Trichy/Local/Entertainment)
 * Features:
 * - Clickable headlines open story URL
 * - Critics/public view shown where applicable
 * - Source count displayed
 * - Collapsible header
 */
function NewsSection({
    id,
    title,
    icon,
    colorClass,
    news = [],
    maxDisplay = 3,
    showExpand = true,
    error = null,
    extraContent = null,
    onArticleClick = null,
    showCritics = true,
    loading = false,
    healthSummary = null
}) {
    const [expanded, setExpanded] = useState(false);
    const [isCollapsed, setIsCollapsed] = useState(false);
    const [infoText, setInfoText] = useState('');
    const [showHealthPopover, setShowHealthPopover] = useState(false);
    const { auditResults } = useNews();
    const effectiveHealthSummary = useMemo(() => resolveSectionHealthSummary({
        healthSummary,
        sectionId: id,
        stories: news,
    }), [healthSummary, id, news]);

    const settings = getSettings();
    const rankingPolicy = getRankingPolicy(settings);

    const displayCount = expanded ? news.length : Math.min(maxDisplay, news.length);
    const displayNews = news.slice(0, displayCount);
    const hasMore = news.length > maxDisplay;
    const healthStatus = effectiveHealthSummary?.status || 'unknown';
    const isTopStories = title === 'Top Stories';

    const getTimeAgo = (timestamp) => {
        if (!timestamp) return '';
        // eslint-disable-next-line react-hooks/purity
        const seconds = Math.floor((Date.now() - timestamp) / 1000);
        let interval = seconds / 31536000;
        if (interval > 1) return Math.floor(interval) + 'y';
        interval = seconds / 2592000;
        if (interval > 1) return Math.floor(interval) + 'mo';
        interval = seconds / 86400;
        if (interval > 1) return Math.floor(interval) + 'd';
        interval = seconds / 3600;
        if (interval > 1) return Math.floor(interval) + 'h';
        interval = seconds / 60;
        if (interval > 1) return Math.floor(interval) + 'm';
        return 'Now';
    };

    const handleInfoClick = (item, options = {}) => {
        const baseInfo = buildStoryInfoText(item, options) || 'No source link available.';
        const areaInfo = buildAreaRelevanceInfoText(item?._areaRelevance);
        setInfoText([baseInfo, areaInfo].filter(Boolean).join('\n\n'));
    };

    const handleHealthClick = (event) => {
        event.stopPropagation();
        setShowHealthPopover(value => !value);
    };

    const handleStoryClick = (item) => {
        // Track history
        addReadArticle(item);

        // External handler
        if (onArticleClick) {
            onArticleClick(item);
        }

        const storyUrl = getStoryUrl(item);
        if (storyUrl) {
            window.open(storyUrl, '_blank', 'noopener,noreferrer');
        }
    };

    const renderContent = () => {
        if (error) {
            return (
                <div className="empty-state" style={{ borderColor: 'rgba(255, 87, 87, 0.3)' }}>
                    <div className="empty-state__icon">✖</div>
                    <p style={{ color: '#ff5757' }}>{error}</p>
                </div>
            );
        }

        if (loading) {
            return <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)' }}>Loading stories...</div>;
        }

        if (news.length === 0) {
            return (
                <div className="empty-state">
                    <div className="empty-state__icon">📰</div>
                    <p>No news available for this section</p>
                </div>
            );
        }

        return (
            <>
                {extraContent}
                <div className="news-list-modern">
                    {displayNews.map((item, idx) => {
                        const storyUrl = getStoryUrl(item);
                        const sourceLabel = shortenSourceLabel(item.source);
                        const rating = getCardRating(item, isTopStories);

                        return (
                            <article
                                key={item.id || idx}
                                className={`modern-news-card ${item.imageUrl ? 'modern-news-card--with-image' : ''}`}
                                onClick={() => handleStoryClick(item)}
                                style={{ cursor: storyUrl ? 'pointer' : 'default' }}
                            >
                                <div className="mnc-header">
                                    <span className="mnc-source" title={item.source}>{sourceLabel}</span>
                                    <span className="mnc-stars" aria-label={rating.label} title={rating.label}>
                                        {'★'.repeat(rating.stars) + '☆'.repeat(5 - rating.stars)}
                                    </span>
                                    {item.sourceCount > 1 && (
                                        <span className="mnc-badge mnc-badge--consensus">#{item.sourceCount} Sources</span>
                                    )}
                                    <span className="mnc-time">{getTimeAgo(item.publishedAt) || item.time}</span>
                                    <button
                                        type="button"
                                        className="info-icon info-icon--story"
                                        title="Story info"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleInfoClick(item, {
                                                includeScoreBreakdown: isTopStories,
                                                expectTopStoryRank: isTopStories,
                                            });
                                        }}
                                    >ⓘ</button>
                                </div>

                                <h3 className="mnc-headline">
                                    {sanitizeHtmlText(item.headline || item.title)}
                                </h3>

                                {item.imageUrl && (
                                    <img
                                        src={item.imageUrl}
                                        alt={sanitizeHtmlText(item.headline || item.title)}
                                        className="mnc-image"
                                        loading="lazy"
                                        referrerPolicy="no-referrer"
                                        onError={(e) => {
                                            e.currentTarget.style.display = 'none';
                                            e.currentTarget.closest('.modern-news-card')?.classList.remove('modern-news-card--with-image');
                                        }}
                                    />
                                )}

                                {item.summary && (
                                    <p className="mnc-summary">
                                        {sanitizeHtmlText(item.summary, { maxLength: 200 })}
                                    </p>
                                )}

                                {/* Badges Row */}
                                <div className="mnc-badges">
                                    {item.isBreaking && <span className="mnc-badge mnc-badge--breaking">⚡ Breaking</span>}
                                    {computeTrending(item, rankingPolicy) && <span className="mnc-badge mnc-badge--trending">🔥 Trending</span>}

                                    {item.sourceCount > 1 && (
                                        <span className="mnc-badge mnc-badge--consensus">
                                            🔔 {item.sourceCount} sources
                                        </span>
                                    )}

                                    {item.sentiment && (
                                        <span className={`mnc-badge mnc-badge--sentiment-${item.sentiment.label}`}>
                                            {item.sentiment.label === 'positive' ? 'Positive' :
                                                item.sentiment.label === 'negative' ? 'Negative' : 'Neutral'}
                                        </span>
                                    )}
                                </div>

                                {showCritics && item.criticsView && (
                                    <div className="mnc-critics">
                                        <strong>Critics Take:</strong> {item.criticsView}
                                    </div>
                                )}

                                {auditResults[item.id] && (
                                    <div className="mnc-audit-row">
                                        {auditResults[item.id].consensus?.badge && <span>{auditResults[item.id].consensus.badge}</span>}
                                        {auditResults[item.id].breakingVerified && <span>{auditResults[item.id].breakingVerified}</span>}
                                    </div>
                                )}
                            </article>
                        );
                    })}
                </div>

                {showExpand && hasMore && (
                    <div
                        className="news-more-modern"
                        onClick={() => setExpanded(!expanded)}
                    >
                        <span>{expanded ? 'Collapse' : `Show ${news.length - maxDisplay} more`}</span>
                        <span style={{ fontSize: '1.2rem' }}>{expanded ? '▲' : '▼'}</span>
                    </div>
                )}
            </>
        );
    };

    return (
        <section className="news-section" id={id}>
            <h2
                className={`news-section__title ${colorClass}`}
                onClick={() => setIsCollapsed(!isCollapsed)}
                style={{ cursor: 'pointer' }}
                title={`Tap to fold/unfold. Health: ${healthStatus.toUpperCase()}`}
            >
                <div className="news-title-left">
                    <span className="news-icon">{icon}</span>
                    <span className="news-text">{title}</span>
                    {isTopStories && (
                        <span
                            className="info-icon"
                            title="Ranked by context-qualified public interest, freshness, independent corroboration, source quality, location relevance, and diversity."
                            onClick={(e) => {
                                e.stopPropagation();
                                setInfoText('Top Stories Ranking Logic:\n\n1. Context-qualified public-interest events are prioritised.\n2. Freshness and timestamp confidence are enforced.\n3. Independent corroboration and trusted top-feed evidence are rewarded.\n4. Source quality, location relevance, penalties, and diversity are applied.');
                            }}
                            style={{ cursor: 'help', fontSize: '0.8em', marginLeft: '5px', opacity: 0.7 }}
                        >
                            ⓘ
                        </span>
                    )}
                </div>

                <div className="news-title-right">
                    <SectionHealthBadge summary={effectiveHealthSummary} onClick={handleHealthClick} />

                    {news.length > 0 && (
                        <span className="news-count">({news.length})</span>
                    )}

                    {/* Collapse Indicator */}
                    <span className="collapse-arrow">
                        {isCollapsed ? '▼' : '▲'}
                    </span>
                </div>
            </h2>

            {showHealthPopover && (
                <SectionHealthPopover
                    summary={effectiveHealthSummary}
                    onClose={() => setShowHealthPopover(false)}
                />
            )}

            <ProgressBar active={loading} />

            {!isCollapsed && renderContent()}
            {infoText && (
                <div className="news-info-modal" role="dialog" aria-modal="true" onClick={() => setInfoText('')}>
                    <div className="news-info-modal__content" onClick={(e) => e.stopPropagation()}>
                        <div className="news-info-modal__header">
                            <span className="nim-title">📊 Story Intelligence</span>
                            <button type="button" className="nim-close-btn" onClick={() => setInfoText('')} aria-label="Close dialog">×</button>
                        </div>
                        <div className="news-info-modal__body">
                            {(() => {
                                return infoText.split('\n').map((line, index) => {
                                    if (!line.trim()) return <div key={index} className="nim-separator" />;

                                    const sepIdx = line.indexOf(':');
                                    if (sepIdx === -1) {
                                        return <p key={index} className="nim-text-line">{line}</p>;
                                    }

                                    const key = line.slice(0, sepIdx).trim();
                                    const value = line.slice(sepIdx + 1).trim();

                                    if (value.startsWith('http')) {
                                        return (
                                            <div key={index} className="nim-row">
                                                <span className="nim-key">{key}</span>
                                                <a href={value} target="_blank" rel="noopener noreferrer" className="nim-link" title={value}>
                                                    Link ↗
                                                </a>
                                            </div>
                                        );
                                    }

                                    return (
                                        <div key={index} className="nim-row">
                                            <span className="nim-key">{key}</span>
                                            <span className="nim-val">{value}</span>
                                        </div>
                                    );
                                });
                            })()}
                        </div>
                    </div>
                </div>
            )}
        </section>
    );
}

export default React.memo(NewsSection);
