// Mark→tile prep (Round 6 brief) — PURE measurement and trim planning.
//
// Three rules, applied at art-cache build to marks the MEASUREMENTS
// flag — unflagged marks are untouched, byte-identical:
//
//   trim     — a mark whose content occupies too little of its canvas
//              is cropped to content bounds plus a small margin, on a
//              square canvas, so every mark fills the tile at one
//              consistent proportion.
//   adopt    — a mark with a baked-in solid background hands that
//              exact colour to the tile as `tileFill`, so
//              square-in-circle merges into one shape (the Australian
//              Open case). Adoption settles the fill: no contrast pick.
//   contrast — a transparent mark whose dominant colours sit too close
//              to the tile fill it renders on picks a fill from a
//              two-neutral set by maximum contrast (the US Open case).
//              The mark itself is never recoloured.
//
// CONTRAST BASELINE. The client tile fill is theme.container — an
// OKLCH tint whose LIGHTNESS is fixed per mode while only the hue
// varies, so WCAG contrast (luminance-only) against any container is
// two constants, one per mode. The values below were MEASURED from the
// client theme (scripts/audit-mark-tiles.mjs dumps every sport accent's
// container and asserts the cluster) — not assumed.

export interface Grid {
  width: number;
  height: number;
  data: Uint8Array | Buffer; // RGBA, row-major
}

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

// ─── Measurement ──────────────────────────────────────────────────────

const ALPHA_CONTENT = 16; // above this, a pixel claims content
const ALPHA_OPAQUE = 200;
const EDGE_OPAQUE_SHARE = 0.98; // ring share that must be opaque…
const EDGE_TOLERANCE = 12; // …within this per-channel distance of mean

// The border ring, one pixel deep. A baked background shows up as a
// ring that is (a) almost entirely opaque and (b) one colour.
export function edgeBackground(g: Grid): Rgb | null {
  const { width: w, height: h, data } = g;
  if (w < 4 || h < 4) return null;
  const idx: number[] = [];
  for (let x = 0; x < w; x++) idx.push(x, (h - 1) * w + x);
  for (let y = 1; y < h - 1; y++) idx.push(y * w, y * w + w - 1);
  let opaque = 0;
  let r = 0;
  let gg = 0;
  let b = 0;
  for (const i of idx) {
    const o = i * 4;
    if (data[o + 3] >= ALPHA_OPAQUE) {
      opaque++;
      r += data[o];
      gg += data[o + 1];
      b += data[o + 2];
    }
  }
  if (opaque / idx.length < EDGE_OPAQUE_SHARE) return null;
  const mean = { r: r / opaque, g: gg / opaque, b: b / opaque };
  for (const i of idx) {
    const o = i * 4;
    if (data[o + 3] < ALPHA_OPAQUE) continue;
    if (
      Math.abs(data[o] - mean.r) > EDGE_TOLERANCE ||
      Math.abs(data[o + 1] - mean.g) > EDGE_TOLERANCE ||
      Math.abs(data[o + 2] - mean.b) > EDGE_TOLERANCE
    ) {
      return null;
    }
  }
  return { r: Math.round(mean.r), g: Math.round(mean.g), b: Math.round(mean.b) };
}

export interface Bounds {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

// Content = what would survive on the tile: opaque-enough pixels, and —
// when the mark has a baked background — pixels that differ from it.
const BG_TOLERANCE = 24;

function isContent(data: Grid['data'], o: number, bg: Rgb | null): boolean {
  if (data[o + 3] < ALPHA_CONTENT) return false;
  if (!bg) return true;
  return (
    Math.abs(data[o] - bg.r) > BG_TOLERANCE ||
    Math.abs(data[o + 1] - bg.g) > BG_TOLERANCE ||
    Math.abs(data[o + 2] - bg.b) > BG_TOLERANCE
  );
}

export function contentBounds(g: Grid, bg: Rgb | null): Bounds | null {
  const { width: w, height: h, data } = g;
  let x0 = w;
  let y0 = h;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!isContent(data, (y * w + x) * 4, bg)) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  return x1 < 0 ? null : { x0, y0, x1, y1 };
}

// Contain-fit is linear in the LARGER dimension: this is the fraction
// of the tile the mark's content actually spans once rendered.
export function fillRatio(b: Bounds, w: number, h: number): number {
  return Math.max((b.x1 - b.x0 + 1) / w, (b.y1 - b.y0 + 1) / h);
}

// Dominant REAL colours for contrast — unlike the burst extractor this
// must keep blacks, whites and grays (a navy-and-white mark on a dark
// tile fails exactly there). Coarse RGB histogram, true cell means.
const HIST_LEVELS = 8; // per channel → 512 cells
const DOMINANT_MIN_SHARE = 0.12;

export interface DominantColour {
  rgb: Rgb;
  share: number;
}

