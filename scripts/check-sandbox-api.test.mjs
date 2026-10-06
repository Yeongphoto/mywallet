import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkTransactionProjection } from './check-sandbox-api.mjs';

const row = { id: 'test', type: 'expense', date: '2026-10-01', amount: 123, title: 'fixture', category: 'test', asset_id: 'asset', deleted_at: null };
const payload = { id: 'test', type: 'expense', date: '2026-10-01', time: null, amount: 123, title: 'fixture', category: 'test', createdAt: null, assetId: 'asset', toAssetId: null, recurringRuleId: null, installmentGroupId: null, installmentIndex: null, installmentMonths: null, cardSettlementId: null, revision: 1 };
test('snapshot verification handles empty data and detects omitted or changed transaction fields', () => {
  assert.equal(checkTransactionProjection([], []), true);
  assert.equal(checkTransactionProjection([row], [payload]), true);
  assert.equal(checkTransactionProjection([row], [{ ...payload, amount: 124 }]), false);
  assert.equal(checkTransactionProjection([row], [{ ...payload, assetId: null }]), false);
  assert.equal(checkTransactionProjection([row], []), false);
  assert.equal(checkTransactionProjection([row], null), false);
});
