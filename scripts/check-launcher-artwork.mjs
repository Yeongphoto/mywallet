import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';

assert(process.argv[2], 'Pass the installed Chromium/Edge executable path');
const browser = await puppeteer.launch({ executablePath: process.argv[2], headless: true });
try {
  const page = await browser.newPage();
  const origin = process.argv[3] || 'http://127.0.0.1:5187';
  await page.goto(origin);
  const result = await page.evaluate(async () => {
    const images = await Promise.all(['/mewallet-v1-192.png', '/mewallet-v2-launcher-192.svg'].map(async (src) => {
      const image = new Image();
      image.src = src;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 192;
      const context = canvas.getContext('2d');
      context.drawImage(image, 0, 0);
      return { canvas, pixels: context.getImageData(0, 0, 192, 192).data };
    }));
    const [original, rounded] = images.map(({ pixels }) => pixels);
    let catPixels = 0;
    let catDifferences = 0;
    for (let index = 0; index < original.length; index += 4) {
      if (original[index] < 200 || original[index + 1] < 200 || original[index + 2] < 200) continue;
      catPixels++;
      if ([0, 1, 2, 3].some((channel) => original[index + channel] !== rounded[index + channel])) catDifferences++;
    }
    const pixel = (x, y) => [...rounded.slice((y * 192 + x) * 4, (y * 192 + x) * 4 + 4)];
    return { catPixels, catDifferences, corners: [[0, 0], [191, 0], [0, 191], [191, 191]].map(([x, y]) => pixel(x, y)), edge: pixel(96, 0) };
  });
  assert(result.catPixels > 0);
  assert.equal(result.catDifferences, 0, 'Outline, eyes and mouth must remain pixel-identical');
  assert(result.corners.every((pixel) => pixel[3] === 0), 'Corners must be transparent');
  assert.deepEqual(result.edge, [9, 9, 11, 255], 'Keep the black tile edge, not a white border');
  console.log(JSON.stringify(result));
  await page.goto(`${origin}/mewallet-v2-launcher-192.svg`);
  if (process.argv[4]) await page.screenshot({ path: process.argv[4] });
} finally {
  await browser.close();
}
console.log('Artwork passed; Samsung launcher wrapping still requires a device test.');
