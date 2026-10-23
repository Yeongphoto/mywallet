import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseDevices, parseApk, preflightReport, selectPhysicalDevice } from './android-device-preflight.mjs';
const profile = JSON.parse(readFileSync(new URL('../config/android-release.json', import.meta.url), 'utf8'));
const development = JSON.parse(readFileSync(new URL('../capacitor.config.json', import.meta.url), 'utf8'));
const badging = "package: name='com.memoney.probe' versionCode='1' versionName='0.1.0-probe'\nsdkVersion:'24'\ntargetSdkVersion:'36'\napplication-debuggable\n";
const cert = 'Verifies\nSigner #1 certificate SHA-1 digest: ' + 'ab'.repeat(20) + '\n';
const apk = parseApk(badging, cert);
const report = devices => preflightReport({ devices, apk, profile, development, backend: 'http://127.0.0.1:5198' });
test('physical testing never implicitly selects a phone or falls back to another device', () => {
  const devices = parseDevices('phone-a device model:A\nphone-b device model:B\nemulator-5554 device\n');
  assert.equal(selectPhysicalDevice(devices, 'phone-b').model, 'B');
  for (const serial of [undefined, '', 'missing', 'emulator-5554', 'phone-a;cmd']) assert.throws(() => selectPhysicalDevice(devices, serial));
});
test('physical testing refuses offline, unauthorized and ambiguous matching identities', () => {
  for (const state of ['offline', 'unauthorized']) assert.throws(() => selectPhysicalDevice(parseDevices('phone-a ' + state), 'phone-a'));
  assert.throws(() => selectPhysicalDevice(parseDevices('phone-a device\nphone-a device'), 'phone-a'));
});
test('device states and emulators are classified without treating unauthorized phones as ready', () => {
  const devices = parseDevices('List of devices attached\nemulator-5554 device product:sdk model:Virtual\nphone-a unauthorized usb:1\nphone-b offline\nphone-c device usb:2 model:Physical\n');
  assert.equal(devices.length, 4); assert.equal(report(devices).physicalDeviceCheck.authorized, 1);
  assert.equal(report(devices.filter(d => d.serial !== 'phone-c')).physicalDeviceCheck.readyForExplicitSelection, false);
});
test('a running emulator is not a physical-device test', () => {
  assert.equal(report(parseDevices('emulator-5554 device model:Virtual')).physicalDeviceCheck.readyForExplicitSelection, false);
  assert.equal(report([]).physicalDeviceCheck.connected, 0);
});
test('APK identity and SHA-1 come from verified artifact output, not a keystore assumption', () => {
  assert.equal(apk.sha1, Array(20).fill('AB').join(':')); assert.equal(apk.targetSdk, 36);
  assert.throws(() => parseApk(badging, cert.replace('Verifies', 'DOES NOT VERIFY')));
  assert.throws(() => parseApk(badging, cert + 'Signer #2 certificate SHA-1 digest: ' + 'cd'.repeat(20) + '\n'));
  assert.throws(() => parseApk('not an APK', cert));
});
test('the probe cannot be confused with development, production or an arbitrary backend', () => {
  for (const appId of ['com.mywallet.dev', 'com.memoney.app']) assert.throws(() => preflightReport({ devices: [], apk: { ...apk, appId }, profile, development, backend: 'http://127.0.0.1:5198' }));
  assert.throws(() => preflightReport({ devices: [], apk, profile, development, backend: profile.hosting.origin }));
});
test('configuration flags and a connected phone cannot promote fixture authentication to real Google verification', () => {
  const readyProfile = structuredClone(profile); readyProfile.readiness.serverDeploymentVerified = true;
  const result = preflightReport({ devices: parseDevices('phone device model:Physical'), apk, profile: readyProfile, development, backend: 'http://127.0.0.1:5198' });
  assert.equal(result.actualGoogleSignIn.ready, false); assert.equal(result.release.liveGoogleSignInVerified, false);
  assert.equal(result.actualGoogleSignIn.candidateAndroidRegistration.packageName, 'com.memoney.probe');
});
test('the report exposes no device serials and inspection performs no install or data operation', () => {
  const result = report(parseDevices('private-device-serial device model:Physical'));
  assert(!JSON.stringify(result).includes('private-device-serial'));
  assert.equal(result.readOnly, true); assert(result.actionsNotPerformed.includes('DB access'));
});
