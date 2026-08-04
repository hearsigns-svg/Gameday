// The region this device orders by: detected from the OS, overridable
// by the user.
//
// THE OVERRIDE EXISTS because detection answers the wrong question for
// a real and unremarkable case — a Brit in New York has a US phone and
// still wants football first. Detection is a good default, not a claim
// about identity, so the app states what it detected and lets the
// person disagree in one tap. It lives in Preferences beside the other
// display choices: it changes what you see, not what the app fetches.

import { readJson, writeJson } from './storage';
import { NativeModules, Platform } from 'react-native';
import { detectRegionFrom, RegionKey } from './region';

const KEY = 'region.v1';

// `null` = follow the OS. Storing the CHOICE rather than the resolved
// value means a user who moves, or changes their phone's region, keeps
// following the OS unless they explicitly pinned something.
type Stored = { override: RegionKey | null };

function platformLocale(): string | undefined {
  try {
    if (Platform.OS === 'ios') {
      const s = NativeModules.SettingsManager?.settings;
      return s?.AppleLocale ?? s?.AppleLanguages?.[0];
    }
    return NativeModules.I18nManager?.localeIdentifier;
  } catch {
    return undefined;
  }
}

function intlLocale(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().locale;
  } catch {
    return undefined;
  }
}

export function detectedRegion(): RegionKey {
  return detectRegionFrom({
    intlLocale: intlLocale(),
    platformLocale: platformLocale(),
  });
}

export function regionOverride(): RegionKey | null {
  return readJson<Stored | null>(KEY, null)?.override ?? null;
}

export function activeRegion(): RegionKey {
  return regionOverride() ?? detectedRegion();
}

export function setRegionOverride(region: RegionKey | null): void {
  writeJson(KEY, { override: region } satisfies Stored);
}
