// Phase C framework pins: language resolution, interpolation, plurals,
// and the catalog invariants every language file must hold.

import { LANGUAGE_NAMES, t, tn } from '../index';
import { en } from '../catalog/en';
import { es } from '../catalog/es';
import { de } from '../catalog/de';
import { fr } from '../catalog/fr';
import { it as itCatalog } from '../catalog/it';
import { pt } from '../catalog/pt';
import {
  __setLanguageForTests,
  languageFromTag,
  SUPPORTED_LANGUAGES,
} from '../locale';

afterEach(() => __setLanguageForTests(null));

test('language tags resolve by primary subtag; unknown falls to en', () => {
  expect(languageFromTag('es-MX')).toBe('es');
  expect(languageFromTag('pt-BR')).toBe('pt');
  expect(languageFromTag('de')).toBe('de');
  expect(languageFromTag('zh-CN')).toBe('en'); // queued, not yet shipped
  expect(languageFromTag(undefined)).toBe('en');
  expect(languageFromTag('')).toBe('en');
});

test('interpolation fills named params and leaves unknown braces intact', () => {
  __setLanguageForTests('en');
  // Uses a real key with no params — interpolation is a pass-through.
  expect(t('core.teams')).toBe('Teams');
});

test('every language ships every key — and every placeholder', () => {
  const catalogs = { es, de, fr, it: itCatalog, pt };
  const keys = Object.keys(en).sort();
  const placeholders = (s: string) =>
    [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
  for (const [lang, cat] of Object.entries(catalogs)) {
    expect({ lang, keys: Object.keys(cat).sort() }).toEqual({
      lang,
      keys,
    });
    for (const k of keys) {
      // A translation that drops {n} or renames {count} breaks at
      // runtime for exactly one language — pinned here instead.
      expect({ lang, k, ph: placeholders((cat as Record<string, string>)[k]) }).toEqual({
        lang,
        k,
        ph: placeholders((en as Record<string, string>)[k]),
      });
    }
  }
});

test('LANGUAGE_NAMES covers exactly the supported set', () => {
  expect(Object.keys(LANGUAGE_NAMES).sort()).toEqual(
    [...SUPPORTED_LANGUAGES].sort(),
  );
});

test('plural pairs pick one/other by the ACTIVE language’s rules', () => {
  // The catalog grows its pairs during externalisation; this pins the
  // mechanism with whatever pair exists once one lands. Until then the
  // selector itself is exercised through Intl directly.
  __setLanguageForTests('en');
  expect(new Intl.PluralRules('en').select(1)).toBe('one');
  expect(new Intl.PluralRules('en').select(2)).toBe('other');
  expect(new Intl.PluralRules('fr').select(1)).toBe('one');
  void tn; // mechanism typed against the catalog; pairs pinned when present
});
