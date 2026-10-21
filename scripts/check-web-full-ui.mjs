import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import { webUiArtifact } from './web-ui-artifact.mjs';

const origin = process.argv[2] || 'http://127.0.0.1:5190';
assert(['localhost', '127.0.0.1'].includes(new URL(origin).hostname), 'Local fixture host only');
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
let financialRequests = 0, checks = 0;
const screenshots = [];
try {
  for (const width of [411, 768, 1080, 1440]) for (const styleTheme of ['default', 'theme1']) for (const theme of ['light', 'dark']) {
    const page = await browser.newPage(), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.setViewport({ width, height: 1000, deviceScaleFactor: 1 });
    await page.evaluateOnNewDocument(({ theme, styleTheme }) => {
      const id = '77777777-7777-4777-8777-777777777777';
      localStorage.setItem('memoney:guest:active-id', id);
      localStorage.setItem('memoney:wallet-mode', 'local');
      localStorage.setItem('memoney:appearance:v1', JSON.stringify({ theme, styleTheme }));
      const now = new Date(), transactions = [];
      for (let i = 0; i < 3; i++) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 5), date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-05`;
        transactions.push({ id: `income-${i}`, type: 'income', date, time: '09:00', amount: 1000000 + i * 10000, title: '수입 검증', category: 'salary', revision: 1 });
        transactions.push({ id: `expense-${i}`, type: 'expense', date, time: '12:00', amount: 30000 + i * 1000, title: '지출 검증', category: 'food', revision: 1 });
      }
      localStorage.setItem(`memoney:guest:${id}:mywallet:v2`, JSON.stringify({ transactions, assets: [], plans: [], recurringRules: [], deletedRecurringTxs: [], cardSettlements: [], updatedAt: 1, theme, styleTheme }));
    }, { theme, styleTheme });
    await page.setRequestInterception(true);
    page.on('request', r => {
      const url = new URL(r.url());
      if (url.pathname === '/api/data') financialRequests++;
      if (url.pathname.startsWith('/api/')) return void r.respond({ status: 401, contentType: 'application/json', body: '{"error":"UNAUTHENTICATED"}' });
      if (url.origin !== origin) return void r.abort();
      void r.continue();
    });
    const visitTab = async label => {
      await page.evaluate(label => [...document.querySelectorAll('nav a')].find(a => a.textContent.trim() === label && a.getBoundingClientRect().width > 0).click(), label);
      await page.waitForFunction(() => !!document.querySelector('.app-header'));
    };
    const fits = async () => assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, `${width}/${styleTheme}/${theme} overflow`);
    await page.goto(origin + '/guest'); await page.waitForSelector('.summary-card.income'); await fits();
    for (const kind of ['income', 'expense']) {
      await page.click('.summary-card.' + kind); await page.waitForSelector('.trend-overview-card');
      const boxes = await page.evaluate(() => {
        const rect = selector => { const r = document.querySelector(selector).getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right }; };
        return { chart: rect('.trend-chart-box'), note: rect('.trend-piggy-box'), title: rect('.trend-box-title'), months: rect('.trend-box-title > span:last-child') };
      });
      if (width >= 768) {
        assert(Math.abs(boxes.chart.width - boxes.note.width) <= 1, 'Equal tablet columns');
        assert(Math.abs(boxes.chart.height - boxes.note.height) <= 1, 'Equal tablet heights');
        assert(Math.abs(boxes.chart.y - boxes.note.y) <= 1, 'Top aligned tablet panels');
      }
      assert(Math.abs(boxes.months.right - boxes.title.right) <= 1, 'Month range right alignment'); await fits();
      if (kind === 'income' && styleTheme === 'default' && theme === 'light') {
        const path = webUiArtifact(`trend-${width}.png`); await page.screenshot({ path }); screenshots.push(path);
      }
      await visitTab('차트'); await page.waitForSelector('.summary-card.income');
    }
    for (const label of ['계획', '장부', '차트']) { await visitTab(label); await fits(); assert(await page.$('.jelly-toggle')); }
    await page.evaluate(() => [...document.querySelectorAll('button[aria-label="거래 등록"]')].find(b => b.getBoundingClientRect().width > 0).click());
    await page.waitForSelector('.entry-modal');
    for (const label of ['자산', '지출', '수입', '이체']) {
      await page.evaluate(label => [...document.querySelectorAll('.registration-mode-tabs button')].find(b => b.textContent === label).click(), label);
      assert(await page.$('.entry-modal form[data-entry-type]')); await fits();
      assert.equal(await page.$eval('.entry-modal', el => { const r = el.getBoundingClientRect(); return r.left >= -1 && r.right <= innerWidth + 1; }), true);
    }
    await page.click('[aria-label="등록 창 닫기"]'); await page.waitForSelector('.entry-modal', { hidden: true });
    await page.click('.header-settings-btn'); await fits();
    assert.equal(await page.evaluate(() => [...document.images].filter(i => i.currentSrc && i.complete && !i.naturalWidth).length), 0, 'No broken images');
    assert.deepEqual(errors, []); checks++; await page.close();
  }
  assert.equal(financialRequests, 0);
  console.log(JSON.stringify({ checks, widths: [411, 768, 1080, 1440], themes: 4, equalTabletCards: true, jellyTabs: true, fourEntryModes: true, financialRequests, screenshots }));
} finally { await browser.close(); }
