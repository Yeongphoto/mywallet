import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import puppeteer from 'puppeteer-core';
import { randomUUID } from 'node:crypto';
import { startBundleFixture } from './bundle-probe-fixture.mjs';
import { webUiArtifact } from './web-ui-artifact.mjs';

const adb = join(process.env.LOCALAPPDATA, 'Android/Sdk/platform-tools/adb.exe');
const devices = execFileSync(adb, ['devices'], { encoding: 'utf8' }).split(/\r?\n/).filter(row => /^emulator-\d+\s+device$/.test(row)).map(row => row.split(/\s/)[0]);
assert.equal(devices.length, 1, 'Exactly one booted emulator; never install on physical devices');
const serial = devices[0], appId = 'com.memoney.probe';
const abrupt = process.argv.includes('--abrupt-stop');
const state = JSON.parse(readFileSync('android/build/memoney-bundle-probe.json', 'utf8'));
assert.equal(state.appId, appId); assert.equal(state.backend, 'http://127.0.0.1:5198');
const run = (...args) => execFileSync(adb, ['-s', serial, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const fixture = await startBundleFixture();
let browser, closed = false;
const forwards = new Set();
async function attach() {
  let port;
  let lastError;
  for (let n = 0; n < 30; n++) {
    try {
      if (!port) {
        const pid = run('shell', 'pidof', appId).split(/\s/)[0]; assert(/^\d+$/.test(pid));
        port = run('forward', 'tcp:0', 'localabstract:webview_devtools_remote_' + pid);
        forwards.add(port);
      }
      browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:' + port, defaultViewport: null });
      const page = (await browser.pages()).find(page => page.url().startsWith('https://localhost'));
      if (page) return page;
      await browser.disconnect();
    } catch (error) { lastError = error; }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw lastError ?? Error('Bundled WebView unavailable');
}
try {
  run('reverse', 'tcp:5198', 'tcp:5198');
  run('install', '-r', state.apk);
  run('shell', 'am', 'start', '-n', appId + '/com.mywallet.dev.MainActivity');
  let page = await attach();
  await page.waitForSelector('.app-header', { timeout: 30000 });
  assert.equal(new URL(page.url()).pathname, '/guest');
  assert.equal(fixture.metrics.financialReads + fixture.metrics.financialWrites, 0);
  const guestId = await page.evaluate(() => localStorage.getItem('memoney:guest:active-id'));
  const title = '번들 저장 검증 ' + randomUUID().slice(0, 8);
  let assetName = await page.evaluate(id => JSON.parse(localStorage.getItem(`memoney:guest:${id}:mywallet:v2`)).assets[0]?.name, guestId);
  if (!assetName) {
    await page.click('.sidebar a[href="#asset"]');
    await page.click('button[aria-label="자산 등록"]');
    await page.click('button[aria-label="자산 카테고리"]');
    await page.waitForSelector('.picker-grid-btn');
    await page.evaluate(() => document.querySelector('.picker-grid-btn').click());
    await page.type('input[name="asset-name"]', 'Probe 현금');
    await page.evaluate(() => document.querySelector('.asset-entry-form .amount-entry-field').click());
    await page.waitForSelector('.amount-keypad-grid');
    await page.evaluate(() => [...document.querySelectorAll('.keypad-btn')].find(button => button.textContent.trim() === '1').click());
    await page.click('.keypad-submit-btn');
    await page.evaluate(() => { document.activeElement?.blur(); document.querySelector('.picker-popup-backdrop')?.click(); document.querySelector('.asset-entry-form').requestSubmit(); });
    await page.waitForFunction(() => !document.querySelector('.entry-form'));
    await page.click('.sidebar a[href="#summary"]');
    assetName = 'Probe 현금';
  }
  await page.click('button[aria-label="거래 등록"]');
  await page.type('.entry-modal .content-entry-field input', title);
  await page.evaluate(() => document.querySelector('.entry-modal .amount-entry-field').click());
  await page.waitForSelector('.amount-keypad-grid');
  for (const digit of '1234') await page.evaluate(digit => [...document.querySelectorAll('.keypad-btn')].find(button => button.textContent.trim() === digit).click(), digit);
  await page.click('.keypad-submit-btn');
  await page.waitForSelector('.picker-grid-btn');
  await page.evaluate(() => document.querySelector('.picker-grid-btn').click());
  await page.waitForFunction(name => [...document.querySelectorAll('.picker-grid-btn')].some(button => button.textContent.includes(name)), {}, assetName);
  await page.evaluate(name => [...document.querySelectorAll('.picker-grid-btn')].find(button => button.textContent.includes(name)).click(), assetName);
  await page.evaluate(() => { document.activeElement?.blur(); document.querySelector('.picker-popup-backdrop')?.click(); });
  await page.evaluate(() => document.querySelector('.entry-form').requestSubmit());
  // The modal closes only after the awaited save acknowledges its strict commit.
  await page.waitForFunction(() => !document.querySelector('.entry-form'), { polling: 10 });
  if (abrupt) {
    run('shell', 'am', 'force-stop', appId); await browser.disconnect();
    run('shell', 'am', 'start', '-n', appId + '/com.mywallet.dev.MainActivity');
    page = await attach(); await page.waitForSelector('.app-header');
  }
  await page.waitForFunction(({ id, title }) => JSON.parse(localStorage.getItem(`memoney:guest:${id}:mywallet:v2`) || '{}').transactions?.some(row => row.title === title && row.amount === 1234), {}, { id: guestId, title });
  assert.equal(fixture.metrics.financialReads + fixture.metrics.financialWrites, 0);
  const local = await page.evaluate(id => localStorage.getItem(`memoney:guest:${id}:mywallet:v2`), guestId);
  if (!abrupt) {
    await page.reload(); await page.waitForSelector('.app-header');
    assert.equal(await page.evaluate(({id,title}) => JSON.parse(localStorage.getItem(`memoney:guest:${id}:mywallet:v2`)).transactions.find(row => row.title === title)?.amount, {id:guestId,title}), 1234);
  }
  writeFileSync(webUiArtifact('bundle-local-backup.json'), JSON.stringify({ format: 'memoney-local', version: 1, data: JSON.parse(local) }), 'utf8');
  const api = await page.evaluate(async ledger => {
    const call = async (path, body, headers = {}) => { const response = await fetch(path, { method: body ? 'POST' : 'GET', headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers }, ...(body ? { body: JSON.stringify(body) } : {}) }); return { status: response.status, cookie: response.headers.get('Set-Cookie'), body: await response.json() }; };
    const anonymous = await call('/api/data');
    const challenge = await call('/api/auth/challenge', {});
    const login = await call('/api/auth/google', { idToken: 'isolated-probe-token' });
    const session = await call('/api/auth/session');
    const other = await call('/api/data', undefined, { 'X-Memoney-Ledger': '33333333-3333-4333-8333-333333333333' });
    const data = await call('/api/data', undefined, { 'X-Memoney-Ledger': ledger });
    const rejected = [];
    for (const options of [{ path: '//evil.example/api/data', method: 'GET', headers: {}, body: '' },
      { path: '/api/data', method: 'GET', headers: { Cookie: 'forged=1' }, body: '' },
      { path: '/api/data', method: 'GET', headers: { Origin: 'https://evil.example' }, body: '' }]) {
      try { await window.Capacitor.Plugins.MemoneyApi.request(options); rejected.push(false); } catch { rejected.push(true); }
    }
    let redirectBlocked = false; try { await fetch('/api/auth/config?redirect=1'); } catch { redirectBlocked = true; }
    return { anonymous: anonymous.status, challenge: challenge.status, login: login.status, session: session.status,
      other: other.status, data: data.status, rejected, redirectBlocked,
      cookieHidden: login.cookie === null && !document.cookie.includes('session'), user: session.body.user?.id,
      errors: { anonymous: anonymous.body.error, challenge: challenge.body.error, login: login.body.error, session: session.body.error, data: data.body.error } };
  }, fixture.ledger);
  assert.deepEqual([api.anonymous, api.challenge, api.login, api.session, api.other, api.data], [401, 200, 200, 200, 403, 200], JSON.stringify(api.errors));
  assert.deepEqual(api.rejected, [true, true, true]); assert.equal(api.redirectBlocked, true); assert.equal(api.cookieHidden, true);
  assert.equal(fixture.metrics.financialWrites, 0);
  if (!abrupt) {
    run('shell', 'input', 'keyevent', 'KEYCODE_HOME');
    await new Promise(resolve => setTimeout(resolve, 3000));
  }
  run('shell', 'am', 'force-stop', appId);
  await browser.disconnect();
  run('shell', 'am', 'start', '-n', appId + '/com.mywallet.dev.MainActivity');
  page = await attach(); await page.waitForSelector('.app-header');
  assert.equal(await page.evaluate(async () => (await fetch('/api/auth/session')).status), 200, 'Native cookie survives app restart');
  assert.equal(await page.evaluate(({id,title}) => JSON.parse(localStorage.getItem(`memoney:guest:${id}:mywallet:v2`)).transactions.find(row => row.title === title)?.amount, {id:guestId,title}), 1234);
  await page.evaluate(async () => { await fetch('/api/auth/logout', { method: 'POST' }); });
  assert.equal(await page.evaluate(async () => (await fetch('/api/auth/session')).status), 401);
  await fixture.close(); closed = true;
  run('reverse', '--remove', 'tcp:5198');
  run('shell', 'am', 'force-stop', appId); await browser.disconnect();
  run('shell', 'am', 'start', '-n', appId + '/com.mywallet.dev.MainActivity');
  page = await attach(); await page.waitForSelector('.app-header');
  assert.equal(await page.evaluate(({id,title}) => JSON.parse(localStorage.getItem(`memoney:guest:${id}:mywallet:v2`)).transactions.find(row => row.title === title)?.amount, {id:guestId,title}), 1234);
  assert.equal(await page.evaluate(() => /\ufffd|\\u[0-9a-f]{4}/i.test(document.body.innerText)), false);
  const screenshot = webUiArtifact('bundle-offline.png'); await page.screenshot({ path: screenshot });
  assert.equal(fixture.metrics.financialWrites, 0);
  assert.equal(fixture.metrics.financeRows, 0);
  assert.equal(fixture.metrics.duplicateCookieNames, 0);
  console.log(JSON.stringify({ bundledLocalOrigin: page.url(), localUiSave: true, cookieRestart: true, logout: true,
    foreignLedgerDenied: true, forbiddenHeadersDenied: true, redirectsDenied: true, backendStoppedColdLaunch: true,
    localRecordPreserved: true, immediateKillAfterAcknowledgement: abrupt, metrics: fixture.metrics, screenshot }));
} finally {
  if (browser) await browser.disconnect(); if (!closed) await fixture.close();
  for (const port of forwards) { try { run('forward', '--remove', 'tcp:' + port); } catch { /* Preserve unrelated forwards. */ } }
  try { run('reverse', '--remove', 'tcp:5198'); } catch { /* Already removed for the offline scenario. */ }
}
