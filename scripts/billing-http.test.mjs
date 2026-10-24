import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { generateKeyPair, exportPKCS8, jwtVerify } from 'jose';
import { handleBilling } from '../server/billing/http.ts';
import { playAccessToken } from '../server/billing/google-play.ts';
import { createSession } from '../server/auth/store.ts';
import { annualProduct, billingAccountId } from '../server/billing/annual.ts';
import { accountPremium } from '../server/billing/store.ts';

const origin = 'http://localhost:5187', owner = '11111111-1111-4111-8111-111111111111', other = '22222222-2222-4222-8222-222222222222';
async function fixture(t) {
  const sqlite = new DatabaseSync(':memory:'); t.after(() => sqlite.close());
  sqlite.exec(readFileSync(new URL('./auth-foundation-schema.sql', import.meta.url), 'utf8'));
  sqlite.exec(readFileSync(new URL('./billing-auth-schema.sql', import.meta.url), 'utf8'));
  for (const id of [owner, other]) sqlite.prepare('INSERT INTO users(id,status,created_at) VALUES(?,?,?)').run(id, 'active', Date.now());
  const db = { prepare(sql) { const values = []; return { bind(...args) { values.push(...args); return this; },
    async first() { return sqlite.prepare(sql).get(...values) ?? null; }, async run() { return sqlite.prepare(sql).run(...values); } }; } };
  const session = await createSession(db, owner), cookie = 'mywallet-dev-session=' + session.token;
  const env = { DB: db, AUTH_ENABLED: 'true', AUTH_LOCAL_DEV: 'true', AUTH_ORIGIN: origin,
    AUTH_GOOGLE_CLIENT_ID: 'fixture.apps.googleusercontent.com', BILLING_ENABLED: 'true',
    BILLING_SERVICE_ACCOUNT_EMAIL: 'billing@fixture.iam.gserviceaccount.com',
    BILLING_SERVICE_ACCOUNT_PRIVATE_KEY: '-----BEGIN PRIVATE KEY-----fixture' };
  const now = Date.now(), expiry = now + 365 * 86400000;
  const purchase = { subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE', acknowledgementState: 'ACKNOWLEDGEMENT_STATE_PENDING',
    externalAccountIdentifiers: { obfuscatedExternalAccountId: await billingAccountId(owner) },
    lineItems: [{ productId: annualProduct.productId, offerDetails: { basePlanId: annualProduct.basePlanId },
      expiryTime: new Date(expiry).toISOString(), autoRenewingPlan: { autoRenewEnabled: true } }] };
  const calls = [];
  const deps = { now: () => now, accessToken: async () => 'server-access-token', fetcher: async (url, init) => {
    calls.push({ url, method: init.method || 'GET' });
    return url.endsWith(':acknowledge') ? new Response(null, { status: 204 }) : Response.json(purchase);
  } };
  const request = (action, body, changes = {}) => new Request(origin + '/api/billing/' + action, {
    method: body === undefined ? 'GET' : 'POST', headers: { Origin: origin, Cookie: cookie, 'Content-Type': 'application/json', ...changes },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  return { sqlite, db, env, purchase, deps, calls, request, now, expiry };
}

test('disabled billing exposes no purchase route or DB access', async () => {
  const env = { DB: { prepare() { throw Error('Must not query'); } } };
  const status = await handleBilling(new Request(origin + '/api/billing/status'), env, 'status');
  assert.deepEqual(await status.json(), { enabled: false });
  assert.equal((await handleBilling(new Request(origin + '/api/billing/verify', { method: 'POST' }), env, 'verify')).status, 503);
});

test('billing requires a real app session, same origin, exact request fields and bounded JSON', async t => {
  const f = await fixture(t);
  assert.equal((await handleBilling(f.request('status', undefined, { Cookie: '' }), f.env, 'status', f.deps)).status, 401);
  assert.equal((await handleBilling(f.request('verify', { purchaseToken: 't' }, { Origin: 'https://evil.example' }), f.env, 'verify', f.deps)).status, 403);
  for (const body of [{ purchaseToken: 't', userId: other }, { premium: true }, { purchaseToken: 'x'.repeat(9000) }]) {
    assert.equal((await handleBilling(f.request('verify', body), f.env, 'verify', f.deps)).status, 400);
  }
  assert.equal((await handleBilling(f.request('verify'), f.env, 'verify', f.deps)).status, 405);
  assert.equal(f.calls.length, 0);
});

test('verified annual purchase is durably granted before server acknowledgement and status contains no credentials', async t => {
  const f = await fixture(t), original = f.deps.fetcher;
  f.deps.fetcher = async (url, init) => {
    if (url.endsWith(':acknowledge')) assert.equal((await accountPremium(f.db, owner, f.now)).plan, 'premium_yearly');
    return original(url, init);
  };
  const response = await handleBilling(f.request('verify', { purchaseToken: 'private-purchase-token' }), f.env, 'verify', f.deps);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.plan, 'premium_yearly'); assert.equal(body.expiresAt, f.expiry);
  assert.equal(body.accountId, await billingAccountId(owner));
  assert(!JSON.stringify(body).includes('private-purchase-token'));
  assert(!JSON.stringify(body).includes('server-access-token'));
  assert(f.calls[1].url.endsWith('/purchases/subscriptions/memoney_premium/tokens/private-purchase-token:acknowledge'));
  assert.equal(f.calls[1].method, 'POST');
  assert.equal((await accountPremium(f.db, other, f.now)).plan, 'free');
});

test('another app accounts purchase cannot grant premium', async t => {
  const f = await fixture(t);
  f.purchase.externalAccountIdentifiers.obfuscatedExternalAccountId = await billingAccountId(other);
  const response = await handleBilling(f.request('verify', { purchaseToken: 'token' }), f.env, 'verify', f.deps);
  assert.equal(response.status, 409); assert.equal(f.calls.length, 1);
  assert.equal((await accountPremium(f.db, owner, f.now)).plan, 'free');
});

test('pending purchase grants nothing; completion and restore retries use the same ownership safely', async t => {
  const f = await fixture(t);
  f.purchase.subscriptionState = 'SUBSCRIPTION_STATE_PENDING';
  const response = await handleBilling(f.request('verify', { purchaseToken: 'same-token' }), f.env, 'verify', f.deps);
  const pending = await response.json(); assert.equal(pending.plan, 'free'); assert.equal(pending.purchasePending, true);
  assert.equal(f.calls.length, 1);
  f.purchase.subscriptionState = 'SUBSCRIPTION_STATE_ACTIVE';
  for (let i = 0; i < 2; i++) {
    assert.equal((await handleBilling(f.request('verify', { purchaseToken: 'same-token' }), f.env, 'verify', f.deps)).status, 200);
  }
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM billing_subscriptions').get().n, 1);
});

test('acknowledgement failure stays retryable without losing a verified entitlement', async t => {
  const f = await fixture(t), original = f.deps.fetcher;
  f.deps.fetcher = async (url, init) => url.endsWith(':acknowledge') ? new Response('failure', { status: 503 }) : original(url, init);
  const response = await handleBilling(f.request('verify', { purchaseToken: 'token' }), f.env, 'verify', f.deps);
  assert.equal(response.status, 503); assert.equal((await response.json()).error, 'PURCHASE_PROCESSING_PENDING');
  const status = await handleBilling(f.request('status'), f.env, 'status', f.deps);
  assert.equal((await status.json()).plan, 'premium_yearly');
  f.deps.fetcher = original;
  assert.equal((await handleBilling(f.request('verify', { purchaseToken: 'token' }), f.env, 'verify', f.deps)).status, 200);
});

test('verification throttling prevents repeated publisher API calls and DB failures never become a false free status', async t => {
  const f = await fixture(t);
  f.deps.fetcher = async () => { f.calls.push('request'); return new Response(null, { status: 404 }); };
  for (let i = 0; i < 30; i++) {
    assert.equal((await handleBilling(f.request('verify', { purchaseToken: 'invalid-token' }), f.env, 'verify', f.deps)).status, 400);
  }
  assert.equal((await handleBilling(f.request('verify', { purchaseToken: 'invalid-token' }), f.env, 'verify', f.deps)).status, 429);
  assert.equal(f.calls.length, 30);
  f.sqlite.exec('DROP TABLE billing_subscriptions');
  assert.equal((await handleBilling(f.request('status'), f.env, 'status', f.deps)).status, 503);
});

test('server OAuth JWT has only the publisher scope, uses the service identity, and never returns the private key', async () => {
  const { privateKey, publicKey } = await generateKeyPair('RS256', { extractable: true });
  const pem = await exportPKCS8(privateKey), email = 'billing@fixture.iam.gserviceaccount.com', now = Date.now();
  const token = await playAccessToken({ BILLING_SERVICE_ACCOUNT_EMAIL: email, BILLING_SERVICE_ACCOUNT_PRIVATE_KEY: pem }, async (url, init) => {
    assert.equal(url, 'https://oauth2.googleapis.com/token'); assert.equal(init.redirect, 'error');
    assert.equal(init.body.get('grant_type'), 'urn:ietf:params:oauth:grant-type:jwt-bearer');
    const claims = (await jwtVerify(init.body.get('assertion'), publicKey, { issuer: email,
      audience: url, currentDate: new Date(now) })).payload;
    assert.equal(claims.scope, 'https://www.googleapis.com/auth/androidpublisher');
    return Response.json({ access_token: 'fixture-access', token_type: 'Bearer', expires_in: 3600 });
  }, now);
  assert.equal(token, 'fixture-access'); assert(!token.includes(pem));
  await assert.rejects(playAccessToken({}), /BILLING_NOT_CONFIGURED/);
});
