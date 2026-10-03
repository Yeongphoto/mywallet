import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root));
for (const path of ['public/favicon.svg', 'public/logo.svg', 'public/logo-icon.svg', 'public/icons', 'public/images/logo-pig-backup.png']) {
  assert(!existsSync(new URL(path, root)), `${path}: retired branding asset must not return`);
}

function pngPixels(path) {
  const bytes = read(path);
  assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', `${path}: invalid PNG`);
  let width = 0;
  let height = 0;
  const data = [];
  for (let offset = 8; offset < bytes.length;) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.toString('ascii', offset + 4, offset + 8);
    const chunk = bytes.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = chunk.readUInt32BE(0);
      height = chunk.readUInt32BE(4);
      assert.equal(chunk[8], 8, `${path}: expected 8-bit PNG`);
      assert.equal(chunk[9], 6, `${path}: expected RGBA PNG`);
      assert.equal(chunk[12], 0, `${path}: interlaced PNG is unsupported`);
    }
    if (type === 'IDAT') data.push(chunk);
    offset += length + 12;
  }
  assert(width > 0 && height > 0 && data.length > 0, `${path}: incomplete PNG`);
  const scanlines = inflateSync(Buffer.concat(data));
  const stride = width * 4;
  const pixels = Buffer.alloc(stride * height);
  let input = 0;
  for (let y = 0; y < height; y++) {
    const filter = scanlines[input++];
    assert(filter >= 0 && filter <= 4, `${path}: unsupported PNG filter`);
    for (let x = 0; x < stride; x++) {
      const left = x >= 4 ? pixels[y * stride + x - 4] : 0;
      const up = y > 0 ? pixels[(y - 1) * stride + x] : 0;
      const upperLeft = y > 0 && x >= 4 ? pixels[(y - 1) * stride + x - 4] : 0;
      let predictor = 0;
      if (filter === 1) predictor = left;
      if (filter === 2) predictor = up;
      if (filter === 3) predictor = Math.floor((left + up) / 2);
      if (filter === 4) {
        const estimate = left + up - upperLeft;
        const distances = [left, up, upperLeft].map((value) => Math.abs(estimate - value));
        predictor = distances.indexOf(Math.min(...distances)) === 0 ? left
          : distances[1] <= distances[2] ? up : upperLeft;
      }
      pixels[y * stride + x] = (scanlines[input++] + predictor) & 255;
    }
  }
  assert.equal(input, scanlines.length, `${path}: unexpected PNG data length`);
  return { width, height, pixels };
}

function whiteMark(path) {
  const { width, height, pixels } = pngPixels(path);
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  let count = 0;
  let radius = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const at = (y * width + x) * 4;
      if (pixels[at] < 200 || pixels[at + 1] < 200 || pixels[at + 2] < 200 || pixels[at + 3] < 128) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      radius = Math.max(radius, Math.hypot((x + .5) / width - .5, (y + .5) / height - .5));
      count++;
    }
  }
  assert(count > 0, `${path}: no white logo found`);
  return {
    width, height, pixels,
    xSize: (maxX - minX + 1) / width,
    ySize: (maxY - minY + 1) / height,
    xCenter: (minX + maxX + 1) / (2 * width),
    yCenter: (minY + maxY + 1) / (2 * height),
    area: count / (width * height),
    radius,
  };
}

