"""Outline Fredoka for the Basic wordmark; does not alter the pixel original.

Requires fonttools. Font source and OFL are pinned to a Google Fonts commit.
"""
from pathlib import Path
from io import BytesIO
from urllib.request import urlopen
import hashlib
import json
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.boundsPen import BoundsPen

ROOT = Path(__file__).resolve().parents[1]
SOURCE = 'https://raw.githubusercontent.com/google/fonts/a60a77e14f28abd4ef243a1b5dfc48df0cec5205/ofl/fredoka/'
font_bytes = urlopen(SOURCE + 'Fredoka%5Bwdth%2Cwght%5D.ttf').read()
font = instantiateVariableFont(TTFont(BytesIO(font_bytes)), {'wght': 700, 'wdth': 108}, inplace=True)
glyphs = font.getGlyphSet()
cmap = font.getBestCmap()
paths = []
x = 0
bounds = []
for letter in 'MEMONEY':
    glyph = glyphs[cmap[ord(letter)]]
    pen = SVGPathPen(glyphs)
    glyph.draw(pen)
    box = BoundsPen(glyphs)
    glyph.draw(box)
    left, bottom, right, top = box.bounds
    bounds.append((left + x, bottom, right + x, top))
    paths.append((letter, x, pen.getCommands()))
    x += glyph.width + 60
left = min(b[0] for b in bounds)
right = max(b[2] for b in bounds)
bottom = min(b[1] for b in bounds)
top = max(b[3] for b in bounds)
width = right - left + 140
height = top - bottom + 210
lines = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width:g} {height:g}" color="#2e3a37">',
         '<title>Memoney jelly wordmark</title>', '<g id="wordmark">',
         '<defs>',
         '<radialGradient id="jelly-sage" cx=".38" cy=".7" r=".75">',
         '<stop offset="0" stop-color="#a6bfb1" stop-opacity=".55"/>',
         '<stop offset=".55" stop-color="#6f8e7d" stop-opacity=".78"/>',
         '<stop offset="1" stop-color="#647f70" stop-opacity=".78"/>',
         '</radialGradient>',
         '<radialGradient id="jelly-mint" cx=".35" cy=".75" r=".75">',
         '<stop offset="0" stop-color="#b4e7ce" stop-opacity=".45"/>',
         '<stop offset=".55" stop-color="#55c590" stop-opacity=".72"/>',
         '<stop offset="1" stop-color="#419e77" stop-opacity=".78"/>',
         '</radialGradient>',
         '<radialGradient id="jelly-droplet">',
         '<stop offset="0" stop-color="white" stop-opacity="0"/>',
         '<stop offset=".7" stop-color="white" stop-opacity=".08"/>',
         '<stop offset="1" stop-color="white" stop-opacity=".55"/>',
         '</radialGradient>',
         '<filter id="jelly-depth" x="-15%" y="-20%" width="130%" height="140%" color-interpolation-filters="sRGB">',
         '<feMorphology in="SourceAlpha" operator="erode" radius="1.5" result="ao-core"/>',
         '<feGaussianBlur in="ao-core" stdDeviation="1" result="ao-soft"/>',
         '<feComposite in="SourceAlpha" in2="ao-soft" operator="out" result="ao-rim"/>',
         '<feFlood flood-color="#164c34" flood-opacity=".12" result="ao-tint"/>',
         '<feComposite in="ao-tint" in2="ao-rim" operator="in" result="ao-color"/>',
         '<feComposite in="ao-color" in2="SourceAlpha" operator="in" result="ao-inner"/>',
         '<feMerge><feMergeNode in="SourceGraphic"/><feMergeNode in="ao-inner"/></feMerge>',
         '</filter>', '</defs>']
for index, (letter, offset, path) in enumerate(paths):
    fill = '#68cfa2' if letter == 'O' else 'currentColor'
    # Small, static differences in tilt and height make the letters feel soft.
    tilt = [-1.2, 1, -0.8, 0, 1.1, -1, 1.2][index]
    stretch = [.97, 1, .98, 1.02, .97, 1, .98][index]
    lift = [10, 0, 8, -8, 10, 0, 8][index]
    center = (bounds[index][2] - bounds[index][0]) / 2
    lines.append(f'<g transform="translate({offset-left+70:g} {60+lift:g}) rotate({tilt:g} {center:g} 360)">')
    body = 'url(#jelly-mint)' if letter == 'O' else 'url(#jelly-sage)'
    lines.append(f'<g transform="translate(0 {top:g}) scale(1 {-stretch:g})">')
    lines.append(f'<path fill="{body}" filter="url(#jelly-depth)" d="{path}"/>')
    lines.append(f'<clipPath id="jelly-letter-{index}"><path d="{path}"/></clipPath>')
    lines.append(f'<g clip-path="url(#jelly-letter-{index})">')
    glyph_left, glyph_bottom, glyph_right, glyph_top = bounds[index]
    glyph_left -= offset
    glyph_right -= offset
    gw = glyph_right - glyph_left
    gh = glyph_top - glyph_bottom
    # Local curved reflections, rather than a metallic full-width band.
    lines.append(f'<ellipse cx="{glyph_left+gw*.3:g}" cy="{glyph_top-gh*.12:g}" rx="{gw*.22:g}" ry="{gh*.045:g}" fill="white" opacity=".65" transform="rotate(9 {glyph_left+gw*.3:g} {glyph_top-gh*.12:g})"/>')
    lines.append(f'<ellipse cx="{glyph_left+gw*.16:g}" cy="{glyph_top-gh*.3:g}" rx="{gw*.035:g}" ry="{gh*.07:g}" fill="white" opacity=".34"/>')
    for bubble in range(2):
        bx = glyph_left + gw * (.1 + ((bubble*37+index*19) % 79)/100)
        by = glyph_bottom + gh * (.1 + ((bubble*29+index*11) % 77)/100)
        radius = [9, 6, 13, 7, 5][bubble % 5]
        lines.append(f'<circle cx="{bx:g}" cy="{by:g}" r="{radius}" fill="url(#jelly-droplet)"/>')
        lines.append(f'<circle cx="{bx-radius*.3:g}" cy="{by+radius*.35:g}" r="{radius*.22:g}" fill="white" opacity=".65"/>')
    lines.append('</g>')
    lines += ['</g>', '</g>']
for index in range(3):
    fill = '#68cfa2' if index == 2 else 'currentColor'
    lines.append(f'<circle cx="{98+index*92}" cy="{top-bottom+160:g}" r="31" fill="{fill}" fill-opacity=".72"/>')
lines += ['</g>', '</svg>']
target = ROOT / 'public/images/mememo/memoney-wordmark-rounded-v9.svg'
target.write_text('\n'.join(lines) + '\n', encoding='utf-8', newline='\n')
license_dir = ROOT / 'public/licenses'
license_dir.mkdir(exist_ok=True)
(license_dir / 'Fredoka-OFL.txt').write_bytes(urlopen(SOURCE + 'OFL.txt').read())
print(json.dumps({'viewBox': f'0 0 {width:g} {height:g}', 'fontSha256': hashlib.sha256(font_bytes).hexdigest(), 'asset': str(target)}))
