// Semantic design tokens — mirrors docs/DESIGN_SYSTEM.md. Never use raw
// hex in components; import roles from here. Team/sport colour never
// lands in a UI slot directly — it passes through teamTheme() first.
// Colour values live in palette.ts (pure data) so teamTheme and tests
// can import them without react-native.

import { useColorScheme } from 'react-native';
import { palette, Theme } from './palette';

export { palette };
export type { Theme };

export function useTheme(): Theme {
  return useColorScheme() === 'dark' ? palette.dark : palette.light;
}

export const spacing = { xs: 4, s: 8, m: 12, l: 16, xl: 24, xxl: 32 } as const;

// One geometry: a single radius scale plus the pill.
export const radius = {
  chip: 8,
  button: 10,
  card: 12,
  hero: 20,
  sheet: 16,
  pill: 999,
} as const;

export const type = {
  display: { fontSize: 32, fontWeight: '700' },
  hero: { fontSize: 28, fontWeight: '800', letterSpacing: -0.5 },
  title: { fontSize: 24, fontWeight: '600' },
  heading: { fontSize: 18, fontWeight: '600' },
  body: { fontSize: 16, fontWeight: '400' },
  secondary: { fontSize: 14, fontWeight: '400' },
  caption: { fontSize: 12, fontWeight: '400' },
  // Section labels: small caps carry hierarchy without extra weight.
  label: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
} as const;

// Motion only where it means something: three durations, no bespoke
// values scattered through components. Reduced-motion disables the lot
// at the usage site.
export const motion = { fast: 120, standard: 200, slow: 300 } as const;
