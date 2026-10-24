import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import { webUiArtifact } from './web-ui-artifact.mjs';

const origin = process.env.MEMONEY_UI_ORIGIN || 'http://127.0.0.1:5190';
assert(['127.0.0.1', 'localhost'].includes(new URL(origin).hostname));
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
let financialRequests = 0;
const completed = 'memoney:usage-guide:v1:completed';
try {
  for (const width of [320, 411, 768, 1080]) for (const theme of ['light', 'dark']) for (const styleTheme of ['default', 'theme1']) {
    const empty = width === 320 && theme === 'light' && styleTheme === 'default';
    console.log('Checking', width, theme, styleTheme, empty ? 'new user' : 'existing user');
    const context = await browser.createBrowserContext(), page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setViewport({ width, height: 800 });
    await page.evaluateOnNewDocument(({ theme, styleTheme, empty }) => {
      const id = '88888888-8888-4888-8888-888888888888';
      localStorage.setItem('memoney:guest:active-id', id);
      localStorage.setItem('memoney:wallet-mode', 'local');
      localStorage.setItem('memoney:appearance:v1', JSON.stringify({ theme, styleTheme }));
      // Seed once: a returning user's pre-existing asset must also receive this guide.
      if (!localStorage.getItem(`memoney:guest:${id}:mywallet:v2`)) localStorage.setItem(`memoney:guest:${id}:mywallet:v2`, JSON.stringify({
        theme, styleTheme, updatedAt: 1, plans: [], recurringRules: [], deletedRecurringTxs: [],
        assets: empty ? [] : [{ id: 'cash', category: 'cash', name: 'Guide fixture', memo: '', amount: 130000000 }],
        transactions: empty ? [] : [{ id: 'fixture', type: 'income', date: '2026-09-01', amount: 1000000, title: 'Fixture', category: 'salary', assetId: 'cash', revision: 1 }]
      }));
    }, { theme, styleTheme, empty });
    await page.setRequestInterception(true);
    page.on('request', request => {
      const url = new URL(request.url());
      if (url.pathname === '/api/data') financialRequests++;
      if (url.pathname.startsWith('/api/')) return void request.respond({ status: 401, contentType: 'application/json', body: '{"error":"UNAUTHENTICATED"}' });
      if (url.origin !== origin) return void request.abort();
      void request.continue();
    });
    const stage = name => page.waitForSelector(`.first-use-guide[data-guide-step="${name}"] .first-use-guide-tip`, { visible: true });
    const clickTarget = name => page.$$eval(`[data-guide="${name}"]`, elements => elements.find(el => el.getBoundingClientRect().width > 0).click());
    const assertFit = async () => assert.equal(await page.$eval('.first-use-guide-tip', el => {
      const r = el.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight;
    }), true, `${width}/${theme}: guide fits viewport`);
    await page.goto(origin + '/guest#summary');
    await stage('asset-tab'); await assertFit();
    if (width === 411) await page.screenshot({ path: webUiArtifact(`first-use-${styleTheme}-${theme}.png`) });
    await clickTarget('asset-tab'); await stage('asset-add'); await assertFit();
    await clickTarget('asset-add'); await page.waitForSelector('.entry-modal', { visible: true });
    assert.equal(await page.$('.first-use-guide'), null, 'guide never covers the registration modal');
    await page.click('[aria-label="등록 창 닫기"]'); await stage('asset-add');
    if (empty) {
      assert.equal(await page.$('.first-use-guide-skip'), null);
      await clickTarget('asset-add'); await page.waitForSelector('.asset-entry-form');
      await page.click('button[aria-label="자산 카테고리"]');
      await page.waitForSelector('.picker-grid-btn', { visible: true });
      await page.$$eval('.picker-grid-btn', elements => elements.find(el => el.textContent.includes('은행')).click());
      await page.type('input[name="asset-name"]', 'Starter fixture');
      await page.click('input[name="asset-amount"]'); await page.waitForSelector('.keypad-btn', { visible: true });
      for (const digit of ['1', '3', '000', '000', '0']) await page.$$eval('.keypad-btn', (buttons, value) => buttons.find(el => el.textContent.trim() === value).click(), digit);
      await page.$eval('.keypad-submit-btn', el => el.click());
      await page.waitForSelector('.picker-popup-backdrop', { hidden: true });
      assert.equal(await page.$eval('input[name="asset-amount"]', el => el.value.replaceAll(',', '')), '130000000');
      await page.click('.asset-entry-form button[type="submit"]');
      await page.waitForSelector('.entry-modal', { hidden: true });
    } else await page.click('.first-use-guide-skip');
    await stage('ledger-tab');
    await clickTarget('ledger-tab'); await stage('ledger-add'); await assertFit();
    await clickTarget('ledger-add'); await page.waitForSelector('.entry-modal', { visible: true });
    await page.waitForFunction(key => localStorage.getItem(key) === '1', {}, completed);
    assert.equal(await page.$('.first-use-guide'), null);
    await page.click('[aria-label="등록 창 닫기"]');
    await page.reload(); await page.waitForSelector('.header-settings-btn');
    assert.equal(await page.$('.first-use-guide'), null, 'completed guide stays dismissed after reload');
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('memoney:guest:88888888-8888-4888-8888-888888888888:mywallet:v2')));
    assert.equal(saved.assets.length, 1);
    assert.equal(saved.assets[0].amount, 130000000, 'new and existing opening amounts survive restart');
    if (empty) assert.equal(saved.assets[0].name, 'Starter fixture', 'successful first asset advances the guide');
    assert.equal(saved.transactions.length, empty ? 0 : 1);
    await page.evaluate(() => document.querySelector('a[href="#summary"]').click());
    await page.waitForFunction(() => [...document.querySelectorAll('button')].some(el => el.textContent.trim() === '자산' && el.hasAttribute('aria-pressed')));
    await page.evaluate(() => [...document.querySelectorAll('button')].find(el => el.textContent.trim() === '자산' && el.hasAttribute('aria-pressed')).click());
    if (!empty) {
      await page.waitForFunction(() => [...document.querySelectorAll('svg text')].some(el => /\d+\.\d{2}억/.test(el.textContent)));
      const labels = await page.$$eval('svg text', nodes => nodes.map(node => node.textContent).filter(value => value.endsWith('억')));
      assert(labels.every(value => /^-?\d+\.\d{2}억$/.test(value)), 'asset axis uses two decimal places');
    }
    await page.evaluate(key => localStorage.removeItem(key), completed); await page.reload(); await stage('asset-tab');
    await page.click('[aria-label="가이드 닫기"]');
    await page.reload(); await page.waitForSelector('.header-settings-btn');
    assert.equal(await page.$('.first-use-guide'), null, 'manual dismissal is also durable');
    assert.deepEqual(errors, []);
    await context.close();
  }
  assert.equal(financialRequests, 0, 'guide never writes or reads financial APIs in local mode');
  console.log('Guide/axis: 16 responsive style/theme combinations passed; first asset save, cancel, existing asset, completion, reload, dismissal and source preservation verified; financial API calls: 0');
} finally { await browser.close(); }
