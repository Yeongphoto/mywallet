import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const { onRequestGet, onRequestPatch } = await import(process.env.MEMONEY_ASSET_HANDLER
  ? pathToFileURL(resolve(process.env.MEMONEY_ASSET_HANDLER)).href : '../functions/api/data.ts');
import { activeGuestId, guestKey, localSnapshot, localWalletFetch } from '../src/auth/local-wallet.ts';

const asset = (id, amount) => ({ id, category: 'bank', name: 'Opening fixture', memo: '', amount });
function local() {
  const rows = new Map(), storage = { getItem: key => rows.get(key) ?? null, setItem: (key, value) => rows.set(key, value) };
  const id = activeGuestId(storage);
  return { storage, id, read: async () => localSnapshot(storage, id),
    patch: body => localWalletFetch(id, '/api/data', { method: 'PATCH', body: JSON.stringify(body) }, storage), close() {} };
}
function cloud() {
  const sql = new DatabaseSync(':memory:'); sql.exec(readFileSync('scripts/android-sandbox-schema.sql', 'utf8'));
  const db = { fail: false, prepare(query) { return { query, values: [], bind(...values) { this.values = values; return this; },
    async first() { return sql.prepare(query).get(...this.values) || null; },
    async all() { return { results: sql.prepare(query).all(...this.values) }; },
    async run() { return { meta: { changes: sql.prepare(query).run(...this.values).changes } }; } }; },
    async batch(statements) { sql.exec('BEGIN'); try {
      const result = statements.map(statement => {
        if (db.fail && statement.query.startsWith('INSERT INTO assets')) throw Error('injected storage failure');
        const q = sql.prepare(statement.query);
        return q.columns().length ? { results: q.all(...statement.values) } : { meta: { changes: q.run(...statement.values).changes } };
      }); sql.exec('COMMIT'); return result;
    } catch (error) { sql.exec('ROLLBACK'); throw error; } }
  };
  return { db, read: async () => (await onRequestGet({ env: { DB: db }, request: new Request('https://fixture/api/data') })).json(),
    patch: body => onRequestPatch({ env: { DB: db }, request: new Request('https://fixture/api/data', { method: 'PATCH', body: JSON.stringify(body) }) }), close: () => sql.close() };
}
for (const [name, fixture] of [['local', local], ['cloud', cloud]]) {
  test(`${name}: direct opening amount survives reload, metadata updates and duplicate create without income rows`, async () => {
    const f = fixture(); try {
      for (const [id, amount] of [['positive', 130000000], ['zero', 0], ['negative', -1200000]]) {
        const created = await f.patch({ op: 'asset.create', operationId: randomUUID(), asset: asset(id, amount), openingTransaction: null });
        assert.equal(created.status, 200); assert.equal((await created.json()).asset.amount, amount);
        assert.equal((await f.read()).assets.find(a => a.id === id).amount, amount);
      }
      const before = await f.read();
      assert.equal(before.transactions.length, 0, 'opening amount must not inflate income/expense totals');
      const updated = await f.patch({ op: 'asset.update', operationId: randomUUID(), expectedRevision: 1, asset: { ...asset('positive', 7), memo: 'metadata update' } });
      assert.equal(updated.status, 200); assert.equal((await updated.json()).asset.amount, 130000000);
      assert.equal((await f.patch({ op: 'asset.create', operationId: randomUUID(), asset: asset('positive', 999) })).status, 409);
      const after = await f.read();
      assert.equal(after.assets.length, 3); assert.equal(after.assets.find(a => a.id === 'positive').amount, 130000000);
      assert.deepEqual(after.transactions, before.transactions);
      if (name === 'local') {
        const backup = JSON.stringify({ format: 'memoney-local', version: 1, data: after });
        const restored = local(); restored.storage.setItem(guestKey(restored.id), JSON.stringify(JSON.parse(backup).data));
        assert.deepEqual(await restored.read(), after);
      }
    } finally { f.close(); }
  });
  test(`${name}: legacy explicit opening transaction counts once and invalid direct amounts leave assets unchanged`, async () => {
    const f = fixture(); try {
      const opening = { id: 'legacy-opening', type: 'income', date: '2026-10-24', amount: 1200000, title: 'Opening fixture', category: 'opening-balance', assetId: 'legacy' };
      assert.equal((await f.patch({ op: 'asset.create', operationId: randomUUID(), asset: asset('legacy', 1200000), openingTransaction: opening })).status, 200);
      const data = await f.read();
      assert.equal(data.assets[0].amount, 0); assert.equal(data.transactions.length, 1);
      assert.equal(data.assets[0].amount + data.transactions[0].amount, 1200000);
      for (const amount of ['not-a-number', undefined]) assert.equal((await f.patch({ op: 'asset.create', operationId: randomUUID(), asset: asset('invalid', amount) })).status, 400);
      assert.deepEqual((await f.read()).assets, data.assets);
      assert.deepEqual((await f.read()).transactions, data.transactions);
    } finally { f.close(); }
  });
}
test('failed local storage or cloud batch cannot acknowledge or partially add an opening asset', async () => {
  for (const fixture of [local, cloud]) {
    const f = fixture(); try {
      const before = await f.read();
      if (f.db) f.db.fail = true; else f.storage.setItem = () => { throw Error('quota'); };
      try { const response = await f.patch({ op: 'asset.create', operationId: randomUUID(), asset: asset('failed', 100) }); assert(response.status >= 400); }
      catch (error) { assert.match(error.message, /LOCAL_STORAGE_FAILED|injected storage failure/); }
      const after = await f.read(); assert.deepEqual(after.assets, before.assets); assert.deepEqual(after.transactions, before.transactions);
    } finally { f.close(); }
  }
});
