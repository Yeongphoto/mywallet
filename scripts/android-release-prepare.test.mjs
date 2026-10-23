import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { preparationArtifacts, signingConfigurationErrors } from './android-release-prepare.mjs';
import { readDevelopmentConfig } from './android-build-config.mjs';

const profile = JSON.parse(readFileSync(new URL('../config/android-release.json', import.meta.url), 'utf8'));
const development = readDevelopmentConfig().capacitor;

test('preparation uses production identity without mutating development', () => {
  const before = JSON.stringify(development);
  const artifacts = preparationArtifacts(profile, development);
  const cap = JSON.parse(artifacts['capacitor.config.json']);
  assert.equal(cap.appId, 'com.memoney.app');
  assert.equal(cap.appName, 'Memoney');
  assert.equal(cap.server.url, 'https://memoney-6r5.pages.dev/signin');
  assert.equal(JSON.stringify(development), before);
  assert.equal(cap.plugins.MemoneyGoogleAuth.androidClientId, undefined);
  assert.equal(cap.readiness, undefined);
});

test('generated Android names are exact UTF-8 localized resources', () => {
  const artifacts = preparationArtifacts(profile, development);
  assert.ok(artifacts['android/app/src/main/res/values/strings.xml'].includes('>Memoney</string>'));
  assert.ok(artifacts['android/app/src/main/res/values-ko/strings.xml'].includes('>메머니</string>'));
  assert.ok(!Object.values(artifacts).join('').includes('memeony'));
});

test('generated project retains build and install guards and independent version', () => {
  const gradle = preparationArtifacts(profile, development)['android/app/memoney-preparation.gradle'];
  assert.match(gradle, /assemble\|bundle\|install\|publish/);
  assert.match(gradle, /versionCode 1/);
  assert.match(gradle, /versionName '0.1.0'/);
});

test('structural profile errors prevent any preparation', () => {
  const changed = structuredClone(profile);
  changed.appId = development.appId;
  assert.throws(() => preparationArtifacts(changed, development), /Release appId/);
});

test('missing signing input is reported without secret values', () => {
  assert.equal(signingConfigurationErrors({}).length, 4);
  const result = signingConfigurationErrors({ MEMONEY_UPLOAD_STORE_PASSWORD: 'synthetic-secret' });
  assert.equal(result.length, 3);
  assert.ok(!result.join('').includes('synthetic-secret'));
});

test('debug signing key and alias cannot be used as upload key', () => {
  const env = { MEMONEY_UPLOAD_KEYSTORE: 'debug.keystore', MEMONEY_UPLOAD_KEY_ALIAS: 'androiddebugkey',
    MEMONEY_UPLOAD_STORE_PASSWORD: 'synthetic', MEMONEY_UPLOAD_KEY_PASSWORD: 'synthetic' };
  assert.equal(signingConfigurationErrors(env, () => true).length, 2);
});

test('signing configuration checks presence, not certificate validity', () => {
  const env = { MEMONEY_UPLOAD_KEYSTORE: 'upload.jks', MEMONEY_UPLOAD_KEY_ALIAS: 'memoney-upload',
    MEMONEY_UPLOAD_STORE_PASSWORD: 'synthetic', MEMONEY_UPLOAD_KEY_PASSWORD: 'synthetic' };
  assert.deepEqual(signingConfigurationErrors(env, () => true), []);
  assert.equal(signingConfigurationErrors(env, () => false).length, 1);
});
