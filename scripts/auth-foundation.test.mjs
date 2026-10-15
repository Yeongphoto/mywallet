import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { generateKeyPair, SignJWT, exportJWK, createLocalJWKSet } from 'jose';
import { verifyGoogleIdentity } from '../server/auth/google.ts';
import { handleAuth } from '../server/auth/http.ts';
import { createChallenge, readChallenge, consumeChallenge, sessionUser, resolveUser, createSession } from '../server/auth/store.ts';
import { ledgerAccess } from '../server/auth/ledger-access.ts';

const { privateKey, publicKey } = await generateKeyPair('RS256');
const keys = createLocalJWKSet({ keys: [{ ...await exportJWK(publicKey), kid: 'test', alg: 'RS256' }] });
const clientId = 'test-client.apps.googleusercontent.com';
const androidClientId = 'test-android.apps.googleusercontent.com';
const nonce = 'n'.repeat(64);
async function sign(claims = {}, signingKey = privateKey) {
  return new SignJWT({ nonce, email: 'test@example.invalid', email_verified: true, ...claims })
    .setProtectedHeader({ alg: 'RS256', kid: 'test' }).setSubject(claims.sub ?? 'google-subject-A')
    .setIssuer(claims.iss ?? 'https://accounts.google.com').setAudience(claims.aud ?? clientId)
    .setIssuedAt(claims.iat ?? Math.floor(Date.now() / 1000)).setExpirationTime(claims.exp ?? '5m').sign(signingKey);
}
function fixture() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON;');
  sqlite.exec(readFileSync(new URL('./auth-foundation-schema.sql', import.meta.url), 'utf8'));
  const db = {
    prepare(sql) {
      return { sql, values: [], bind(...values) { this.values = values; return this; },
        async first() { return sqlite.prepare(sql).get(...this.values) ?? null; },
        async run() { return sqlite.prepare(sql).run(...this.values); } };
    },
    async batch(statements) {
      sqlite.exec('BEGIN');
      try { const results = statements.map(s => sqlite.prepare(s.sql).run(...s.values)); sqlite.exec('COMMIT'); return results; }
      catch (error) { sqlite.exec('ROLLBACK'); throw error; }
    },
  };
  return { sqlite, db, env: { DB: db, AUTH_ENABLED: 'true', AUTH_GOOGLE_CLIENT_ID: clientId, AUTH_ORIGIN: 'https://app.example.invalid' } };
}
const verify = (token, audience, expectedNonce, parties = []) => verifyGoogleIdentity(token, audience, expectedNonce, keys, parties);
function request(action, method = 'GET', cookies = '', body, origin = 'https://app.example.invalid') {
  return new Request(`https://app.example.invalid/api/auth/${action}`, { method,
    headers: { Origin: origin, Cookie: cookies, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}) });
}
function cookiesOf(response) { return response.headers.getSetCookie().map(value => value.split(';')[0]); }

test('Google identity validates signature, issuer, audience, expiry, nonce and azp', async () => {
  const identity = await verifyGoogleIdentity(await sign(), clientId, nonce, keys);
  assert.equal(identity.subject, 'google-subject-A');
  assert.equal(identity.issuer, 'https://accounts.google.com');
  assert.equal((await verifyGoogleIdentity(await sign({ iss: 'accounts.google.com' }), clientId, nonce, keys)).issuer, identity.issuer);
  for (const claims of [{ iss: 'https://attacker.invalid' }, { aud: 'other-client' }, { exp: 1 },
    { nonce: 'wrong-nonce' }, { azp: 'other-client' }, { iat: Math.floor(Date.now() / 1000) + 600 }]) {
    await assert.rejects(verifyGoogleIdentity(await sign(claims), clientId, nonce, keys));
  }
  const other = await generateKeyPair('RS256');
  await assert.rejects(verifyGoogleIdentity(await sign({}, other.privateKey), clientId, nonce, keys));
});

test('identity mapping never merges two Google subjects with the same email', async () => {
  const { db, sqlite } = fixture();
  try {
    const a = await resolveUser(db, { issuer: 'https://accounts.google.com', subject: 'A', email: 'same@example.invalid' });
    const b = await resolveUser(db, { issuer: 'https://accounts.google.com', subject: 'B', email: 'same@example.invalid' });
    assert.notEqual(a, b);
    assert.equal(await resolveUser(db, { issuer: 'https://accounts.google.com', subject: 'A', email: 'changed@example.invalid' }), a);
    assert.equal(sqlite.prepare('SELECT count(*) AS count FROM users').get().count, 2);
  } finally { sqlite.close(); }
});

