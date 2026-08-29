// The typed string catalog (Round 3 Phase C) — in-house, deliberately.
//
// KEYS ARE A UNION TYPE derived from the English catalog, so a missing
// key is a compile error and a translation file that drops one fails
// `tsc`, not a user. Values interpolate `{name}` params; plural forms
// are explicit `_one`/`_other` keys resolved through Intl.PluralRules
// (every working-set language — en es de fr it pt — is a one/other
// language, so two forms are the honest complete set; a queued
// language with more forms adds its forms when its catalog lands).
//
// ENGLISH VALUES ARE THE PREVIOUS LITERALS, byte-for-byte: every test
// that asserts copy keeps passing, and the en experience is provably
// unchanged. Fixture titles are PROVIDER TRUTH and never pass through
// here (owner ruling).

import { deviceLanguage, Language } from './locale';
import { en } from './catalog/en';
import { es } from './catalog/es';
import { de } from './catalog/de';
import { fr } from './catalog/fr';
import { it } from './catalog/it';
import { pt } from './catalog/pt';

export type CatalogKey = keyof typeof en;
export type Catalog = Record<CatalogKey, string>;

const CATALOGS: Record<Language, Catalog> = { en, es, de, fr, it, pt };

export function currentLanguage(): Language {
  return deviceLanguage();
}

// Human name of a language, in that language — the calendar-rewrite
// notice says which language the calendar is becoming.
export const LANGUAGE_NAMES: Record<Language, string> = {
  en: 'English',
  es: 'Español',
  de: 'Deutsch',
  fr: 'Français',
  it: 'Italiano',
  pt: 'Português',
};

function interpolate(
  template: string,
  params?: Record<string, string | number>,
): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in params ? String(params[name]) : whole,
  );
}

export function t(
  key: CatalogKey,
  params?: Record<string, string | number>,
): string {
  const catalog = CATALOGS[currentLanguage()] ?? en;
  return interpolate(catalog[key] ?? en[key], params);
}

// Plural pairs: `key_one` / `key_other`, chosen by the language's own
// plural rules, with {n} available to the template. The base key names
// the pair; the suffixed keys are ordinary catalog entries so the
// completeness guarantees cover them.
export function tn(
  base: string & { [K in CatalogKey]: K extends `${infer B}_one` ? B : never }[CatalogKey],
  n: number,
  params?: Record<string, string | number>,
): string {
  const lang = currentLanguage();
  let form: string;
  try {
    form = new Intl.PluralRules(lang).select(n);
  } catch {
    form = n === 1 ? 'one' : 'other';
  }
  const key = (
    form === 'one' ? `${base}_one` : `${base}_other`
  ) as CatalogKey;
  return t(key, { n, ...params });
}
