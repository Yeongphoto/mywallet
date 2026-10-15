import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

// Run check-android-local.mjs --restart-ready, restart the app and forward its new WebView socket first.
const { previous, temporaryId } = JSON.parse(readFileSync('android/build/local-mode-qa-state.json', 'utf8'));
const expected = JSON.parse(readFileSync('android/build/local-mode-qa-backup.json', 'utf8')).data.transactions[0];
const browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9223', defaultViewport: null });
try {
  const page = (await browser.pages()).find(p => p.url().startsWith('http://localhost:5187/guest') || p.url().startsWith('http://localhost:5187/wallet'));
  assert(page, 'Memoney page required');
  await page.waitForSelector('.app-header');
  const saved = await page.evaluate(({ id, expected }) => {
    const data = JSON.parse(localStorage.getItem(`memoney:guest:${id}:mywallet:v2`));
    return data.transactions.some(t => t.title === expected.title && t.amount === expected.amount);
  }, { id: temporaryId, expected });
  assert(saved, 'Guest record must survive force stop and restart');
  await page.evaluate(previous => {
    for (const [k, v] of [['memoney:guest:active-id', previous.id], ['memoney:wallet-mode', previous.mode]]) {
      if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v);
    }
  }, previous);
  await page.goto('http://localhost:5187/wallet');
  await page.waitForSelector('.header-settings-btn');
  await page.evaluate(() => document.querySelector('.header-settings-btn').click());
  await page.waitForFunction(() => [...document.querySelectorAll('button')].some(b => b.textContent === '환경'));
  await page.evaluate(() => [...document.querySelectorAll('button')].find(b => b.textContent === '환경')?.click());
  await page.waitForSelector('button[aria-label="장부 선택"]');
  console.log(JSON.stringify({ nativeColdLaunchSaved: saved, sharedSettingsRestored: true }));
  // Optional native document save verification only reads the exact test-created filename.
  const name = process.argv[2];
  if (name) {
    assert(/^memoney-local-backup-\d+\.json$/.test(name));
    const adb = join(process.env.LOCALAPPDATA, 'Android', 'Sdk', 'platform-tools', 'adb.exe');
    const backup = JSON.parse(execFileSync(adb, ['-s', 'emulator-5554', 'exec-out', 'cat', `/sdcard/Download/${name}`], { encoding: 'utf8' }));
    assert(backup.format === 'memoney-local' && backup.version === 1);
    console.log(JSON.stringify({ nativeBackupFileVerified: true }));
  }
} finally { await browser.disconnect(); }
