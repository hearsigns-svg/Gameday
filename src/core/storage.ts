// Single MMKV instance behind typed JSON helpers. All persistent client
// state (ledger, follows, prefs) lives here.

import { createMMKV } from 'react-native-mmkv';

const mmkv = createMMKV({ id: 'gameday' });

export function readJson<T>(key: string, fallback: T): T {
  const raw = mmkv.getString(key);
  if (raw === undefined) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function writeJson(key: string, value: unknown): void {
  mmkv.set(key, JSON.stringify(value));
}

export function removeKey(key: string): void {
  mmkv.remove(key);
}

// The full local wipe (Stage 7B "Delete my data & reset"): every
// persisted key at once — follows, prefs, exclusions, pins, ledger,
// photo cache, calendar choice, welcome flag, all of it. Enumerated
// nowhere on purpose: a hand-kept key list is exactly the thing that
// silently misses the next store someone adds.
export function wipeAllLocalData(): void {
  mmkv.clearAll();
}
