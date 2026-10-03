import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';

assert(process.argv[2], 'Pass the installed Chromium/Edge executable path');
const browser = await puppeteer.launch({ executablePath: process.argv[2], headless: true });
try {
  const page = await browser.newPage();
  const origin = process.argv[3] || 'http://127.0.0.1:5187';
  await page.goto(`${origin}/manifest.webmanifest`);
  for (const size of [49, 147, 192, 512]) {
    const result = await page.evaluate(async (size) => {
      const png = new Image(), svg = new Image();
      png.src = '/logo.png';
      svg.src = '/memoney-mark-v1.svg';
      await Promise.all([png.decode(), svg.decode()]);
      const source = document.createElement('canvas'), vector = document.createElement('canvas');
      source.width = source.height = vector.width = vector.height = size;
      const a = source.getContext('2d'), b = vector.getContext('2d');
      a.imageSmoothingQuality = 'high';
      a.drawImage(png, .055 * size, .055 * size, .89 * size, .89 * size);
      a.globalCompositeOperation = 'source-in';
      a.fillStyle = '#ffffff';
      a.fillRect(0, 0, size, size);
      b.drawImage(svg, 0, 0, size, size);
      const expected = a.getImageData(0, 0, size, size).data;
      const actual = b.getImageData(0, 0, size, size).data;
      let intersection = 0, union = 0, alphaError = 0, radius = 0;
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const at = (y * size + x) * 4 + 3;
          const left = expected[at] > 127, right = actual[at] > 127;
          if (left && right) intersection++;
          if (left || right) union++;
          alphaError += Math.abs(expected[at] - actual[at]);
          if (right) radius = Math.max(radius, Math.hypot((x + .5) / size - .5, (y + .5) / size - .5));
        }
      }
      const alpha = (x, y) => actual[(Math.floor(y * size) * size + Math.floor(x * size)) * 4 + 3];
      return { size, silhouetteMatch: intersection / union, meanAlphaError: alphaError / (size * size), radius,
        eyes: [alpha(.3576, .4822), alpha(.6424, .4822)], mouth: alpha(.5, .5356), gap: alpha(.5, .411), corner: alpha(0, 0) };
    }, size);
    console.log(JSON.stringify(result));
    // A 49px/1x preview has subpixel-width details; compare the area error too.
    assert(result.silhouetteMatch > (size === 49 ? .90 : .97), 'Vector must preserve the source silhouette');
    assert(result.meanAlphaError < (size === 49 ? 4 : 3), 'Tracing error must remain small at actual icon sizes');
    assert(result.radius <= .405, 'Keep the complete cat inside the maskable safe zone');
    assert(result.eyes.every((alpha) => alpha > 128));
    assert(result.mouth > 128);
    assert.equal(result.gap, 0);
    assert.equal(result.corner, 0);
  }
  await page.goto(`${origin}/memoney-mark-v1.svg`);
  await page.evaluate(() => { document.documentElement.style.background = '#09090b'; });
  if (process.argv[4]) await page.screenshot({ path: process.argv[4] });
} finally {
  await browser.close();
}
console.log('Vector fidelity passed; Samsung native installation still requires a device test.');
