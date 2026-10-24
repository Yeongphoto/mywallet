import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID, createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import puppeteer from 'puppeteer-core';

// Start a fresh --shared memory fixture, then sign in to the isolated probe first.
// This script creates synthetic rows and one shared ledger; it never sends an invitation email.
assert.equal(process.argv[2], '--serial');
assert.equal(process.argv.length, 4);
const serial = process.argv[3], appId = 'com.memoney.probe';
assert(/^[a-zA-Z0-9._:-]+$/.test(serial) && !serial.startsWith('emulator-'));
const probe = JSON.parse(readFileSync('android/build/memoney-bundle-probe.json', 'utf8'));
assert.equal(probe.appId, appId);
assert.equal(probe.backend, 'http://127.0.0.1:5198');
const adb = join(process.env.LOCALAPPDATA, 'Android/Sdk/platform-tools/adb.exe');
const devices = execFileSync(adb, ['devices', '-l'], { encoding: 'utf8' });
assert(devices.split(/\r?\n/).some(line => line.startsWith(serial + ' ') && /\sdevice\s/.test(line)));
const run = (...args) => execFileSync(adb, ['-s', serial, ...args], { encoding: 'utf8' }).trim();
const installed = run('shell', 'pm', 'path', appId);
assert.match(installed, /^package:/);
const apkHash = createHash('sha256').update(readFileSync(probe.apk)).digest('hex');
assert.equal(run('shell', 'sha256sum', installed.slice('package:'.length)).split(/\s/)[0], apkHash,
  'Installed probe must match the locally configured APK');
