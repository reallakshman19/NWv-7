import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  MARKET_WORKSPACE_IDS,
  LEGACY_MARKET_WORKSPACE_IDS,
  getMarketWorkspaceFromHash,
  withMarketWorkspaceHash
} from '../src/services/marketWorkspaceRoute.js';

test('nine workspaces and overview by default in R2.1',()=>{
  assert.equal(MARKET_WORKSPACE_IDS.length, 9);
  assert.deepEqual(LEGACY_MARKET_WORKSPACE_IDS, ['indices', 'equity', 'funds', 'currency']);
  assert.equal(getMarketWorkspaceFromHash('#/markets'), 'overview');
  assert.equal(getMarketWorkspaceFromHash('#/markets?view=funds'), 'funds');
  assert.equal(getMarketWorkspaceFromHash('#/markets?view=unknown'), 'overview');
});

test('query changes preserve URL search preferences and map aliases',()=>{
  assert.equal(withMarketWorkspaceHash('#/markets?region=IN&view=indices', 'equity'), '#/markets?region=IN&view=equity');
  assert.equal(withMarketWorkspaceHash('#/markets', 'currency'), '#/markets?view=currency-macro');
  assert.equal(withMarketWorkspaceHash('#/markets', 'unknown'), '#/markets?view=overview');
});

test('hash Back/forward restores the previously selected workspace',()=>{
  const route = withMarketWorkspaceHash('#/markets?view=indices', 'funds');
  assert.equal(getMarketWorkspaceFromHash(route), 'funds');
  assert.equal(getMarketWorkspaceFromHash('#/markets?view=currency'), 'currency-macro');
});
