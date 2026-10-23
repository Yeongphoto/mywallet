import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { releaseServerDraft } from './android-release-server.mjs';
import { readDevelopmentConfig } from './android-build-config.mjs';
import { hostedWalletDeployment } from '../server/wallet/deployment.ts';
import { sharedWalletConfiguration } from '../server/wallet/shared-web.ts';
import { isolatedSharedReady } from '../server/wallet/shared-creation.ts';
import { handleAuth } from '../server/auth/http.ts';
import { resolveUser } from '../server/auth/store.ts';

const profile = JSON.parse(readFileSync(new URL('../config/android-release.json', import.meta.url), 'utf8'));
const databases = JSON.parse(readFileSync(new URL('./hosted-databases.json', import.meta.url), 'utf8'));
const personal = { databaseId: databases.personal.id, databaseName: databases.personal.name, ledgerId: '11111111-1111-4111-8111-111111111111' };
const draft = () => releaseServerDraft(profile, readDevelopmentConfig().capacitor, databases, personal);

test('server draft preserves actual common DB IDs and has no automatic activation', () => {
  const config = draft();
  assert.deepEqual(config.d1_databases.map(row => row.database_id), Object.values(databases).map(row => row.id));
  assert.equal(config.vars.AUTH_ENABLED, 'false');
  assert.equal(config.vars.AUTH_PERSONAL_ONBOARDING, 'false');
  assert.equal(config.vars.AUTH_GOOGLE_ANDROID_CLIENT_ID, undefined);
  assert.equal(config.vars.AUTH_SHARED_WALLET_LEDGER_ID, personal.ledgerId);
  assert.equal(config.pages_build_output_dir, 'NOT_PREPARED_FOR_DEPLOYMENT');
  assert.equal(config.vars.AUTH_SHARED_WALLET_ORIGIN, undefined);
});

test('draft rejects changed DB identity, missing ledger and debug OAuth client', () => {
  const changed = structuredClone(databases); changed.personal.id = personal.ledgerId;
  assert.throws(() => releaseServerDraft(profile, readDevelopmentConfig().capacitor, changed, personal), /database mismatch/);
  assert.throws(() => releaseServerDraft(profile, readDevelopmentConfig().capacitor, databases, { ...personal, ledgerId: '' }), /mapping/);
  const changedProfile = structuredClone(profile);
  changedProfile.plugins.MemoneyGoogleAuth.androidClientId = readDevelopmentConfig().capacitor.plugins.MemoneyGoogleAuth.androidClientId;
  // A pending/invalid client is never emitted, even in a configuration draft.
  assert.throws(() => releaseServerDraft(changedProfile, readDevelopmentConfig().capacitor, databases, personal), /debug/);
});

test('release origin requires explicit gate; arbitrary hosts and suffixes are rejected', () => {
  const env = draft().vars;
  assert.equal(hostedWalletDeployment(env), true);
  for (const changed of [{ AUTH_RELEASE_DEPLOYMENT: 'false' }, { AUTH_SHARED_TEST_DEPLOYMENT: 'false' },
    { AUTH_LOCAL_DEV: 'true' }, { AUTH_ORIGIN: 'https://preview.memoney-6r5.pages.dev' },
    { AUTH_ORIGIN: 'https://memoney-6r5.pages.dev.evil.example' }, { AUTH_ORIGIN: 'https://other.pages.dev' }]) {
    assert.equal(hostedWalletDeployment({ ...env, ...changed }), false);
  }
  assert.equal(hostedWalletDeployment({ AUTH_ORIGIN: 'https://memoney-android-test.pages.dev', AUTH_SHARED_TEST_DEPLOYMENT: 'true' }), true);
});

test('release wallet keeps ledger binding and sharing isolation checks', async () => {
  const env = { ...draft().vars, TEST_FINANCE: {}, TEST_SHARED_FINANCE: { prepare() { return { bind() { return { async first() { return { id: 'marker' }; } }; } }; } } };
  assert.equal(sharedWalletConfiguration(env).ledgerId, personal.ledgerId);
  assert.equal(await isolatedSharedReady(env), true);
  assert.equal(sharedWalletConfiguration({ ...env, AUTH_RELEASE_DEPLOYMENT: 'false' }), null);
  assert.equal(await isolatedSharedReady({ ...env, AUTH_SHARED_WALLET_ORIGIN: 'https://old.example' }), false);
  assert.equal(sharedWalletConfiguration({ ...env, TEST_FINANCE: undefined }), null);
});

test('new origin uses host-only secure cookies and rejects old/local/cross-origin POST without DB access', async () => {
  let writes = 0;
  const env = { ...draft().vars, AUTH_ENABLED: 'true', DB: { prepare() { writes++; throw Error('No database access expected'); } } };
  for (const origin of ['https://memoney-android-test.pages.dev', 'http://localhost', 'https://evil.example']) {
    const response = await handleAuth(new Request(profile.hosting.origin + '/api/auth/challenge', { method: 'POST', headers: { Origin: origin } }), env, 'challenge');
    assert.equal(response.status, 403);
    assert.equal(response.headers.get('Access-Control-Allow-Origin'), null);
  }
  assert.equal(writes, 0);
  const sqlite = new DatabaseSync(':memory:');
  try {
    sqlite.exec(readFileSync(new URL('./auth-foundation-schema.sql', import.meta.url), 'utf8'));
    env.DB = { prepare(sql) { return { bind(...args) { return { async run() { sqlite.prepare(sql).run(...args); } }; } }; } };
    const response = await handleAuth(new Request(profile.hosting.origin + '/api/auth/challenge', { method: 'POST', headers: { Origin: profile.hosting.origin } }), env, 'challenge');
    assert.equal(response.status, 200);
    const cookie = response.headers.get('Set-Cookie');
    assert.match(cookie, /__Host-mywallet-login-state=/);
    assert.match(cookie, /HttpOnly; SameSite=Lax/);
    assert.match(cookie, /Secure/);
    assert.ok(!cookie.includes('Domain='));
  } finally { sqlite.close(); }
});

test('same Google subject resolves to same account across origins without creating another user', async () => {
  const sqlite = new DatabaseSync(':memory:');
  try {
    sqlite.exec(readFileSync(new URL('./auth-foundation-schema.sql', import.meta.url), 'utf8'));
    const db = { prepare(sql) { return { bind(...values) { return { async first() { return sqlite.prepare(sql).get(...values); }, async run() { sqlite.prepare(sql).run(...values); } }; } }; },
      async batch(statements) { for (const statement of statements) await statement.run(); } };
    const identity = { issuer: 'https://accounts.google.com', subject: 'isolated-memoney-release-fixture' };
    assert.equal(await resolveUser(db, identity), await resolveUser(db, identity));
    assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM users').get().n, 1);
  } finally { sqlite.close(); }
});
