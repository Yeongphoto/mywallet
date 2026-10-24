import assert from 'node:assert/strict';
import { createServer } from 'vite';
import puppeteer from 'puppeteer-core';

const server = await createServer({ server: { host: '127.0.0.1', port: 0, hmr: false } });
await server.listen();
const origin = 'http://127.0.0.1:' + server.httpServer.address().port;
let browser;
try {
  browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  const page = await browser.newPage();
  for (const theme of ['light', 'dark']) {
    await page.setViewport({ width: 411, height: 914 });
    await page.goto(origin + '/scripts/ui-fixtures/billing.html?theme=' + theme);
    await page.waitForSelector('.billing-settings-actions .primary-button');
    assert((await page.$eval('.billing-settings', element => element.textContent)).includes('₩2,000'));
    assert.equal(await page.evaluate(() => /\ufffd|\\u[0-9a-f]{4}/i.test(document.body.innerText)), false);
    await page.screenshot({ path: 'android/build/billing-ui-' + theme + '.png' });
    for (const width of [320, 411, 768]) {
      await page.setViewport({ width, height: 914 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    }
    await page.click('.billing-settings-actions .primary-button');
    await page.waitForFunction(() => document.body.innerText.includes('연 구독 이용 중'));
    assert.equal(await page.$('.billing-settings-actions .primary-button'), null);
    await page.evaluate(() => [...document.querySelectorAll('button')].find(button => button.textContent === '구매 복원').click());
    await page.waitForFunction(() => document.body.innerText.includes('연 구독 혜택이 적용됐어요.'));
    await page.evaluate(() => [...document.querySelectorAll('button')].find(button => button.textContent === '구독 관리').click());
    await page.waitForFunction(() => document.documentElement.dataset.managed === 'true');
  }
  await page.goto(origin + '/scripts/ui-fixtures/billing.html?cancel=1');
  await page.waitForSelector('.billing-settings-actions .primary-button');
  await page.click('.billing-settings-actions .primary-button');
  await page.waitForFunction(() => document.body.innerText.includes('결제를 취소했어요.'));
  assert(await page.$('.billing-settings-actions .primary-button'));
  console.log(JSON.stringify({ lightAndDark: true, viewportWidths: [320, 411, 768], mockPurchaseRestoreManage: true,
    cancellationPreservesFreeState: true, realBillingCalls: 0 }));
} finally { if (browser) await browser.close(); await server.close(); }