test('invitation profile comes from verified Google claims without granting membership', async () => {
  const { db, sqlite, env } = fixture();
  try {
    sqlite.exec(readFileSync(new URL('./ledger-invitations-schema.sql', import.meta.url), 'utf8'));
    const sharingEnv = { ...env, AUTH_LEDGER_INVITES: 'true' };
    const challengeResponse = await handleAuth(request('challenge', 'POST'), sharingEnv, 'challenge', verify);
    const state = cookiesOf(challengeResponse)[0]; const challenge = await challengeResponse.json();
    const token = await sign({ email: 'fixture@gmail.com', nonce: challenge.nonce });
    const login = await handleAuth(request('google', 'POST', state, { idToken: token }), sharingEnv, 'google', verify);
    assert.equal(login.status, 200);
    const profile = sqlite.prepare('SELECT email, authoritative FROM auth_identity_profiles').get();
    assert.equal(profile.email, 'fixture@gmail.com'); assert.equal(profile.authoritative, 1);
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM ledger_memberships').get().n, 0);
    assert.equal((await verifyGoogleIdentity(await sign({ email: 'fixture@example.invalid' }), clientId, nonce, keys)).authoritativeEmail, false);
  } finally { sqlite.close(); }
});

test('native authorized party requires an explicit allowlist and the Web audience', async () => {
  const token = await sign({ azp: androidClientId });
  await assert.rejects(verifyGoogleIdentity(token, clientId, nonce, keys));
  assert.equal((await verifyGoogleIdentity(token, clientId, nonce, keys, [androidClientId])).subject, 'google-subject-A');
  assert.equal((await verifyGoogleIdentity(await sign({ azp: clientId }), clientId, nonce, keys, [androidClientId])).subject, 'google-subject-A');
  for (const claims of [{ azp: 'unregistered.apps.googleusercontent.com' },
    { azp: androidClientId, aud: androidClientId }, { azp: androidClientId, nonce: 'wrong-nonce' },
    { azp: [androidClientId] }]) {
    await assert.rejects(verifyGoogleIdentity(await sign(claims), clientId, nonce, keys, [androidClientId]));
  }
});

test('HTTP native login passes only configured authorized parties into token verification', async () => {
  const { db, sqlite, env } = fixture();
  try {
    const challengeResponse = await handleAuth(request('challenge', 'POST'), env, 'challenge', verify);
    const state = cookiesOf(challengeResponse)[0];
    const challenge = await challengeResponse.json();
    const token = await sign({ azp: androidClientId, nonce: challenge.nonce });
    assert.equal((await handleAuth(request('google', 'POST', state, { idToken: token }), env, 'google', verify)).status, 401);
    const nativeEnv = { ...env, AUTH_GOOGLE_ANDROID_CLIENT_ID: androidClientId };
    const login = await handleAuth(request('google', 'POST', state, { idToken: token }), nativeEnv, 'google', verify);
    assert.equal(login.status, 200);
    const session = cookiesOf(login)[0];
    assert.equal((await handleAuth(request('session', 'GET', session), nativeEnv, 'session', verify)).status, 200);
    const invalidEnv = { ...env, AUTH_GOOGLE_ANDROID_CLIENT_ID: '*' };
    assert.equal((await handleAuth(request('session'), invalidEnv, 'session', verify)).status, 503);
  } finally { sqlite.close(); }
});

test('challenge is hashed, expires and can be consumed exactly once', async () => {
  const { db, sqlite } = fixture();
  try {
    const challenge = await createChallenge(db, 1000);
    assert.notEqual(sqlite.prepare('SELECT token_hash FROM auth_login_challenges').get().token_hash, challenge.token);
    assert.equal((await readChallenge(db, challenge.token, 1001)).nonce, challenge.nonce);
    assert.equal(await readChallenge(db, challenge.token, 301000), null);
    assert(await consumeChallenge(db, challenge.token, challenge.nonce, 1001));
    assert.equal(await consumeChallenge(db, challenge.token, challenge.nonce, 1001), null);
  } finally { sqlite.close(); }
});

