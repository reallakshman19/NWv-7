import React from 'react';

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

function freezeLabel(value) {
  if (!value) return '';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: true,
  }).format(date);
}

function compositionLabel(value) {
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

export function DailyDigestSection({
  cards = [],
  digestDate,
  frozenAt,
  compositionState,
  availability = 'UNKNOWN',
  loading = false,
  error = null,
}) {
  const frozen = freezeLabel(frozenAt);
  const status = cards.length ? null : emptyStateCopy({ availability, loading, error });

  return (
    <section className="news-section" id="daily-digest" data-availability={availability}>
      <h2 className="news-section__title news-section__title--india">
        <div className="news-title-left">
          <span className="news-icon">🗞️</span>
          <span className="news-text">Daily Digest</span>
        </div>
        <div className="news-title-right">
          {cards.length > 0
            ? <span className="news-count">({cards.length})</span>
            : <span className="mnc-badge">{status.badge}</span>}
        </div>
      </h2>

      {cards.length > 0 ? (
        <div className="news-list-modern">
          {cards.map(card => (
            <a
              key={`${card.slot}:${card.canonicalId}`}
              href={card.canonicalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="modern-news-card"
              style={{ display: 'block', textDecoration: 'none', color: 'inherit' }}
            >
              <div className="mnc-header">
                <span className="mnc-source">{productLabel(card)}</span>
                <span className="mnc-badge">{card.slot}</span>
              </div>
              <h3 className="mnc-headline">{card.title}</h3>
              <div className="mnc-badges">
                <span className="mnc-badge">Publisher-curated</span>
                {card.replacementReason && <span className="mnc-badge">Health failover</span>}
              </div>
            </a>
          ))}
        </div>
      ) : (
        <div
          className="modern-news-card"
          role="status"
          aria-live="polite"
          style={{ display: 'block' }}
        >
          <div className="mnc-header">
            <span className="mnc-source">Publisher-curated edition</span>
            <span className="mnc-badge">{status.badge}</span>
          </div>
          <h3 className="mnc-headline">{status.title}</h3>
          <p style={{ margin: '8px 0 0', color: 'var(--text-muted)', lineHeight: 1.45 }}>
            {status.message}
          </p>
        </div>
      )}

      <div style={{
        marginTop: '8px', fontSize: '0.72rem', color: 'var(--text-muted)',
        display: 'flex', gap: '8px', flexWrap: 'wrap',
      }}>
        {cards.length > 0 && <span>{compositionLabel(compositionState)}</span>}
        {digestDate && <span>{cards.length > 0 ? '• ' : ''}{digestDate}</span>}
        {frozen && <span>• Frozen {frozen} IST</span>}
      </div>
    </section>
  );
}

export default DailyDigestSection;
