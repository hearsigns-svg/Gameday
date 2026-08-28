import { dominantPair, hslToHex, Rgba } from '../crestColours';

const px = (r: number, g: number, b: number, a = 255): Rgba => ({ r, g, b, a });
const many = (n: number, p: Rgba): Rgba[] => Array.from({ length: n }, () => p);

describe('dominantPair', () => {
  it('one dominant colour → one flat full-saturation hex', () => {
    const pair = dominantPair(many(100, px(200, 20, 30)));
    expect(pair).toHaveLength(1);
    expect(pair![0]).toMatch(/^#[0-9A-F]{6}$/);
  });

  it('two apart colours → the pair, biggest first', () => {
    const pair = dominantPair([
      ...many(120, px(200, 20, 30)), // red
      ...many(80, px(20, 60, 220)), // blue
    ]);
    expect(pair).toHaveLength(2);
    expect(pair![0]).not.toBe(pair![1]);
  });

  it('a perceptually-close pair drops to ONE colour', () => {
    const pair = dominantPair([
      ...many(120, px(200, 20, 30)), // red
      ...many(80, px(210, 60, 20)), // red-orange, under 40° away
    ]);
    expect(pair).toHaveLength(1);
  });

  it('outline and background never count: white, black, transparent, gray', () => {
    expect(
      dominantPair([
        ...many(500, px(255, 255, 255)), // white field
        ...many(300, px(10, 10, 10)), // black outline
        ...many(200, px(128, 128, 128)), // gray
        ...many(100, px(200, 20, 30, 10)), // transparent red
        ...many(50, px(20, 160, 60)), // the ONLY real colour
      ]),
    ).toHaveLength(1);
  });

  it('a badge with nothing chromatic is null — the client falls back', () => {
    expect(dominantPair(many(400, px(240, 240, 240)))).toBeNull();
    expect(dominantPair(many(400, px(30, 30, 30)))).toBeNull();
  });

  it('trim under the share threshold cannot claim a slot', () => {
    const pair = dominantPair([
      ...many(300, px(200, 20, 30)), // the kit
      ...many(10, px(20, 60, 220)), // a fleck of blue trim (~3%)
    ]);
    expect(pair).toHaveLength(1);
  });
});

it('hslToHex lands in the flat vocabulary', () => {
  expect(hslToHex(0, 0.9, 0.5)).toBe('#F20D0D');
  expect(hslToHex(120, 0.9, 0.5)).toMatch(/^#0[0-9A-F]F20[0-9A-F]$/i);
});
