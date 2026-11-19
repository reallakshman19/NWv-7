import React, { useId, useState } from 'react';
import { digestPublishedAt, digestSnippet } from '../utils/digestCardContent.js';

const PUBLISHER_LABELS = Object.freeze({
  AKASHVANI: 'Akashvani',
  INDIAN_EXPRESS: 'Indian Express',
  THE_HINDU: 'The Hindu',
  FINANCIAL_TIMES: 'Financial Times',
});

const EMPTY_STATE_COPY = Object.freeze({
  NOT_FROZEN: Object.freeze({
    badge: 'Scheduled',
    title: 'Today’s Daily Digest is scheduled',
    message: 'Publishes at 10:15 IST after the publisher snapshot freezes.',
  }),
  MISSED_FREEZE: Object.freeze({
    badge: 'Delayed',
    title: 'Today’s Daily Digest is delayed',
    message: 'No publisher snapshot was available after the scheduled 10:15 IST freeze. Try refreshing shortly.',
  }),
  BACKEND_NOT_CONFIGURED: Object.freeze({
    badge: 'Unavailable',
    title: 'Daily Digest service unavailable',
    message: 'The Daily Digest backend is not configured for this deployment.',
  }),
  SECTIONS_UNAVAILABLE: Object.freeze({
    badge: 'Unavailable',
    title: 'Daily Digest could not load current stories',
    message: 'The current news snapshot could not be loaded. Retry to check again.',
  }),
  EMPTY: Object.freeze({
    badge: 'Empty',
    title: 'No Daily Digest cards available',
    message: 'Today’s snapshot contains no valid publisher cards.',
  }),
});

function publisherLabel(value) {
  return PUBLISHER_LABELS[value] || String(value || '').replaceAll('_', ' ');
}

function productLabel(card) {
  const product = String(card?.product || '').replaceAll('_', ' ').toLowerCase();
  if (!product) return publisherLabel(card?.publisherFamily);
  return `${publisherLabel(card?.publisherFamily)} · ${product.replace(/\b\w/g, char => char.toUpperCase())}`;
}

function sectionLabel(value) {
  const labels = {
    topStories: 'Top Stories',
    india: 'India',
    world: 'World',
    business: 'Business',
    technology: 'Technology',
    tn: 'Tamil Nadu',
    muscat: 'Muscat',
    sports: 'Sports',
    entertainment: 'Entertainment',
  };
  return labels[value] || String(value || '').replaceAll('_', ' ');
}

function isAutoSelectedCard(card, deliveryMode) {
  return ['LIVE', 'SNAPSHOT'].includes(deliveryMode) || ['LIVE', 'SNAPSHOT'].includes(card?.deliveryMode);
}

function cardSourceLabel(card, deliveryMode) {
  if (!isAutoSelectedCard(card, deliveryMode)) return productLabel(card);
  const source = String(card?.source || card?.sourceGroup || 'Sections authority').trim();
  const section = sectionLabel(card?.section);
  return section ? `${source} · ${section}` : source;
}

function freezeLabel(value) {
  if (!value) return '';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: true,
  }).format(date);
}

function DigestStoryDetails({ card }) {
  const publishedAt = digestPublishedAt(card);
  const snippet = digestSnippet(card);
  const date = publishedAt ? new Date(publishedAt) : null;
  const published = date ? new Intl.DateTimeFormat('en-IN', {
    day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
  }).format(date) : null;
  return <>
    <div className="daily-digest-published">
      {date ? <time dateTime={date.toISOString()} title={date.toLocaleString('en-IN', {
        year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'long',
      })}>Published {published}</time> : <span>Publication time unavailable</span>}
    </div>
    {snippet && <p className="daily-digest-snippet">{snippet}</p>}
  </>;
}

function compositionLabel(value, deliveryMode) {
  if (deliveryMode === 'SNAPSHOT' || value === 'PUBLISHED_SECTIONS_AUTHORITY') return 'Digest · published snapshot';
  if (deliveryMode === 'LIVE' || value === 'LIVE_SECTIONS_AUTHORITY') {
    return 'Live digest · current Sections authority';
  }
  if (value === 'DEGRADED_GLOBAL_UNAVAILABLE') return 'India edition · global slot unavailable';
  if (value === 'DEGRADED_INDIA_AND_GLOBAL_SHORTFALL') return 'Reduced edition';
  if (value === 'NORMAL') return 'India + global edition';
  return 'Publisher-curated edition';
}

function emptyStateCopy({ availability, loading, error }) {
  if (loading) {
    return {
      badge: 'Loading',
      title: 'Checking today’s Daily Digest',
      message: 'Loading the shared publisher snapshot.',
    };
  }
  if (EMPTY_STATE_COPY[availability]) return EMPTY_STATE_COPY[availability];
  if (error || (availability && availability !== 'UNKNOWN')) {
    return {
      badge: 'Unavailable',
      title: 'Daily Digest temporarily unavailable',
      message: 'Today’s publisher snapshot could not be loaded. Try refreshing shortly.',
    };
  }
  return {
    badge: 'Pending',
    title: 'Daily Digest is preparing',
    message: 'Checking availability for today’s publisher-curated edition.',
  };
}

