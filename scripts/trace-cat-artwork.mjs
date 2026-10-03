import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { createHash } from 'node:crypto';

const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root));
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


const { width, height, pixels } = pngPixels('public/logo.png');
const threshold = 127;
const nodes = new Map();
const alpha = (x, y) => pixels[(y * width + x) * 4 + 3];
function node(key, x1, y1, x2, y2) {
  if (!nodes.has(key)) {
    const a = alpha(x1, y1);
    const b = alpha(x2, y2);
    const t = (threshold - a) / (b - a);
    nodes.set(key, { x: x1 + .5 + (x2 - x1) * t, y: y1 + .5 + (y2 - y1) * t, neighbors: [] });
  }
  return key;
}
function connect(a, b) {
  nodes.get(a).neighbors.push(b);
  nodes.get(b).neighbors.push(a);
}
for (let y = 0; y < height - 1; y++) {
  for (let x = 0; x < width - 1; x++) {
    const values = [alpha(x, y), alpha(x + 1, y), alpha(x + 1, y + 1), alpha(x, y + 1)];
    const inside = values.map(value => value > threshold);
    const edges = [];
    if (inside[0] !== inside[1]) edges.push([0, node('h:' + x + ':' + y, x, y, x + 1, y)]);
    if (inside[1] !== inside[2]) edges.push([1, node('v:' + (x + 1) + ':' + y, x + 1, y, x + 1, y + 1)]);
    if (inside[2] !== inside[3]) edges.push([2, node('h:' + x + ':' + (y + 1), x, y + 1, x + 1, y + 1)]);
    if (inside[3] !== inside[0]) edges.push([3, node('v:' + x + ':' + y, x, y, x, y + 1)]);
    if (edges.length === 2) connect(edges[0][1], edges[1][1]);
    if (edges.length === 4) {
      const centerInside = values.reduce((sum, value) => sum + value, 0) / 4 > threshold;
      const pair = inside[0] === centerInside ? [[0, 1], [2, 3]] : [[0, 3], [1, 2]];
      for (const [a, b] of pair) connect(edges[a][1], edges[b][1]);
    }
  }
}
function distance(point, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const t = dx || dy ? Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / (dx * dx + dy * dy))) : 0;
  return Math.hypot(point.x - a.x - t * dx, point.y - a.y - t * dy);
}
function simplify(points) {
  if (points.length <= 2) return points;
  let maximum = .2, split = -1;
  for (let i = 1; i < points.length - 1; i++) {
    const d = distance(points[i], points[0], points[points.length - 1]);
    if (d > maximum) { maximum = d; split = i; }
  }
  if (split < 0) return [points[0], points[points.length - 1]];
  return [...simplify(points.slice(0, split + 1)).slice(0, -1), ...simplify(points.slice(split))];
}
const visited = new Set();
const loops = [];
for (const [start, value] of nodes) {
  assert.equal(value.neighbors.length, 2, 'Every contour must be closed');
  if (visited.has(start)) continue;
  const points = [];
  let current = start, previous = null;
  do {
    assert(!visited.has(current), 'Unexpected intersecting contour');
    visited.add(current);
    const point = nodes.get(current);
    points.push({ x: point.x, y: point.y });
    const next = point.neighbors.find(key => key !== previous);
    previous = current;
    current = next;
  } while (current !== start);
  points.push(points[0]);
  loops.push(simplify(points));
}
assert.equal(loops.length, 5, 'Expected outer outline, face opening, two eyes and mouth');
const coord = value => Number(value.toFixed(2));
const path = loops.map(points => 'M' + points.map(point => coord(point.x) + ',' + coord(point.y)).join('L') + 'Z').join(' ');
const hash = createHash('sha256').update(read('public/logo.png')).digest('hex');
process.stdout.write('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + width + ' ' + height + '" width="512" height="512">\n' +
  '  <!-- Source alpha contour: logo.png sha256=' + hash + '; threshold=127; tolerance=0.2 source px; 5 closed contours. -->\n' +
  '  <path transform="translate(70.4 70.4) scale(0.89)" d="' + path + '" fill="#ffffff" fill-rule="evenodd"/>\n</svg>\n');
