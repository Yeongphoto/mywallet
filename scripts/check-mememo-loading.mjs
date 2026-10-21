import { webUiArtifact } from './web-ui-artifact.mjs';
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';

const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const origin=process.argv[2] || 'http://localhost:5187';
try {
  for (const native of [false, true]) for (const stage of ['initial', 'session']) for (const dpr of [1, 2, 3]) {
    const page = await browser.newPage();
    await page.setCacheEnabled(false);
    await page.setViewport({ width: 411, height: 914, deviceScaleFactor: dpr });
    if (native) await page.setUserAgent((await browser.userAgent()) + ' MemoneyAndroid');
    await page.setRequestInterception(true);
    const held = [];
    page.on('request', request => {
      const url = new URL(request.url());
      if (stage === 'initial' && /\/assets\/index-.*\.js$/.test(url.pathname)) return void request.respond({ status: 200, contentType: 'text/javascript', body: '' });
      if (url.pathname === '/api/auth/config') { held.push(request); return; }
      if (url.pathname.startsWith('/api/')) return void request.respond({ status: 401, contentType: 'application/json', body: '{"error":"UNAUTHENTICATED"}' });
      void request.continue();
    });
    await page.goto(origin+'/signin?wallet=shared', { waitUntil: 'domcontentloaded' });
    if (stage === 'session') await page.waitForFunction(() => !document.querySelector('#root > style'));
    await page.waitForSelector('.app-loading-glyph[data-painted="true"]');
    const result = await page.evaluate(async native => {
      const canvas = document.querySelector('.app-loading-glyph');
      // Returning from account selection can emit several viewport resize events.
      for(let n=0;n<10;n++)window.dispatchEvent(new Event('resize'));
      const reference = document.createElement('canvas'); reference.width = canvas.width; reference.height = canvas.height;
      const image = new Image(); image.src = native ? '/images/mememo/mememo-met-mint.png' : '/mewallet-loading-v1.png'; await image.decode();
      const context = reference.getContext('2d'); context.imageSmoothingEnabled = true; context.imageSmoothingQuality = 'high';
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const expected = context.getImageData(0, 0, canvas.width, canvas.height).data;
      const actual = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
      let differences = 0;
      for (let i = 0; i < actual.length; i++) if ((native || i % 4 === 3) && actual[i] !== expected[i]) differences++;
      const box = canvas.getBoundingClientRect();
      return { differences, width: box.width, height: box.height, text: document.querySelector('.app-loading-copy').textContent.trim(),
        background: getComputedStyle(document.querySelector('.app-loading-screen')).backgroundColor,
        mask: getComputedStyle(canvas).maskImage, copyDisplay: getComputedStyle(document.querySelector('.app-loading-copy')).display,
        orbitDisplay: getComputedStyle(document.querySelector('.app-loading-orbit')).display, overflow: document.documentElement.scrollWidth > innerWidth };
    }, native);
    assert.equal(result.differences, 0); assert.equal(result.width, native ? 194 : 49); assert.equal(result.height, native ? 194 : 49);
    assert.equal(result.text, 'Memoney'); assert.equal(result.mask, 'none'); assert.equal(result.overflow, false);
    if (native) { assert.equal(result.background, 'rgb(10, 19, 14)'); assert.equal(result.copyDisplay, 'none'); assert.equal(result.orbitDisplay, 'none'); }
    if (native && dpr === 3) await page.screenshot({ path: webUiArtifact(`mememo-${stage}-loading.png`) });
    for (const request of held) await request.respond({ status: 200, contentType: 'application/json', body: '{"enabled":false}' });
    await page.close();
  }
  console.log('Initial and session loaders: identical original pixels, DPR 1/2/3. Native character-only 194px and existing web 49px alpha verified.');
} finally { await browser.close(); }
