import { useCallback, useMemo } from 'react';
import { useDataset } from '../data/orchestrator/useDataset.js';

function asCards(value) {
  return Array.isArray(value) ? value : [];
}

export function useDailyDigestSectionViewModel() {
  const {
    envelope,
    loading,
    error,
    reload,
  } = useDataset('dailyDigest');

  const data = envelope?.data || {};
  const cards = useMemo(() => asCards(data.cards), [data.cards]);
  const refresh = useCallback(() => reload(true), [reload]);

  return {
    cards,
    hasCards: cards.length > 0,
    digestDate: data.digestDate || null,
    frozenAt: data.frozenAt || null,
    snapshotId: data.snapshotId || null,
    snapshotRevision: data.snapshotRevision || null,
    compositionState: data.compositionState || null,
    availability: data.availability || 'UNKNOWN',
    loading,
    error,
    refresh,
  };
}
