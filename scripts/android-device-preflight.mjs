import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readDevelopmentConfig, releaseConfigErrors } from './android-build-config.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
export function parseDevices(output) {
  return output.split(/\r?\n/).flatMap(line => {
    const match = /^(\S+)\s+(device|offline|unauthorized)(?:\s|$)(.*)$/.exec(line);
    return match ? [{ serial: match[1], state: match[2], emulator: match[1].startsWith('emulator-'),
      model: /(?:^|\s)model:(\S+)/.exec(match[3])?.[1] ?? null }] : [];
  });
}
export function parseApk(output, certificates) {
  const pkg = /^package: name='([^']+)' versionCode='(\d+)' versionName='([^']+)'/m.exec(output);
  const signers = [...certificates.matchAll(/^Signer #(\d+) certificate SHA-1 digest:\s*([a-f0-9]{40})\s*$/gim)];
  if (!pkg || signers.length !== 1 || !/^Verifies\s*$/m.test(certificates)) throw Error('APK identity/signature could not be verified');
  return { appId: pkg[1], versionCode: Number(pkg[2]), versionName: pkg[3],
    minSdk: Number(/^sdkVersion:'(\d+)'/m.exec(output)?.[1]),
    targetSdk: Number(/^targetSdkVersion:'(\d+)'/m.exec(output)?.[1]),
    debuggable: /^application-debuggable\s*$/m.test(output),
    sha1: signers[0][2].toUpperCase().match(/../g).join(':') };
}
export function selectPhysicalDevice(devices, serial) {
  if (typeof serial !== 'string' || !/^[a-zA-Z0-9._:-]+$/.test(serial) || serial.startsWith('emulator-')) throw Error('An explicit physical device is mandatory');
  const matches = devices.filter(device => device.serial === serial);
  if (matches.length !== 1 || matches[0].state !== 'device' || matches[0].emulator) throw Error('Selected physical device is not authorized');
  return matches[0];
}
export function preflightReport({ devices, apk, profile, development, backend }) {
  if (apk.appId !== 'com.memoney.probe' || !apk.debuggable || backend !== 'http://127.0.0.1:5198' ||
      !Number.isInteger(apk.minSdk) || !Number.isInteger(apk.targetSdk)) throw Error('Expected the isolated debug bundle probe, not another app');
  const physical = devices.filter(device => !device.emulator);
  const authorized = physical.filter(device => device.state === 'device');
  return {
    readOnly: true,
    devices: devices.map(({ state, emulator, model }) => ({ state, emulator, model })),
    physicalDeviceCheck: { connected: physical.length, authorized: authorized.length,
      readyForExplicitSelection: authorized.length > 0 },
    apk,
    probeBackend: backend,
    actualGoogleSignIn: { ready: false, reasons: ['The probe backend accepts only synthetic fixture credentials.',
      'The probe package/signing certificate is not covered by the development Android OAuth client.',
      'Google Console registration and a real-token isolated backend have not been verified.'],
      candidateAndroidRegistration: { packageName: apk.appId, certificateSha1: apk.sha1, channel: 'local debug probe only; never Play app signing' },
      webAudience: profile.plugins.MemoneyGoogleAuth.webClientId },
    release: { appId: profile.appId, origin: profile.hosting.origin,
      pending: releaseConfigErrors(profile, development), liveGoogleSignInVerified: false },
    actionsPerformed: ['adb devices -l', 'aapt dump badging', 'apksigner verify --verbose --print-certs', 'read local configuration'],
    actionsNotPerformed: ['install', 'launch', 'force-stop', 'clear data', 'Google sign-in', 'network requests', 'deployment', 'DB access'],
  };
}
export function inspectDeviceReadiness() {
  const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || join(process.env.LOCALAPPDATA || '', 'Android/Sdk');
  const tools = join(sdk, 'build-tools');
  const version = readdirSync(tools).filter(name => /^\d+\.\d+\.\d+$/.test(name)).sort((a,b) => b.localeCompare(a, undefined, { numeric: true }))[0];
  if (!version) throw Error('Android build-tools unavailable');
  const jdkRoot = join(root, '.android-tools/jdk21');
  const candidates = [process.env.MYWALLET_JAVA_HOME, process.env.JAVA_HOME,
    ...(existsSync(jdkRoot) ? readdirSync(jdkRoot).map(name => join(jdkRoot, name)) : [])];
  const javaName = process.platform === 'win32' ? 'java.exe' : 'java';
  const java = candidates.find(path => path && existsSync(join(path, 'bin', javaName)));
  if (!java) throw Error('JDK unavailable');
  const artifact = JSON.parse(readFileSync(join(root, 'android/build/memoney-bundle-probe.json'), 'utf8'));
  const run = (exe, args) => execFileSync(exe, args, { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
  const extension = process.platform === 'win32' ? '.exe' : '';
  const devices = parseDevices(run(join(sdk, 'platform-tools', 'adb' + extension), ['devices', '-l']));
  const badging = run(join(tools, version, 'aapt' + extension), ['dump', 'badging', artifact.apk]);
  const certificate = run(join(java, 'bin', javaName), ['-jar', join(tools, version, 'lib/apksigner.jar'), 'verify', '--verbose', '--print-certs', artifact.apk]);
  return preflightReport({ devices, apk: parseApk(badging, certificate), backend: artifact.backend,
    profile: JSON.parse(readFileSync(join(root, 'config/android-release.json'), 'utf8')),
    development: readDevelopmentConfig(root).capacitor });
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 2) throw Error('Read-only inspection has no install or login options');
  const report = inspectDeviceReadiness(); console.log(JSON.stringify(report, null, 2));
  if (!report.physicalDeviceCheck.readyForExplicitSelection || !report.actualGoogleSignIn.ready) process.exitCode = 2;
}
