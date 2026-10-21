import { webUiArtifact } from './web-ui-artifact.mjs';
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import { randomUUID } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { resolve } from 'node:path';

// A fresh browser and mocked wallet API keep this UI check separate from all user accounts and records.
const scope = { mode: 'shared-web', user: { id: randomUUID() }, ledger: { id: randomUUID(), role: 'owner' } };
const snapshot = { transactions: [{ id: randomUUID(), type: 'expense', date: '2026-10-14', amount: 100, title: '전환 확인', category: 'food', revision: 1 }],
  assets: [], plans: [], recurringRules: [], deletedRecurringTxs: [], cardSettlements: [], customExpenseCategories: [], customIncomeCategories: [], customAssetCategories: [], updatedAt: 1, cursor: 0 };
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true,
  userDataDir: resolve(mkdtempSync(webUiArtifact('mode-ui-'))), defaultViewport: { width: 411, height: 914 } });
let writes = 0, logout = 0, reads = 0, signedIn = true;
try {
  const page = await browser.newPage();
  await page.setRequestInterception(true);
  page.on('request', request => {
    const url = new URL(request.url());
    if (!url.pathname.startsWith('/api/')) return void request.continue();
    if (request.method() !== 'GET') writes++;
    if (url.pathname === '/api/auth/logout') logout++;
    let body;
    if (url.pathname === '/api/wallet/context') body = signedIn ? scope : { error: 'UNAUTHENTICATED' };
    else if (url.pathname === '/api/auth/session') body = signedIn ? { user: scope.user } : { user: null };
    else if (url.pathname === '/api/data') { reads++; body = url.searchParams.has('after') ? { changes: [], nextCursor: 0 } : snapshot; }
    else body = {};
    void request.respond({ status: url.pathname === '/api/wallet/context' && !signedIn ? 401 : 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  const clickText = text => page.evaluate(text => {
    const button = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === text);
    if (!button) throw Error('Button unavailable'); button.click();
  }, text);
  await page.goto('http://localhost:5187/wallet');
  await page.waitForSelector('.header-settings-btn');
  await page.waitForFunction(() => {
    const button = document.querySelector('.header-settings-btn'), box = button.getBoundingClientRect();
    return button.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2));
  });
  await page.click('.header-settings-btn');
  await page.waitForSelector('button[aria-label="장부 선택"]');
  await clickText('🍃 메메모 (Mememo)');
  await clickText('다크');
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('memoney:appearance:v1')).styleTheme === 'mememo');
  const key = `memoney:user:${scope.user.id}:ledger:${scope.ledger.id}:mywallet:v2`;
  assert.equal(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).transactions.length, key), 1);
  await page.waitForSelector('.ledger-connection-action');
  assert.equal(await page.$eval('.ledger-connection-action', b => b.textContent), '연결 끊기');
  const closedHeight = await page.$eval('.ledger-settings-row', e => e.getBoundingClientRect().height);
  await page.click('button[aria-label="장부 선택"]');
  assert.equal(await page.$eval('.ledger-settings-row', e => e.getBoundingClientRect().height), closedHeight, 'Dropdown must not resize the settings card');
  assert.equal(await page.$eval('.instant-select-menu', e => getComputedStyle(e).position), 'absolute');
  await page.screenshot({ path: webUiArtifact('ledger-dropdown-dark.png') });
  await Promise.all([page.waitForNavigation(), clickText('로컬 장부')]);
  await page.waitForSelector('.app-header');
  const localReads = reads;
  const state = await page.evaluate(key => {
    const id = localStorage.getItem('memoney:guest:active-id');
    const local = JSON.parse(localStorage.getItem(`memoney:guest:${id}:mywallet:v2`) || '{}');
    return { mode: localStorage.getItem('memoney:wallet-mode'), localTransactions: local.transactions?.length || 0,
      sharedCacheTransactions: JSON.parse(localStorage.getItem(key)).transactions.length,
      overflow: document.documentElement.scrollWidth > innerWidth, style: document.documentElement.getAttribute('data-style-theme'), theme: document.documentElement.getAttribute('data-theme') };
  }, key);
  assert.equal(state.mode, 'local'); assert.equal(state.localTransactions, 0); assert.equal(state.sharedCacheTransactions, 1);
  assert.equal(state.style, 'mememo'); assert.equal(state.theme, 'dark');
  await page.waitForSelector('button[aria-label="장부 선택"]');
  await clickText('연결');
  await page.waitForFunction(() => [...document.querySelectorAll('.guest-sync-card button')].some(b => b.textContent === '공유 장부에 합치기'));
  assert.equal(reads, localReads, 'Opening local mode and its sync settings must not fetch financial data');
  assert.equal(await page.evaluate(() => document.querySelectorAll('.guest-sync-card p').length), 0);
  await page.screenshot({ path: webUiArtifact('sync-mememo-dark.png') });
  await page.click('.guest-sync-close');
  await page.click('button[aria-label="장부 선택"]');
  await Promise.all([page.waitForNavigation(), clickText('공유 장부')]);
  await page.waitForSelector('.app-header');
  await page.waitForFunction(key => JSON.parse(localStorage.getItem(key)).transactions.length === 1, {}, key);
  assert.equal(await page.evaluate(() => localStorage.getItem('memoney:wallet-mode')), 'shared-web');
  assert.equal(writes, 0); assert.equal(logout, 0); assert.equal(state.overflow, false);
  await page.waitForSelector('.ledger-connection-action');
  await page.screenshot({ path: webUiArtifact('ledger-connected-dark.png') });
  await Promise.all([page.waitForNavigation(), clickText('연결 끊기')]);
  await page.waitForSelector('button[aria-label="장부 선택"]');
  assert.equal(await page.$eval('.ledger-connection-action', b => b.textContent), '연결');
  assert.equal(await page.evaluate(() => localStorage.getItem('memoney:wallet-mode')), 'local');
  assert.equal(writes, 0); assert.equal(logout, 0);
  await page.screenshot({ path: webUiArtifact('ledger-local-dark.png') });
  for (const width of [320, 411, 768]) {
    await page.setViewport({ width, height: 914 });
    const height = await page.$eval('.ledger-settings-row', e => e.getBoundingClientRect().height);
    await page.click('button[aria-label="장부 선택"]');
    assert.equal(await page.$eval('.ledger-settings-row', e => e.getBoundingClientRect().height), height);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    assert(await page.$eval('.instant-select-menu', e => { const r = e.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth; }));
    await page.keyboard.press('Escape');
  }
  await page.setViewport({ width: 411, height: 914 });
  signedIn = false;
  for (const style of ['default', 'doodle', 'mememo']) {
    for (const theme of ['light', 'dark']) {
      await page.evaluate(appearance => localStorage.setItem('memoney:appearance:v1', JSON.stringify(appearance)), { styleTheme: style, theme });
      await page.goto('http://localhost:5187/signin?wallet=shared');
      await page.waitForSelector('.signin-google');
      await page.waitForFunction(() => document.querySelector('.signin-card')?.getAttribute('aria-busy') !== 'true');
      const appearance = await page.evaluate(() => ({ style: document.documentElement.getAttribute('data-style-theme'), theme: document.documentElement.getAttribute('data-theme'),
        logo: document.querySelector('.signin-brand img').getAttribute('src'), paragraphs: document.querySelectorAll('.signin-content p').length,
        overflow: document.documentElement.scrollWidth > innerWidth }));
      assert.equal(appearance.style, style); assert.equal(appearance.theme, theme); assert.equal(appearance.paragraphs, 0); assert.equal(appearance.overflow, false);
      if (style === 'mememo') assert(appearance.logo.includes(theme === 'dark' ? 'mememo-met-mint' : 'mememo-met-green'));
      await page.screenshot({ path: webUiArtifact(`login-${style}-${theme}.png`) });
    }
  }
  assert.equal(writes, 0); assert.equal(logout, 0);
  console.log(JSON.stringify({ ledgerDropdown: true, signedInLocalSelection: true, sharedRecordsPreserved: true,
    returnToSharedWallet: true, disconnectToLocal: true, dropdownKeepsCardSize: true, responsiveWidths: 3,
    themePreserved: true, loginThemeVariants: 6, financialWrites: writes, logoutRequests: logout, mobileOverflow: false }));
} finally { await browser.close(); }
