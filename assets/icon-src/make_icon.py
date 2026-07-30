#!/usr/bin/env python3
"""KickOffCal app icon generator — owner-approved composition.

A football breaking out of a calendar: white-framed calendar with a
day grid and a green-check match day, classic panelled football
overlapping from the left with green motion lines, on a deep-blue
field. No wordmark — the springboard prints the name, and in-icon text
is illegible at grid size. Regenerate with:

    python3 assets/icon-src/make_icon.py

Outputs (over the Expo template placeholders):
  assets/icon.png                    1024x1024, opaque (iOS)
  assets/android-icon-background.png 512x512 field
  assets/android-icon-foreground.png 512x512 composition, transparent,
                                     sized for the adaptive safe zone
  assets/android-icon-monochrome.png 512x512 white silhouette
  assets/splash-icon.png             1024x1024 composition on transparent
  assets/favicon.png                 48x48
"""

import math
from pathlib import Path

from PIL import Image, ImageDraw

ASSETS = Path(__file__).resolve().parent.parent

# Palette — brand blues plus the design-system accent green.
FIELD_TOP = (32, 64, 190)
FIELD_BOTTOM = (9, 23, 98)
WHITE = (255, 255, 255)
INK = (13, 34, 110)  # ball panels / inner calendar
GREEN = (74, 222, 128)  # accent: check + motion lines

SS = 4  # supersample factor


def field(size, top=FIELD_TOP, bottom=FIELD_BOTTOM):
    img = Image.new("RGB", (size, size), top)
    px = img.load()
    for y in range(size):
        t = y / size
        c = tuple(int(top[i] + (bottom[i] - top[i]) * t) for i in range(3))
        for x in range(size):
            px[x, y] = c
    return img


def pentagon(cx, cy, r, rot=-90):
    return [
        (cx + r * math.cos(math.radians(rot + i * 72)),
         cy + r * math.sin(math.radians(rot + i * 72)))
        for i in range(5)
    ]


def draw_ball(draw, cx, cy, r):
    """Classic panelled football: white disc, filled navy centre
    pentagon, five rim patches, thin outline."""
    draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=WHITE, outline=INK,
                 width=max(int(r * 0.045), 3))
    centre = pentagon(cx, cy, r * 0.40)
    draw.polygon(centre, fill=INK)
    for i, (px, py) in enumerate(centre):
        ang = math.atan2(py - cy, px - cx)
        # rim patch: quadrilateral straddling the spoke direction
        p1 = (cx + math.cos(ang - 0.30) * r * 0.98,
              cy + math.sin(ang - 0.30) * r * 0.98)
        p2 = (cx + math.cos(ang + 0.30) * r * 0.98,
              cy + math.sin(ang + 0.30) * r * 0.98)
        p3 = (cx + math.cos(ang + 0.16) * r * 0.66,
              cy + math.sin(ang + 0.16) * r * 0.66)
        p4 = (cx + math.cos(ang - 0.16) * r * 0.66,
              cy + math.sin(ang - 0.16) * r * 0.66)
        draw.polygon([p1, p2, p3, p4], fill=INK)
        # seam from pentagon vertex to patch
        draw.line([px, py, (p3[0] + p4[0]) / 2, (p3[1] + p4[1]) / 2],
                  fill=INK, width=max(int(r * 0.045), 3))


def draw_check(draw, cx, cy, s, width):
    """White check mark centred in a box of side s."""
    pts = [
        (cx - s * 0.28, cy + s * 0.02),
        (cx - s * 0.06, cy + s * 0.24),
        (cx + s * 0.30, cy - 0.22 * s),
    ]
    draw.line(pts, fill=WHITE, width=width, joint="curve")


