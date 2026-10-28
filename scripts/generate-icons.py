"""Regenerate the simple geometric extension mark (requires Pillow)."""
from pathlib import Path
from PIL import Image, ImageDraw

target = Path(__file__).resolve().parent.parent / 'extension' / 'icons'
target.mkdir(exist_ok=True)
canvas = Image.new('RGBA', (512, 512), (0, 0, 0, 0))
draw = ImageDraw.Draw(canvas)
draw.rounded_rectangle((0, 0, 511, 511), radius=126, fill='#3d63e9')
for x in (113, 279):
    for y in (113, 279):
        draw.rounded_rectangle((x, y, x + 120, y + 120), radius=20, outline='white', width=17)
for size in (16, 32, 48, 128):
    if size == 128:
        icon = Image.new('RGBA', (128, 128), (0, 0, 0, 0))
        icon.alpha_composite(canvas.resize((96, 96), Image.Resampling.LANCZOS), (16, 16))
    else:
        icon = canvas.resize((size, size), Image.Resampling.LANCZOS)
    icon.save(target / f'{size}.png')
