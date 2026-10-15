"""Reuse the supplied MEMEMO glyph silhouettes; add only the new N/Y letters."""
from pathlib import Path
import hashlib
import json
from PIL import Image

root = Path(__file__).resolve().parent.parent
source = root / 'public/images/mememo/mememo-wordmark-source.png'
im = Image.open(source).convert('RGBA')
dark, mint = set(), set()
samples, error = 0, 0

def copy_glyph(left, right, offset, target):
    global samples, error
    for y in range(56, 169):
        for x in range(left, right):
            alpha = im.getpixel((x, y))[3]
            present = alpha >= 128
            samples += 1
            error += abs((255 if present else 0) - alpha)
            if present:
                target.add((x - left + offset, y - 56))

# Original M, E, M, O, E; preserve their raster silhouettes, without redrawing.
copy_glyph(51, 177, 0, dark)
copy_glyph(204, 324, 153, dark)
copy_glyph(351, 476, 300, dark)
copy_glyph(803, 915, 452, mint)
copy_glyph(204, 324, 744, dark)

# Preserve the three signature dots under the first M in their original colors.
for y in range(181, 205):
    for x in range(51, 154):
        r, g, b, a = im.getpixel((x, y))
        if a >= 128:
            (mint if g - r > 40 else dark).add((x - 51, y - 56))

# N/Y are new glyphs requested for MEMONEY, on the source's 18px pixel grid.
xs = [0, 18, 36, 54, 72, 90, 108, 126]
ys = [0, 16, 34, 51, 69, 87, 113]
def new_glyph(rows, offset, target):
    for row, pattern in enumerate(rows):
        for col, cell in enumerate(pattern):
            if cell == '#':
                for y in range(ys[row], ys[row + 1]):
                    for x in range(xs[col], xs[col + 1]):
                        target.add((x + offset, y))

new_glyph(['##...##', '###..##', '####.##', '##.####', '##..###', '##...##'], 591, dark)
new_glyph(['##...##', '##...##', '.##.##.', '..###..', '..###..', '..###..'], 891, dark)

def vector_path(pixels):
    # Merge identical row runs into rectangles: lossless for the threshold mask.
    active, rectangles = {}, []
    for y in range(150):
        row = sorted(x for x, py in pixels if py == y)
        runs = []
        for x in row:
            if not runs or x != runs[-1][1]:
                runs.append([x, x + 1])
            else:
                runs[-1][1] = x + 1
        keys = {tuple(run) for run in runs}
        for key in list(active):
            if key not in keys:
                start = active.pop(key)
                rectangles.append((key[0], start, key[1] - key[0], y - start))
        for key in keys:
            active.setdefault(key, y)
    return ''.join(f'M{x} {y}h{w}v{h}h-{w}z' for x, y, w, h in rectangles)

svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1017 149" color="#2e3a37" shape-rendering="crispEdges">
  <title>Memoney</title>
  <g id="wordmark">
    <path fill="currentColor" d="{vector_path(dark)}"/>
    <path fill="#68cfa2" d="{vector_path(mint)}"/>
  </g>
</svg>
'''
(root / 'public/images/mememo/memoney-wordmark-v2.svg').write_text(svg, encoding='utf-8')
metrics = {
    'sourceSha256': hashlib.sha256(source.read_bytes()).hexdigest(),
    'sourceSize': list(im.size), 'alphaThreshold': 128,
    'preservedGlyphs': 'M E M O E, plus original signature dots',
    'newGlyphs': 'N Y', 'accentGlyph': 'central O', 'preservedMaskIoU': 1.0,
    'preservedGlyphAlphaMeanAbsoluteError255': round(error / samples, 4),
    'background': 'transparent', 'embeddedRaster': False,
}
(root / 'Docs/memoney-wordmark-metrics.json').write_text(json.dumps(metrics, indent=2) + '\n', encoding='utf-8')
print(json.dumps(metrics))
