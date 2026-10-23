import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import puppeteer from 'puppeteer-core';
import { join } from 'node:path';

const args = process.argv.slice(2);
if (args.length < 2 || args.length > 3 || args[0] !== '--serial' || !args[1] || (args[2] && args[2] !== '--tap-google')) {
  throw Error('Use --serial <authorized physical device> [--tap-google]');
}
const serial = args[1], appId = 'com.memoney.probe', tapGoogle = args[2] === '--tap-google';
const adb = join(process.env.LOCALAPPDATA, 'Android/Sdk/platform-tools/adb.exe');
const output = execFileSync(adb, ['devices', '-l'], { encoding: 'utf8' });
const device = output.split(/\r?\n/).find(line => new RegExp('^' + serial + '\\s+device\\s').test(line));
assert.ok(device, 'Selected device must be authorized');
assert.ok(!/\b(emulator|sdk_gphone|generic_x86)\b/i.test(device), 'Select a physical device explicitly');
const run = (...values) => execFileSync(adb, ['-s', serial, ...values], { encoding: 'utf8' }).trim();
const packagePath = run('shell', 'pm', 'path', appId);
assert.match(packagePath, /^package:/, 'Only the isolated probe package may be inspected');
run('shell', 'am', 'start', '-n', appId + '/com.mywallet.dev.MainActivity');

let browser, forward;
try {
  let pid;
  for (let attempt = 0; attempt < 30; attempt++) {
    try { pid = run('shell', 'pidof', appId).split(/\s/)[0]; } catch { /* Wait for this probe process only. */ }
    if (/^\d+$/.test(pid)) break;
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  assert.match(pid || '', /^\d+$/, 'Probe app did not start');
  forward = run('forward', 'tcp:0', 'localabstract:webview_devtools_remote_' + pid);
  browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:' + forward, defaultViewport: null });
  const page = (await browser.pages()).find(value => new URL(value.url()).origin === 'https://localhost');
  assert.ok(page, 'Bundled probe WebView is unavailable');
  await page.goto('https://localhost/signin?wallet=shared&probe=google', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.signin-google', { timeout: 15000 });
  if (tapGoogle) {
    await page.click('.signin-google');
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  const state = await page.evaluate(() => ({ platform: window.Capacitor?.getPlatform(),
    nativeGoogle: window.Capacitor?.isPluginAvailable('MemoneyGoogleAuth'),
    buttonEnabled: !document.querySelector('.signin-google')?.disabled,
    feedback: document.querySelector('.signin-feedback')?.textContent || '',
    financialRequests: performance.getEntriesByType('resource').filter(entry => entry.name.includes('/api/data')).length,
    route: location.pathname }));
  assert.equal(state.platform, 'android');
  assert.equal(state.nativeGoogle, true);
  assert.equal(state.buttonEnabled, !tapGoogle);
  assert.equal(state.financialRequests, 0);
  console.log(JSON.stringify({ ...state, googlePromptRequested: tapGoogle }));
} finally {
  if (browser) await browser.disconnect();
  if (forward) { try { run('forward', '--remove', 'tcp:' + forward); } catch { /* Only remove this script's forwarding port. */ } }
}
