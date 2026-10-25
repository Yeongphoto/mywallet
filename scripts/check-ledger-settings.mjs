import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';

const origin = process.env.MEMONEY_UI_ORIGIN || 'http://127.0.0.1:5190';
assert(['127.0.0.1', 'localhost'].includes(new URL(origin).hostname));
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const user = '99999999-9999-4999-8999-999999999999';
const personal = '77777777-7777-4777-8777-777777777777';
const shared = '66666666-6666-4666-8666-666666666666';
const guest = '55555555-5555-4555-8555-555555555555';
let financialWrites = 0;
try {
  for (const width of [320, 768]) for (const theme of ['light', 'dark']) for (const kind of ['personal', 'shared']) {
    console.log('Ledger settings', width, theme, kind);
    const context = await browser.createBrowserContext(), page = await context.newPage();
    await page.setViewport({ width, height: 900 });
    let loggedOut = false, failLogout = width === 320 && theme === 'light' && kind === 'personal';
    const ledger = { id: kind === 'personal' ? personal : shared, kind, name: kind === 'personal' ? '개인 장부' : '공유 장부', role: 'owner' };
    const data = { transactions: [], assets: [{ id: 'cloud-asset', category: 'cash', name: 'Cloud fixture', amount: 2000 }], plans: [], recurringRules: [], deletedRecurringTxs: [], updatedAt: 1 };
    await page.evaluateOnNewDocument(({ guest, theme }) => {
      localStorage.setItem('memoney:guest:active-id', guest);
      localStorage.setItem('memoney:usage-guide:v1:completed', '1');
      localStorage.setItem('memoney:appearance:v1', JSON.stringify({ theme, styleTheme: 'default' }));
      const key = `memoney:guest:${guest}:mywallet:v2`;
      if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify({ transactions: [], assets: [{ id: 'device-asset', category: 'cash', name: 'Device fixture', amount: 1000 }], plans: [{ category: 'food', type: 'expense', plannedAmount: 77 }], recurringRules: [], deletedRecurringTxs: [], updatedAt: 1, theme }));
    }, { guest, theme });
    await page.setRequestInterception(true);
    page.on('request', request => {
      const url = new URL(request.url());
      if (url.origin !== origin) return void request.abort();
      if (!url.pathname.startsWith('/api/')) return void request.continue();
      let status = 200, body = {};
      if (url.pathname === '/api/data') {
        if (request.method() !== 'GET') financialWrites++;
        body = data;
      } else if (url.pathname === '/api/wallet/context') {
        status = loggedOut ? 401 : 200;
        body = { user: { id: user }, ledger, mode: 'shared-web' };
      } else if (url.pathname === '/api/wallet/ledgers') body = { ledgers: [{ id: personal, name: '개인 장부', kind: 'personal', role: 'owner' }, { id: shared, name: '공유 장부', kind: 'shared', role: 'owner' }] };
      else if (url.pathname === '/api/auth/session') { status = loggedOut ? 401 : 200; body = { user: { id: user } }; }
      else if (url.pathname === '/api/wallet/sharing') body = { user: { email: 'fixture@example.invalid' } };
      else if (url.pathname === '/api/auth/logout') { status = failLogout ? 503 : 200; if (!failLogout) loggedOut = true; }
      else if (url.pathname === '/api/auth/config') body = { enabled: false };
      void request.respond({ status, contentType: 'application/json', body: JSON.stringify(body) });
    });
    await page.goto(origin + '/wallet#settings');
    const trigger = '.ledger-settings-controls .instant-select-trigger';
    await page.waitForSelector(trigger, { visible: true });
    await page.waitForFunction(() => document.querySelector('.account-settings-action')?.textContent === '로그아웃');
    assert.equal(await page.$('.ledger-connection-action'), null, 'no redundant disconnect/device-switch button while signed in');
    await page.click(trigger);
    await page.waitForSelector('.ledger-settings-controls [role="option"]');
    const labels = await page.$$eval('.ledger-settings-controls [role="option"]', nodes => nodes.map(el => el.textContent));
    assert(labels.some(label => label.includes('개인 장부')));
    assert(labels.some(label => label.includes('공유 장부')));
    assert(labels.every(label => !/기기 장부|로컬 장부/.test(label)), 'cloud selector excludes device-only storage');
    await page.keyboard.press('Escape');
    const before = await page.evaluate(guest => localStorage.getItem(`memoney:guest:${guest}:mywallet:v2`), guest);
    await page.click('.account-settings-action');
    if (failLogout) {
      await page.waitForFunction(() => document.body.textContent.includes('로그아웃을 완료하지 못했어요.'));
      assert.equal(new URL(page.url()).pathname, '/wallet', 'failed logout never claims a device-mode transition');
      failLogout = false;
      await page.evaluate(() => [...document.querySelectorAll('button')].find(el => el.textContent === '다시 시도').click());
    }
    await page.waitForFunction(() => location.pathname === '/guest');
    await page.waitForSelector(trigger, { visible: true });
    assert((await page.$eval(trigger, el => el.textContent)).includes('기기 장부'));
    assert.equal(await page.$eval('.ledger-connection-action', el => el.textContent), '연결');
    const after = await page.evaluate(guest => localStorage.getItem(`memoney:guest:${guest}:mywallet:v2`), guest);
    const original = JSON.parse(before), restored = JSON.parse(after);
    for (const key of ['assets', 'transactions', 'recurringRules', 'deletedRecurringTxs']) assert.deepEqual(restored[key], original[key], `logout preserves device ${key}, without cloud rows`);
    assert.equal(restored.plans.find(plan => plan.category === 'food' && plan.type === 'expense').plannedAmount, 77);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await context.close();
  }
  assert.equal(financialWrites, 0);
  console.log('Ledger settings: 8 mocked personal/shared responsive combinations, failed logout retry, original device data preserved; financial writes: 0');
} finally { await browser.close(); }
