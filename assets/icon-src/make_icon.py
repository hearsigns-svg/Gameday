#!/usr/bin/env python3
"""KickOffCal app icon generator.

One glyph, one story: match day in your calendar — a calendar card with
a football as the date. Brand-blue field, warm-white card (the shell
palette), deep-navy header band and ball detail. Regenerate with:

    python3 assets/icon-src/make_icon.py

Outputs (over the Expo template placeholders):
  assets/icon.png                    1024x1024, opaque (iOS)
  assets/android-icon-background.png 512x512 flat brand field
  assets/android-icon-foreground.png 512x512 card+ball, transparent,
                                     sized for the adaptive safe zone
  assets/android-icon-monochrome.png 512x512 white silhouette
  assets/splash-icon.png             1024x1024 card+ball on transparent
  assets/favicon.png                 48x48
"""

import math
from pathlib import Path

from PIL import Image, ImageDraw

ASSETS = Path(__file__).resolve().parent.parent

# Brand family (docs/DESIGN_SYSTEM.md primary + derived tones).
FIELD_TOP = (26, 107, 250)  # lifted brand blue
FIELD_BOTTOM = (10, 74, 209)  # deeper brand blue
CARD = (251, 250, 248)  # warm white shell
BAND = (9, 42, 128)  # deep navy header
INK = (9, 42, 128)  # ball line work
MUTED = (199, 207, 221)  # quiet grid dots

SS = 4  # supersample factor for crisp edges


def rounded(draw, box, radius, fill):
    draw.rounded_rectangle(box, radius=radius, fill=fill)


def pentagon(cx, cy, r, rot=-90):
    return [
        (cx + r * math.cos(math.radians(rot + i * 72)),
         cy + r * math.sin(math.radians(rot + i * 72)))
        for i in range(5)
    ]


def draw_ball(draw, cx, cy, r):
    """Iconic football: white disc, navy outline, centre pentagon with
    spokes and edge wedges — legible at 60 px, no gradients."""
    lw = max(int(r * 0.10), 4)
    draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(255, 255, 255), outline=INK, width=lw)
    pr = r * 0.42
    centre = pentagon(cx, cy, pr)
    draw.polygon(centre, fill=INK)
    for (px, py) in centre:
        # spoke from pentagon vertex towards the rim
        dx, dy = px - cx, py - cy
        d = math.hypot(dx, dy)
        ex, ey = cx + dx / d * (r * 0.94), cy + dy / d * (r * 0.94)
        draw.line([px, py, ex, ey], fill=INK, width=lw)
        # tangent cap at the rim — hints the neighbouring panels
        ang = math.atan2(dy, dx)
        ax = cx + math.cos(ang - 0.38) * r * 0.93
        ay = cy + math.sin(ang - 0.38) * r * 0.93
        bx = cx + math.cos(ang + 0.38) * r * 0.93
        by = cy + math.sin(ang + 0.38) * r * 0.93
        draw.line([ax, ay, bx, by], fill=INK, width=lw)


def draw_card(img, x0, y0, x1, y1):
    """Calendar card with header band, weekday dots and the ball.
    Composited through ONE rounded-rect mask so band/body meet with no
    paint seams."""
    x0, y0, x1, y1 = int(x0), int(y0), int(x1), int(y1)
    w = x1 - x0
    h = y1 - y0
    radius = int(w * 0.155)
    band_h = int(h * 0.235)
    # colour layer: band on top, body below — hard edge, no overpaint
    layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    ldraw = ImageDraw.Draw(layer)
    ldraw.rectangle([x0, y0, x1, y0 + band_h], fill=BAND + (255,))
    ldraw.rectangle([x0, y0 + band_h, x1, y1], fill=CARD + (255,))
    # binder notches in the band
    notch_r = int(w * 0.036)
    for fx in (0.30, 0.70):
        nx = x0 + w * fx
        ny = y0 + band_h * 0.5
        ldraw.ellipse(
            [nx - notch_r, ny - notch_r, nx + notch_r, ny + notch_r],
            fill=CARD + (255,),
        )
    # quiet grid dots — other, lesser days
    dot_r = int(w * 0.030)
    dy = y0 + band_h + h * 0.135
    for fx in (0.22, 0.415, 0.61, 0.80):
        dx_ = x0 + w * fx
        ldraw.ellipse([dx_ - dot_r, dy - dot_r, dx_ + dot_r, dy + dot_r], fill=MUTED + (255,))
    # the ball: THE day
    bcx = x0 + w * 0.5
    bcy = y0 + band_h + h * 0.475
    draw_ball(ldraw, bcx, bcy, w * 0.255)
    # one mask for the whole card
    mask = Image.new("L", img.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle([x0, y0, x1, y1], radius=radius, fill=255)
    img.paste(layer, (0, 0), Image.composite(mask, Image.new("L", img.size, 0), mask))


def field(size, top, bottom):
    img = Image.new("RGB", (size, size), top)
    px = img.load()
    for y in range(size):
        t = y / size
        c = tuple(int(top[i] + (bottom[i] - top[i]) * t) for i in range(3))
        for x in range(size):
            px[x, y] = c
    return img


def make_ios_icon():
    size = 1024 * SS
    img = field(size, FIELD_TOP, FIELD_BOTTOM).convert("RGBA")
    m = int(size * 0.185)  # card margin
    draw_card(img, m, m * 0.96, size - m, size - m * 0.96)
    img = img.convert("RGB")
    img = img.resize((1024, 1024), Image.LANCZOS)
    img.save(ASSETS / "icon.png")


def make_android():
    # background: flat field
    bg = field(512, FIELD_TOP, FIELD_BOTTOM)
    bg.save(ASSETS / "android-icon-background.png")
    # foreground: card+ball on transparency, inside the ~66% safe zone
    size = 512 * SS
    fg = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    m = int(size * 0.30)
    draw_card(fg, m, m * 0.98, size - m, size - m * 0.98)
    fg = fg.resize((512, 512), Image.LANCZOS)
    fg.save(ASSETS / "android-icon-foreground.png")
    # monochrome: white silhouette of the same shapes
    mono_big = Image.new("L", (size, size), 0)
    draw = ImageDraw.Draw(mono_big)
    w0, w1 = m, size - m
    rounded(draw, [w0, int(m * 0.98), w1, size - int(m * 0.98)], int((w1 - w0) * 0.155), 255)
    mono = Image.new("RGBA", (512, 512), (0, 0, 0, 0))
    alpha = mono_big.resize((512, 512), Image.LANCZOS)
    white = Image.new("RGBA", (512, 512), (255, 255, 255, 255))
    mono.paste(white, (0, 0), alpha)
    mono.save(ASSETS / "android-icon-monochrome.png")


def make_splash_and_favicon():
    size = 1024 * SS
    sp = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    m = int(size * 0.28)
    draw_card(sp, m, m * 0.98, size - m, size - m * 0.98)
    sp = sp.resize((1024, 1024), Image.LANCZOS)
    sp.save(ASSETS / "splash-icon.png")
    fav = Image.open(ASSETS / "icon.png").resize((48, 48), Image.LANCZOS)
    fav.save(ASSETS / "favicon.png")


if __name__ == "__main__":
    make_ios_icon()
    make_android()
    make_splash_and_favicon()
    print("icons written to", ASSETS)
