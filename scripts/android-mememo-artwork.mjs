import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import puppeteer from 'puppeteer-core';

// Resize the existing artwork only. No tracing, recoloring, or generated details.
const source = readFileSync('public/images/mememo/mememo-met-mint.png');
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
try {
  const page = await browser.newPage();
  const res = resolve('android/app/src/main/res');
  const render = async (size, artworkSize, background = false, round = false, safeRadius = null) => {
    const result = await page.evaluate(async ({ src, size, artworkSize, background, round, safeRadius }) => {
      const image = new Image(); image.src = src; await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = size;
      const context = canvas.getContext('2d');
      context.imageSmoothingEnabled = true; context.imageSmoothingQuality = 'high';
      if (background) {
        context.fillStyle = '#0a130e';
        if (round) { context.beginPath(); context.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2); context.fill(); }
        else context.fillRect(0, 0, size, size);
      }
      context.drawImage(image, (size - artworkSize) / 2, (size - artworkSize) / 2, artworkSize, artworkSize);
      let outside = 0;
      if (safeRadius) {
        const pixels = context.getImageData(0, 0, size, size).data;
        for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
          if (pixels[(y * size + x) * 4 + 3] > 8 && Math.hypot(x + 0.5 - size / 2, y + 0.5 - size / 2) > safeRadius) outside++;
        }
      }
      return { png: canvas.toDataURL('image/png').split(',')[1], outside };
    }, { src: `data:image/png;base64,${source.toString('base64')}`, size, artworkSize, background, round, safeRadius });
    assert.equal(result.outside, 0, 'Artwork must fit inside the Android safe circle');
    return Buffer.from(result.png, 'base64');
  };
  for (const [density, scale] of [['mdpi', 1], ['hdpi', 1.5], ['xhdpi', 2], ['xxhdpi', 3], ['xxxhdpi', 4]]) {
    const folder = resolve(res, `mipmap-${density}`); mkdirSync(folder, { recursive: true });
    writeFileSync(resolve(folder, 'mememo_launcher.png'), await render(48 * scale, 44 * scale, true));
    writeFileSync(resolve(folder, 'mememo_launcher_round.png'), await render(48 * scale, 44 * scale, true, true));
    writeFileSync(resolve(folder, 'mememo_foreground.png'), await render(108 * scale, 72 * scale, false, false, 33 * scale));
    const drawable = resolve(res, `drawable-${density}`); mkdirSync(drawable, { recursive: true });
    writeFileSync(resolve(drawable, 'mememo_splash.png'), await render(288 * scale, 194 * scale, false, false, 96 * scale));
  }
  mkdirSync('android/build', { recursive: true });
  writeFileSync('android/build/mememo-icon-preview.png', await render(512, 470, true, true));
  console.log('Mememo native icons generated from the unchanged mint PNG. Adaptive and splash safe circles verified.');
} finally { await browser.close(); }
