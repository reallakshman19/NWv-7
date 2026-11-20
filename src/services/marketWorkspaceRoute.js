import {
  R21_MARKET_WORKSPACE_IDS,
  R21_DEFAULT_WORKSPACE,
  getR21MarketViewFromHash,
  withR21MarketViewHash
} from '../market/contracts/index.js';

export const LEGACY_MARKET_WORKSPACE_IDS = Object.freeze(['indices', 'equity', 'funds', 'currency']);
export const MARKET_WORKSPACE_IDS = R21_MARKET_WORKSPACE_IDS;

export function getMarketWorkspaceFromHash(hash = '') {
  return getR21MarketViewFromHash(hash);
}

export function withMarketWorkspaceHash(hash = '#/markets', view = R21_DEFAULT_WORKSPACE) {
  return withR21MarketViewHash(hash, view);
}
