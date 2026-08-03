// teamTheme(): the one gate between brand colour (data) and UI slots.
// No raw team hex ever lands on a surface — every variant this returns
// is tone-mapped in OKLCH until it meets WCAG contrast on the surface
// it will sit on. Deterministic and side-effect-free; the contrast
// guarantees are pinned by unit tests (worst cases: pure white, yellow,
// sky blue, near-black, and no colour at all).

import { palette } from './palette';

// A generated accent hex from a bare hue (athlete accentHue, Prompt
// 9b): fixed mid saturation/lightness — teamTheme tone-maps whatever
// arrives, so the exact S/L only seeds the ramp.
export function hueToHex(hue: number): string {
  const h = ((hue % 360) + 360) % 360;
  const s = 0.6;
  const l = 0.45;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] =
    h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x]
    : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  const hex = (v: number) =>
    Math.round((v + m) * 255).toString(16).padStart(2, '0');
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}

export interface TeamTheme {
  accent: string; // ≥4.5:1 against the mode's bg — safe for text/icons
  onAccent: string; // ≥4.5:1 against accent — text on accent fills
  container: string; // low-chroma tint for card/chip backgrounds
  onContainer: string; // ≥4.5:1 against container
  gradient: [string, string]; // dark poster stops; white text ≥4.5:1 on both
  onGradient: string; // always white — stops are constrained to carry it
}

export type ThemeMode = 'light' | 'dark';

const CONTRAST_TEXT = 4.5;

// Shell backgrounds the accent must read against — imported from the
// palette itself so the CI guarantee tracks the real shell, never a
// hand-copied value that can drift.
const SURFACE: Record<ThemeMode, string> = {
  light: palette.light.bg,
  dark: palette.dark.bg,
};
const DARK_TEXT = '#06101F';
const WHITE = '#FFFFFF';

// Fallback for entities with no colour: a neutral graphite with a whisper
// of blue — the "no colour" case is a first-class design, not an error.
const FALLBACK_HUE = { h: 255, c: 0.02 };

// ---------------------------------------------------------------------------
// Colour math: sRGB ↔ OKLab/OKLCH (Björn Ottosson's matrices).

interface Lch {
  l: number; // 0..1 perceptual lightness
  c: number; // chroma, 0..~0.37
  h: number; // hue degrees
}

function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

const srgbToLinear = (c: number): number =>
  c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
const linearToSrgb = (c: number): number =>
  c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;

function rgbToLch([r8, g8, b8]: [number, number, number]): Lch {
  const r = srgbToLinear(r8 / 255);
  const g = srgbToLinear(g8 / 255);
  const b = srgbToLinear(b8 / 255);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const c = Math.sqrt(a * a + bb * bb);
  const h = ((Math.atan2(bb, a) * 180) / Math.PI + 360) % 360;
  return { l: L, c, h };
}

// OKLCH → linear sRGB triple; components may fall outside [0,1] when the
// colour is out of gamut (callers clamp chroma until it fits).
function lchToLinear({ l: L, c, h }: Lch): [number, number, number] {
  const hr = (h * Math.PI) / 180;
  const a = c * Math.cos(hr);
  const b = c * Math.sin(hr);
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

const inGamut = (lin: [number, number, number]): boolean =>
  lin.every((v) => v >= -1e-6 && v <= 1 + 1e-6);

// Render an OKLCH colour to hex, shrinking chroma (never lightness) until
// it fits sRGB — hue and tone are the identity carriers, chroma bends.
function lchToHex(lch: Lch): string {
  let lo = 0;
  let hi = lch.c;
  let fit: Lch = { ...lch, c: 0 };
  if (inGamut(lchToLinear(lch))) {
    fit = lch;
  } else {
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2;
      if (inGamut(lchToLinear({ ...lch, c: mid }))) {
        lo = mid;
        fit = { ...lch, c: mid };
      } else {
        hi = mid;
      }
    }
  }
  const [r, g, b] = lchToLinear(fit).map((v) =>
    Math.round(Math.min(1, Math.max(0, linearToSrgb(Math.min(1, Math.max(0, v))))) * 255),
  );
  const to2 = (n: number) => n.toString(16).padStart(2, '0');
  return `#${to2(r)}${to2(g)}${to2(b)}`.toUpperCase();
}

