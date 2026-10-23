import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import puppeteer from 'puppeteer-core';

const adb = join(process.env.LOCALAPPDATA, 'Android/Sdk/platform-tools/adb.exe');
const serials = execFileSync(adb, ['devices'], { encoding: 'utf8' }).split(/\r?\n/).filter(row => /^emulator-\d+\s+device$/.test(row)).map(row => row.split(/\s/)[0]);
assert.equal(serials.length, 1);
const app = 'com.memoney.probe', run = (...args) => execFileSync(adb, ['-s', serials[0], ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
let browser;
const ports = [];
async function attach() {
  let port;
  for (let attempt = 0; attempt < 30; attempt++) {
    try {
      if (!port) { port = run('forward', 'tcp:0', 'localabstract:webview_devtools_remote_' + run('shell', 'pidof', app)); ports.push(port); }
      browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:' + port, defaultViewport: null });
      const page = (await browser.pages()).find(page => page.url().startsWith('https://localhost'));
      if (page) return page;
      await browser.disconnect();
    } catch { /* Wait for this probe process only. */ }
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  throw Error('Probe unavailable');
}
try {
  run('shell', 'am', 'start', '-n', app + '/com.mywallet.dev.MainActivity');
  let page = await attach();
  await page.goto('https://localhost/signin?storage-diagnostic=1');
  await page.waitForSelector('.signin-content');
  const key = 'memoney:diagnostic:' + randomUUID();
  await page.evaluate(key => {
    const button = document.createElement('button'); button.id = 'storage-diagnostic'; button.textContent = 'Storage diagnostic';
    button.onclick = () => { localStorage.setItem(key, 'acknowledged'); button.dataset.saved = 'yes'; };
    document.body.append(button);
  }, key);
  await page.click('#storage-diagnostic');
  assert.equal(await page.evaluate(key => localStorage.getItem(key), key), 'acknowledged');
  run('shell', 'am', 'force-stop', app); await browser.disconnect();
  run('shell', 'am', 'start', '-n', app + '/com.mywallet.dev.MainActivity');
  page = await attach(); await page.waitForSelector('.app-header');
  const persisted = await page.evaluate(key => localStorage.getItem(key), key);
  console.log(JSON.stringify({ isolatedRawLocalStorage: true, noLedgerMutation: true, immediateKillPersisted: persisted === 'acknowledged' }));
} finally {
  if (browser) await browser.disconnect();
  for (const port of ports) { try { run('forward', '--remove', 'tcp:' + port); } catch {} }
}
