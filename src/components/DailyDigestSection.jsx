import React from 'react';

const PUBLISHER_LABELS = Object.freeze({
  AKASHVANI: 'Akashvani',
  INDIAN_EXPRESS: 'Indian Express',
  THE_HINDU: 'The Hindu',
  FINANCIAL_TIMES: 'Financial Times',
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

export function DailyDigestSection({ cards = [], digestDate, frozenAt, compositionState }) {
  if (!cards.length) return null;
  const frozen = freezeLabel(frozenAt);

  return (
    <section className="news-section" id="daily-digest">
      <h2 className="news-section__title news-section__title--india">
        <div className="news-title-left">
          <span className="news-icon">🗞️</span>
          <span className="news-text">Daily Digest</span>
        </div>
        <div className="news-title-right">
          <span className="news-count">({cards.length})</span>
        </div>
      </h2>

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

      <div style={{
        marginTop: '8px', fontSize: '0.72rem', color: 'var(--text-muted)',
        display: 'flex', gap: '8px', flexWrap: 'wrap',
      }}>
        <span>{compositionLabel(compositionState)}</span>
        {digestDate && <span>• {digestDate}</span>}
        {frozen && <span>• Frozen {frozen} IST</span>}
      </div>
    </section>
  );
}

export default DailyDigestSection;
