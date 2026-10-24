import test from 'node:test';
import assert from 'node:assert/strict';
import { createAnnualBillingClient } from '../src/auth/billing-client.ts';

function fixture() {
  const calls = [], nativeCalls = [];
  let plan = 'free', account = 'a'.repeat(64), pending = false;
  const status = () => ({ enabled: true, plan, expiresAt: plan === 'free' ? null : Date.now() + 86400000,
    accountId: account, productId: 'memoney_premium', basePlanId: 'annual', billingPeriod: 'P1Y' });
  const native = {
    async configuration() { nativeCalls.push('configuration'); return { available: true }; },
    async product() { nativeCalls.push('product'); return { productId: 'memoney_premium', basePlanId: 'annual',
      billingPeriod: 'P1Y', formattedPrice: '₩12,345', currency: 'KRW', priceMicros: 12345000000 }; },
    async purchase(options) { nativeCalls.push({ purchase: options }); return { purchases: [{ purchaseToken: 'test-token', state: 'purchased' }] }; },
    async restore(options) { nativeCalls.push({ restore: options }); return { purchases: [] }; },
    async manage() { nativeCalls.push('manage'); },
  };
  const request = async (path, init) => {
    calls.push({ path, init });
    if (path.endsWith('/verify')) { assert.deepEqual(JSON.parse(init.body), { purchaseToken: 'test-token' }); if (!pending) plan = 'premium_yearly'; }
    return Response.json({ ...status(), ...(path.endsWith('/verify') ? { purchasePending: pending } : {}) });
  };
  return { native, nativeCalls, calls, request, client: createAnnualBillingClient(native, (...args) => request(...args)),
    setPlan(value) { plan = value; }, setAccount(value) { account = value; }, setPending(value) { pending = value; } };
}

test('disabled native billing never contacts the account API; disabled server never queries products', async () => {
  const f = fixture(); f.native.configuration = async () => ({ available: false });
  assert.deepEqual(await f.client.load(), { available: false }); assert.equal(f.calls.length, 0);
  const disabled = createAnnualBillingClient({ ...f.native, configuration: async () => ({ available: true }) }, async () => Response.json({ enabled: false }));
  assert.deepEqual(await disabled.load(), { available: false }); assert(!f.nativeCalls.includes('product'));
});

test('annual price comes from Play and purchase identity comes from the authenticated server', async () => {
  const f = fixture(), loaded = await f.client.load();
  assert.equal(loaded.price.formattedPrice, '₩12,345');
  const result = await f.client.purchase(); assert.equal(result.plan, 'premium_yearly');
  assert.deepEqual(f.nativeCalls.find(row => row.purchase).purchase, { accountId: 'a'.repeat(64) });
  const verification = f.calls.find(row => row.path.endsWith('/verify'));
  assert.equal(verification.init.credentials, 'same-origin'); assert.equal(verification.init.redirect, 'error');
  assert(!verification.init.body.includes('premium')); assert(!verification.init.body.includes('accountId'));
});

test('native purchased result alone never grants premium and pending purchases stay pending', async () => {
  const f = fixture(); f.setPending(true); await f.client.load();
  const result = await f.client.purchase(); assert.equal(result.plan, 'free'); assert.equal(result.purchasePending, true);
  assert(f.calls.some(row => row.path.endsWith('/verify')));
});

test('app account changes before or during the Play dialog stop purchase attachment', async () => {
  const f = fixture(); await f.client.load(); f.setAccount('b'.repeat(64));
  await assert.rejects(f.client.purchase(), /BILLING_ACCOUNT_CHANGED/);
  assert(!f.nativeCalls.some(row => row.purchase));
  f.setAccount('a'.repeat(64));
  f.native.purchase = async () => { f.setAccount('b'.repeat(64)); return { purchases: [{ purchaseToken: 'test-token', state: 'purchased' }] }; };
  await assert.rejects(f.client.purchase(), /BILLING_ACCOUNT_CHANGED/);
  assert(!f.calls.some(row => row.path.endsWith('/verify')));
});

test('cancelled purchases do not call verification; existing premium never launches another purchase', async () => {
  const f = fixture(); await f.client.load(); f.native.purchase = async () => { throw Error('CANCELLED'); };
  await assert.rejects(f.client.purchase(), /CANCELLED/); assert(!f.calls.some(row => row.path.endsWith('/verify')));
  f.setPlan('premium_yearly'); assert.equal((await f.client.purchase()).plan, 'premium_yearly');
});

test('empty Play restore cannot revoke a server entitlement, and product failure still permits purchase restoration', async () => {
  const f = fixture(); f.setPlan('premium_yearly'); await f.client.load();
  assert.equal((await f.client.restore()).plan, 'premium_yearly'); assert(!f.nativeCalls.includes('product'));
  f.setPlan('free'); f.native.product = async () => { throw Error('PRODUCT_UNAVAILABLE'); };
  assert.equal((await f.client.load()).priceError, 'PRODUCT_UNAVAILABLE');
  assert.equal((await f.client.restore()).plan, 'free');
});

test('concurrent initial loads share one product query, and concurrent purchase dialogs are rejected', async () => {
  const f = fixture(); await Promise.all([f.client.load(), f.client.load()]);
  assert.equal(f.nativeCalls.filter(row => row === 'product').length, 1);
  let finish;
  f.native.purchase = () => new Promise(resolve => { finish = resolve; });
  const first = f.client.purchase();
  await new Promise(resolve => setTimeout(resolve, 0));
  await assert.rejects(f.client.purchase(), /BILLING_BUSY/);
  finish({ purchases: [{ purchaseToken: 'test-token', state: 'purchased' }] });
  assert.equal((await first).plan, 'premium_yearly');
});

test('a pending result does not skip verification of additional restored tokens', async () => {
  const f = fixture(); f.setPending(true); await f.client.load();
  f.native.restore = async () => ({ purchases: [{ purchaseToken: 'test-token', state: 'pending' }, { purchaseToken: 'test-token', state: 'purchased' }] });
  await f.client.restore(); assert.equal(f.calls.filter(row => row.path.endsWith('/verify')).length, 2);
});
