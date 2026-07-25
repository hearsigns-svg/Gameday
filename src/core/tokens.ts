// Semantic design tokens — mirrors docs/DESIGN_SYSTEM.md. Never use raw
// hex in components; import roles from here.

import { useColorScheme } from 'react-native';

export interface Theme {
  bg: string;
  surface: string;
  surfaceRaised: string;
  textPrimary: string;
  textSecondary: string;
  primary: string;
  onPrimary: string;
  accent: string;
  danger: string;
  border: string;
}

export const palette: { light: Theme; dark: Theme } = {
  light: {
    bg: '#FFFFFF',
    surface: '#F5F6F8',
    surfaceRaised: '#FFFFFF',
    textPrimary: '#0B0F14',
    textSecondary: '#5B6572',
    primary: '#1463F3',
    onPrimary: '#FFFFFF',
    accent: '#0FA968',
    danger: '#D83A3A',
    border: '#E3E6EA',
  },
  dark: {
    bg: '#0B0F14',
    surface: '#161B22',
    surfaceRaised: '#1D242E',
    textPrimary: '#F2F5F8',
    textSecondary: '#98A2AE',
    primary: '#4C8DFF',
    onPrimary: '#06101F',
    accent: '#2ECC8F',
    danger: '#FF6B6B',
    border: '#2A323D',
  },
};

export function useTheme(): Theme {
  return useColorScheme() === 'dark' ? palette.dark : palette.light;
}

export const spacing = { xs: 4, s: 8, m: 12, l: 16, xl: 24, xxl: 32 } as const;
export const radius = { chip: 8, button: 10, card: 12, sheet: 16 } as const;

export const type = {
  display: { fontSize: 32, fontWeight: '700' },
  title: { fontSize: 24, fontWeight: '600' },
  heading: { fontSize: 18, fontWeight: '600' },
  body: { fontSize: 16, fontWeight: '400' },
  secondary: { fontSize: 14, fontWeight: '400' },
  caption: { fontSize: 12, fontWeight: '400' },
} as const;
