import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

// This test uses a fresh, isolated guest namespace. It never uploads test records.
const browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9223', defaultViewport: null });
const page = (await browser.pages()).find(p => p.url().startsWith('http://localhost:5187/'));
assert(page, 'Memoney WebView required');
const temporaryId = randomUUID();
const previous = await page.evaluate(() => ({ id: localStorage.getItem('memoney:guest:active-id'), mode: localStorage.getItem('memoney:wallet-mode') }));
let dataRequests = 0;
const listen = request => { if (new URL(request.url()).pathname === '/api/data') dataRequests++; };
page.on('request', listen);
try {
  await page.evaluate(id => { localStorage.setItem('memoney:guest:active-id', id); localStorage.setItem('memoney:wallet-mode', 'local'); }, temporaryId);
  await page.goto('http://localhost:5187/guest');
  await page.waitForSelector('.app-header');
  await page.click('button[aria-label="거래 등록"]');
  await page.click('button[aria-label="카테고리"]');
  await page.waitForSelector('.picker-grid-btn');
  await page.evaluate(() => [...document.querySelectorAll('.picker-grid-btn')].find(b => b.textContent.includes('음식')).click());
  await page.evaluate(() => document.querySelector('.picker-popup-backdrop')?.click());
  await page.type('input[placeholder="금액"]', '1234');
  await page.type('input[placeholder="내용 (미입력 시 분류명)"]', '기기 저장 확인');
  await page.evaluate(() => document.activeElement?.blur());
  await page.evaluate(() => document.querySelector('.picker-popup-backdrop')?.click());
  await page.evaluate(() => document.querySelector('.entry-submit').form.requestSubmit());
  await page.waitForFunction(id => JSON.parse(localStorage.getItem(`memoney:guest:${id}:mywallet:v2`) || '{}').transactions?.some(t => t.title === '기기 저장 확인'), {}, temporaryId);
  await page.waitForFunction(() => !document.querySelector('.entry-form'));
  await page.reload();
  await page.waitForSelector('.app-header');
  const state = await page.evaluate(id => {
    const data = JSON.parse(localStorage.getItem(`memoney:guest:${id}:mywallet:v2`));
    return { saved: data.transactions.some(t => t.title === '기기 저장 확인' && t.amount === 1234),
      mode: localStorage.getItem('memoney:wallet-mode'), overflow: document.documentElement.scrollWidth > innerWidth };
  }, temporaryId);
  assert.equal(state.saved, true); assert.equal(state.mode, 'local'); assert.equal(state.overflow, false); assert.equal(dataRequests, 0);
  await page.click('.header-settings-btn');
  await page.waitForSelector('button[aria-label="장부 선택"]');
  await page.click('.ledger-connection-action');
  await page.waitForSelector('.guest-sync-card');
  await page.waitForFunction(() => document.querySelector('.guest-sync-card')?.getAttribute('aria-busy') === 'false');
  const panel = await page.evaluate(() => ({ title: document.querySelector('.guest-sync-card h2')?.textContent,
    overflow: document.documentElement.scrollWidth > innerWidth,
    invalidText: /\ufffd|\\u[0-9a-f]{4}/i.test(document.querySelector('.guest-sync-card').textContent) }));
  assert.equal(panel.title, '동기화'); assert.equal(panel.overflow, false); assert.equal(panel.invalidText, false);
  await page.screenshot({ path: 'android/build/memoney-local-ui.png' });
  const backup = await page.evaluate(id => ({ format: 'memoney-local', version: 1, data: JSON.parse(localStorage.getItem(`memoney:guest:${id}:mywallet:v2`)) }), temporaryId);
  const backupPath = resolve('android/build/local-mode-qa-backup.json');
  writeFileSync(backupPath, JSON.stringify(backup), 'utf8');
  await page.click('.guest-sync-close');
  await page.evaluate(() => [...document.querySelectorAll('.settings-segment button')].find(b => b.textContent === '데이터').click());
  await page.waitForSelector('input[accept=".json"]');
  // Host filesystem paths cannot be read by an Android WebView's document picker.
  // Supply a browser File to exercise the same UTF-8 reading and reviewed restore path.
  await page.evaluate(backup => {
    const input = document.querySelector('input[accept=".json"]');
    const transfer = new DataTransfer();
    transfer.items.add(new File([JSON.stringify(backup)], 'memoney-local-backup.json', { type: 'application/json' }));
    input.files = transfer.files; input.dispatchEvent(new Event('change', { bubbles: true }));
  }, backup);
  await page.waitForSelector('#confirm-title');
  await Promise.all([page.waitForNavigation(), page.evaluate(() => document.querySelector('.confirm-actions .primary-button').click())]);
  await page.waitForSelector('.app-header');
  assert.equal(await page.evaluate(id => JSON.parse(localStorage.getItem(`memoney:guest:${id}:mywallet:v2`)).transactions[0].title, temporaryId), '기기 저장 확인');
  assert.equal(dataRequests, 0);
  console.log(JSON.stringify({ ...state, settingsVerified: true, backupRestoreVerified: true, localFinancialRequests: dataRequests, testNamespaceIsolated: true }));
} catch (error) {
  console.log(JSON.stringify(await page.evaluate(() => ({ feedback: [...document.querySelectorAll('[role="alert"], .notice-modal, .notice-toast, .toast')].map(e => e.textContent),
    bodyTail: document.body.innerText.slice(-600), entries: JSON.parse(localStorage.getItem(`memoney:guest:${localStorage.getItem('memoney:guest:active-id')}:mywallet:v2`) || '{}').transactions?.length }))));
  throw error;
} finally {
  page.off('request', listen);
  if (process.argv.includes('--restart-ready')) {
    writeFileSync('android/build/local-mode-qa-state.json', JSON.stringify({ previous, temporaryId }), 'utf8');
  } else await page.evaluate(previous => {
    for (const [key, value] of [['memoney:guest:active-id', previous.id], ['memoney:wallet-mode', previous.mode]]) {
      if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value);
    }
  }, previous);
  await page.goto(process.argv.includes('--restart-ready') || previous.mode === 'local' ? 'http://localhost:5187/guest' : 'http://localhost:5187/signin');
  await browser.disconnect();
}
