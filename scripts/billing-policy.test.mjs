import assert from 'node:assert/strict';
import test from 'node:test';
import { annualProduct, billingAccountId, hasAnnualPremium, verifyAnnualPurchase } from '../server/billing/annual.ts';
import { monetizationPolicy } from '../server/billing/policy.ts';
import { saveVerifiedSubscription, accountPremium } from '../server/billing/store.ts';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';

const owner = '11111111-1111-4111-8111-111111111111', guest = '22222222-2222-4222-8222-222222222222';
const now = Date.parse('2026-10-24T00:00:00Z'), expiry = Date.parse('2027-10-24T00:00:00Z');
async function payload(userId = owner, state = 'SUBSCRIPTION_STATE_ACTIVE') {
  return { subscriptionState: state, acknowledgementState: 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED',
    externalAccountIdentifiers: { obfuscatedExternalAccountId: await billingAccountId(userId) },
    lineItems: [{ productId: annualProduct.productId, offerDetails: { basePlanId: annualProduct.basePlanId },
      expiryTime: new Date(expiry).toISOString(), autoRenewingPlan: { autoRenewEnabled: true } }] };
}
async function verified(userId = owner, state = 'SUBSCRIPTION_STATE_ACTIVE', change = data => data, overrides = {}) {
  const data = change(await payload(userId, state));
  return verifyAnnualPurchase({ userId, purchaseToken: 'fixture-token', accessToken: 'server-credential', now,
    fetcher: async () => Response.json(data), ...overrides });
}
const policy = (purchases = [], changes = {}) => monetizationPolicy({ actorUserId: guest, ledgerOwnerUserId: owner,
  ledgerAssetCount: 10, entriesUsedToday: 10, verifiedRewardsToday: 0, purchases, now, ...changes });

test('subscribed host unlocks shared assets without removing ads or entry limits from an unpaid guest', async () => {
  const result = policy([await verified(owner)], { ledgerAssetCount: 25 });
  assert.equal(result.assetLimit, null); assert.equal(result.canCreateAsset, true);
  assert.equal(result.actorPlan, 'free'); assert.equal(result.dailyEntryLimit, 10);
  assert.equal(result.adsEnabled, true); assert.equal(result.rewardRequiredForNextEntry, true);
  assert.equal(result.canCreateEntry, false);
});

test('subscribed guest gets personal ad removal and unlimited entries but does not upgrade the hosts asset plan', async () => {
  const result = policy([await verified(guest)]);
  assert.equal(result.assetLimit, 10); assert.equal(result.canCreateAsset, false);
  assert.equal(result.actorPlan, 'premium_yearly'); assert.equal(result.adsEnabled, false);
  assert.equal(result.dailyEntryLimit, null); assert.equal(result.canCreateEntry, true);
});

test('personal ledger uses its owners subscription for both assets and entries', async () => {
  const result = policy([await verified(owner)], { actorUserId: owner });
  assert.equal(result.ledgerAssetPlan, 'premium_yearly'); assert.equal(result.actorPlan, 'premium_yearly');
  assert.equal(result.canCreateAsset, true); assert.equal(result.adsEnabled, false);
});

