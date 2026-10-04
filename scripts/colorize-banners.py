#!/usr/bin/env python3
"""
Colorize banner shapes and generate letter/number symbols (del order 2026-10-04).
- Tints 6 grayscale shapes with 8 palette primary colors -> 48 colored banners
- Generates 36 heraldic letter/number symbols (A-Z, 0-9) via PIL
"""

from PIL import Image, ImageDraw, ImageFont
from pathlib import Path

REPO = Path("/home/hatch/workspace/bannerlord-clone")
SHAPES = REPO / "clients/campaign/public/banners/shapes"
COLORED = REPO / "clients/campaign/public/banners/colored"
SYMBOLS = REPO / "clients/campaign/public/banners/symbols"

PALETTES = {
    "crimson": "#8B0000",
    "midnight": "#191970",
    "forest": "#228B22",
    "purple": "#4B0082",
    "ocean": "#006994",
    "charcoal": "#36454F",
    "desert": "#C2B280",
    "blood": "#660000",
}

SHAPE_NAMES = ["rectangle", "swallowtail", "pennant", "heater", "triple-point", "war-flag"]

def hex_to_rgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i+2], 16) for i in (0, 2, 4))

def tint_shape(shape_path: Path, color_hex: str, out_path: Path):
    """Tint a grayscale shape with a color, preserving luminance."""
    img = Image.open(shape_path).convert("RGBA")
    r, g, b = hex_to_rgb(color_hex)

    # Get luminance and alpha
    data = img.getdata()
    new_data = []
    for pixel in data:
        pr, pg, pb, pa = pixel
        # Luminance (0-1)
        lum = (0.299 * pr + 0.587 * pg + 0.114 * pb) / 255.0
        # Tint: multiply color by luminance (darker where shape is darker)
        # Boost to keep it vivid
        nr = int(r * (0.3 + 0.7 * lum))
        ng = int(g * (0.3 + 0.7 * lum))
        nb = int(b * (0.3 + 0.7 * lum))
        new_data.append((nr, ng, nb, pa))

    img.putdata(new_data)
    img.save(out_path, "WEBP", quality=90)

def make_letter_symbol(char: str, out_path: Path, size: int = 512):
    """Generate a heraldic letter/number symbol."""
    img = Image.new("RGBA", (size, size), (255, 255, 255, 255))
    draw = ImageDraw.Draw(img)

    # Try to find a bold serif font
    font = None
    for font_path in [
        "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSerif-Bold.ttf",
        "/usr/share/fonts/TTF/DejaVuSerif-Bold.ttf",
    ]:
        try:
            font = ImageFont.truetype(font_path, size=int(size * 0.6))
            break
        except:
            continue
    if not font:
        font = ImageFont.load_default()

    # Center the character
    bbox = draw.textbbox((0, 0), char, font=font)
    w = bbox[2] - bbox[0]
    h = bbox[3] - bbox[1]
    x = (size - w) / 2 - bbox[0]
    y = (size - h) / 2 - bbox[1]

    # Draw with a slight outline for heraldic feel
    outline = int(size * 0.02)
    for dx in range(-outline, outline + 1, 2):
        for dy in range(-outline, outline + 1, 2):
            draw.text((x + dx, y + dy), char, font=font, fill=(0, 0, 0, 255))
    draw.text((x, y), char, font=font, fill=(0, 0, 0, 255))

    img.save(out_path, "WEBP", quality=90)

def main():
    COLORED.mkdir(parents=True, exist_ok=True)

    print("Tinting shapes...")
    count = 0
    for shape in SHAPE_NAMES:
        shape_path = SHAPES / f"shape-{shape}.webp"
        if not shape_path.exists():
            print(f"  MISSING: {shape}")
            continue
        for color_name, color_hex in PALETTES.items():
            out = COLORED / f"banner-{shape}-{color_name}.webp"
            tint_shape(shape_path, color_hex, out)
            count += 1
    print(f"  {count} colored banners")

    print("Generating letters/numbers...")
    count = 0
    for char in "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789":
        out = SYMBOLS / f"symbol-letter-{char.lower()}.webp"
        make_letter_symbol(char, out)
        count += 1
    print(f"  {count} letter/number symbols")
    print("DONE")

if __name__ == "__main__":
    main()
