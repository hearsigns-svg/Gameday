// The palette as pure data — importable from pure modules (teamTheme,
// tests) without dragging in react-native. tokens.ts re-exports this;
// teamTheme derives its contrast surfaces from it, so the CI contrast
// guarantees track the real shell automatically.

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

// Neutral shell, expressive content: the shell is a warm-white gallery
// (light) / warm graphite (dark); identity comes from followed content.
// accent/danger are tuned to ≥4.5:1 on bg, surface AND surfaceRaised.
export const palette: { light: Theme; dark: Theme } = {
  light: {
    bg: '#FBFAF8',
    surface: '#F3F2EF',
    surfaceRaised: '#FFFFFF',
    textPrimary: '#171512',
    textSecondary: '#5F5B54',
    primary: '#1463F3',
    onPrimary: '#FFFFFF',
    accent: '#0B7A4B',
    danger: '#C22A2A',
    border: '#E7E5E0',
  },
  dark: {
    bg: '#121110',
    surface: '#1C1B19',
    surfaceRaised: '#242220',
    textPrimary: '#F5F3F0',
    textSecondary: '#A5A099',
    primary: '#4C8DFF',
    onPrimary: '#06101F',
    accent: '#2ECC8F',
    danger: '#FF6B6B',
    border: '#32302C',
  },
};
