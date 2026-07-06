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
    expect(src).toContain('upAheadDataset.api_edge_diagnostics');
    expect(src).toContain('latestUpAheadEdgeDiagnostics');
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

  it('keeps diagnostics in export payload', () => {
    expect(src).toContain('exportedAt');
    expect(src).toContain('diagnostics,');
    expect(src).toContain('datasets: cachedEnvelopes.map');
  });
});