test('HTTP login verifies signed token, sets secure cookie, blocks replay and revokes logout', async () => {
  const { db, sqlite, env } = fixture();
  try {
    assert.equal((await handleAuth(request('session'), env, 'session', verify)).status, 401);
    assert.equal((await handleAuth(request('challenge', 'POST', '', null, 'https://attacker.invalid'), env, 'challenge', verify)).status, 403);
    assert.equal((await handleAuth(request('google', 'POST', '', { idToken: 'x'.repeat(25000) }), env, 'google', verify)).status, 400);
    const challenge = await handleAuth(request('challenge', 'POST'), env, 'challenge', verify);
    const stateCookie = cookiesOf(challenge)[0];
    const data = await challenge.json();
    const token = await sign({ nonce: data.nonce });
    const login = await handleAuth(request('google', 'POST', stateCookie, { idToken: token }), env, 'google', verify);
    assert.equal(login.status, 200);
    const sessionCookie = cookiesOf(login)[0];
    assert.match(login.headers.getSetCookie()[0], /__Host-mywallet-session=.*; Path=\/; HttpOnly; SameSite=Lax; Max-Age=604800; Secure/);
    const userId = (await login.json()).user.id;
    assert(!sqlite.prepare('SELECT token_hash FROM auth_sessions').get().token_hash.includes(sessionCookie.split('=')[1]));
    assert.equal((await (await handleAuth(request('session', 'GET', sessionCookie), env, 'session', verify)).json()).user.id, userId);
    assert.equal((await handleAuth(request('google', 'POST', stateCookie, { idToken: token }), env, 'google', verify)).status, 401);
    assert.equal((await handleAuth(request('logout', 'POST', sessionCookie), env, 'logout', verify)).status, 200);
    assert.equal((await handleAuth(request('session', 'GET', sessionCookie), env, 'session', verify)).status, 401);
    assert.equal(await sessionUser(db, sessionCookie.split('=')[1]), null);
  } finally { sqlite.close(); }
});

test('disabled accounts and expired sessions cannot authenticate', async () => {
  const { db, sqlite } = fixture();
  try {
    const user = await resolveUser(db, { issuer: 'https://accounts.google.com', subject: 'A', email: null });
    const session = await createSession(db, user, 1000);
    assert(await sessionUser(db, session.token, 1001));
    assert.equal(await sessionUser(db, session.token, 1000 + 604800000), null);
    sqlite.prepare("UPDATE users SET status = 'disabled' WHERE id = ?").run(user);
    assert.equal(await sessionUser(db, session.token, 1001), null);
    await assert.rejects(resolveUser(db, { issuer: 'https://accounts.google.com', subject: 'A', email: null }));
  } finally { sqlite.close(); }
});

test('missing config and insecure non-local origins fail closed without DB access', async () => {
  const inaccessible = { prepare() { throw new Error('Unexpected DB access'); } };
  const disabled = { DB: inaccessible };
  assert.equal((await handleAuth(request('google', 'POST', '', { idToken: 'not-a-token' }), disabled, 'google')).status, 503);
  assert.deepEqual(await (await handleAuth(request('config'), disabled, 'config')).json(), { enabled: false, clientId: null });
  const insecure = { DB: inaccessible, AUTH_ENABLED: 'true', AUTH_GOOGLE_CLIENT_ID: clientId,
    AUTH_ORIGIN: 'http://remote.example.invalid', AUTH_LOCAL_DEV: 'true' };
  assert.equal((await handleAuth(new Request('http://remote.example.invalid/api/auth/session'), insecure, 'session')).status, 503);
});

test('private and shared ledgers enforce membership, viewer/editor roles and revocation', async () => {
  const { db, sqlite } = fixture();
  try {
    for (const id of ['owner', 'partner', 'outsider']) sqlite.prepare('INSERT INTO users VALUES (?, ?, ?)').run(id, 'active', 1);
    for (const id of ['private', 'shared']) {
      sqlite.prepare('INSERT INTO ledgers VALUES (?, ?, ?, ?)').run(id, 'owner', id, 1);
      sqlite.prepare('INSERT INTO ledger_memberships VALUES (?, ?, ?, ?)').run(id, 'owner', 'owner', 1);
    }
    sqlite.prepare('INSERT INTO ledger_memberships VALUES (?, ?, ?, ?)').run('shared', 'partner', 'viewer', 1);
    assert.equal(await ledgerAccess(db, 'partner', 'private'), null);
    assert.equal(await ledgerAccess(db, 'outsider', 'shared'), null);
    assert.equal(await ledgerAccess(db, 'partner', 'shared', 'unexpected'), null);
    assert(await ledgerAccess(db, 'partner', 'shared', 'view'));
    assert.equal(await ledgerAccess(db, 'partner', 'shared', 'write'), null);
    assert.equal(await ledgerAccess(db, 'partner', 'shared', 'manage'), null);
    sqlite.prepare("UPDATE ledger_memberships SET role = 'editor' WHERE user_id = 'partner'").run();
    assert(await ledgerAccess(db, 'partner', 'shared', 'write'));
    assert.equal(await ledgerAccess(db, 'partner', 'shared', 'manage'), null);
    sqlite.prepare("DELETE FROM ledger_memberships WHERE user_id = 'partner'").run();
    assert.equal(await ledgerAccess(db, 'partner', 'shared'), null);
    assert(await ledgerAccess(db, 'owner', 'private', 'manage'));
  } finally { sqlite.close(); }
});
