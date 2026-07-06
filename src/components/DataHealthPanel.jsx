import React, { useEffect, useState } from 'react';
import {
  clearDiagnostics,
  listDiagnostics,
  subscribeDiagnostics,
} from '../data/diagnosticsStore.js';
import { listDatasetCache } from '../data/orchestrator/useDataset.js';

const EDGE_DIAGNOSTIC_EVENT = 'upAheadDataset.api_edge_diagnostics';
const EDGE_DIAGNOSTIC_FIELDS = ['source', 'reason', 'freshness', 'ageSeconds'];

function formatTime(value) {
  if (!value) return '--';

  try {
    return new Date(value).toLocaleString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
      day: '2-digit',
      month: 'short',
    });
  } catch {
    return '--';
  }
}

function getCacheSnapshot() {
  return listDatasetCache();
}

function isObjectRecord(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function formatDiagnosticValue(value) {
  if (value === null || value === undefined || value === '') return 'unknown';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

function getDiagnosticDetailEntries(details = {}) {
  if (!isObjectRecord(details)) return [];
  const keys = Object.keys(details);
  const orderedKeys = [
    ...EDGE_DIAGNOSTIC_FIELDS.filter(key => keys.includes(key)),
    ...keys.filter(key => !EDGE_DIAGNOSTIC_FIELDS.includes(key)).sort(),
  ];
  return orderedKeys.map(key => [key, formatDiagnosticValue(details[key])]);
}

function getLatestUpAheadEdgeDiagnostics(diagnostics = []) {
  return diagnostics
    .slice()
    .reverse()
    .find(item => item?.event === EDGE_DIAGNOSTIC_EVENT && isObjectRecord(item.details))?.details || null;
}

function buildEdgeApiDiagnosticsExport(details) {
  if (!isObjectRecord(details)) return null;
  return {
    source: formatDiagnosticValue(details.source),
    reason: formatDiagnosticValue(details.reason),
    freshness: formatDiagnosticValue(details.freshness),
    ageSeconds: formatDiagnosticValue(details.ageSeconds),
  };
}

function DiagnosticDetails({ details }) {
  const entries = getDiagnosticDetailEntries(details);
  if (entries.length === 0) return null;

  return (
    <dl
      aria-label="diagnostic details"
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
        gap: '6px 10px',
        margin: '8px 0 0',
        fontSize: '0.78rem',
      }}
    >
      {entries.map(([key, value]) => (
        <div key={key} style={{ minWidth: 0 }}>
          <dt style={{ color: 'var(--text-muted)', textTransform: 'capitalize' }}>{key}</dt>
          <dd style={{ margin: 0, overflowWrap: 'anywhere' }}>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function EdgeApiSummary({ details }) {
  if (!isObjectRecord(details)) return null;

  return (
    <div
      aria-label="Up Ahead Edge API diagnostics"
      style={{
        marginTop: '10px',
        padding: '10px',
        border: '1px solid var(--border-muted)',
        borderRadius: '10px',
        background: 'rgba(255,255,255,0.03)',
      }}
    >
      <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '6px' }}>
        Edge API
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '8px' }}>
        <div><strong>Source:</strong> {formatDiagnosticValue(details.source)}</div>
        <div><strong>Reason:</strong> {formatDiagnosticValue(details.reason)}</div>
        <div><strong>Freshness:</strong> {formatDiagnosticValue(details.freshness)}</div>
        <div><strong>Age seconds:</strong> {formatDiagnosticValue(details.ageSeconds)}</div>
      </div>
    </div>
  );
}

export default function DataHealthPanel() {
  const [diagnostics, setDiagnostics] = useState(() => listDiagnostics());
  const [, setCacheVersion] = useState(0);

  useEffect(() => {
    const unsubscribe = subscribeDiagnostics(nextDiagnostics => {
      setDiagnostics(nextDiagnostics);
      setCacheVersion(v => v + 1);
    });

    return unsubscribe;
  }, []);

  const cachedEnvelopes = getCacheSnapshot();
  const latestUpAheadEdgeDiagnostics = getLatestUpAheadEdgeDiagnostics(diagnostics);

  const exportPayload = () => {
    const payload = {
      exportedAt: Date.now(),
      diagnostics,
      datasets: cachedEnvelopes.map(({ datasetId, envelope }) => ({
        datasetId,
        ok: envelope?.ok,
        source: envelope?.source,
        freshness: envelope?.freshness,
        fallbackUsed: envelope?.fallbackUsed,
        payloadHash: envelope?.payloadHash,
        fetchedAt: envelope?.fetchedAt,
        lastGoodAt: envelope?.lastGoodAt,
        validation: envelope?.validation,
        slo: envelope?.slo,
        error: envelope?.error,
        edgeApiDiagnostics: datasetId === 'upAhead'
          ? buildEdgeApiDiagnosticsExport(latestUpAheadEdgeDiagnostics)
          : null,
      })),
    };

    const text = JSON.stringify(payload, null, 2);

    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).catch(() => {});
    }

    if (
      typeof document !== 'undefined' &&
      typeof Blob !== 'undefined' &&
      typeof URL !== 'undefined'
    ) {
      const blob = new Blob([text], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');

      anchor.href = url;
      anchor.download = `data-health-${Date.now()}.json`;
      anchor.click();

      URL.revokeObjectURL(url);
    }
  };

  return (
    <section className="modern-card" data-testid="data-health-panel" style={{ padding: '16px' }}>
      <div className="modern-card__header">
        <div>
          <div className="topline__label">Runtime diagnostics</div>
          <h2 className="modern-card__title">Data Health</h2>
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            type="button"
            className="btn btn--secondary"
            onClick={() => clearDiagnostics()}
          >
            Clear diagnostics
          </button>
          <button
            type="button"
            className="btn btn--primary"
            onClick={exportPayload}
          >
            Export JSON
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gap: '12px', marginTop: '16px' }}>
        {cachedEnvelopes.length === 0 ? (
          <div className="empty-state" style={{ padding: '16px' }}>
            No cached dataset envelopes yet. Open a migrated tab to populate this panel.
          </div>
        ) : cachedEnvelopes.map(({ datasetId, envelope }) => (
          <div key={datasetId} className="modern-card" style={{ padding: '12px', background: 'var(--bg-secondary)' }}>
            <h3 style={{ margin: '0 0 8px' }}>{datasetId}</h3>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '8px' }}>
              <div><strong>Status:</strong> {envelope?.ok ? 'ok' : 'degraded'}</div>
              <div><strong>Source:</strong> {envelope?.source || '--'}</div>
              <div><strong>Freshness:</strong> {envelope?.freshness || '--'}</div>
              <div><strong>Fallback:</strong> {envelope?.fallbackUsed ? 'yes' : 'no'}</div>
              <div><strong>Payload hash:</strong> {envelope?.payloadHash || '--'}</div>
              <div><strong>Last good:</strong> {formatTime(envelope?.lastGoodAt)}</div>
              <div><strong>Validation:</strong> {envelope?.validation?.passed === false ? 'failed' : 'passed'}</div>
              <div><strong>SLO score:</strong> {envelope?.slo?.score ?? '--'}</div>
            </div>

            {datasetId === 'upAhead' && (
              <EdgeApiSummary details={latestUpAheadEdgeDiagnostics} />
            )}

            {envelope?.error && (
              <div style={{ marginTop: '8px', color: 'var(--accent-danger)' }}>
                {envelope.error}
              </div>
            )}
          </div>
        ))}
      </div>

      <div style={{ marginTop: '20px' }}>
        <h3>Recent diagnostics ({diagnostics.length})</h3>

        <div style={{ display: 'grid', gap: '8px' }}>
          {diagnostics.slice(-20).reverse().map(item => (
            <div
              key={item.id}
              className="modern-card"
              style={{ padding: '10px', background: 'rgba(255,255,255,0.03)' }}
            >
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                {formatTime(item.ts)} · {item.datasetId} · {item.severity}
              </div>
              <div style={{ fontWeight: 600 }}>{item.event}</div>
              {item.message && <div style={{ fontSize: '0.85rem' }}>{item.message}</div>}
              <DiagnosticDetails details={item.details} />
            </div>
          ))}

          {diagnostics.length === 0 && (
            <div className="empty-state" style={{ padding: '12px' }}>
              No diagnostics recorded.
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
