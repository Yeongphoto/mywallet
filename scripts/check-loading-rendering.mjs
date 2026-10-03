import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';

const executablePath = process.argv[2];
assert(executablePath, 'Pass the installed Chromium/Edge executable path');
const origin = process.argv[3] || 'http://127.0.0.1:5187';
const browser = await puppeteer.launch({ executablePath, headless: true });
try {
  for (const initial of [true, false]) {
    for (const dpr of [1, 2, 3]) {
      const page = await browser.newPage();
      await page.setViewport({ width: 360, height: 780, deviceScaleFactor: dpr });
      await page.evaluateOnNewDocument(() => localStorage.setItem('mywallet:theme', 'dark'));
      const client = await page.createCDPSession();
      await client.send('Emulation.setAutoDarkModeOverride', { enabled: true });
      if (initial) {
        await page.setRequestInterception(true);
        page.on('request', (request) => {
          if (request.url().includes('/src/main.tsx')) request.respond({ status: 200, contentType: 'text/javascript', body: '' });
          else request.continue();
        });
      }
      await page.goto(origin, { waitUntil: 'networkidle0' });
      await page.waitForSelector('canvas.app-loading-glyph[data-painted="true"]');
      const branding = await page.evaluate(() => ({
        title: document.title,
        loading: document.querySelector('.app-loading-copy h1')?.textContent?.trim(),
        wordmarks: [...document.querySelectorAll('.brand-wordmark')].map((element) => element.textContent),
      }));
      assert.equal(branding.title, 'Memoney');
      assert.equal(branding.loading, 'Memoney');
      if (!initial) {
        assert.equal(branding.wordmarks.length, 2);
        assert(branding.wordmarks.every((text) => text === 'Memoney'));
      }
      if (dpr === 3 && process.argv[4]) {
        await page.screenshot({ path: `${process.argv[4]}/mewallet-${initial ? 'initial' : 'react'}-canvas.png` });
      }
      for (const theme of ['default', 'doodle', 'mememo']) {
        const result = await page.evaluate(async (theme) => {
          document.documentElement.dataset.styleTheme = theme;
          document.documentElement.dataset.theme = 'dark';
          const canvas = document.querySelector('canvas.app-loading-glyph');
          const style = getComputedStyle(canvas);
          const image = new Image();
          image.src = '/mewallet-loading-v1.png';
          await image.decode();
          const reference = document.createElement('canvas');
          reference.width = canvas.width;
          reference.height = canvas.height;
          const context = reference.getContext('2d');
          context.imageSmoothingQuality = 'high';
          context.drawImage(image, 0, 0, reference.width, reference.height);
          const expected = context.getImageData(0, 0, reference.width, reference.height).data;
          const actual = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
          let alphaDifferences = 0;
          let whitePixels = 0;
          for (let index = 0; index < actual.length; index += 4) {
            if (actual[index + 3] !== expected[index + 3]) alphaDifferences++;
            if (actual[index + 3] >= 240 && actual[index] === 255 && actual[index + 1] === 255 && actual[index + 2] === 255) whitePixels++;
          }
          const at = (x, y) => actual[(Math.floor(y * canvas.height) * canvas.width + Math.floor(x * canvas.width)) * 4 + 3];
          return {
            theme, width: canvas.width, cssWidth: canvas.getBoundingClientRect().width,
            alphaDifferences, whitePixels, eyes: [at(.34, .48), at(.66, .48)],
            mouth: at(.5, .54), gap: at(.5, .4), corner: at(0, 0),
            filter: getComputedStyle(canvas.parentElement).filter, mask: style.maskImage,
          };
        }, theme);
        console.log(`${initial ? 'Initial' : 'React'} DPR=${dpr}: ${JSON.stringify(result)}`);
        assert.equal(result.width, 49 * dpr);
        assert.equal(result.cssWidth, 49);
        assert.equal(result.alphaDifferences, 0, 'All original transparent gaps and facial features must survive');
        assert(result.whitePixels > 0, 'Opaque artwork must stay pure white');
        assert(result.eyes.every((alpha) => alpha > 128), 'Both eyes must remain visible');
        assert(result.mouth > 128, 'Mouth must remain visible');
        assert.equal(result.gap, 0, 'Face interior must not be filled');
        assert.equal(result.corner, 0, 'Canvas must not paint a square');
        assert.equal(result.filter, 'none');
        assert.equal(result.mask, 'none');
      }
      await page.close();
    }
  }
} finally {
  await browser.close();
}
console.log('Loading pixels passed. This does not emulate Samsung Internet or its native launcher/splash.');
