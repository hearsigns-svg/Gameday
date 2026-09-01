// Mark-tile prep (Round 6): the three rules and their order, on
// synthetic grids — including the pass-through case, because "unflagged
// marks are untouched" is the contract the byte-diff later proves.

import {
  assessMark,
  composeTrimmed,
  contentBounds,
  CONTRAST_OK_SHARE_MIN,
  dominantColours,
  edgeBackground,
  FILL_RATIO_MIN,
  fillRatio,
  Grid,
  hexOf,
  markTilePlan,
  pickNeutralFill,
  trimBox,
  worstModeOkShare,
} from '../markTiles';

const NAVY = { r: 20, g: 41, b: 91 };
const WHITE = { r: 255, g: 255, b: 255 };
const BLUE = { r: 28, g: 145, b: 208 }; // the Australian Open case

function grid(
  w: number,
  h: number,
  paint: (x: number, y: number) => { r: number; g: number; b: number; a: number },
): Grid {
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = paint(x, y);
      const o = (y * w + x) * 4;
      data[o] = p.r;
      data[o + 1] = p.g;
      data[o + 2] = p.b;
      data[o + 3] = p.a;
    }
  }
  return { width: w, height: h, data };
}

const CLEAR = { r: 0, g: 0, b: 0, a: 0 };
const opaque = (c: { r: number; g: number; b: number }) => ({ ...c, a: 255 });

// A transparent-padded mark: content square from 20..79 on a 100 canvas.
const paddedMark = (c = NAVY) =>
  grid(100, 100, (x, y) =>
    x >= 20 && x < 80 && y >= 20 && y < 80 ? opaque(c) : CLEAR,
  );

describe('edge background detection', () => {
  it('finds a baked solid background and ignores transparency', () => {
    const baked = grid(64, 64, (x, y) =>
      x > 20 && x < 44 && y > 20 && y < 44 ? opaque(WHITE) : opaque(BLUE),
    );
    expect(edgeBackground(baked)).toEqual(BLUE);
    expect(edgeBackground(paddedMark())).toBeNull();
  });
});

describe('content bounds and fill ratio', () => {
  it('measures alpha bounds for transparent marks', () => {
    const b = contentBounds(paddedMark(), null)!;
    expect(b).toEqual({ x0: 20, y0: 20, x1: 79, y1: 79 });
    expect(fillRatio(b, 100, 100)).toBeCloseTo(0.6);
  });
  it('measures colour bounds against a baked background', () => {
    const baked = grid(100, 100, (x, y) =>
      x >= 30 && x < 70 && y >= 30 && y < 70 ? opaque(WHITE) : opaque(BLUE),
    );
    const b = contentBounds(baked, BLUE)!;
    expect(fillRatio(b, 100, 100)).toBeCloseTo(0.4);
  });
});

describe('the coverage contrast verdict', () => {
  it('passes a mixed mark whose halves cover both modes (the MLB shape)', () => {
    const half = grid(80, 80, (x) => opaque(x < 40 ? NAVY : WHITE));
    const d = dominantColours(half, null);
    expect(worstModeOkShare(d)).toBeGreaterThanOrEqual(CONTRAST_OK_SHARE_MIN);
    expect(markTilePlan(assessMark(half)).flags).toEqual([]);
  });
  it('flags a mark whose majority melts in one mode (the US Open shape)', () => {
    const mostlyNavy = grid(90, 90, (x) => opaque(x < 60 ? NAVY : WHITE));
    const a = assessMark(mostlyNavy);
    expect(a.worstModeOkShare).toBeLessThan(CONTRAST_OK_SHARE_MIN);
    const plan = markTilePlan(a);
    expect(plan.flags).toContain('contrast');
    // Majority-navy: the near-white plate makes the majority legible.
    expect(plan.tileFill).toBe('#F4F2ED');
    expect(pickNeutralFill(a.dominants)).toBe('#F4F2ED');
  });
  it('flags an all-white silhouette (invisible in light mode) onto the dark plate', () => {
    // Transparent-edged and well-filled, so ONLY contrast can flag —
    // a borderless opaque white square would honestly read as a baked
    // background instead.
    const silhouette = grid(80, 80, (x, y) =>
      x >= 2 && x < 78 && y >= 2 && y < 78 ? opaque(WHITE) : CLEAR,
    );
    const plan = markTilePlan(assessMark(silhouette));
    expect(plan.flags).toEqual(['contrast']);
    expect(plan.tileFill).toBe('#22252A');
  });
});

describe('rule order', () => {
  it('background adoption settles the fill — no contrast pick after it', () => {
    // Blue baked background, small white glyph: low fill ratio AND a
    // dominant (white) that would fail light mode — but adoption wins.
    const ao = grid(100, 100, (x, y) =>
      x >= 40 && x < 60 && y >= 40 && y < 60 ? opaque(WHITE) : opaque(BLUE),
    );
    const plan = markTilePlan(assessMark(ao));
    expect(plan.flags).toEqual(['fill-ratio', 'baked-background']);
    expect(plan.trim).toBe(true);
    expect(plan.tileFill).toBe(hexOf(BLUE));
  });
  it('an unflagged mark gets a strictly empty plan — the byte-identical contract', () => {
    // Well-filled, transparent-edged, mixed colours: nothing to do.
    const clean = grid(100, 100, (x, y) =>
      x >= 2 && x < 98 && y >= 2 && y < 98
        ? opaque(x < 50 ? NAVY : WHITE)
        : CLEAR,
    );
    const a = assessMark(clean);
    expect(a.fillRatio).toBeGreaterThanOrEqual(FILL_RATIO_MIN);
    expect(markTilePlan(a)).toEqual({ trim: false, flags: [] });
  });
});

describe('trim composition', () => {
  it('crops to a centred square with the margin, transparent off-canvas', () => {
    const g = paddedMark();
    const b = contentBounds(g, null)!;
    const box = trimBox(b);
    // 60px content × (1 + 2×0.08) = 69.6 → 70, centred on 49.5.
    expect(box.size).toBe(70);
    const out = composeTrimmed(g, box, null);
    expect(out.width).toBe(70);
    // Centre pixel is content; the corner is inside the margin: clear.
    const at = (x: number, y: number) => out.data[(y * 70 + x) * 4 + 3];
    expect(at(35, 35)).toBe(255);
    expect(at(0, 0)).toBe(0);
  });
  it('fills off-content margin with the baked background when adopting', () => {
    const ao = grid(100, 100, (x, y) =>
      x >= 40 && x < 60 && y >= 40 && y < 60 ? opaque(WHITE) : opaque(BLUE),
    );
    const a = assessMark(ao);
    const out = composeTrimmed(ao, trimBox(a.bounds!), a.bakedBg);
    const o = 0; // corner: margin territory, must be the background
    expect([out.data[o], out.data[o + 1], out.data[o + 2], out.data[o + 3]]).toEqual([
      BLUE.r,
      BLUE.g,
      BLUE.b,
      255,
    ]);
  });
});
