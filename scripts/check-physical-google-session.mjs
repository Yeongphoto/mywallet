import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import puppeteer from 'puppeteer-core';
import { join } from 'node:path';

const args = process.argv.slice(2);
if (args.length !== 2 || args[0] !== '--serial' || !args[1]) throw Error('Use --serial <authorized physical device>');
const serial = args[1], appId = 'com.memoney.probe';
const adb = join(process.env.LOCALAPPDATA, 'Android/Sdk/platform-tools/adb.exe');
const output = execFileSync(adb, ['devices', '-l'], { encoding: 'utf8' });
const device = output.split(/\r?\n/).find(line => new RegExp('^' + serial + '\\s+device\\s').test(line));
assert.ok(device && !/\b(emulator|sdk_gphone|generic_x86)\b/i.test(device), 'Select an authorized physical device');
const run = (...values) => execFileSync(adb, ['-s', serial, ...values], { encoding: 'utf8' }).trim();
assert.match(run('shell', 'pm', 'path', appId), /^package:/, 'Isolated probe must be installed');

let browser, forward;
try {
  const pid = run('shell', 'pidof', appId).split(/\s/)[0];
  assert.match(pid, /^\d+$/, 'Isolated probe must be running');
  forward = run('forward', 'tcp:0', 'localabstract:webview_devtools_remote_' + pid);
  browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:' + forward, defaultViewport: null });
  const page = (await browser.pages()).find(value => new URL(value.url()).origin === 'https://localhost');
  assert.ok(page, 'Bundled probe WebView is unavailable');
  const state = await page.evaluate(async () => {
    try {
      const response = await fetch('/api/auth/session', { cache: 'no-store', signal: AbortSignal.timeout(5000) });
      const body = await response.json();
      return { status: response.status, authenticated: Boolean(body.user?.id), route: location.pathname,
        heading: document.querySelector('.signin-content h1')?.textContent || '',
        feedback: document.querySelector('.signin-feedback')?.textContent || '',
        financialRequests: performance.getEntriesByType('resource').filter(entry => entry.name.includes('/api/data')).length };
    } catch {
      return { status: 0, authenticated: false, route: location.pathname,
        heading: document.querySelector('.signin-content h1')?.textContent || '',
        feedback: document.querySelector('.signin-feedback')?.textContent || '',
        financialRequests: performance.getEntriesByType('resource').filter(entry => entry.name.includes('/api/data')).length };
    }
  });
  assert.equal(state.financialRequests, 0);
  console.log(JSON.stringify(state));
} finally {
  if (browser) await browser.disconnect();
  if (forward) { try { run('forward', '--remove', 'tcp:' + forward); } catch { /* Only remove this script's forwarding port. */ } }
}
