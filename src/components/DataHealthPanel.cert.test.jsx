import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

describe('DataHealthPanel', () => {
  const src = fs.readFileSync('src/components/DataHealthPanel.jsx', 'utf8');

  it('uses production dataset cache reader', () => {
    expect(src).toContain('listDatasetCache');
    expect(src).not.toContain('__getDatasetCacheForTest');
  });

  it('subscribes to diagnostics store', () => {
    expect(src).toContain('subscribeDiagnostics');
    expect(src).toContain('listDiagnostics');
    expect(src).toContain('clearDiagnostics');
  });

  it('guards browser globals for export', () => {
    expect(src).toContain("typeof navigator !== 'undefined'");
    expect(src).toContain("typeof document !== 'undefined'");
    expect(src).toContain("typeof Blob !== 'undefined'");
    expect(src).toContain("typeof URL !== 'undefined'");
  });

  it('shows envelope fields and export controls', () => {
    expect(src).toContain('payloadHash');
    expect(src).toContain('freshness');
    expect(src).toContain('fallbackUsed');
    expect(src).toContain('Clear diagnostics');
    expect(src).toContain('Export JSON');
  });

  it('renders diagnostics details safely', () => {
    expect(src).toContain('DiagnosticDetails');
    expect(src).toContain('getDiagnosticDetailEntries');
    expect(src).toContain('item.details');
    expect(src).toContain('diagnostic details');
  });

  it('prioritizes Up Ahead edge diagnostics fields', () => {
    expect(src).toContain('EDGE_DIAGNOSTIC_FIELDS');
    expect(src).toContain('source');
    expect(src).toContain('reason');
    expect(src).toContain('freshness');
    expect(src).toContain('ageSeconds');
  });

  it('derives latest Up Ahead edge diagnostics for the dataset card', () => {
    expect(src).toContain('getLatestUpAheadEdgeDiagnostics');
    expect(src).toContain('getLatestUpAheadEdgeDiagnosticEvent');
    expect(src).toContain('upAheadDataset.api_edge_diagnostics');
    expect(src).toContain('latestUpAheadEdgeDiagnostics');
    expect(src).toContain('latestUpAheadEdgeDiagnosticEvent');
    expect(src).toContain("datasetId === 'upAhead'");
  });

  it('renders a pinned Edge API summary with edge metadata fields', () => {
    expect(src).toContain('EdgeApiSummary');
    expect(src).toContain('Edge API');
    expect(src).toContain('Source:');
    expect(src).toContain('Reason:');
    expect(src).toContain('Freshness:');
    expect(src).toContain('Age seconds:');
  });

  it('renders Up Ahead Edge Activation status panel', () => {
    expect(src).toContain('UpAheadEdgeActivationStatus');
    expect(src).toContain('Up Ahead Edge Activation');
    expect(src).toContain('Up Ahead Edge Activation status');
    expect(src).toContain('Dataset API mode');
    expect(src).toContain('Worker/API base URL');
  });

  it('shows activation status labels without inventing unavailable URLs', () => {
    expect(src).toContain('ACTIVATION_STATUS_LABELS');
    expect(src).toContain('configured');
    expect(src).toContain('not configured');
    expect(src).toContain('missing');
    expect(src).toContain('unknown');
    expect(src).toContain('getDatasetApiModeStatus');
    expect(src).toContain('getWorkerBaseUrlStatus');
  });

  it('shows latest edge activation diagnostics and timestamp fields', () => {
    expect(src).toContain('Latest edge source');
    expect(src).toContain('Latest edge reason');
    expect(src).toContain('Latest edge freshness');
    expect(src).toContain('Latest edge age seconds');
    expect(src).toContain('Last diagnostics timestamp');
    expect(src).toContain('formatTime(diagnosticEvent?.ts)');
  });

  it('shows operator readiness and smoke commands', () => {
    expect(src).toContain('READINESS_COMMAND');
    expect(src).toContain('SMOKE_COMMAND');
    expect(src).toContain('Readiness command');
    expect(src).toContain('Smoke command');
    expect(src).toContain('npm run test:upahead-edge-readiness');
    expect(src).toContain('VITE_API_BASE_URL=https://<worker-host> npm run test:upahead-edge-readiness -- --require-config --smoke');
  });

  it('keeps diagnostics in export payload', () => {
    expect(src).toContain('exportedAt');
    expect(src).toContain('diagnostics,');
    expect(src).toContain('datasets: cachedEnvelopes.map');
  });

  it('exports Up Ahead edge diagnostics in the dataset summary', () => {
    expect(src).toContain('buildEdgeApiDiagnosticsExport');
    expect(src).toContain('edgeApiDiagnostics');
    expect(src).toContain("datasetId === 'upAhead'");
    expect(src).toContain('latestUpAheadEdgeDiagnostics');
    expect(src).toContain('source: formatDiagnosticValue(details.source)');
    expect(src).toContain('reason: formatDiagnosticValue(details.reason)');
    expect(src).toContain('freshness: formatDiagnosticValue(details.freshness)');
    expect(src).toContain('ageSeconds: formatDiagnosticValue(details.ageSeconds)');
  });

  it('keeps existing dataset export summary fields', () => {
    expect(src).toContain('payloadHash: envelope?.payloadHash');
    expect(src).toContain('fetchedAt: envelope?.fetchedAt');
    expect(src).toContain('lastGoodAt: envelope?.lastGoodAt');
    expect(src).toContain('validation: envelope?.validation');
    expect(src).toContain('slo: envelope?.slo');
    expect(src).toContain('error: envelope?.error');
  });
});
