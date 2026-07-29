// The ThemeMode teamTheme() expects, from the OS colour scheme.

import { useColorScheme } from 'react-native';
import { ThemeMode } from './teamTheme';

export function useColorSchemeMode(): ThemeMode {
  return useColorScheme() === 'dark' ? 'dark' : 'light';
}
