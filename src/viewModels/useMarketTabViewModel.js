import { useCallback, useEffect, useMemo } from 'react';
import { useMarket } from '../context/MarketContext';
import { useSettings } from '../context/SettingsContext';
import {
  getMarketSessionState,
  getOldestMarketQuoteAt,
  isUsableMarketQuoteRow,
} from '../utils/marketSession';
import { auditMarketTabQuality } from '../services/pageAuditGrading.js';

const PRIMARY_INDEX_NAMES = ['NIFTY 50', 'SENSEX', 'BANK NIFTY', 'MIDCAP 150'];
const GLOBAL_INDEX_NAMES = ['S&P 500', 'NASDAQ', 'NIKKEI 225', 'HANG SENG', 'FTSE 100'];

const INDEX_ALIAS_MAP = {
  'NIFTY 50': ['NIFTY 50', 'NIFTY50', '^NSEI'],
  SENSEX: ['SENSEX', 'BSE SENSEX', '^BSESN'],
  'BANK NIFTY': ['BANK NIFTY', 'NIFTY BANK', '^NSEBANK'],
  'MIDCAP 150': ['MIDCAP 150', 'MIDCAP', 'NIFTY MIDCAP 150', 'NIFTYMIDCAP150.NS'],
};

const GLOBAL_INDEX_ALIAS_MAP = {
  'S&P 500': ['S&P 500', 'SP 500', '^GSPC'],
  NASDAQ: ['NASDAQ', '^IXIC'],
  'NIKKEI 225': ['NIKKEI 225', '^N225'],
  'HANG SENG': ['HANG SENG', '^HSI'],
  'FTSE 100': ['FTSE 100', '^FTSE'],
};

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value
    : {};
}

function getFloat(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function hasUsableSectionData(section) {
  if (Array.isArray(section)) return section.length > 0;
  if (!section || typeof section !== 'object') return false;
  return Object.keys(section).length > 0;
}

function getIndexByName(indices, names) {
  return names
    .map(name => asArray(indices).find(item => item?.name === name))
    .filter(Boolean);
}

function getIndexByAliases(indices, map, names) {
  return names
    .map(name => {
      const aliases = map[name] || [name];

      return asArray(indices).find(item => (
        aliases.some(alias => item?.name === alias || item?.symbol === alias)
      ));
    })
    .filter(Boolean);
}

function getIndiaIndices(indices, globalIndices) {
  const globalIdentifiers = new Set([
    ...Object.values(GLOBAL_INDEX_ALIAS_MAP).flat(),
    ...globalIndices.flatMap(item => [item?.name, item?.symbol]).filter(Boolean),
  ]);
  return indices.filter(item => (
    typeof item?.name === 'string' && item.name.trim() &&
    !globalIdentifiers.has(item.name) && !globalIdentifiers.has(item.symbol)
  ));
}

function getTrackedIndexBreadth(indices) {
  const counts = { rising: 0, falling: 0, flat: 0, unknown: 0 };
  for (const item of indices) {
    const value = item.change;
    const numeric = typeof value === 'number' ||
      (typeof value === 'string' && /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value.trim()));
    const change = numeric ? Number(value) : NaN;

    if (!Number.isFinite(change)) counts.unknown++;
    else if (change > 0) counts.rising++;
    else if (change < 0) counts.falling++;
    else counts.flat++;
  }
  return counts;
}

function getMarketMood(indices) {
  const safeIndices = asArray(indices);

  if (safeIndices.length === 0) {
    return { tone: 'neutral', label: 'No active market data' };
  }

  const avg = safeIndices.reduce((sum, item) => (
    sum + getFloat(item.changePercent)
  ), 0) / safeIndices.length;

  if (avg >= 0.6) return { tone: 'positive', label: 'Broad risk-on tone' };
  if (avg <= -0.6) return { tone: 'negative', label: 'Broad risk-off tone' };

  return { tone: 'neutral', label: 'Mixed market tone' };
}

function getMarketTone(value) {
  const parsed = getFloat(value);
  if (parsed > 0) return 'positive';
  if (parsed < 0) return 'negative';
  return 'neutral';
}

function getMarketToneClass(value) {
  return `market-tone--${getMarketTone(value)}`;
}

