import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startBundleFixture } from './bundle-probe-fixture.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const probe = JSON.parse(readFileSync(resolve(root, 'android/build/memoney-bundle-probe.json'), 'utf8'));
const webClientId = JSON.parse(readFileSync(resolve(root, 'config/android-release.json'), 'utf8')).plugins.MemoneyGoogleAuth.webClientId;
if (probe.appId !== 'com.memoney.probe' || probe.backend !== 'http://127.0.0.1:5198' ||
    !/^[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/.test(probe.androidClientId || '') ||
    !/^[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/.test(webClientId)) {
  throw new Error('Build the isolated Google probe APK with its Android OAuth client first');
}

const fixture = await startBundleFixture({ realGoogleAndroidClientId: probe.androidClientId });
console.log('Isolated Google verifier listening on 127.0.0.1:5198. Auth uses Google JWKS; non-auth APIs are blocked.');
let closing = false;
async function close() {
  if (closing) return;
  closing = true;
  await fixture.close();
  console.log(JSON.stringify({ authRoutes: fixture.metrics.routes, financialReads: fixture.metrics.financialReads,
    financialWrites: fixture.metrics.financialWrites, isolatedAuthOnly: true }));
}
process.once('SIGINT', () => { void close().finally(() => process.exit(0)); });
process.once('SIGTERM', () => { void close().finally(() => process.exit(0)); });
