import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MARKET_WORKSPACE_IDS, getMarketWorkspaceFromHash, withMarketWorkspaceHash } from '../src/services/marketWorkspaceRoute.js';

test('only four workspaces and Indices by default',()=>{
  assert.deepEqual(MARKET_WORKSPACE_IDS,['indices','equity','funds','currency']);
  assert.equal(getMarketWorkspaceFromHash('#/markets'),'indices');
  assert.equal(getMarketWorkspaceFromHash('#/markets?view=funds'),'funds');
  assert.equal(getMarketWorkspaceFromHash('#/markets?view=unknown'),'indices');
});
test('query changes preserve URL search preferences and hash route identity',()=>{
  assert.equal(withMarketWorkspaceHash('#/markets?region=IN&view=indices','equity'),'#/markets?region=IN&view=equity');
  assert.equal(withMarketWorkspaceHash('#/markets','currency'),'#/markets?view=currency');
  assert.equal(withMarketWorkspaceHash('#/markets','unknown'),'#/markets');
});
test('hash Back/forward restores the previously selected workspace',()=>{
  const route=withMarketWorkspaceHash('#/markets?view=indices','funds');
  assert.equal(getMarketWorkspaceFromHash(route),'funds');
  assert.equal(getMarketWorkspaceFromHash('#/markets?view=currency'),'currency');
});
