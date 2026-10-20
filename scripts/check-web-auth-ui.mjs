import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import { existsSync } from 'node:fs';

const executablePath = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
if (!existsSync(executablePath)) throw Error('Set CHROME_PATH to a Chromium executable');
const browser = await puppeteer.launch({ executablePath, headless: true });
try {
  const page = await browser.newPage();
  const userId = '11111111-1111-4111-a111-111111111111', personalId = '22222222-2222-4222-a222-222222222222', sharedId = '33333333-3333-4333-a333-333333333333';
  let signedIn = false, copied = false, writes = 0, googleOptions, loginAttempts = 0;
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.evaluateOnNewDocument(() => localStorage.setItem('mywallet:v2', JSON.stringify({ transactions: [{ id: 'legacy', title: 'LEGACY_PRIVATE_SENTINEL', amount: 999 }] })));
  await page.setRequestInterception(true);
  page.on('request', request => {
    const url = new URL(request.url());
    if (url.origin === 'https://accounts.google.com') {
      return void request.respond({ status: 200, contentType: 'application/javascript', body: `window.google={accounts:{id:{initialize(o){window.mockGoogleOptions=o;},renderButton(host){const b=document.createElement('button');b.textContent='Google로 계속하기';b.onclick=()=>window.mockGoogleOptions.callback({credential:'synthetic-test-credential'});host.append(b);},disableAutoSelect(){}}}};` });
    }
    if (!url.pathname.startsWith('/api/')) return void request.continue();
    let status = 200, data = {};
    const personal = { id: personalId, name: '개인 장부', kind: 'personal', role: 'owner' };
    const books = () => [personal, ...(copied ? [{ id: sharedId, name: '공유 UI 시험', kind: 'shared', role: 'owner' }] : [])];
    if (url.pathname === '/api/auth/config') data = { enabled: true, required: true, clientId: 'test.apps.googleusercontent.com' };
    else if (url.pathname === '/api/auth/challenge') data = { clientId: 'test.apps.googleusercontent.com', nonce: 'a'.repeat(64) };
    else if (url.pathname === '/api/auth/google') {
      assert.equal(JSON.parse(request.postData()).idToken, 'synthetic-test-credential');
      if (++loginAttempts === 1) { status = 401; data = { error: 'INVALID_ID_TOKEN' }; }
      else { signedIn = true; data = { user: { id: userId } }; }
    }
    else if (url.pathname === '/api/auth/logout') { signedIn = false; data = { success: true }; }
    else if (url.pathname === '/api/auth/session') { status = signedIn ? 200 : 401; data = signedIn ? { user: { id: userId } } : { error: 'UNAUTHENTICATED' }; }
    else if (url.pathname === '/api/wallet/context') data = { user: { id: userId }, ledger: personal, mode: 'shared-web' };
    else if (url.pathname === '/api/wallet/ledgers') {
      if (request.method() === 'POST') { copied = true; data = { creation: { id: sharedId, operationId: 'ui-operation', status: 'ready', percent: 100, total: 0, completed: 0 } }; }
      else data = { ledgers: books(), creation: copied ? { id: sharedId, status: 'ready', percent: 100 } : null };
    } else if (url.pathname === '/api/wallet/sharing') data = { user: { id: userId, email: 'fixture@gmail.com' }, personalLedger: personal, ledger: copied ? books()[1] : null, members: [], invitations: [], receivedInvitations: [] };
    else if (url.pathname === '/api/data') {
      if (request.method() !== 'GET') writes++;
      data = url.search ? { changes: [], nextCursor: 0 } : { transactions: [], assets: [], plans: [], recurringRules: [], deletedRecurringTxs: [], cardSettlements: [], customExpenseCategories: [], customIncomeCategories: [], customAssetCategories: [], budget: 1000000, updatedAt: 1, cursor: 0 };
    } else return void request.abort();
    void request.respond({ status, contentType: 'application/json', headers: { 'Cache-Control': 'no-store' }, body: JSON.stringify(data) });
  });
  await page.goto('http://localhost:5189/signin');
  await page.waitForSelector('.signin-card button');
  await page.waitForFunction(() => document.querySelector('.signin-card')?.textContent.includes('Google로 계속하기'));
  googleOptions = await page.evaluate(() => ({ clientId: window.mockGoogleOptions.client_id, nonce: window.mockGoogleOptions.nonce, auto: window.mockGoogleOptions.auto_select }));
  assert.deepEqual(googleOptions, { clientId: 'test.apps.googleusercontent.com', nonce: 'a'.repeat(64), auto: false });
  for (const width of [320, 411, 1280]) {
    await page.setViewport({ width, height: 900 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  }
  await page.evaluate(() => [...document.querySelectorAll('.signin-card button')].find(b => b.textContent === 'Google로 계속하기').click());
  await page.waitForFunction(() => document.body.textContent.includes('로그인 또는 장부 연결에 실패했어요.'));
  await page.evaluate(() => [...document.querySelectorAll('.signin-card button')].find(b => b.textContent === '다시 확인').click());
  await page.waitForFunction(() => [...document.querySelectorAll('.signin-card button')].some(b => b.textContent === 'Google로 계속하기'));
  const googleButton = await page.waitForSelector('.signin-card > div > button');
  assert.equal(await googleButton.evaluate(b => !!b.closest('[inert]')), false);
  await googleButton.click();
  await page.waitForSelector('.app-shell');
  assert.equal(await page.evaluate(() => document.body.textContent.includes('LEGACY_PRIVATE_SENTINEL')), false);
  assert.equal(await page.evaluate(() => localStorage.getItem('mywallet:v2').includes('LEGACY_PRIVATE_SENTINEL')), true);
  await page.goto('http://localhost:5189/sharing?return=cloud');
  await page.waitForSelector('input[aria-label="새 공유 장부 이름"]');
  await page.type('input[aria-label="새 공유 장부 이름"]', '공유 UI 시험');
  await page.evaluate(() => document.querySelector('input[aria-label="새 공유 장부 이름"]').closest('form').requestSubmit());
  await page.waitForFunction(() => document.body.textContent.includes('공유 장부를 만들었어요.'));
  assert.equal(copied, true);
  assert.equal(loginAttempts, 2);
  assert.equal(writes, 0);
  assert.deepEqual(errors, []);
  console.log('Mocked browser login → isolated wallet → shared creation passed at 320/411/1280px. No real Google login or financial writes.');
} finally { await browser.close(); }
