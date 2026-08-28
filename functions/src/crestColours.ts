// Dominant crest colours (Round 3 burst ruling) — PURE.
//
// A burst wants AT MOST TWO flat, full-saturation team colours; tonal
// ramps read as one colour smeared. So: filter out the pixels that are
// outline and background (transparent, near-white, near-black, gray),
// bucket what survives by hue, and take the two biggest buckets that
// are perceptually apart — pushed to full saturation at mid lightness
// so every extracted pair sits in one flat vocabulary. Too close a
// pair drops to one colour; nothing chromatic at all is null, and the
// client falls back to the entity's treatment hue.

export interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

// Minimum share of the chromatic pixels a hue bucket needs before it
// can claim to be a team colour — under this it is trim, not identity.
const MIN_BUCKET_SHARE = 0.08;
// Hue distance (degrees) under which two "colours" are one colour.
const MIN_HUE_APART = 40;
const BUCKETS = 24; // 15° each

function hueDistance(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) * 60;
  else if (max === gn) h = ((bn - rn) / d + 2) * 60;
  else h = ((rn - gn) / d + 4) * 60;
  return [h, s, l];
}

export function hslToHex(h: number, s: number, l: number): string {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] =
    h < 60 ? [c, x, 0]
    : h < 120 ? [x, c, 0]
    : h < 180 ? [0, c, x]
    : h < 240 ? [0, x, c]
    : h < 300 ? [x, 0, c]
    : [c, 0, x];
  const to = (v: number) =>
    Math.round((v + m) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`.toUpperCase();
}

// The flat vocabulary every extracted colour lands in.
const FLAT_S = 0.9;
const FLAT_L = 0.5;

export function dominantPair(
  pixels: readonly Rgba[],
): [string] | [string, string] | null {
  const counts = new Array<number>(BUCKETS).fill(0);
  const hueSums = new Array<number>(BUCKETS).fill(0);
  let chromatic = 0;
  for (const p of pixels) {
    if (p.a < 200) continue; // transparent: background
    const max = Math.max(p.r, p.g, p.b);
    const min = Math.min(p.r, p.g, p.b);
    if (max > 235 && min > 200) continue; // near-white
    if (max < 50) continue; // near-black outline
    if (max - min < 30) continue; // gray: not a colour claim
    const [h, s] = rgbToHsl(p.r, p.g, p.b);
    if (s < 0.25) continue;
    const bucket = Math.floor(h / (360 / BUCKETS)) % BUCKETS;
    counts[bucket]++;
    hueSums[bucket] += h;
    chromatic++;
  }
  if (chromatic === 0) return null;
  const ranked = counts
    .map((count, i) => ({ count, hue: count > 0 ? hueSums[i] / count : 0 }))
    .filter((b) => b.count / chromatic >= MIN_BUCKET_SHARE)
    .sort((a, b) => b.count - a.count);
  if (ranked.length === 0) return null;
  const first = hslToHex(ranked[0].hue, FLAT_S, FLAT_L);
  const second = ranked
    .slice(1)
    .find((b) => hueDistance(b.hue, ranked[0].hue) >= MIN_HUE_APART);
  return second ? [first, hslToHex(second.hue, FLAT_S, FLAT_L)] : [first];
}

// ─── Impure edge: fetch + decode (node-only) ──────────────────────────

// PNG magic bytes — the only format we decode. SVG and anything else
// returns null and the entity keeps its treatment-hue fallback.
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47];

const MAX_SAMPLES = 4096;

export async function extractCrestColours(
  url: string,
  fetchImpl: typeof fetch = fetch,
): Promise<[string] | [string, string] | null> {
  try {
    const res = await fetchImpl(url);
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 8 || PNG_MAGIC.some((b, i) => buf[i] !== b)) return null;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { PNG } = require('pngjs') as typeof import('pngjs');
    const png = PNG.sync.read(buf);
    const total = png.width * png.height;
    const stride = Math.max(1, Math.floor(total / MAX_SAMPLES));
    const pixels: Rgba[] = [];
    for (let i = 0; i < total; i += stride) {
      const o = i * 4;
      pixels.push({
        r: png.data[o],
        g: png.data[o + 1],
        b: png.data[o + 2],
        a: png.data[o + 3],
      });
    }
    return dominantPair(pixels);
  } catch {
    return null; // a bad badge costs its colours, never the directory
  }
}

// Enrich a directory's rows with their crest colours, boundedly — runs
// inside the 24h directory refresh, so the fetches are per-league,
// per-day, not per-request.
export async function enrichBurstColours<
  T extends { crestUrl?: string; burstColours?: string[] },
>(rows: T[], concurrency = 4): Promise<T[]> {
  const out = [...rows];
  let next = 0;
  const worker = async () => {
    for (;;) {
      const i = next++;
      if (i >= out.length) return;
      const url = out[i].crestUrl;
      if (!url) continue;
      const pair = await extractCrestColours(url);
      if (pair) out[i] = { ...out[i], burstColours: pair };
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(concurrency, out.length) }, worker),
  );
  return out;
}
