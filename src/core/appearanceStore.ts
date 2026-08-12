// The appearance choice: follow the system, or pin light/dark. PURE-ish
// core store, same shape as regionStore — readJson/writeJson persistence
// plus a subscription so every mounted screen repaints the moment the
// setting changes, not on its next visit.
//
// 'system' is the default and the absence: a fresh install follows the
// OS, which is what an unconfigured phone user expects, and the setting
// exists for the two real minorities — OLED-dark-always people and
// bright-sun-light-always people (Prompt 24 B3).

// LAZY, GUARDED storage — deliberately not a top-level import. This
// store is reached from `tokens.ts`, which every pure domain test
// imports transitively, and `storage.ts` instantiates MMKV (a native
// Nitro module) at module scope: a static import here made merely
// LOADING the design tokens require a native runtime and killed pure
// suites. Same pattern deviceRegistry uses for RNFB — the require
// happens at first use, and an environment without the native module
// (jest) just gets the in-memory default.
type Storage = {
  readJson<T>(key: string, fallback: T): T;
  writeJson(key: string, value: unknown): void;
};
function storage(): Storage | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('./storage') as Storage;
  } catch {
    return null;
  }
}

export type AppearanceChoice = 'system' | 'light' | 'dark';

const KEY = 'appearance.v1';

let cached: AppearanceChoice | null = null;
const listeners = new Set<() => void>();

export function appearanceChoice(): AppearanceChoice {
  if (cached !== null) return cached;
  const stored = storage()?.readJson<string | null>(KEY, null) ?? null;
  cached =
    stored === 'light' || stored === 'dark' || stored === 'system'
      ? stored
      : 'system';
  return cached;
}

export function setAppearanceChoice(choice: AppearanceChoice): void {
  cached = choice;
  storage()?.writeJson(KEY, choice);
  for (const l of listeners) l();
}

export function subscribeAppearance(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
