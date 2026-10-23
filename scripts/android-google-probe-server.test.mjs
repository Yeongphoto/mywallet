import assert from 'node:assert/strict';
import test from 'node:test';
import { startBundleFixture } from './bundle-probe-fixture.mjs';

test('real Google probe verifies tokens against configured Web audience and blocks every finance route', async () => {
  const fixture = await startBundleFixture({ realGoogleAndroidClientId: 'probe-android.apps.googleusercontent.com' });
  try {
    const origin = 'http://127.0.0.1:5198';
    const config = await fetch(origin + '/api/auth/config').then(response => response.json());
    assert.equal(config.enabled, true);
    assert.equal(config.clientId, '367615872651-ln2adrilfm9c9ofk12pl5jip1so1ra08.apps.googleusercontent.com');
    const noRedirect = await fetch(origin + '/api/auth/config?redirect=1', { redirect: 'manual' });
    assert.equal(noRedirect.status, 200);
    assert.equal(noRedirect.headers.has('location'), false);

    const challenge = await fetch(origin + '/api/auth/challenge', { method: 'POST', headers: { Origin: origin } });
    assert.equal(challenge.status, 200);
    const cookie = challenge.headers.get('set-cookie').split(';', 1)[0];
    const rejected = await fetch(origin + '/api/auth/google', { method: 'POST', headers: {
      Origin: origin, Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken: 'not-a-google-token' }) });
    assert.equal(rejected.status, 401);

    for (const path of ['/api/data', '/api/wallet/context', '/api/wallet/onboarding']) {
      assert.equal((await fetch(origin + path)).status, 403);
    }
    assert.equal(fixture.metrics.financialReads, 0);
    assert.equal(fixture.metrics.financialWrites, 0);
    assert.equal(fixture.metrics.financeRows, 0);
  } finally {
    await fixture.close();
  }
});