function groupDigestCards(cards, deliveryMode) {
  const groups = new Map();
  for (const card of cards) {
    const live = isAutoSelectedCard(card, deliveryMode);
    const source = String(card.source || card.sourceGroup || 'Sections authority').trim();
    const key = live ? card.sourceGroup || source : card.publisherFamily || 'curated';
    const label = live ? source : publisherLabel(card.publisherFamily) || 'Publisher';
    if (!groups.has(key)) groups.set(key, { key, label, cards: [] });
    const group = groups.get(key);
    if (live && label.length < group.label.length) group.label = label;
    group.cards.push(card);
  }
  return [...groups.values()];
}

export function DailyDigestSection({
  cards = [],
  digestDate,
  frozenAt,
  compositionState,
  deliveryMode = null,
  availability = 'UNKNOWN',
  loading = false,
  error = null,
  onRefresh,
}) {
  const frozen = freezeLabel(frozenAt);
  const status = cards.length ? null : emptyStateCopy({ availability, loading, error });
  const sourceTabs = groupDigestCards(cards, deliveryMode);
  const [selectedSource, setSelectedSource] = useState(null);
  const activeIndex = Math.max(0, sourceTabs.findIndex(tab => tab.key === selectedSource));
  const activeSource = sourceTabs[activeIndex];
  const tabsId = useId();
  const panelId = tabsId + '-panel';

  function handleTabKey(event, index) {
    const count = sourceTabs.length;
    const nextIndex = {
      ArrowLeft: (index + count - 1) % count,
      ArrowRight: (index + 1) % count,
      Home: 0,
      End: count - 1,
    }[event.key];
    if (!Number.isInteger(nextIndex)) return;
    event.preventDefault();
    setSelectedSource(sourceTabs[nextIndex].key);
    event.currentTarget.parentElement.children[nextIndex].focus();
  }

  return (
    <section className="news-section" id="daily-digest" data-availability={availability}>
      <h2 className="news-section__title news-section__title--india">
        <div className="news-title-left">
          <span className="news-icon">🗞️</span>
          <span className="news-text">Daily Digest</span>
        </div>
        <div className="news-title-right">
          {cards.length > 0 ? (
            <>
              {deliveryMode === 'LIVE' && <span className="mnc-badge">LIVE</span>}
              {deliveryMode === 'SNAPSHOT' && <span className="mnc-badge">SNAPSHOT</span>}
              <span className="news-count">({cards.length})</span>
            </>
          ) : (
            <span className="mnc-badge">{status.badge}</span>
          )}
        </div>
      </h2>

      {cards.length > 0 ? (
        <>
          <div className="daily-digest-tabs" role="tablist" aria-label="Daily Digest sources">
            {sourceTabs.map((source, index) => (
              <button
                key={source.key}
                id={tabsId + '-tab-' + index}
                type="button"
                role="tab"
                aria-controls={panelId}
                aria-selected={activeIndex === index}
                tabIndex={activeIndex === index ? 0 : -1}
                onClick={() => setSelectedSource(source.key)}
                onKeyDown={event => handleTabKey(event, index)}
              >
                {source.label}
                <span className="daily-digest-tab-count">{source.cards.length}</span>
              </button>
            ))}
          </div>
          <div
            className="news-list-modern"
            id={panelId}
            role="tabpanel"
            aria-labelledby={tabsId + '-tab-' + activeIndex}
          >
            {activeSource.cards.map(card => (
              <a
                key={`${card.slot}:${card.canonicalId}`}
                href={card.canonicalUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="modern-news-card"
                style={{ display: 'block', textDecoration: 'none', color: 'inherit' }}
              >
                <div className="mnc-header">
                  <span className="mnc-source">{cardSourceLabel(card, deliveryMode)}</span>
                  <span className="mnc-badge">
                    {isAutoSelectedCard(card, deliveryMode) ? sectionLabel(card.section) : card.slot}
                  </span>
                </div>
                <h3 className="mnc-headline">{card.title}</h3>
                <DigestStoryDetails card={card} />
                <div className="mnc-badges">
                  {isAutoSelectedCard(card, deliveryMode)
                    ? <span className="mnc-badge">{deliveryMode==='SNAPSHOT'||card.deliveryMode==='SNAPSHOT'?'Snapshot':'Live'} · Auto-selected</span>
                    : <span className="mnc-badge">Publisher-curated</span>}
                  {card.replacementReason && <span className="mnc-badge">Health failover</span>}
                </div>
              </a>
            ))}
          </div>
        </>
      ) : (
        <div
          className="modern-news-card"
          role="status"
          aria-live="polite"
          style={{ display: 'block' }}
        >
          <div className="mnc-header">
            <span className="mnc-source">Publisher-curated edition</span>
          </div>
          <h3 className="mnc-headline">{status.title}</h3>
          <p style={{ margin: '8px 0 0', color: 'var(--text-muted)', lineHeight: 1.45 }}>
            {status.message}
          </p>
          {onRefresh && <button
            type="button"
            className="daily-digest-retry"
            onClick={onRefresh}
            disabled={loading}
          >{loading ? 'Checking Daily Digest…' : 'Retry Daily Digest'}</button>}
        </div>
      )}

      <div style={{
        marginTop: '8px', fontSize: '0.72rem', color: 'var(--text-muted)',
        display: 'flex', gap: '8px', flexWrap: 'wrap',
      }}>
        {cards.length > 0 && <span>{compositionLabel(compositionState, deliveryMode)}</span>}
        {digestDate && <span>{cards.length > 0 ? '• ' : ''}{digestDate}</span>}
        {frozen && <span>• Frozen {frozen} IST</span>}
      </div>
    </section>
  );
}

export default DailyDigestSection;