export function projectMarketData(marketData) {
  const safeMarketData = asRecord(marketData);

  return {
    indices: asArray(safeMarketData.indices),
    globalIndices: asArray(safeMarketData.globalIndices),
    equities: asArray(safeMarketData.equities),
    equityCoverage: asRecord(safeMarketData.equityCoverage),
    commodities: asArray(safeMarketData.commodities),
    currencies: asArray(safeMarketData.currencies),
    ipo: asRecord(safeMarketData.ipo),
    // Per-source IPO check time is distinct from indices/publication fetch time.
    ipoLastCheckedAt: safeMarketData.ipoLastCheckedAt,
    generatedAt: safeMarketData.generatedAt,
    mutualFunds: asArray(safeMarketData.mutualFunds),
    nfo: asArray(safeMarketData.nfo),
    movers: asRecord(safeMarketData.movers),
    sectorals: asArray(safeMarketData.sectorals),
    fiidii: asRecord(safeMarketData.fiidii),
    sourceHealth: asRecord(safeMarketData.sourceHealth),
    fetchedAt: safeMarketData.fetchedAt,
    sourceMode: safeMarketData.sourceMode || safeMarketData.source || safeMarketData.mode,
    isSnapshot: Boolean(safeMarketData.isSnapshot),
    isStale: Boolean(safeMarketData.isStale),
    raw: safeMarketData,
  };
}