const source = whiteMark('public/logo.png');
assert.equal(source.width, source.height, 'Loading logo must use a square canvas');
const manifest = JSON.parse(read('public/manifest.webmanifest').toString('utf8'));
assert.deepEqual(manifest, JSON.parse(read('public/mewallet-v1.webmanifest').toString('utf8')), 'Legacy manifest must advertise the same current branding');
assert.deepEqual(manifest, JSON.parse(read('public/mewallet-v2.webmanifest').toString('utf8')), 'Current manifest must match the legacy update routes');
assert.deepEqual(manifest, JSON.parse(read('public/mewallet-v3.webmanifest').toString('utf8')), 'Current manifest must match the legacy update routes');
for (const filename of readdirSync(new URL('public/', root)).filter((name) => name.endsWith('.webmanifest'))) {
  const advertised = JSON.parse(read(`public/${filename}`).toString('utf8'));
  assert.deepEqual(advertised, manifest, `${filename}: old install routes must advertise the repaired configuration`);
  assert(advertised.icons.every((icon) => icon.purpose === 'any'), `${filename}: ANY maskable entry, including 192px or combined purposes, regresses Samsung splash`);
}
assert.equal(manifest.name, 'Mewallet');
assert.equal(manifest.short_name, 'Mewallet');
assert.equal(manifest.id, manifest.start_url, 'Keep the previously inferred PWA identity to preserve existing installations');
assert.equal(manifest.icons.length, 2, 'Install manifest must contain two cat icons');
assert.deepEqual(manifest.icons.map(({ sizes, purpose }) => [sizes, purpose]), [['192x192', 'any'], ['512x512', 'any']], 'Keep the device-confirmed any-only splash configuration');
const html = read('index.html').toString('utf8');
const worker = read('public/sw.js').toString('utf8');
const styles = read('src/styles.css').toString('utf8');
const loadingScale = read('src/loading-scale.css').toString('utf8');
assert.match(html, /<link rel="manifest" href="\/mewallet-v4\.webmanifest"\s*\/>/, 'New installs must request the versioned manifest');
assert(worker.includes("'/mewallet-v4.webmanifest'"), 'Service worker must cache the versioned manifest');
for (const path of ['mewallet-v1-favicon.ico', 'mewallet-v1-apple-touch-icon.png']) {
  assert(existsSync(new URL(`public/${path}`, root)), `${path}: missing versioned fallback icon`);
  assert(html.includes(`href="/${path}"`), `${path}: missing HTML reference`);
  assert(worker.includes(`'/${path}'`), `${path}: missing service worker reference`);
}
assert(!/href="\/(?:favicon\.ico|apple-touch-icon\.png|pwa-cat-)/.test(html), 'HTML must not reuse old install icon URLs');
assert(read('public/logo.png').equals(read('public/images/mememo/mememo-met.png')), 'Mememo loading logo must match the canonical cat artwork');
assert(read('public/logo.png').equals(read('public/mewallet-loading-v1.png')), 'Versioned loading mask must preserve the canonical artwork');
const mask = pngPixels('public/mewallet-loading-v1.png');
for (let x = 0; x < mask.width; x++) {
  assert.equal(mask.pixels[x * 4 + 3], 0, 'Loading mask top edge must remain transparent');
  assert.equal(mask.pixels[((mask.height - 1) * mask.width + x) * 4 + 3], 0, 'Loading mask bottom edge must remain transparent');
}
for (let y = 0; y < mask.height; y++) {
  assert.equal(mask.pixels[y * mask.width * 4 + 3], 0, 'Loading mask left edge must remain transparent');
  assert.equal(mask.pixels[(y * mask.width + mask.width - 1) * 4 + 3], 0, 'Loading mask right edge must remain transparent');
}
assert(html.includes('class="app-loading-glyph"'), 'First paint must render the loading glyph');
assert(html.includes('<canvas class="app-loading-glyph"'), 'First paint must use the same canvas renderer as React');
assert(html.includes('src="/mewallet-loading-v2.js"'), 'Canvas renderer must load before React');
assert(worker.includes("'/mewallet-loading-v2.js'"), 'Canvas renderer must be available offline');
assert(read('src/LoadingGlyph.tsx').toString('utf8').includes('MewalletLoadingArtwork?.draw'), 'React must share the first-paint renderer');
assert(!/<img src="\/logo\.png"/.test(html), 'First paint must not use a bitmap image element');
assert(styles.includes("mask: url('/mewallet-loading-v1.png')"), 'React loading glyph must use the same alpha mask');
assert(html.includes('background:linear-gradient(#ffffff,#ffffff);color-scheme:only light;opacity:1;'), 'First paint must preserve the white loading fill');
assert(styles.includes('background: linear-gradient(#ffffff, #ffffff);'), 'React loading must preserve the white loading fill');
assert(loadingScale.includes('filter: none !important;'), 'Loading artwork must remain crisp without a glow filter');
assert(html.includes('width:49px;height:49px'), 'First-paint logo size differs from the measured Android splash');
assert((styles.match(/width: 49px;\s*height: 49px;/g) ?? []).length >= 2, 'App and sync loading logo sizes differ');
assert(/width: 49px;\s*height: 49px;/.test(loadingScale), 'Loading scale override differs from measured Android splash');

for (const [purpose, scale] of [['any', 1], ['maskable', .89]]) {
  for (const size of [192, 512]) {
    const path = `public/mewallet-v1-${purpose === 'any' ? '' : 'maskable-'}${size}.png`;
    const mark = whiteMark(path);
    assert.equal(mark.width, size, `${path}: incorrect width`);
    assert.equal(mark.height, size, `${path}: incorrect height`);
    for (const corner of [0, (size - 1) * 4, (size * size - size) * 4, (size * size - 1) * 4]) {
      assert.deepEqual([...mark.pixels.subarray(corner, corner + 4)], [9, 9, 11, 255], `${path}: wrong opaque background`);
    }
    for (const dimension of ['xSize', 'ySize']) {
      assert(Math.abs(mark[dimension] - source[dimension] * scale) < .015, `${path}: logo ${dimension} differs from loading logo`);
    }
    for (const dimension of ['xCenter', 'yCenter']) {
      assert(Math.abs(mark[dimension] - source[dimension]) < .01, `${path}: logo is off-center`);
    }
    assert(Math.abs(mark.area - source.area * scale * scale) < .008, `${path}: unexpected white pixels, possibly a border or another mark`);
    if (purpose === 'maskable') assert(mark.radius <= .405, `${path}: logo extends outside maskable safe zone`);
    if (purpose === 'any') assert(manifest.icons.some((icon) => icon.src === `/${path.slice(7)}` && icon.sizes === `${size}x${size}` && icon.purpose === purpose), `${path}: missing or incorrect manifest entry`);
    console.log(`${path}: ${(mark.xSize * 100).toFixed(1)}% wide, ${(mark.ySize * 100).toFixed(1)}% high, centered`);
  }
}
console.log('PWA artwork and loading size checks passed. Android OS splash must still be checked on the installed device.');