export function dominantColours(g: Grid, bg: Rgb | null): DominantColour[] {
  const { width: w, height: h, data } = g;
  const cells = new Map<number, { n: number; r: number; g: number; b: number }>();
  let counted = 0;
  const total = w * h;
  const stride = Math.max(1, Math.floor(total / 8192));
  for (let i = 0; i < total; i += stride) {
    const o = i * 4;
    if (data[o + 3] < ALPHA_OPAQUE) continue;
    if (bg && !isContent(data, o, bg)) continue; // baked bg is not the mark
    const key =
      (data[o] >> 5) * HIST_LEVELS * HIST_LEVELS +
      (data[o + 1] >> 5) * HIST_LEVELS +
      (data[o + 2] >> 5);
    const c = cells.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
    c.n++;
    c.r += data[o];
    c.g += data[o + 1];
    c.b += data[o + 2];
    cells.set(key, c);
    counted++;
  }
  if (counted === 0) return [];
  return [...cells.values()]
    .map((c) => ({
      rgb: {
        r: Math.round(c.r / c.n),
        g: Math.round(c.g / c.n),
        b: Math.round(c.b / c.n),
      },
      share: c.n / counted,
    }))
    .filter((c) => c.share >= DOMINANT_MIN_SHARE)
    .sort((a, b) => b.share - a.share)
    .slice(0, 3);
}

// ─── Contrast (WCAG relative luminance) ───────────────────────────────

function channel(v: number): number {
  const s = v / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

export function relLuminance(c: Rgb): number {
  return 0.2126 * channel(c.r) + 0.7152 * channel(c.g) + 0.0722 * channel(c.b);
}

export function contrastRatio(a: number, b: number): number {
  const [hi, lo] = a >= b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}

export const hexOf = (c: Rgb): string =>
  `#${[c.r, c.g, c.b].map((v) => v.toString(16).padStart(2, '0')).join('')}`.toUpperCase();

export function rgbOfHex(hex: string): Rgb {
  const h = hex.replace('#', '');
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

// The container luminances the marks actually sit on (see header) —
// MEASURED 2026-09-01 across every sport accent via the client
// teamTheme: dark containers span 0.0187–0.0211, light 0.794–0.818.
// Midpoints; the ±2% hue spread moves no verdict at these thresholds.
export const CONTAINER_LUMINANCE = { light: 0.806, dark: 0.02 };

// Coverage, not worst-pixel: almost every real mark contains a white
// or a near-black somewhere, and any-dominant-fails flagged 74 of 85
// (measured 2026-09-01). A mark is illegible in a mode when the
// MAJORITY of its visible mass melts there — so the verdict is the
// share of dominants that still contrast, per mode, worst mode ruling.
export function modeOkShare(
  dominants: readonly DominantColour[],
  containerLum: number,
): number {
  let total = 0;
  let ok = 0;
  for (const d of dominants) {
    total += d.share;
    if (contrastRatio(relLuminance(d.rgb), containerLum) >= CONTRAST_MIN) {
      ok += d.share;
    }
  }
  return total === 0 ? 1 : ok / total;
}

export function worstModeOkShare(dominants: readonly DominantColour[]): number {
  return Math.min(
    modeOkShare(dominants, CONTAINER_LUMINANCE.light),
    modeOkShare(dominants, CONTAINER_LUMINANCE.dark),
  );
}

// ─── Rules and thresholds ─────────────────────────────────────────────

// Content spanning under this fraction of the canvas renders visibly
// smaller than its neighbours — the padded-badge look.
export const FILL_RATIO_MIN = 0.78;
// A dominant colour "holds" against a container at this ratio or
// better. (WCAG's non-text floor is 3:1; tiles are decorative
// identity, so the bar is legibility, not AA.)
export const CONTRAST_MIN = 1.9;
// …and a mark fails a mode when less than this share of its visible
// mass holds there — the majority-melts rule.
export const CONTRAST_OK_SHARE_MIN = 0.5;
// Trim margin: content max-dimension × this on every side.
export const TRIM_MARGIN = 0.08;

const NEUTRAL_FILLS = ['#F4F2ED', '#22252A'] as const;

// A bicolour mark (navy + white) has no fill that rescues both — so
// the pick maximises the SHARE that holds (make the majority legible),
// share-weighted mean contrast breaking ties.
export function pickNeutralFill(dominants: readonly DominantColour[]): string {
  let best: string = NEUTRAL_FILLS[0];
  let bestOk = -1;
  let bestMean = -1;
  for (const fill of NEUTRAL_FILLS) {
    const l = relLuminance(rgbOfHex(fill));
    const ok = modeOkShare(dominants, l);
    let mean = 0;
    let total = 0;
    for (const d of dominants) {
      mean += d.share * contrastRatio(relLuminance(d.rgb), l);
      total += d.share;
    }
    mean = total > 0 ? mean / total : 0;
    if (ok > bestOk || (ok === bestOk && mean > bestMean)) {
      bestOk = ok;
      bestMean = mean;
      best = fill;
    }
  }
  return best;
}

export interface MarkAssessment {
  width: number;
  height: number;
  bakedBg: Rgb | null;
  bounds: Bounds | null;
  fillRatio: number; // 0 when no content found
  dominants: DominantColour[];
  worstModeOkShare: number; // 1 when nothing measurable
}

export function assessMark(g: Grid): MarkAssessment {
  const bakedBg = edgeBackground(g);
  const bounds = contentBounds(g, bakedBg);
  const dominants = dominantColours(g, bakedBg);
  return {
    width: g.width,
    height: g.height,
    bakedBg,
    bounds,
    fillRatio: bounds ? fillRatio(bounds, g.width, g.height) : 0,
    dominants,
    worstModeOkShare: worstModeOkShare(dominants),
  };
}

export interface MarkTilePlan {
  trim: boolean;
  tileFill?: string;
  flags: Array<'fill-ratio' | 'baked-background' | 'contrast'>;
}

// Rule order: trim → background adoption → contrast pick; adoption
// settles the fill. An empty plan (no flags) means BYTE-IDENTICAL
// pass-through — the mark is never touched.
export function markTilePlan(a: MarkAssessment): MarkTilePlan {
  const flags: MarkTilePlan['flags'] = [];
  const trim = a.bounds !== null && a.fillRatio > 0 && a.fillRatio < FILL_RATIO_MIN;
  if (trim) flags.push('fill-ratio');
  let tileFill: string | undefined;
  if (a.bakedBg) {
    flags.push('baked-background');
    tileFill = hexOf(a.bakedBg);
  } else if (
    a.dominants.length > 0 &&
    a.worstModeOkShare < CONTRAST_OK_SHARE_MIN
  ) {
    flags.push('contrast');
    tileFill = pickNeutralFill(a.dominants);
  }
  return { trim, ...(tileFill ? { tileFill } : {}), flags };
}

// ─── Trim composition ─────────────────────────────────────────────────

export interface TrimBox {
  x: number; // source-space top-left of the square canvas
  y: number;
  size: number; // square canvas edge
}

export function trimBox(b: Bounds, margin = TRIM_MARGIN): TrimBox {
  const cw = b.x1 - b.x0 + 1;
  const ch = b.y1 - b.y0 + 1;
  const content = Math.max(cw, ch);
  const size = Math.round(content * (1 + 2 * margin));
  return {
    x: Math.round(b.x0 + cw / 2 - size / 2),
    y: Math.round(b.y0 + ch / 2 - size / 2),
    size,
  };
}

// ─── Decode edge (node-only, pure on the buffer) ──────────────────────

// PNG or JPEG by magic bytes — three curated marks are JPEGs wearing
// .png names (measured 2026-09-01), and a JPEG has no alpha, so its
// baked background is exactly what the adoption rule exists for.
export function gridFromImageBuffer(buf: Buffer): Grid | null {
  try {
    if (buf.length > 8 && buf[0] === 0x89 && buf[1] === 0x50) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { PNG } = require('pngjs') as typeof import('pngjs');
      const png = PNG.sync.read(buf);
      return { width: png.width, height: png.height, data: png.data };
    }
    if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const jpeg = require('jpeg-js') as typeof import('jpeg-js');
      const img = jpeg.decode(buf, { useTArray: true, maxMemoryUsageInMB: 64 });
      return { width: img.width, height: img.height, data: img.data };
    }
    return null;
  } catch {
    return null; // an unreadable mark is left exactly as it is
  }
}

