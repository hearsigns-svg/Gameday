// The ThemeMode teamTheme() expects — the OS colour scheme, unless the
// user pinned one (Prompt 24 B3). Every themed surface already reaches
// its palette through this hook, which is what makes the appearance
// setting a one-file change instead of a sweep.

import { useEffect, useState } from 'react';
import { useColorScheme } from 'react-native';
import { appearanceChoice, subscribeAppearance } from './appearanceStore';
import { ThemeMode } from './teamTheme';

export function useColorSchemeMode(): ThemeMode {
  const system = useColorScheme() === 'dark' ? 'dark' : 'light';
  const [choice, setChoice] = useState(appearanceChoice);
  useEffect(
    () => subscribeAppearance(() => setChoice(appearanceChoice())),
    [],
  );
  return choice === 'system' ? system : choice;
}
