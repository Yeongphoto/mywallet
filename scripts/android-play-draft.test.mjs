import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { assertDraftBuild, draftGradle } from './android-play-draft.mjs';
import { preparationArtifacts } from './android-release-prepare.mjs';
import { readDevelopmentConfig } from './android-build-config.mjs';
const profile = JSON.parse(readFileSync(new URL('../config/android-release.json', import.meta.url), 'utf8'));
const config = JSON.parse(preparationArtifacts(profile, readDevelopmentConfig().capacitor)['capacitor.config.json']);
const identity = { app: 'memoney', mode: 'production', authProbe: false };
test('Console draft rejects probe assets, remote screens, wrong APIs and active billing', () => {
  assert.doesNotThrow(() => assertDraftBuild(identity, config));
  assert.throws(() => assertDraftBuild({ ...identity, authProbe: true }, config));
  assert.throws(() => assertDraftBuild({ ...identity, mode: 'android-probe' }, config));
  for (const mutate of [c => { c.appId = 'com.memoney.probe'; }, c => { c.server.url = 'https://example.com'; },
    c => { c.plugins.MemoneyApi.origin = 'http://127.0.0.1:5198'; }, c => { c.plugins.MemoneyBilling.enabled = true; }]) {
    const changed = structuredClone(config); mutate(changed); assert.throws(() => assertDraftBuild(identity, changed));
  }
});
test('signed draft requires explicit versions and environment signing without changing development gates', () => {
  for (const invalid of [0, -1, NaN, 1.5, '2']) assert.throws(() => draftGradle(invalid));
  assert.match(draftGradle(2), /versionCode 2/);
  assert.match(draftGradle(2), /System.getenv\('MEMONEY_UPLOAD_PASSWORD'\)/);
  assert.match(draftGradle(2), /no debug identity, installation or publishing/);
  assert.match(readFileSync(new URL('../android/app/build.gradle', import.meta.url), 'utf8'), /Release disabled:/);
});
test('internal build uses only the existing hosted API with an explicit native opt-in', () => {
  const internal = structuredClone(config);
  internal.plugins.MemoneyApi = { enabled: true, origin: 'https://memoney-android-test.pages.dev', hostedInternalTest: true };
  assert.doesNotThrow(() => assertDraftBuild(identity, internal, true));
  assert.throws(() => assertDraftBuild(identity, internal));
  delete internal.plugins.MemoneyApi.hostedInternalTest;
  assert.throws(() => assertDraftBuild(identity, internal, true));
  const source = readFileSync(new URL('../android/app/src/main/java/com/mywallet/dev/MemoneyApiPlugin.java', import.meta.url), 'utf8');
  assert.match(source, /getBoolean\("hostedInternalTest", false\)/);
});