export function pngBufferOf(g: Grid): Buffer {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { PNG } = require('pngjs') as typeof import('pngjs');
  const png = new PNG({ width: g.width, height: g.height });
  Buffer.from(g.data).copy(png.data);
  return PNG.sync.write(png);
}

// A new square grid: the source region under the box, transparent (or
// the baked background colour) where the box runs off the source.
export function composeTrimmed(g: Grid, box: TrimBox, bg: Rgb | null): Grid {
  const out = new Uint8Array(box.size * box.size * 4);
  if (bg) {
    for (let i = 0; i < box.size * box.size; i++) {
      const o = i * 4;
      out[o] = bg.r;
      out[o + 1] = bg.g;
      out[o + 2] = bg.b;
      out[o + 3] = 255;
    }
  }
  for (let y = 0; y < box.size; y++) {
    const sy = box.y + y;
    if (sy < 0 || sy >= g.height) continue;
    for (let x = 0; x < box.size; x++) {
      const sx = box.x + x;
      if (sx < 0 || sx >= g.width) continue;
      const so = (sy * g.width + sx) * 4;
      const oo = (y * box.size + x) * 4;
      out[oo] = g.data[so];
      out[oo + 1] = g.data[so + 1];
      out[oo + 2] = g.data[so + 2];
      out[oo + 3] = g.data[so + 3];
    }
  }
  return { width: box.size, height: box.size, data: out };
}