def draw_composition(img, cx_scale=1.0):
    """Calendar + ball + motion lines, sized for a square canvas."""
    size = img.size[0]
    draw = ImageDraw.Draw(img)
    u = size / 1024  # design units

    # --- calendar card (right of centre) ---
    cx0, cy0 = 380 * u, 300 * u
    cx1, cy1 = 890 * u, 810 * u
    frame = 46 * u
    radius = 78 * u
    # binder rings above the card
    ring_w, ring_h = 56 * u, 150 * u
    for fx in (0.30, 0.70):
        rx = cx0 + (cx1 - cx0) * fx
        draw.rounded_rectangle(
            [rx - ring_w / 2, cy0 - 90 * u, rx + ring_w / 2, cy0 + 60 * u],
            radius=ring_w / 2, fill=WHITE)
    # white frame + navy interior
    draw.rounded_rectangle([cx0, cy0, cx1, cy1], radius=radius, fill=WHITE)
    draw.rounded_rectangle(
        [cx0 + frame, cy0 + frame, cx1 - frame, cy1 - frame],
        radius=radius - frame * 0.7, fill=INK)

    # --- day grid: 3x3 white squares, one green with a check ---
    gx0, gy0 = cx0 + frame + 34 * u, cy0 + frame + 34 * u
    gx1, gy1 = cx1 - frame - 34 * u, cy1 - frame - 34 * u
    cols = rows = 3
    gap = 26 * u
    cell_w = (gx1 - gx0 - gap * (cols - 1)) / cols
    cell_h = (gy1 - gy0 - gap * (rows - 1)) / rows
    check_cell = (1, 1)  # centre day is match day
    for r_ in range(rows):
        for c_ in range(cols):
            x = gx0 + c_ * (cell_w + gap)
            y = gy0 + r_ * (cell_h + gap)
            fill = GREEN if (r_, c_) == check_cell else WHITE
            draw.rounded_rectangle([x, y, x + cell_w, y + cell_h],
                                   radius=18 * u, fill=fill)
            if (r_, c_) == check_cell:
                draw_check(draw, x + cell_w / 2, y + cell_h / 2,
                           cell_w, max(int(16 * u), 3))

    # --- football overlapping the card's lower-left ---
    bcx, bcy, br = 360 * u, 640 * u, 205 * u
    draw_ball(draw, bcx, bcy, br)

    # --- green motion lines, staggered, left of the ball ---
    lw = int(34 * u)
    for i, (y_, x0_, x1_) in enumerate(
        [(560, 150, 285), (640, 105, 250), (720, 150, 285)]
    ):
        draw.rounded_rectangle(
            [x0_ * u, (y_ - 17) * u, x1_ * u, (y_ + 17) * u],
            radius=lw / 2, fill=GREEN)


def silhouette(size):
    """White silhouette (card + rings + ball + lines) for monochrome."""
    img = Image.new("L", (size, size), 0)
    draw = ImageDraw.Draw(img)
    u = size / 1024
    cx0, cy0, cx1, cy1 = 380 * u, 300 * u, 890 * u, 810 * u
    for fx in (0.30, 0.70):
        rx = cx0 + (cx1 - cx0) * fx
        draw.rounded_rectangle(
            [rx - 28 * u, cy0 - 90 * u, rx + 28 * u, cy0 + 60 * u],
            radius=28 * u, fill=255)
    draw.rounded_rectangle([cx0, cy0, cx1, cy1], radius=78 * u, fill=255)
    draw.ellipse([155 * u, 435 * u, 565 * u, 845 * u], fill=255)
    for y_, x0_, x1_ in [(560, 150, 285), (640, 105, 250), (720, 150, 285)]:
        draw.rounded_rectangle(
            [x0_ * u, (y_ - 17) * u, x1_ * u, (y_ + 17) * u],
            radius=17 * u, fill=255)
    return img


def make_ios_icon():
    size = 1024 * SS
    img = field(size).convert("RGBA")
    draw_composition(img)
    img.convert("RGB").resize((1024, 1024), Image.LANCZOS).save(ASSETS / "icon.png")


def make_android():
    field(512).save(ASSETS / "android-icon-background.png")
    size = 512 * SS
    fg = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    # scale composition into the ~66% safe zone
    inner = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw_composition(inner)
    scaled = inner.resize((int(size * 0.62), int(size * 0.62)), Image.LANCZOS)
    off = (size - scaled.size[0]) // 2
    fg.paste(scaled, (off, off), scaled)
    fg.resize((512, 512), Image.LANCZOS).save(ASSETS / "android-icon-foreground.png")
    # monochrome silhouette in the same safe zone
    sil = silhouette(size).resize((int(size * 0.62), int(size * 0.62)), Image.LANCZOS)
    alpha = Image.new("L", (size, size), 0)
    alpha.paste(sil, (off, off))
    mono = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    mono.paste(Image.new("RGBA", (size, size), (255, 255, 255, 255)), (0, 0), alpha)
    mono.resize((512, 512), Image.LANCZOS).save(ASSETS / "android-icon-monochrome.png")


def make_splash_and_favicon():
    size = 1024 * SS
    sp = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    inner = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw_composition(inner)
    scaled = inner.resize((int(size * 0.80), int(size * 0.80)), Image.LANCZOS)
    off = (size - scaled.size[0]) // 2
    sp.paste(scaled, (off, off), scaled)
    sp.resize((1024, 1024), Image.LANCZOS).save(ASSETS / "splash-icon.png")
    Image.open(ASSETS / "icon.png").resize((48, 48), Image.LANCZOS).save(ASSETS / "favicon.png")


if __name__ == "__main__":
    make_ios_icon()
    make_android()
    make_splash_and_favicon()
    print("icons written to", ASSETS)
