import assert from 'node:assert/strict';
import { createServer } from 'vite';
import puppeteer from 'puppeteer-core';
const server = await createServer({ server: { host: '127.0.0.1', port: 0 }, plugins: [{ name: 'isolated-test-page', configureServer(s) {
  s.middlewares.use('/__durability', (_q, response) => { response.setHeader('Content-Type', 'text/html'); response.end('<!doctype html><title>Isolated durability test</title>'); });
} }] });
let browser;
try {
  await server.listen();
  const url = `http://127.0.0.1:${server.httpServer.address().port}/__durability`;
  browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  const page = await browser.newPage(); await page.goto(url);
  const results = await page.evaluate(async () => {
    const checks = [];
    const check = (value, label) => { if (!value) throw Error(label); checks.push(label); };
    const load = suffix => import(`/src/auth/local-durability.ts?instance=${suffix}`);
    const id = crypto.randomUUID(), prefix = `memoney:guest:${id}:`, key = prefix + 'mywallet:v2';
    const base = { transactions: [], assets: [], plans: [], recurringRules: [], deletedRecurringTxs: [], localOperations: {} };
    localStorage.setItem('memoney:guest:active-id', id);
    localStorage.setItem('cloud-cache', 'untouched'); localStorage.setItem(key, JSON.stringify(base));
    const a = await load('a'); await a.initializeGuestDurability();
    check(a.guestDurabilityEnabled(), 'strict journal initialized');
    const saved = { ...base, transactions: [{ id: 'synthetic', title: '합성 기록', amount: 1234 }], localOperations: { operation1: { completed: true } } };
    await a.persistGuestSnapshot(id, key, JSON.stringify(saved));
    // Lose only the projection, not the acknowledged strict checkpoint.
    localStorage.removeItem(key); localStorage.removeItem('memoney:guest:active-id');
    const b = await load('b'); await b.initializeGuestDurability();
    check(localStorage.getItem(key) === JSON.stringify(saved), 'acknowledged transaction restored');
    check(JSON.parse(localStorage.getItem(key)).localOperations.operation1.completed, 'retry receipt restored with rows');
    check(localStorage.getItem('cloud-cache') === 'untouched', 'cloud and unrelated storage untouched');
    const db = await new Promise((resolve, reject) => { const r = indexedDB.open('memoney-guest-durability-v1'); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
    const read = store => new Promise(resolve => { const r = db.transaction(store).objectStore(store).getAll(); r.onsuccess = () => resolve(r.result); });
    check((await read('displaced')).length === 1, 'displaced original retained before restore');
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function(...args) { if (this.name === 'states') throw new DOMException('Synthetic quota', 'QuotaExceededError'); return put.apply(this, args); };
    let failed = false;
    try { await b.persistGuestSnapshot(id, key, JSON.stringify(base)); } catch { failed = true; }
    finally { IDBObjectStore.prototype.put = put; }
    check(failed && localStorage.getItem(key) === JSON.stringify(saved), 'failed commit rejects and rolls projection back');
    const edited = { ...saved, transactions: [{ ...saved.transactions[0], amount: 5678 }] };
    await b.persistGuestSnapshot(id, key, JSON.stringify(edited));
    let conflict = false; try { await a.persistGuestSnapshot(id, key, JSON.stringify(base)); } catch { conflict = true; }
    check(conflict && localStorage.getItem(key) === JSON.stringify(edited), 'stale writer cannot replace a newer revision');
    const removed = { ...base, deletedRecurringTxs: ['rec_synthetic'], localOperations: { delete1: { completed: true } } };
    await b.persistGuestSnapshot(id, key, JSON.stringify(removed));
    localStorage.setItem(key, JSON.stringify(saved));
    const c = await load('c'); await c.initializeGuestDurability();
    check(localStorage.getItem(key) === JSON.stringify(removed), 'deleted row stays deleted after restart');
    const generation = crypto.randomUUID(), gkey = prefix + 'mywallet:v2:generation:' + generation;
    localStorage.setItem(gkey, JSON.stringify(edited)); localStorage.setItem(prefix + 'recovery-generation', generation);
    let generationRejected = false; try { await c.checkpointGuest(id); } catch { generationRejected = true; }
    check(generationRejected, 'implicit recovery generation change rejected');
    await c.checkpointGuest(id, localStorage, true);
    localStorage.removeItem(gkey); localStorage.removeItem(prefix + 'recovery-generation');
    const d = await load('d'); await d.initializeGuestDurability();
    check(localStorage.getItem(gkey) === JSON.stringify(edited) && localStorage.getItem(prefix + 'recovery-generation') === generation, 'explicit recovery pointer and snapshot restored together');
    const state = (await read('states'))[0]; state.hash = 'corrupted';
    await new Promise((resolve, reject) => { const tx = d.durableWriteTransaction(db, 'states'); tx.objectStore('states').put(state); tx.oncomplete = resolve; tx.onabort = reject; });
    const before = localStorage.getItem(gkey);
    let corrupted = false; try { await (await load('e')).initializeGuestDurability(); } catch { corrupted = true; }
    check(corrupted && localStorage.getItem(gkey) === before, 'corrupt journal fails closed without overwriting original');
    db.close(); return checks;
  });
  assert.equal(results.length, 11);
  const context = await browser.createBrowserContext();
  const integrated = await context.newPage(); await integrated.goto(url);
  const integration = await integrated.evaluate(async () => {
    const durability = await import('/src/auth/local-durability.ts');
    const wallet = await import('/src/auth/local-wallet.ts');
    const recovery = await import('/src/auth/local-recovery.ts');
    await durability.initializeGuestDurability();
    const id = wallet.activeGuestId(), checks = [];
    wallet.pinGuestGeneration(id);
    const check = (value, label) => { if (!value) throw Error(label); checks.push(label); };
    const call = async body => {
      const response = await wallet.localWalletFetch(id, '/api/data', { method: 'PATCH', body: JSON.stringify(body) });
      if (!response.ok) throw Error(JSON.stringify(await response.json())); return response.json();
    };
    const transaction = { id: crypto.randomUUID(), type: 'expense', date: '2026-10-23', title: '격리 거래', amount: 1234, category: 'food' };
    const create = { op: 'transaction.create', transaction, operationId: crypto.randomUUID() };
    await call(create); await call(create);
    check(wallet.localSnapshot(localStorage, id).transactions.length === 1, 'actual local adapter receipt prevents duplicate retry');
    await call({ op: 'transaction.update', transaction: { ...transaction, amount: 5678 }, expectedRevision: 1, operationId: crypto.randomUUID() });
    localStorage.removeItem(wallet.guestKey(id));
    await (await import('/src/auth/local-durability.ts?integration=edited')).initializeGuestDurability();
    check(wallet.localSnapshot(localStorage, id).transactions[0].amount === 5678, 'actual adapter edit survives projection loss');
    await call({ op: 'transaction.delete', transactionId: transaction.id, expectedRevision: 2, operationId: crypto.randomUUID() });
    localStorage.removeItem(wallet.guestKey(id));
    await (await import('/src/auth/local-durability.ts?integration=deleted')).initializeGuestDurability();
    check(wallet.localSnapshot(localStorage, id).transactions.length === 0, 'actual adapter delete survives projection loss');
    await wallet.persistLocalView(id, { budget: 7654321, categoryLabels: { food: '식비' } });
    const before = wallet.localSnapshot(localStorage, id);
    const info = await recovery.localRecoveryInfo(id);
    await recovery.localRecoveryAction(id, { action: 'reset', operationId: crypto.randomUUID(), generation: info.generation, version: info.version });
    let stale = false; try { wallet.assertGuestGeneration(id); } catch { stale = true; }
    check(stale, 'reset rejects the previously mounted generation');
    wallet.pinGuestGeneration(id);
    const reset = await recovery.localRecoveryInfo(id);
    check(wallet.localSnapshot(localStorage, id).budget !== before.budget && reset.records.length === 1, 'reset retains the seven-day original archive');
    await recovery.localRecoveryAction(id, { action: 'restore', recoveryId: reset.records[0].id, operationId: crypto.randomUUID(), generation: reset.generation, version: reset.version });
    wallet.pinGuestGeneration(id);
    check(wallet.localSnapshot(localStorage, id).budget === before.budget && wallet.localSnapshot(localStorage, id).categoryLabels.food === '식비', 'recovery restores settings and snapshot together');
    const restoredKey = wallet.guestKey(id); localStorage.removeItem(restoredKey);
    await (await import('/src/auth/local-durability.ts?integration=recovered')).initializeGuestDurability();
    check(wallet.localSnapshot(localStorage, id).budget === before.budget, 'restored generation is itself durable');
    return checks;
  });
  assert.equal(integration.length, 7); await context.close();
  console.log(JSON.stringify({ checks: [...results, ...integration], passed: results.length + integration.length, remoteDBWrites: 0 }));
} finally { await browser?.close(); await server.close(); }
