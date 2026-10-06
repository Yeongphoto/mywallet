import { DatabaseSync } from 'node:sqlite';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { fingerprintDatabase, compareDatabases } from './check-d1-restore.mjs';

const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const ordered = (rows) => [...rows].sort((a, b) => String(a.id).localeCompare(String(b.id)));
const transaction = (t) => ({
  id: t.id, type: t.type, date: t.date, time: t.transaction_time || null,
  amount: Number(t.amount), title: t.title, category: t.category,
  createdAt: t.created_at == null ? null : Number(t.created_at),
  assetId: t.asset_id || null, toAssetId: t.to_asset_id || null,
  recurringRuleId: t.recurring_rule_id || null,
  installmentGroupId: t.installment_group_id || null,
  installmentIndex: t.installment_index == null ? null : Number(t.installment_index),
  installmentMonths: t.installment_months == null ? null : Number(t.installment_months),
  cardSettlementId: t.card_settlement_id || null, revision: Number(t.revision) || 1,
});

export function checkTransactionProjection(rows, payload) {
  if (!Array.isArray(payload)) return false;
  const keys = Object.keys(transaction(rows[0] || {}));
  return equal(ordered(rows.map(transaction)), ordered(payload.map((row) => Object.fromEntries(keys.map((key) => [key, row[key]])))));
}

export async function checkSandboxApi(filename) {
  const baseline = fingerprintDatabase(filename);
  const db = new DatabaseSync(resolve(filename), { readOnly: true });
  const checks = [];
  const require = (condition, name) => {
    if (!condition) throw new Error(`Sandbox API check failed: ${name}`);
    checks.push(name);
  };
  const get = async (query = '') => {
    // Hard-coded loopback only. Do not accept a production URL as an argument.
    const response = await fetch(`http://127.0.0.1:5184/api/data${query}`, { redirect: 'error', signal: AbortSignal.timeout(15000) });
    require(response.headers.get('cache-control') === 'no-store', 'no-store');
    require(response.ok, 'GET status');
    return response.json();
  };
  try {
    const data = await get();
    const rows = db.prepare('SELECT * FROM transactions WHERE deleted_at IS NULL').all();
    require(checkTransactionProjection(rows, data.transactions), 'active transactions and all transaction fields');
    for (const [table, property] of [['assets', 'assets'], ['plans', 'plans'], ['recurring_rules', 'recurringRules'], ['deleted_recurring_txs', 'deletedRecurringTxs'], ['card_settlements', 'cardSettlements']]) {
      require(Array.isArray(data[property]) && data[property].length === db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n, `${table} count`);
    }
    require(['customExpenseCategories', 'customIncomeCategories', 'customAssetCategories'].reduce((n, key) => n + data[key].length, 0) === db.prepare('SELECT COUNT(*) AS n FROM custom_categories').get().n, 'category count');
    require(data.cursor === Number(db.prepare('SELECT MAX(cursor) AS n FROM sync_changes').get().n || 0), 'snapshot cursor');
    require(data.updatedAt === Number(db.prepare("SELECT value FROM settings WHERE key = 'updatedAt'").get()?.value || 0), 'updatedAt unchanged');
    const expected = db.prepare('SELECT * FROM sync_changes ORDER BY cursor').all();
    let cursor = 0;
    let index = 0;
    while (true) {
      const page = await get(`?after=${cursor}`);
      require(Array.isArray(page.changes) && page.changes.length <= 200, 'incremental page shape');
      for (const change of page.changes) {
        const row = expected[index++];
        require(row && equal(change, {
          cursor: Number(row.cursor), entityType: row.entity_type, entityId: row.entity_id,
          changeType: row.change_type, revision: row.revision == null ? null : Number(row.revision),
          payload: row.payload_json ? JSON.parse(row.payload_json) : null,
        }), 'incremental event including tombstone/payload');
      }
      const next = page.changes.length ? page.changes.at(-1).cursor : cursor;
      require(page.nextCursor === next, 'next cursor');
      if (!page.changes.length) break;
      require(next > cursor, 'cursor advances');
      cursor = next;
    }
    require(index === expected.length, 'all incremental events returned');
    const invalid = await fetch('http://127.0.0.1:5184/api/data?after=-1', { redirect: 'error', signal: AbortSignal.timeout(15000) });
    require(invalid.status === 400, 'invalid cursor rejected');
    await invalid.body?.cancel();
    require(compareDatabases(baseline, fingerprintDatabase(filename)).length === 0, 'GET did not change any table');
    return { passed: true, checks: [...new Set(checks)], activeTransactions: rows.length, syncEvents: index };
  } finally {
    db.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    if (process.argv.length !== 3) throw new Error('Usage: node scripts/check-sandbox-api.mjs <sandbox.sqlite>');
    console.log(JSON.stringify(await checkSandboxApi(process.argv[2]), null, 2));
  } catch (error) {
    // Never include API payloads, transaction details or DB rows in diagnostics.
    console.error(error.message);
    process.exitCode = 1;
  }
}