// WCAG relative luminance + contrast ratio, computed on the *rendered*
// hex (post gamut-clamp) so the guarantee holds for what actually ships.
function luminance(hex: string): number {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0;
  const [r, g, b] = rgb.map((v) => srgbToLinear(v / 255));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(hexA: string, hexB: string): number {
  const la = luminance(hexA);
  const lb = luminance(hexB);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

// ---------------------------------------------------------------------------
// Tone search: move lightness away from the surface until contrast passes,
// staying as close to the brand tone as the target allows.

function toneFor(
  base: Lch,
  against: string,
  minRatio: number,
  direction: 'darker' | 'lighter',
): Lch {
  const passes = (l: number): boolean =>
    contrastRatio(lchToHex({ ...base, l }), against) >= minRatio;
  if (passes(base.l)) return base;
  const limit = direction === 'darker' ? 0 : 1;
  if (!passes(limit)) {
    // Even the extreme fails (surface itself near-black/white and the
    // wrong direction was requested) — fall through to the extreme; the
    // caller picks directions so this is a safety net, not a path.
    return { ...base, l: limit };
  }
  // Binary search the boundary between base.l (fails) and limit (passes).
  let fail = base.l;
  let pass = limit;
  for (let i = 0; i < 24; i++) {
    const mid = (fail + pass) / 2;
    if (passes(mid)) pass = mid;
    else fail = mid;
  }
  return { ...base, l: pass };
}

// ---------------------------------------------------------------------------

export function teamTheme(
  brandColour: string | null | undefined,
  mode: ThemeMode,
): TeamTheme {
  const surface = SURFACE[mode];
  const rgb = brandColour ? hexToRgb(brandColour) : null;
  const base: Lch = rgb
    ? rgbToLch(rgb)
    : { l: 0.55, c: FALLBACK_HUE.c, h: FALLBACK_HUE.h };

  // Achromatic brands (white/black/grey kits) get the fallback hue at a
  // whisper of chroma — "Real Madrid white" must still look designed.
  const chroma = base.c < 0.02 ? FALLBACK_HUE.c : base.c;
  const hue = base.c < 0.02 ? FALLBACK_HUE.h : base.h;
  const brand: Lch = { l: base.l, c: chroma, h: hue };

  // Accent: readable on the shell background. Light shell pulls tones
  // down; dark shell lifts them.
  const accent = lchToHex(
    toneFor(
      { ...brand, c: Math.min(chroma, 0.19) },
      surface,
      CONTRAST_TEXT,
      mode === 'light' ? 'darker' : 'lighter',
    ),
  );
  const onAccent =
    contrastRatio(WHITE, accent) >= contrastRatio(DARK_TEXT, accent)
      ? WHITE
      : DARK_TEXT;

  // Container: a quiet tint of the hue for card/chip fills.
  const container = lchToHex({
    l: mode === 'light' ? 0.93 : 0.27,
    c: Math.min(chroma, 0.04),
    h: hue,
  });
  const onContainer = lchToHex(
    toneFor(
      { ...brand, c: Math.min(chroma, 0.12) },
      container,
      CONTRAST_TEXT,
      mode === 'light' ? 'darker' : 'lighter',
    ),
  );

  // Gradient: the dark poster surface heroes sit on — dark is a content
  // surface, not a theme. Both stops are darkened until white text is
  // guaranteed, whatever the brand tone.
  const gradStop = (l: number, c: number): string =>
    lchToHex(toneFor({ l, c, h: hue }, WHITE, CONTRAST_TEXT, 'darker'));
  const gradient: [string, string] = [
    gradStop(0.47, Math.min(chroma, 0.17)),
    gradStop(0.3, Math.min(chroma, 0.13)),
  ];

  return { accent, onAccent, container, onContainer, gradient, onGradient: WHITE };
}
