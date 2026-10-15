import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

// Writes synthetic records only to the dedicated local Android sandbox.
const base = 'http://127.0.0.1:5186';
const marker = await fetch(`${base}/api/android-development`, { redirect: 'error' }).then(r => r.json());
assert.equal(marker.environment, 'mywallet-android-local');
assert.equal(marker.port, 5186);
async function read(suffix = '') {
  const response = await fetch(`${base}/api/data${suffix}`, { redirect: 'error' });
  assert.equal(response.status, 200);
  return response.json();
}
async function patch(body) {
  const response = await fetch(`${base}/api/data`, {
    method: 'PATCH', redirect: 'error', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  assert.equal(response.status, 200, `Local operation failed: ${await response.clone().text()}`);
  return response.json();
}
const before = await read();
const id = randomUUID();
const transaction = { id, type: 'expense', date: '2026-10-13', amount: 100,
  title: 'Android sandbox verification', category: 'food', createdAt: Date.now() };
const create = { op: 'transaction.create', operationId: randomUUID(), transaction };
const saved = await patch(create);
assert.equal(saved.transaction.revision, 1);
await patch(create);
assert.equal((await read()).transactions.filter(t => t.id === id).length, 1);
const edited = await patch({ op: 'transaction.update', operationId: randomUUID(),
  expectedRevision: 1, transaction: { ...transaction, amount: 200 } });
assert.equal(edited.transaction.revision, 2);
assert.equal(edited.transaction.amount, 200);
const delta = await read(`?after=${before.cursor}`);
assert(delta.changes.some(change => change.entityId === id && change.revision === 2));
await patch({ op: 'transaction.delete', operationId: randomUUID(), transactionId: id, expectedRevision: 2 });
const after = await read();
assert(!after.transactions.some(t => t.id === id));
assert.equal(after.transactions.length, before.transactions.length);
const deleted = await read(`?after=${delta.nextCursor}`);
assert(deleted.changes.some(change => change.entityId === id && change.changeType === 'delete'));
console.log('Android local API: create, duplicate retry, update, incremental sync and delete passed.');