test('cancellation retains paid time; grace retains entitlement; hold, pause, pending and expiry do not', async () => {
  for (const state of ['SUBSCRIPTION_STATE_ACTIVE', 'SUBSCRIPTION_STATE_CANCELED', 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD']) {
    const purchase = await verified(owner, state);
    assert.equal(hasAnnualPremium(owner, [purchase], now), true);
    assert.equal(hasAnnualPremium(owner, [purchase], expiry), false);
  }
  for (const state of ['SUBSCRIPTION_STATE_ON_HOLD', 'SUBSCRIPTION_STATE_PAUSED', 'SUBSCRIPTION_STATE_PENDING',
    'SUBSCRIPTION_STATE_EXPIRED', 'SUBSCRIPTION_STATE_PENDING_PURCHASE_CANCELED']) {
    assert.equal(hasAnnualPremium(owner, [await verified(owner, state)], now), false);
  }
});

test('verified ad rewards extend the free allowance by ten without increasing the asset limit', () => {
  const result = policy([], { verifiedRewardsToday: 1 });
  assert.equal(result.dailyEntryLimit, 20); assert.equal(result.entriesRemaining, 10);
  assert.equal(result.canCreateEntry, true); assert.equal(result.adsEnabled, true); assert.equal(result.assetLimit, 10);
  for (const changes of [{ entriesUsedToday: -1 }, { verifiedRewardsToday: 0.5 }, { ledgerAssetCount: NaN },
    { verifiedRewardsToday: Number.MAX_SAFE_INTEGER }]) assert.throws(() => policy([], changes), /COUNTER/);
});

test('downgrade preserves all existing records and never restores entitlement from another account or a future snapshot', async () => {
  const purchase = await verified(owner);
  assert.equal(hasAnnualPremium(guest, [purchase], now), false);
  assert.equal(hasAnnualPremium(owner, [{ ...purchase, verifiedAt: now + 1 }], now), false);
  const result = policy([purchase], { now: expiry, ledgerAssetCount: 50 });
  assert.equal(result.assetLimit, 10); assert.equal(result.canCreateAsset, false);
  assert.equal(result.restrictExistingRecords, false); assert.equal(result.preserveExistingRecords, true);
});

test('the verifier contacts the fixed package API, binds the app account and omits raw purchase credentials from the snapshot', async () => {
  let requested;
  const data = await payload();
  const result = await verifyAnnualPurchase({ userId: owner, purchaseToken: 'opaque/token', accessToken: 'secret-server-value', now,
    fetcher: async (url, init) => { requested = { url, init }; return Response.json(data); } });
  assert.equal(requested.url, 'https://androidpublisher.googleapis.com/androidpublisher/v3/applications/com.memoney.app/purchases/subscriptionsv2/tokens/opaque%2Ftoken');
  assert.equal(requested.init.redirect, 'error'); assert.equal(requested.init.headers.Authorization, 'Bearer secret-server-value');
  assert(!JSON.stringify(result).includes('opaque')); assert(!JSON.stringify(result).includes('secret-server-value'));
  const binding = await billingAccountId(owner); assert.equal(binding.length, 64); assert(!binding.includes(owner));
  await assert.rejects(billingAccountId('client-supplied-email@example.com'), /ACCOUNT/);
});

test('wrong app account, unrelated products, unconfigured plans, invalid dates and production test purchases are rejected', async () => {
  const invalid = [
    [data => ({ ...data, externalAccountIdentifiers: {} }), /ACCOUNT_MISMATCH/],
    [data => { data.lineItems[0].productId = 'other'; return data; }, /PRODUCT_MISMATCH/],
    [data => { data.lineItems[0].offerDetails.basePlanId = 'monthly'; return data; }, /PRODUCT_MISMATCH/],
    [data => { data.lineItems[0].expiryTime = '2027-10-24'; return data; }, /INVALID_PLAY_RESPONSE/],
    [data => ({ ...data, testPurchase: {} }), /TEST_PURCHASE_NOT_ALLOWED/],
    [data => ({ ...data, subscriptionState: 'CLIENT_PREMIUM' }), /INVALID_PLAY_RESPONSE/],
  ];
  for (const [change, error] of invalid) await assert.rejects(verified(owner, 'SUBSCRIPTION_STATE_ACTIVE', change), error);
  const otherAccount = await payload(guest);
  await assert.rejects(verifyAnnualPurchase({ userId: owner, purchaseToken: 'token', accessToken: 'server', now,
    fetcher: async () => Response.json(otherAccount) }), /ACCOUNT_MISMATCH/);
});

test('pending purchases without expiry never grant premium, and an old expired purchase cannot override a newer valid purchase', async () => {
  const pending = await verified(owner, 'SUBSCRIPTION_STATE_PENDING', data => {
    delete data.lineItems[0].expiryTime; data.acknowledgementState = 'ACKNOWLEDGEMENT_STATE_PENDING'; return data;
  });
  assert.equal(pending.expiresAt, null); assert.equal(pending.acknowledged, false);
  assert.equal(hasAnnualPremium(owner, [pending], now), false);
  const expired = await verified(owner, 'SUBSCRIPTION_STATE_EXPIRED');
  assert.equal(hasAnnualPremium(owner, [expired, await verified(owner)], now), true);
});

test('Google outages and invalid purchases fail without granting a local premium fallback or leaking credentials', async () => {
  for (const status of [400, 404, 401, 403, 429, 503]) {
    await assert.rejects(verifyAnnualPurchase({ userId: owner, purchaseToken: 'private-token', accessToken: 'private-access', now,
      fetcher: async () => new Response('private-token', { status }) }), error => {
      assert(!error.message.includes('private')); return ['INVALID_PURCHASE', 'PLAY_UNAVAILABLE'].includes(error.message);
    });
  }
  await assert.rejects(verifyAnnualPurchase({ userId: owner, purchaseToken: 'token', accessToken: 'server', now,
    fetcher: async () => { throw Error('private-network-detail'); } }), /PLAY_UNAVAILABLE/);
});

function registry(t) {
  const sqlite = new DatabaseSync(':memory:'); t.after(() => sqlite.close());
  sqlite.exec('CREATE TABLE users(id TEXT PRIMARY KEY);');
  for (const id of [owner, guest]) sqlite.prepare('INSERT INTO users(id) VALUES(?)').run(id);
  sqlite.exec(readFileSync(new URL('./billing-auth-schema.sql', import.meta.url), 'utf8'));
  return { sqlite, db: { prepare(sql) { const values = []; return {
    bind(...args) { values.push(...args); return this; },
    async first() { return sqlite.prepare(sql).get(...values) ?? null; },
  }; } } };
}

test('registry accepts only a freshly verified server snapshot and never transfers a purchase to another account', async t => {
  const { db, sqlite } = registry(t), purchase = await verified(owner);
  await assert.rejects(saveVerifiedSubscription(db, JSON.parse(JSON.stringify(purchase))), /SERVER_VERIFICATION_REQUIRED/);
  assert.equal(await saveVerifiedSubscription(db, purchase), 'stored');
  assert.equal((await accountPremium(db, owner, now)).plan, 'premium_yearly');
  assert.equal((await accountPremium(db, guest, now)).plan, 'free');
  // A token cannot change app-account ownership even if an upstream response is inconsistent.
  await assert.rejects(saveVerifiedSubscription(db, await verified(guest)), /PURCHASE_ALREADY_LINKED/);
  assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM billing_subscriptions').get().n, 1);
});

test('late verification cannot overwrite a newer hold, and valid purchases expire at the exact boundary', async t => {
  const { db } = registry(t);
  const older = await verified(owner);
  const newer = await verified(owner, 'SUBSCRIPTION_STATE_ON_HOLD', data => data, { now: now + 1 });
  await saveVerifiedSubscription(db, newer);
  assert.equal(await saveVerifiedSubscription(db, older), 'stale');
  assert.equal((await accountPremium(db, owner, now + 1)).plan, 'free');
  const renewed = await verified(owner, 'SUBSCRIPTION_STATE_ACTIVE', data => data, { now: now + 2 });
  await saveVerifiedSubscription(db, renewed);
  assert.equal((await accountPremium(db, owner, now + 2)).plan, 'premium_yearly');
  assert.equal((await accountPremium(db, owner, expiry)).plan, 'free');
});

test('revoking an old token does not remove a different valid annual purchase', async t => {
  const { db } = registry(t);
  await saveVerifiedSubscription(db, await verified(owner));
  await saveVerifiedSubscription(db, await verified(owner, 'SUBSCRIPTION_STATE_ACTIVE', data => data, { purchaseToken: 'replacement-token' }));
  await saveVerifiedSubscription(db, await verified(owner, 'SUBSCRIPTION_STATE_EXPIRED', data => data, { now: now + 1 }));
  assert.equal((await accountPremium(db, owner, now + 1)).plan, 'premium_yearly');
});
