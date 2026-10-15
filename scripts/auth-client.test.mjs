import test from 'node:test';
import assert from 'node:assert/strict';
import { createAuthClient } from '../src/auth/auth-client.ts';

const clientId = 'test.apps.googleusercontent.com';
const nonce = 'a'.repeat(64);
const user = { id: '12345678-1234-1234-1234-123456789abc' };
const json = (data, status = 200) => Response.json(data, { status });
function harness(native, handler) {
  const calls = [];
  const client = createAuthClient(native, async (path, options) => {
    calls.push({ path, options });
    assert.equal(options.credentials, 'same-origin');
    assert.equal(options.cache, 'no-store');
    assert.equal(options.redirect, 'error');
    return handler(path, options);
  });
  return { client, calls };
}

test('native credential is submitted to the server and success requires a cookie-backed session', async () => {
  const credential = { idToken: 'transient-token' };
  const { client, calls } = harness({
    async signIn(options) { assert.deepEqual(options, { clientId, nonce }); return credential; },
  }, (path, options) => {
    if (path.endsWith('challenge')) return json({ clientId, nonce });
    if (path.endsWith('google')) { assert.deepEqual(JSON.parse(options.body), { idToken: 'transient-token' }); return json({ user }); }
    return json({ user });
  });
  assert.deepEqual(await client.signIn(), user);
  assert.equal(credential.idToken, '');
  assert.deepEqual(calls.map(call => call.path), ['/api/auth/challenge', '/api/auth/google', '/api/auth/session']);
});

test('cancelled account selection submits no credential and a retry uses a new challenge', async () => {
  let attempt = 0;
  const { client, calls } = harness({
    async signIn() { if (++attempt === 1) throw { code: 'CANCELLED' }; return { idToken: 'retry-token' }; },
  }, path => path.endsWith('challenge') ? json({ clientId, nonce }) : json({ user }));
  await assert.rejects(client.signIn(), error => error.code === 'CANCELLED');
  assert.equal(calls.filter(call => call.path.endsWith('google')).length, 0);
  await client.signIn();
  assert.equal(calls.filter(call => call.path.endsWith('challenge')).length, 2);
});

test('a rejected Google token never produces authenticated UI state and is cleared', async () => {
  const credential = { idToken: 'rejected-token' };
  const { client, calls } = harness({ async signIn() { return credential; } },
    path => path.endsWith('challenge') ? json({ clientId, nonce }) : json({ error: 'INVALID_ID_TOKEN' }, 401));
  await assert.rejects(client.signIn(), error => error.code === 'INVALID_ID_TOKEN');
  assert.equal(credential.idToken, '');
  assert.equal(calls.some(call => call.path.endsWith('session')), false);
});

test('successful login response without a usable session cookie is not success', async () => {
  const { client } = harness({ async signIn() { return { idToken: 'token' }; } }, path => {
    if (path.endsWith('challenge')) return json({ clientId, nonce });
    if (path.endsWith('session')) return json({ error: 'UNAUTHENTICATED' }, 401);
    return json({ user });
  });
  await assert.rejects(client.signIn(), error => error.code === 'SESSION_NOT_SAVED');
});

test('server logout precedes provider cleanup and provider errors do not restore a session', async () => {
  const order = [];
  const { client } = harness({ async clearCredentialState() { order.push('provider'); throw Error('provider'); } }, () => {
    order.push('server'); return json({ success: true });
  });
  assert.deepEqual(await client.logout(), { providerCleared: false });
  assert.deepEqual(order, ['server', 'provider']);
  const { client: failed } = harness({ async clearCredentialState() { assert.fail('Provider must not clear before server revocation'); } },
    () => json({ error: 'AUTH_UNAVAILABLE' }, 503));
  await assert.rejects(failed.logout(), error => error.code === 'AUTH_UNAVAILABLE');
});

test('invalid challenge, unavailable session and network errors fail closed', async () => {
  const { client } = harness({ async signIn() { assert.fail('Invalid challenge must not reach native code'); } },
    () => json({ clientId, nonce: 'short' }));
  await assert.rejects(client.signIn(), error => error.code === 'AUTH_UNAVAILABLE');
  const { client: unavailable } = harness({}, () => json({ error: 'AUTH_UNAVAILABLE' }, 503));
  await assert.rejects(unavailable.session(), error => error.code === 'AUTH_UNAVAILABLE');
  const offline = createAuthClient({}, async () => { throw Error('offline'); });
  await assert.rejects(offline.session(), error => error.code === 'NETWORK');
});
