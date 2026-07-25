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
