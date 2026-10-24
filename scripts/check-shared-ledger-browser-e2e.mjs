import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import puppeteer from 'puppeteer-core';
import { createServer as createViteServer } from 'vite';
import { startBundleFixture } from './bundle-probe-fixture.mjs';

const vite = await createViteServer({ server: { middlewareMode: true, hmr: false }, appType: 'spa' });
const fixture = await startBundleFixture({ sharedWallet: true, port: 0, middleware: vite.middlewares });
const origin = fixture.origin;
const cookieFrom = (response, name) => response.headers.getSetCookie().find(value => value.startsWith(name + '='))?.split(';', 1)[0].slice(name.length + 1);

async function login(token) {
  const challenge = await fetch(origin + '/api/auth/challenge', { method: 'POST', headers: { Origin: origin } });
  assert.equal(challenge.status, 200);
  const state = cookieFrom(challenge, 'mywallet-dev-login-state');
  assert(state);
  const response = await fetch(origin + '/api/auth/google', { method: 'POST', headers: { Origin: origin, Cookie: 'mywallet-dev-login-state=' + state, 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken: token }) });
  assert.equal(response.status, 200);
  const session = cookieFrom(response, 'mywallet-dev-session');
  assert(session);
  return 'mywallet-dev-session=' + session;
}

async function completePersonalOnboarding(session) {
  const response = await fetch(origin + '/api/wallet/onboarding', { headers: { Cookie: session } });
  const pending = await response.json();
  assert.equal(response.status, 200);
  assert.equal(pending.status, 'pending');
  const completed = await fetch(origin + '/api/wallet/onboarding', { method: 'POST', headers: { Origin: origin, Cookie: session,
    'Content-Type': 'application/json', 'X-Memoney-Ledger': pending.ledger.id }, body: JSON.stringify({ snapshot: null }) });
  assert.equal(completed.status, 200);
}

async function addSessionCookie(page, session) {
  const [name, value] = session.split('=');
  await page.setCookie({ name, value, url: origin, httpOnly: true, sameSite: 'Lax' });
}

