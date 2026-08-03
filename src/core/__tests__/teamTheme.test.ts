// The design system's one hard guarantee: no team colour reaches a UI
// slot below WCAG text contrast. Pinned against the identities that
// break naive theming — pure white, yellows, sky blue, near-black, and
// entities with no colour at all.

import { palette } from '../palette';
import { contrastRatio, teamTheme, ThemeMode } from '../teamTheme';

// Assert against the real shell tokens — if the palette moves, these
// guarantees must still hold against what actually ships.
const SHELL: Record<ThemeMode, string> = {
  light: palette.light.bg,
  dark: palette.dark.bg,
};

const WORST_CASES: Array<[string, string | null]> = [
  ['Real Madrid white', '#FFFFFF'],
  ['Norwich yellow', '#FFF200'],
  ['Man City sky blue', '#6CABDD'],
  ['Lakers gold', '#FDB927'],
  ['McLaren papaya', '#FF8000'],
  ['near-black kit', '#131313'],
  ['pitch green', '#16A34A'],
  ['F1 red', '#E10600'],
  ['no colour (athlete)', null],
];

describe.each(['light', 'dark'] as ThemeMode[])('teamTheme %s', (mode) => {
  it.each(WORST_CASES)('%s: every slot meets 4.5:1', (_name, hex) => {
    const t = teamTheme(hex, mode);
    expect(contrastRatio(t.accent, SHELL[mode])).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(t.onAccent, t.accent)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(t.onContainer, t.container)).toBeGreaterThanOrEqual(
      4.5,
    );
    for (const stop of t.gradient) {
      expect(contrastRatio(t.onGradient, stop)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it.each(WORST_CASES)('%s: outputs are valid hex', (_name, hex) => {
    const t = teamTheme(hex, mode);
    for (const c of [
      t.accent,
      t.onAccent,
      t.container,
      t.onContainer,
      ...t.gradient,
      t.onGradient,
    ]) {
      expect(c).toMatch(/^#[0-9A-F]{6}$/);
    }
  });

  it('is deterministic', () => {
    expect(teamTheme('#6CABDD', mode)).toEqual(teamTheme('#6CABDD', mode));
  });

  it('treats malformed input as no-colour, not a crash', () => {
    expect(teamTheme('Red / White', mode)).toEqual(teamTheme(null, mode));
    expect(teamTheme('', mode)).toEqual(teamTheme(null, mode));
  });

  it('containers stay quiet (tints, not fills)', () => {
    const t = teamTheme('#E10600', mode);
    // The container must sit near the shell, not shout at it.
    expect(contrastRatio(t.container, SHELL[mode])).toBeLessThan(2);
  });
});

it('preserves hue identity for saturated brands (light mode)', () => {
  // McLaren papaya should map to something recognisably orange: the
  // accent's red channel stays dominant over blue.
  const t = teamTheme('#FF8000', 'light');
  const r = parseInt(t.accent.slice(1, 3), 16);
  const b = parseInt(t.accent.slice(5, 7), 16);
  expect(r).toBeGreaterThan(b);
});

it('gradients are dark poster surfaces in both modes', () => {
  for (const mode of ['light', 'dark'] as ThemeMode[]) {
    const t = teamTheme('#FFF200', mode);
    for (const stop of t.gradient) {
      // Any stop light enough to carry 4.5:1 white text is "dark".
      expect(contrastRatio('#FFFFFF', stop)).toBeGreaterThanOrEqual(4.5);
    }
  }
});

describe('hueToHex (Prompt 9b athlete accents)', () => {
  const { hueToHex } = jest.requireActual<typeof import('../teamTheme')>(
    '../teamTheme',
  );
  test('deterministic, hex-shaped, distinct across hues', () => {
    expect(hueToHex(210)).toBe(hueToHex(210));
    expect(hueToHex(0)).toMatch(/^#[0-9a-f]{6}$/);
    expect(hueToHex(0)).not.toBe(hueToHex(120));
    expect(hueToHex(480)).toBe(hueToHex(120)); // wraps
  });
});
