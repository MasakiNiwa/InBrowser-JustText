#!/usr/bin/env python3
"""Draws the app icons. No libraries needed.

    python3 scripts/make-icons.py

The artwork is nothing but rounded rectangles, rendered with 4x4
supersampling and written out as PNG. It matches assets/icon.svg.
"""
import struct
import zlib
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "assets"

BG = (0x14, 0x59, 0xB8)       # the blue behind everything
CARD = (0xFF, 0xFF, 0xFF)     # the sheet of paper
LINE = (0x8A, 0xB4, 0xE8)     # lines of text
LINE_STRONG = (0x27, 0x6A, 0xC4)
CARET = (0xFF, 0xC1, 0x3B)    # the caret

# (x0, y0, x1, y1, radius, color) — coordinates run 0..1
SHAPES = [
    (0.180, 0.150, 0.700, 0.850, 0.060, CARD),
    (0.250, 0.265, 0.620, 0.320, 0.028, LINE_STRONG),
    (0.250, 0.400, 0.620, 0.455, 0.028, LINE),
    (0.250, 0.535, 0.620, 0.590, 0.028, LINE),
    (0.250, 0.670, 0.480, 0.725, 0.028, LINE),
    (0.660, 0.330, 0.740, 0.760, 0.040, CARET),
]


def rounded_rect_hit(x, y, x0, y0, x1, y1, r):
    """Whether the point (x, y) falls inside the rounded rectangle."""
    if x < x0 or x > x1 or y < y0 or y > y1:
        return False
    r = min(r, (x1 - x0) / 2, (y1 - y0) / 2)
    cx = min(max(x, x0 + r), x1 - r)
    cy = min(max(y, y0 + r), y1 - r)
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r


def blend(dst, src, alpha):
    return tuple(round(d + (s - d) * alpha) for d, s in zip(dst, src))


def render(size, maskable=False):
    samples = 4
    scale = 1.0 / (samples * samples)
    inset = 0.14 if maskable else 0.0  # a maskable icon stays inside the safe area
    bg_radius = 0.0 if maskable else 0.22

    pixels = bytearray()
    for py in range(size):
        row = bytearray()
        for px in range(size):
            color = (0, 0, 0)
            alpha = 0.0
            # background
            cover = 0
            for sy in range(samples):
                for sx in range(samples):
                    x = (px + (sx + 0.5) / samples) / size
                    y = (py + (sy + 0.5) / samples) / size
                    if rounded_rect_hit(x, y, 0, 0, 1, 1, bg_radius):
                        cover += 1
            if cover:
                color = BG
                alpha = cover * scale
            # foreground, shrunk to fit inside
            for x0, y0, x1, y1, r, shape_color in SHAPES:
                if inset:
                    span = 1 - 2 * inset
                    x0, y0, x1, y1 = (inset + v * span for v in (x0, y0, x1, y1))
                    r *= span
                cover = 0
                for sy in range(samples):
                    for sx in range(samples):
                        x = (px + (sx + 0.5) / samples) / size
                        y = (py + (sy + 0.5) / samples) / size
                        if rounded_rect_hit(x, y, x0, y0, x1, y1, r):
                            cover += 1
                if cover:
                    a = cover * scale
                    color = blend(color, shape_color, a if alpha else 1.0)
                    alpha = max(alpha, a)
            row += bytes((*color, round(alpha * 255)))
        pixels += row
    return bytes(pixels)


def write_png(path, size, rgba):
    raw = b"".join(b"\x00" + rgba[y * size * 4:(y + 1) * size * 4] for y in range(size))

    def chunk(tag, data):
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(raw, 9))
    png += chunk(b"IEND", b"")
    path.write_bytes(png)
    print(f"{path.name}: {len(png):,} bytes")


def write_svg(path):
    parts = [
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">',
        f'<rect width="100" height="100" rx="22" fill="rgb{BG}"/>',
    ]
    for x0, y0, x1, y1, r, color in SHAPES:
        parts.append(
            f'<rect x="{x0 * 100:.1f}" y="{y0 * 100:.1f}" width="{(x1 - x0) * 100:.1f}" '
            f'height="{(y1 - y0) * 100:.1f}" rx="{r * 100:.1f}" fill="rgb{color}"/>'
        )
    parts.append("</svg>")
    path.write_text("\n".join(parts), encoding="utf-8")
    print(f"{path.name}: written")


if __name__ == "__main__":
    OUT.mkdir(exist_ok=True)
    write_svg(OUT / "icon.svg")
    for size in (192, 512):
        write_png(OUT / f"icon-{size}.png", size, render(size))
    write_png(OUT / "icon-maskable-512.png", 512, render(512, maskable=True))