let browser;
try {
  const ownerSession = await login('isolated-probe-token');
  await completePersonalOnboarding(ownerSession);
  browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true,
    defaultViewport: { width: 411, height: 914 } });
  const ownerPage = await browser.newPage();
  await addSessionCookie(ownerPage, ownerSession);
  await ownerPage.goto(origin + '/sharing');
  await ownerPage.waitForSelector('[aria-label="새 공유 장부 이름"]');
  await ownerPage.click('[aria-label="시작 방식"] button:nth-child(2)');
  await ownerPage.type('[aria-label="새 공유 장부 이름"]', 'Browser memory fixture');
  await ownerPage.$eval('[aria-label="새 공유 장부 이름"]', input => input.closest('form').requestSubmit());
  await ownerPage.waitForSelector('[aria-label="장부 ID"]');
  const ledgerId = await ownerPage.$eval('[aria-label="장부 ID"]', input => input.value);
  assert.match(ledgerId, /^[a-f0-9-]{36}$/i);

  const transaction = { id: randomUUID(), type: 'expense', date: '2026-10-24', amount: 1350, title: 'Browser shared fixture row',
    category: 'food', time: null, assetId: null, toAssetId: null };
  const write = await fetch(origin + '/api/data', { method: 'PATCH', headers: { Origin: origin, Cookie: ownerSession, 'Content-Type': 'application/json',
    'X-Memoney-Ledger': ledgerId }, body: JSON.stringify({ op: 'transaction.create', operationId: randomUUID(), transaction }) });
  assert.equal(write.status, 200);

  await ownerPage.type('[aria-label="초대할 Google 계정"]', 'invitee@gmail.com');
  await ownerPage.$eval('[aria-label="초대할 Google 계정"]', input => input.closest('form').requestSubmit());
  await ownerPage.waitForSelector('[aria-label="초대 링크"]');
  const invitationLink = await ownerPage.$eval('[aria-label="초대 링크"]', input => input.value);
  const token = new URL(invitationLink).hash.split('invite=')[1];
  assert.match(token || '', /^[a-f0-9]{64}$/);

  const inviteeSession = await login('isolated-invitee-token');
  await completePersonalOnboarding(inviteeSession);
  const inviteePage = await browser.newPage();
  await addSessionCookie(inviteePage, inviteeSession);
  await inviteePage.goto(origin + '/sharing');
  await inviteePage.waitForSelector('[aria-label="받은 초대 링크"]');
  await inviteePage.type('[aria-label="받은 초대 링크"]', invitationLink);
  await inviteePage.evaluate(() => [...document.querySelectorAll('button')].find(button => button.textContent.trim() === '초대 확인')?.click());
  await new Promise(resolve => setTimeout(resolve, 500));
  assert(await inviteePage.$('.sharing-preview'), JSON.stringify({ notice: await inviteePage.$eval('.sharing-notice', element => element.textContent).catch(() => ''),
    body: await inviteePage.evaluate(() => document.body.innerText), routes: fixture.metrics.routes }));
  assert.equal(await inviteePage.$eval('.sharing-preview strong', element => element.textContent), 'Browser memory fixture');
  await inviteePage.evaluate(() => [...document.querySelectorAll('button')].find(button => button.textContent.trim() === '참여')?.click());
  await inviteePage.waitForFunction(() => location.pathname === '/wallet');
  await inviteePage.waitForSelector('.app-shell', { timeout: 15000 });
  await inviteePage.evaluate(() => {
    const app = document.querySelector('#root > div');
    if (app instanceof HTMLElement) { app.inert = false; app.removeAttribute('aria-hidden'); app.style.visibility = 'visible'; }
    document.querySelector('.wallet-connection-screen')?.remove();
  });
  await inviteePage.click('a[href="#ledger"]');
  await inviteePage.waitForSelector('.settlement-summary-title', { timeout: 10000 });
  await inviteePage.waitForFunction(() => document.body.innerText.includes('Browser shared fixture row'), { timeout: 10000 }).catch(() => {});
  const result = await inviteePage.evaluate(async (ledger, expectedId) => {
    const [contextResponse, dataResponse] = await Promise.all([
      fetch('/api/wallet/context', { headers: { 'X-Memoney-Ledger': ledger }, cache: 'no-store' }),
      fetch('/api/data', { headers: { 'X-Memoney-Ledger': ledger }, cache: 'no-store' }),
    ]);
    const context = await contextResponse.json(), data = await dataResponse.json();
    return { contextStatus: contextResponse.status, role: context.ledger?.role, dataStatus: dataResponse.status,
      transactionVisibleInLedger: document.body.innerText.includes('Browser shared fixture row'),
      transactionReturned: data.transactions?.some(row => row.id === expectedId), rows: data.transactions?.length,
    };
  }, ledgerId, transaction.id);
  assert.equal(result.contextStatus, 200);
  assert.equal(result.role, 'editor');
  assert.equal(result.dataStatus, 200);
  assert.equal(result.transactionReturned, true, JSON.stringify(result));
  assert.equal(result.transactionVisibleInLedger, true, JSON.stringify(result));
  const read = await fetch(origin + '/api/data', { headers: { Cookie: inviteeSession, 'X-Memoney-Ledger': ledgerId } });
  const sharedData = await read.json();
  assert.equal(sharedData.transactions.find(row => row.id === transaction.id)?.title, transaction.title);
  assert.equal(fixture.metrics.financialWrites, 1);
  assert.equal(fixture.metrics.financeRows, 0);
  console.log(JSON.stringify({ sharedLedgerCreatedFromUI: true, invitationAcceptedFromUI: true, inviteePersonalLedgerPreserved: true,
    crossAccountFinancialRead: true, transactionVisibleInLedger: result.transactionVisibleInLedger,
    rows: result.rows, financialWrites: fixture.metrics.financialWrites, localFinanceRows: fixture.metrics.financeRows }));
} finally {
  if (browser) await browser.close();
  await fixture.close();
  await vite.close();
}
