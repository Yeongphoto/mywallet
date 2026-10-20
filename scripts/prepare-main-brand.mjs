import puppeteer from 'puppeteer-core';
import { readFileSync, writeFileSync } from 'node:fs';

// Export display-sized variants from the untouched source artwork. Downsample in
// stages so the small logo retains coverage along its transparent curved edges.
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
try {
  const page = await browser.newPage();
  for (const [name, source, crop, width] of [
    ['cat', 'public/images/logo-cat.png', [80, 209, 1104, 888], 32],
    ['name', 'public/images/mememo/memony-wordmark.png', [49, 222, 2078, 316], 104],
  ]) {
    const sourceUrl = `data:image/png;base64,${readFileSync(source).toString('base64')}`;
    for (const density of [1, 2, 3]) {
      const png = await page.evaluate(async ({ sourceUrl, crop, width, density }) => {
        const image = new Image(); image.src = sourceUrl; await image.decode();
        const make = (w, h) => { const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h; return canvas; };
        let canvas = make(crop[2], crop[3]);
        canvas.getContext('2d').drawImage(image, ...crop, 0, 0, canvas.width, canvas.height);
        const targetWidth = width * density;
        const targetHeight = Math.round(targetWidth * crop[3] / crop[2]);
        while (canvas.width > targetWidth) {
          const nextWidth = Math.max(targetWidth, Math.round(canvas.width / 2));
          const nextHeight = nextWidth === targetWidth ? targetHeight : Math.round(nextWidth * crop[3] / crop[2]);
          const next = make(nextWidth, nextHeight), context = next.getContext('2d');
          context.imageSmoothingEnabled = true; context.imageSmoothingQuality = 'high';
          context.drawImage(canvas, 0, 0, next.width, next.height);
          canvas = next;
        }
        return canvas.toDataURL('image/png').split(',')[1];
      }, { sourceUrl, crop, width, density });
      const output = `public/images/mememo/main-${name}-smooth-v1-${density}x.png`;
      writeFileSync(output, Buffer.from(png, 'base64'));
      console.log(output);
    }
  }
} finally { await browser.close(); }
