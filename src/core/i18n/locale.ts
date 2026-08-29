// Device-language detection (Round 3 Phase C) — the ONE place the app
// asks what language the phone speaks.
//
// PHONE LANGUAGE PRIMARY, store region fallback (owner ruling): the
// language tag comes from expo-localization; the REGION axis stays
// core/regionStore (sport terminology — Football vs Soccer — remains a
// region fact inside whichever language is active, not a language
// fact).
//
// expo-localization is a NATIVE module: required lazily inside a
// try/catch (the MMKV/Nitro lesson — a module-scope import kills every
// jest suite that transitively touches this file), with Hermes's own
// Intl locale as the fallback and 'en' as the floor. Resolved ONCE per
// process: a language change is an OS-level act that restarts the app
// on Android and re-launches cleanly on iOS, so nothing needs to be
// reactive.

export const SUPPORTED_LANGUAGES = ['en', 'es', 'de', 'fr', 'it', 'pt'] as const;
export type Language = (typeof SUPPORTED_LANGUAGES)[number];

// pt-BR is the working-set target; plain pt falls into the same
// catalog. zh-CN and hi are QUEUED named additions (owner ruling) —
// they land here as two lines when their catalogs exist.
export function languageFromTag(tag: string | undefined): Language {
  const primary = (tag ?? '').toLowerCase().split(/[-_]/)[0];
  return (SUPPORTED_LANGUAGES as readonly string[]).includes(primary)
    ? (primary as Language)
    : 'en';
}

function detectTag(): string | undefined {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const lz = require('expo-localization') as {
      getLocales?: () => Array<{ languageTag?: string }>;
    };
    const tag = lz.getLocales?.()[0]?.languageTag;
    if (tag) return tag;
  } catch {
    // Native module absent (jest, a bare env) — fall through.
  }
  try {
    return Intl.DateTimeFormat().resolvedOptions().locale;
  } catch {
    return undefined;
  }
}

let resolved: Language | null = null;

export function deviceLanguage(): Language {
  if (resolved === null) resolved = languageFromTag(detectTag());
  return resolved;
}

// Tests only — never product code. A language is a device fact.
export function __setLanguageForTests(lang: Language | null): void {
  resolved = lang;
}
