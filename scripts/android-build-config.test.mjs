import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { developmentConfigErrors, releaseConfigErrors, readDevelopmentConfig } from './android-build-config.mjs';

const development = readDevelopmentConfig();
const draft = JSON.parse(readFileSync(new URL('../config/android-release.json', import.meta.url), 'utf8'));
function readyFixture() {
  const profile = structuredClone(draft);
  profile.plugins.MemoneyGoogleAuth.androidClientId = '123456789-releasefixture.apps.googleusercontent.com';
  profile.readiness = {
    playAppSigningSha1: Array(20).fill('AB').join(':'),
    uploadKeyConfigured: true, serverDeploymentVerified: true, originMigrationVerified: true,
  };
  return profile;
}

test('existing development app and native identity remain valid', () => {
  assert.deepEqual(developmentConfigErrors(development), []);
});

for (const [field, value] of [['appId', 'com.memoney.app'], ['appName', 'Memoney'], ['loggingBehavior', 'production']]) {
  test(`development rejects changed ${field}`, () => {
    const changed = structuredClone(development);
    changed.capacitor[field] = value;
    assert.ok(developmentConfigErrors(changed).length);
  });
}

test('development rejects a production server before sync', () => {
  const changed = structuredClone(development);
  changed.capacitor.server.url = draft.hosting.origin + '/signin';
  assert.ok(developmentConfigErrors(changed).length);
});

test('development rejects mismatching native resources and Gradle', () => {
  const changed = structuredClone(development);
  changed.gradle = changed.gradle.replace('applicationId "com.mywallet.dev"', 'applicationId "com.memoney.app"');
  changed.strings = changed.strings.replaceAll('Memoney Dev', 'Memoney');
  assert.ok(developmentConfigErrors(changed).length >= 3);
});

test('checked-in release profile remains deliberately incomplete', () => {
  assert.equal(releaseConfigErrors(draft, development.capacitor).length, 5);
});

test('complete synthetic preparation profile passes without writes or network', () => {
  assert.deepEqual(releaseConfigErrors(readyFixture(), development.capacitor), []);
});

for (const name of ['memoney', 'memeony', 'MEMONEY']) {
  test(`release rejects incorrect brand capitalization: ${name}`, () => {
    const changed = readyFixture();
    changed.appName = name;
    assert.ok(releaseConfigErrors(changed, development.capacitor).length);
  });
}

test('release rejects debug OAuth credentials', () => {
  const changed = readyFixture();
  changed.plugins.MemoneyGoogleAuth.androidClientId = development.capacitor.plugins.MemoneyGoogleAuth.androidClientId;
  assert.ok(releaseConfigErrors(changed, development.capacitor).some(error => error.includes('debug client')));
});

test('release rejects test server and shared development package', () => {
  const changed = readyFixture();
  changed.appId = development.capacitor.appId;
  changed.server.url = development.capacitor.server.url;
  assert.ok(releaseConfigErrors(changed, development.capacitor).length >= 2);
});

test('release rejects changed Web audience and unsafe HTTP', () => {
  const changed = readyFixture();
  changed.plugins.MemoneyGoogleAuth.webClientId = changed.plugins.MemoneyGoogleAuth.androidClientId;
  changed.server.cleartext = true;
  changed.hosting.origin = 'http://localhost:5187';
  assert.ok(releaseConfigErrors(changed, development.capacitor).length >= 3);
});

test('release rejects malformed signing fingerprint', () => {
  const changed = readyFixture();
  changed.readiness.playAppSigningSha1 = 'AB:CD';
  assert.ok(releaseConfigErrors(changed, development.capacitor).length);
});

test('release rejects a remote WebView and invalid local bundled origins', () => {
  for (const server of [
    { ...draft.server, url: draft.hosting.origin + '/signin' },
    { ...draft.server, hostname: 'external.example' },
    { ...draft.server, androidScheme: 'http' },
  ]) {
    const changed = readyFixture(); changed.server = server;
    assert(releaseConfigErrors(changed, development.capacitor).some(error => error.includes('bundled assets')));
  }
});

test('release rejects disabled API bridge, test backends and debug probe access', () => {
  for (const api of [
    { ...draft.plugins.MemoneyApi, enabled: false },
    { ...draft.plugins.MemoneyApi, origin: 'http://127.0.0.1:5198' },
    { ...draft.plugins.MemoneyApi, allowLocalProbe: true },
  ]) {
    const changed = readyFixture(); changed.plugins.MemoneyApi = api;
    assert(releaseConfigErrors(changed, development.capacitor).some(error => error.includes('Release API')));
  }
});