assert.match(run('reverse', '--list'), /tcp:5198\s+tcp:5198/, 'Probe must use this PC server');
const configuration = await fetch(probe.backend + '/api/auth/config', { signal: AbortSignal.timeout(5000) });
assert.equal(configuration.headers.get('X-Memoney-Probe-Isolation'), 'memory-only', 'Memory-only fixture required');
const suffix = randomUUID().slice(0, 8), assetName = 'Shared cash ' + suffix, title = 'Shared device entry ' + suffix;
let browser, page, forward;
async function ready() {
  await page.waitForSelector('.app-shell', { timeout: 20000 });
  try {
    await page.waitForFunction(() => !document.querySelector('.wallet-connection-screen') &&
      getComputedStyle(document.querySelector('.app-shell')).visibility === 'visible', { timeout: 20000 });
  } catch (error) {
    const diagnostic = await page.evaluate(() => ({ visibility: document.visibilityState,
      connection: document.querySelector('.wallet-connection-screen')?.getAttribute('data-state'),
      images: [...document.querySelectorAll('.wallet-connection-screen img')].map(image => ({
        loaded: image.complete, width: image.naturalWidth, source: image.getAttribute('src') })),
      feedback: document.querySelector('.wallet-connection-status')?.textContent }));
    throw new Error('Wallet did not naturally become ready: ' + JSON.stringify(diagnostic), { cause: error });
  }
}
async function data(ledger) {
  return page.evaluate(async id => {
    const response = await fetch('/api/data', { headers: { 'X-Memoney-Ledger': id }, cache: 'no-store' });
    if (!response.ok) throw Error('DATA_' + response.status);
    return response.json();
  }, ledger);
}
async function digits(value) {
  await page.waitForSelector('.amount-keypad-grid');
  for (const digit of value) await page.evaluate(d => [...document.querySelectorAll('.keypad-btn')]
    .find(button => button.textContent.trim() === d).click(), digit);
  await page.click('.keypad-submit-btn');
}
async function submit() {
  await page.evaluate(() => {
    document.activeElement?.blur();
    document.querySelector('.picker-popup-backdrop')?.click();
    document.querySelector('.entry-form').requestSubmit();
  });
  await page.waitForFunction(() => !document.querySelector('.entry-form'), { timeout: 15000 });
}
try {
  const pid = run('shell', 'pidof', appId).split(/\s/)[0];
  assert.match(pid, /^\d+$/);
  forward = run('forward', 'tcp:0', 'localabstract:webview_devtools_remote_' + pid);
  browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:' + forward, defaultViewport: null });
  page = (await browser.pages()).find(value => new URL(value.url()).origin === 'https://localhost');
  assert(page);
  await page.waitForFunction(() => location.pathname === '/wallet', { timeout: 30000 });
  const initial = await page.evaluate(async () => {
    const [session, context] = await Promise.all([fetch('/api/auth/session'), fetch('/api/wallet/context')]);
    return { authenticated: session.status === 200, context: await context.json() };
  });
  assert(initial.authenticated);
  assert.equal(initial.context.ledger.kind, 'personal');
  const personalId = initial.context.ledger.id;
  const before = await data(personalId);
  await ready();
  console.log('real-google-personal-wallet-naturally-ready');
  await page.goto('https://localhost/sharing', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[aria-label="새 공유 장부 이름"]');
  await page.click('[aria-label="시작 방식"] button:nth-child(2)');
  await page.type('[aria-label="새 공유 장부 이름"]', 'Physical shared ' + suffix);
  await page.$eval('[aria-label="새 공유 장부 이름"]', input => input.closest('form').requestSubmit());
  await page.waitForSelector('[aria-label="장부 ID"]');
  const sharedId = await page.$eval('[aria-label="장부 ID"]', input => input.value);
  assert.notEqual(sharedId, personalId);
  await page.click('[aria-label="뒤로"]');
  await page.waitForFunction(() => location.pathname === '/wallet');
  await ready();
  const scope = await page.evaluate(async id => {
    if (localStorage.getItem('memoney:selected-cloud-ledger:v1') !== id) throw Error('Shared ledger was not selected');
    return (await fetch('/api/wallet/context', { headers: { 'X-Memoney-Ledger': id } })).json();
  }, sharedId);
  assert.equal(scope.ledger.id, sharedId);
  assert.equal(scope.ledger.kind, 'shared');
  assert.equal(scope.ledger.role, 'owner');
  console.log('shared-created-from-native-ui-and-opened');
  await page.click('.sidebar a[href="#asset"]');
  await page.click('button[aria-label="자산 등록"]');
  await page.click('button[aria-label="자산 카테고리"]');
  await page.waitForSelector('.picker-grid-btn');
  await page.evaluate(() => {
    const choices = [...document.querySelectorAll('.picker-grid-btn')];
    (choices.find(button => button.textContent.includes('현금')) || choices[0]).click();
  });
  await page.type('input[name="asset-name"]', assetName);
  await page.evaluate(() => document.querySelector('.asset-entry-form .amount-entry-field').click());
  await digits('10000');
  await submit();
  await page.click('.sidebar a[href="#summary"]');
  await page.click('button[aria-label="거래 등록"]');
  await page.type('.entry-modal .content-entry-field input', title);
  await page.evaluate(() => document.querySelector('.entry-modal .amount-entry-field').click());
  await digits('1234');
  await page.waitForSelector('.picker-grid-btn');
  await page.evaluate(() => document.querySelector('.picker-grid-btn').click());
  await page.waitForFunction(name => [...document.querySelectorAll('.picker-grid-btn')]
    .some(button => button.textContent.includes(name)), {}, assetName);
  await page.evaluate(name => [...document.querySelectorAll('.picker-grid-btn')]
    .find(button => button.textContent.includes(name)).click(), assetName);
  await submit();
  const saved = await data(sharedId);
  const transaction = saved.transactions.find(row => row.title === title);
  assert.equal(transaction?.amount, 1234);
  assert(saved.assets.some(asset => asset.name === assetName));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await ready();
  await page.click('.sidebar a[href="#ledger"]');
  await page.waitForFunction(text => document.body.innerText.includes(text), {}, title);
  assert.equal((await data(sharedId)).transactions.find(row => row.id === transaction.id)?.amount, 1234);
  assert.deepEqual(await data(personalId), before, 'Personal ledger was changed by shared UI operations');
  await page.goto('https://localhost/sharing', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[aria-label="초대할 Google 계정"]');
  // Creating a link does not send an email. The synthetic invitation exists in memory only.
  await page.type('[aria-label="초대할 Google 계정"]', 'memoney-probe-' + suffix + '@gmail.com');
  await page.$eval('[aria-label="초대할 Google 계정"]', input => input.closest('form').requestSubmit());
  await page.waitForSelector('[aria-label="초대 링크"]');
  assert((await page.$eval('[aria-label="초대 링크"]', input => input.value)).includes('#invite='));
  await page.click('.sharing-invite-row button');
  await page.waitForFunction(() => !document.querySelector('.sharing-invite-row'));
  await page.click('[aria-label="뒤로"]');
  await page.waitForFunction(() => location.pathname === '/wallet');
  await ready();
  await page.click('.sidebar a[href="#ledger"]');
  await page.waitForFunction(text => document.body.innerText.includes(text), {}, title);
  await page.evaluate(async () => {
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    await Promise.all(document.getAnimations().filter(animation => animation.effect?.getTiming().iterations !== Infinity)
      .map(animation => animation.finished.catch(() => {})));
  });
  const screenshot = 'android/build/physical-shared-' + Date.now() + '.png';
  const png = execFileSync(adb, ['-s', serial, 'exec-out', 'screencap', '-p'], { timeout: 10000, maxBuffer: 12 * 1024 * 1024 });
  // Foldables can prepend a multi-display warning to stdout before the PNG bytes.
  const pngStart = png.indexOf(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  assert(pngStart >= 0, 'Device did not return a PNG screenshot');
  writeFileSync(screenshot, png.subarray(pngStart));
  const receipt = { verifiedAt: new Date().toISOString(), package: appId, backend: probe.backend,
    actualGoogleSession: true, naturallyEnteredPersonalAndSharedWallet: true, sharedCreatedFromUI: true,
    assetAndTransactionSavedFromUI: true, reloadRetainedTransaction: true, personalLedgerPreserved: true,
    invitationCreatedAndRevokedFromUI: true, productionDBAccess: false, screenshot,
    apkHash };
  writeFileSync('android/build/physical-shared-verification-' + Date.now() + '.json', JSON.stringify(receipt, null, 2) + '\n', 'utf8');
  console.log(JSON.stringify(receipt));
} finally {
  if (browser) await browser.disconnect();
  if (forward) { try { run('forward', '--remove', 'tcp:' + forward); } catch { /* This script's forwarding port only. */ } }
}
