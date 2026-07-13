import React from 'react';

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function text(value, fallback = '—') {
  const rendered = String(value ?? '').trim();
  return rendered || fallback;
}

function formatReason(reason) {
  return String(reason || '')
    .replace(/_/g, ' ')
    .replace(/^stale reason:/, 'stale reason:');
}

function renderTopSources(sources) {
  const rows = asArray(sources);
  if (rows.length === 0) return <span>None recorded</span>;
  return (
    <ul className="section-health-popover__list">
      {rows.map((source, index) => (
        <li key={`${source.source || 'source'}-${index}`}>
          {text(source.source || source.id)}{Number.isFinite(Number(source.count)) ? ` (${source.count})` : ''}
        </li>
      ))}
    </ul>
  );
}

function renderFeeds(feeds) {
  const rows = asArray(feeds);
  if (rows.length === 0) return <span>None recorded</span>;
  return (
    <ul className="section-health-popover__list">
      {rows.map((feed, index) => (
        <li key={`${feed.id || 'feed'}-${index}`}>
          <strong>{text(feed.id)}</strong>
          {Number.isFinite(Number(feed.zeroItemRuns)) && Number(feed.zeroItemRuns) > 0 && (
            <span> · zero-item runs: {feed.zeroItemRuns}</span>
          )}
          {feed.lastNonZeroSuccess && <span> · last non-zero: {feed.lastNonZeroSuccess}</span>}
          {feed.lastError && <span> · error: {feed.lastError}</span>}
          {feed.feedUrl && (
            <span>
              {' · '}
              <a href={feed.feedUrl} target="_blank" rel="noopener noreferrer">feed</a>
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

function renderReasons(reasons) {
  const rows = asArray(reasons);
  if (rows.length === 0) return <span>None recorded</span>;
  return (
    <ul className="section-health-popover__list">
      {rows.map(reason => <li key={reason}>{formatReason(reason)}</li>)}
    </ul>
  );
}

function Field({ label, children }) {
  return (
    <div className="section-health-popover__field" style={{ marginBottom: '8px' }}>
      <div style={{ fontSize: '0.68rem', textTransform: 'uppercase', opacity: 0.68 }}>{label}</div>
      <div>{children}</div>
    </div>
  );
}

export default function SectionHealthPopover({ summary = null, onClose = null }) {
  const unavailable = !summary;
  const status = summary?.status || 'unknown';

  return (
    <div
      className="section-health-popover"
      role="dialog"
      aria-modal="false"
      aria-label="Section health diagnostics"
      onClick={event => event.stopPropagation()}
      style={{
        margin: '8px 0 12px',
        padding: '12px',
        border: '1px solid rgba(255,255,255,0.16)',
        borderRadius: '12px',
        background: 'var(--bg-secondary, rgba(0,0,0,0.72))',
        color: 'var(--text-primary, inherit)',
        boxShadow: '0 12px 24px rgba(0,0,0,0.25)',
        fontSize: '0.82rem',
      }}
    >
      <div
        className="section-health-popover__header"
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', marginBottom: '10px' }}
      >
        <strong>Section Health Diagnostics</strong>
        {typeof onClose === 'function' && (
          <button
            type="button"
            aria-label="Close section health diagnostics"
            onClick={(event) => {
              event.stopPropagation();
              onClose(event);
            }}
            style={{ border: 0, background: 'transparent', color: 'inherit', cursor: 'pointer', fontSize: '1rem' }}
          >
            ×
          </button>
        )}
      </div>

      {unavailable ? (
        <Field label="status">unknown — diagnostics unavailable</Field>
      ) : (
        <>
          <Field label="sectionId">{text(summary.sectionId)}</Field>
          <Field label="status">{status}</Field>
          <Field label="storyCount">{Number(summary.storyCount ?? 0)}</Field>
          <Field label="sourceGroupCount">{Number(summary.sourceGroupCount ?? 0)}</Field>
          <Field label="topSources">{renderTopSources(summary.topSources)}</Field>
          <Field label="warningFeeds">{renderFeeds(summary.warningFeeds)}</Field>
          <Field label="deadFeeds">{renderFeeds(summary.deadFeeds)}</Field>
          <Field label="staleFeeds">{renderFeeds(summary.staleFeeds)}</Field>
          <Field label="zeroItemFeeds">{renderFeeds(summary.zeroItemFeeds)}</Field>
          <Field label="lastCheckedAt">{text(summary.lastCheckedAt)}</Field>
          <Field label="lastNonZeroSuccess">{text(summary.lastNonZeroSuccess)}</Field>
          <Field label="lastError">{text(summary.lastError)}</Field>
          <Field label="reasons">{renderReasons(summary.reasons)}</Field>
        </>
      )}
    </div>
  );
}
