// Explicitly selected phone, isolated probe only. No login, API calls, adb
// reverse, app-data clearing, uninstall or interaction with the user's app.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import puppeteer from 'puppeteer-core';
import { inspectDeviceReadiness, parseDevices, selectPhysicalDevice } from './android-device-preflight.mjs';
import { webUiArtifact } from './web-ui-artifact.mjs';

assert.equal(process.argv[2], '--serial', 'An explicit physical device is mandatory');
assert.equal(process.argv.length, 4);
const serial = process.argv[3], app = 'com.memoney.probe';
assert(/^[a-zA-Z0-9._:-]+$/.test(serial)); assert(!serial.startsWith('emulator-'));
const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || join(process.env.LOCALAPPDATA, 'Android/Sdk');
const adb = join(sdk, 'platform-tools', process.platform === 'win32' ? 'adb.exe' : 'adb');
const run = (...args) => execFileSync(adb, ['-s', serial, ...args], { encoding: 'utf8', stdio: ['ignore','pipe','pipe'] }).trim();
const device = selectPhysicalDevice(parseDevices(execFileSync(adb, ['devices', '-l'], { encoding: 'utf8' })), serial);
const preflight = inspectDeviceReadiness();
assert.equal(preflight.apk.appId, app); assert.equal(preflight.probeBackend, 'http://127.0.0.1:5198');
assert(run('shell', 'pm', 'path', app).startsWith('package:'), 'Install the separately verified probe APK first');
const suffix = randomUUID().slice(0,8), assetName = 'Probe 현금 ' + suffix;
const title = '실기기 합성 검증 ' + suffix, editedTitle = title + ' 수정';
let browser, page;
const forwards = new Set();
async function attach() {
  let port, error;
  for (let attempt = 0; attempt < 40; attempt++) {
    try {
      if (!port) {
        const pid = run('shell', 'pidof', app).split(/\s/)[0]; assert(/^\d+$/.test(pid));
        port = run('forward', 'tcp:0', 'localabstract:webview_devtools_remote_' + pid); forwards.add(port);
      }
      browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:' + port, defaultViewport: null });
      const found = (await browser.pages()).find(p => new URL(p.url()).origin === 'https://localhost');
      if (found) {
        assert.equal(new URL(found.url()).pathname, '/guest', 'Never operate a logged-in wallet');
        await found.waitForSelector('.app-header', { timeout: 30000 });
        assert.notEqual(await found.evaluate(() => localStorage.getItem('memoney:wallet-mode')), 'shared-web');
        return found;
      }
      await browser.disconnect();
    } catch (caught) { error = caught; }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw error ?? Error('Probe WebView unavailable');
}
async function restart() {
  run('shell', 'am', 'force-stop', app); await browser.disconnect();
  run('shell', 'am', 'start', '-n', app + '/com.mywallet.dev.MainActivity');
  page = await attach();
}
async function snapshot() {
  return page.evaluate(() => {
    const id = localStorage.getItem('memoney:guest:active-id');
    const generation = localStorage.getItem(`memoney:guest:${id}:recovery-generation`);
    const key = `memoney:guest:${id}:mywallet:v2` + (generation ? ':generation:' + generation : '');
    return { id, data: JSON.parse(localStorage.getItem(key)) };
  });
}
async function digits(value) {
  await page.waitForSelector('.amount-keypad-grid');
  for (const digit of value) await page.evaluate(d => [...document.querySelectorAll('.keypad-btn')].find(button => button.textContent.trim() === d).click(), digit);
  await page.click('.keypad-submit-btn');
}
async function submit() {
  await page.evaluate(() => { document.activeElement?.blur(); document.querySelector('.picker-popup-backdrop')?.click(); document.querySelector('.entry-form').requestSubmit(); });
  await page.waitForFunction(() => !document.querySelector('.entry-form'), { polling: 10 });
}
async function rowAction(text, action) {
  await page.click('.sidebar a[href="#ledger"]');
  await page.waitForFunction(title => [...document.querySelectorAll('.mobile-ledger-swipe')].some(row => row.textContent.includes(title)), {}, text);
  await page.evaluate(({text,action}) => {
    const row = [...document.querySelectorAll('.mobile-ledger-swipe')].find(row => row.textContent.includes(text));
    row.querySelector(`button[aria-label="${action}"]`).click();
  }, {text,action});
}
try {
  // Launch only this separate package. Radio/network settings are left alone.
  run('shell', 'am', 'start', '-n', app + '/com.mywallet.dev.MainActivity');
  page = await attach();
  console.log('probe-opened: isolated guest only');
  await page.click('.sidebar a[href="#asset"]');
  await page.click('button[aria-label="자산 등록"]');
  await page.click('button[aria-label="자산 카테고리"]');
  await page.waitForSelector('.picker-grid-btn');
  await page.evaluate(() => {
    const choices = [...document.querySelectorAll('.picker-grid-btn')];
    (choices.find(button => button.textContent.includes('현금')) ?? choices[0]).click();
  });
  await page.type('input[name="asset-name"]', assetName);
  await page.evaluate(() => document.querySelector('.asset-entry-form .amount-entry-field').click());
  await digits('1'); await submit();
  console.log('synthetic-asset-saved');
  const before = await snapshot();
  writeFileSync(webUiArtifact('physical-probe-before.json'), JSON.stringify(before), 'utf8');
  await page.click('.sidebar a[href="#summary"]');
  await page.click('button[aria-label="거래 등록"]');
  await page.type('.entry-modal .content-entry-field input', title);
  await page.evaluate(() => document.querySelector('.entry-modal .amount-entry-field').click());
  await digits('1234');
  await page.waitForSelector('.picker-grid-btn');
  await page.evaluate(() => document.querySelector('.picker-grid-btn').click());
  await page.waitForFunction(name => [...document.querySelectorAll('.picker-grid-btn')].some(button => button.textContent.includes(name)), {}, assetName);
  await page.evaluate(name => [...document.querySelectorAll('.picker-grid-btn')].find(button => button.textContent.includes(name)).click(), assetName);
  await submit(); await restart();
  let saved = await snapshot(); assert.equal(saved.id, before.id);
  const transaction = saved.data.transactions.find(row => row.title === title);
  assert.equal(transaction?.amount, 1234); console.log('create-immediate-kill-preserved');
  await rowAction(title, '수정');
  await page.waitForSelector('.transaction-edit-modal .content-entry-field input');
  await page.evaluate(() => { const input = document.querySelector('.transaction-edit-modal .content-entry-field input'); input.focus(); input.setSelectionRange(0, input.value.length); });
  await page.keyboard.press('Backspace'); await page.type('.transaction-edit-modal .content-entry-field input', editedTitle);
  await submit(); await restart();
  saved = await snapshot();
  assert.equal(saved.data.transactions.find(row => row.id === transaction.id)?.title, editedTitle);
  console.log('edit-immediate-kill-preserved');
  await rowAction(editedTitle, '삭제');
  await page.waitForSelector('.confirm-actions .danger-button');
  await page.click('.confirm-actions .danger-button');
  // Row removal is rendered only after the awaited delete response succeeds.
  await page.waitForFunction(title => ![...document.querySelectorAll('.mobile-ledger-swipe')].some(row => row.textContent.includes(title)), { polling: 10 }, editedTitle);
  await restart();
  const after = await snapshot(); assert.equal(after.id, before.id);
  assert(!after.data.transactions.some(row => row.id === transaction.id));
  for (const key of ['transactions','assets','plans','recurringRules','deletedRecurringTxs']) assert.deepEqual(after.data[key], before.data[key], 'Unrelated probe rows changed: ' + key);
  assert.equal(await page.evaluate(() => /\ufffd|\\u[0-9a-f]{4}/i.test(document.body.innerText)), false);
  const screenshot = webUiArtifact('physical-probe-after.png'); await page.screenshot({ path: screenshot });
  writeFileSync(webUiArtifact('physical-probe-after.json'), JSON.stringify(after), 'utf8');
  console.log(JSON.stringify({ model: device.model, package: app, createEditDeleteImmediateKill: true,
    unrelatedProbeRowsPreserved: true, backendFixtureNotStarted: true, adbReverseNotChanged: true,
    actualGoogleSignIn: false, productionDBAccess: false, userAppNotOperated: true, screenshot }));
} finally {
  if (browser) await browser.disconnect();
  for (const port of forwards) { try { run('forward', '--remove', 'tcp:' + port); } catch { /* This test's ports only. */ } }
}