export function useMarketTabViewModel() {
  const {
    marketData,
    loading,
    error,
    lastFetch,
    refreshMarket,
    ensureBoot,
    booted,
  } = useMarket();

  const { settings } = useSettings();
  const marketSettings = useMemo(() => (
    settings?.market || {}
  ), [settings]);

  useEffect(() => {
    if (typeof ensureBoot === 'function') {
      ensureBoot();
    }
  }, [ensureBoot]);

  const projectedMarketData = useMemo(() => (
    projectMarketData(marketData)
  ), [marketData]);

  const indices = projectedMarketData.indices;
  const indiaIndices = useMemo(() => (
    getIndiaIndices(indices, projectedMarketData.globalIndices)
  ), [indices, projectedMarketData.globalIndices]);
  const usableIndiaIndices = useMemo(() => (
    indiaIndices.filter(isUsableMarketQuoteRow)
  ), [indiaIndices]);

  const primaryIndices = useMemo(() => (
    getIndexByAliases(usableIndiaIndices, INDEX_ALIAS_MAP, PRIMARY_INDEX_NAMES)
  ), [usableIndiaIndices]);

  const globalIndices = useMemo(() => {
    const dedicated = projectedMarketData.globalIndices.filter(isUsableMarketQuoteRow);
    if (dedicated.length > 0) return dedicated;
    return getIndexByAliases(
      indices.filter(isUsableMarketQuoteRow), GLOBAL_INDEX_ALIAS_MAP, GLOBAL_INDEX_NAMES,
    );
  }, [projectedMarketData.globalIndices, indices]);

  const displayedPrimaryIndices = useMemo(() => (primaryIndices.length
    ? primaryIndices
    : usableIndiaIndices.slice(0, 4)
  ), [primaryIndices, usableIndiaIndices]);

  const heroIndex = displayedPrimaryIndices[0] || null;
  const heroSeries = heroIndex?.series || heroIndex?.history || [];

  const mood = useMemo(() => (
    getMarketMood(displayedPrimaryIndices)
  ), [displayedPrimaryIndices]);

  const sourceHealth = useMemo(() => (
    projectedMarketData.sourceHealth || {}
  ), [projectedMarketData.sourceHealth]);

  const sessionState = useMemo(() => (
    getMarketSessionState({
      quoteAt: getOldestMarketQuoteAt(displayedPrimaryIndices),
      tradingHolidays: marketSettings.tradingHolidays || [],
    })
  ), [displayedPrimaryIndices, marketSettings.tradingHolidays]);

  const moverGainers = asArray(projectedMarketData.movers?.gainers);
  const moverLosers = asArray(projectedMarketData.movers?.losers);

  const trackedIndexBreadth = useMemo(() => getTrackedIndexBreadth(indiaIndices), [indiaIndices]);

  const sectoralIndices = useMemo(() => (
    (
      projectedMarketData.sectorals.length
        ? projectedMarketData.sectorals.filter(isUsableMarketQuoteRow)
        : getIndexByName(usableIndiaIndices, ['BANK NIFTY', 'NIFTY IT', 'NIFTY PHARMA', 'NIFTY AUTO'])
    ).filter((item, idx, arr) => (
      arr.findIndex(candidate => candidate.name === item.name) === idx
    ))
  ), [projectedMarketData.sectorals, usableIndiaIndices]);

  const marketTabAudit = useMemo(() => (
    auditMarketTabQuality({
      marketData,
      sourceHealth,
      sessionState,
      error,
      loading,
      lastFetch,
    })
  ), [marketData, sourceHealth, sessionState, error, loading, lastFetch]);

  const navSections = useMemo(() => ([
    { id: 'india-tools', icon: '🇮🇳', label: 'India tools' },
    marketSettings.showMutualFunds !== false && { id: 'nfo-tracker', icon: '📅', label: 'NFOs' },
    (marketSettings.showGainers !== false || marketSettings.showLosers !== false) &&
      { id: 'market-movers', icon: '📈', label: 'Top Movers' },

    marketSettings.showSectorals !== false &&
      { id: 'sectoral-indices', icon: '🏛️', label: 'Sectorals' },

    marketSettings.showCommodities !== false &&
      hasUsableSectionData(projectedMarketData.commodities) &&
      { id: 'commodities', icon: '🪙', label: 'Commodities' },

    marketSettings.showCurrency !== false &&
      hasUsableSectionData(projectedMarketData.currencies) &&
      { id: 'currency', icon: '💱', label: 'Currency' },

    marketSettings.showFIIDII !== false &&
      (
        hasUsableSectionData(projectedMarketData.fiidii?.fii) ||
        hasUsableSectionData(projectedMarketData.fiidii?.dii)
      ) &&
      { id: 'fiidii', icon: '🏦', label: 'FII/DII' },

    marketSettings.showMutualFunds !== false &&
      { id: 'mutual-funds', icon: '💰', label: 'Mutual Funds' },

    marketSettings.showMarketHealth !== false &&
      { id: 'source-health', icon: '📡', label: 'Source Health' },

    marketSettings.showIPO !== false &&
      { id: 'ipo-tracker', icon: '🎯', label: 'IPO / FPO' },
  ].filter(Boolean)), [marketSettings, projectedMarketData]);

  const refresh = useCallback(async (force = true) => {
    try {
      if (typeof refreshMarket === 'function') {
        await Promise.resolve(refreshMarket(force));
        return { ok: true };
      }

      return { ok: false, error: 'Market refresh handler unavailable' };
    } catch (refreshError) {
      return {
        ok: false,
        error: refreshError?.message || String(refreshError),
      };
    }
  }, [refreshMarket]);

  const hasRenderableMarketData = Boolean(
    projectedMarketData.indices.length ||
    projectedMarketData.commodities.length ||
    projectedMarketData.currencies.length ||
    projectedMarketData.mutualFunds.length ||
    hasUsableSectionData(projectedMarketData.ipo) ||
    hasUsableSectionData(projectedMarketData.movers) ||
    hasUsableSectionData(projectedMarketData.fiidii)
  );

  const quickMarketProps = useMemo(() => ({
    marketData: projectedMarketData,
    loading,
    error,
    lastFetch,
    booted,
    sessionState,
    onRefreshMarket: refresh,
  }), [
    projectedMarketData,
    loading,
    error,
    lastFetch,
    booted,
    sessionState,
    refresh,
  ]);

  return {
    marketData: projectedMarketData,
    rawMarketData: marketData,
    marketSettings,

    indices,
    primaryIndices,
    globalIndices,
    displayedPrimaryIndices,
    heroIndex,
    heroSeries,
    mood,
    sourceHealth,
    sessionState,
    moverGainers,
    moverLosers,
    trackedIndexBreadth,
    sectoralIndices,
    marketTabAudit,
    navSections,

    loading,
    error,
    lastFetch,
    booted,
    hasRenderableMarketData,
    refreshMarket: refresh,
    quickMarketProps,

    helpers: {
      getFloat,
      getMarketTone,
      getMarketToneClass,
      hasUsableSectionData,
    },
  };
}

export const __marketTabViewModelInternalsForTest = {
  asArray,
  asRecord,
  getFloat,
  hasUsableSectionData,
  getIndexByName,
  getIndexByAliases,
  getIndiaIndices,
  getTrackedIndexBreadth,
  getMarketMood,
  getMarketTone,
  getMarketToneClass,
  projectMarketData,
};
