// Region — ordering and vocabulary, never availability. PURE except
// for `detectRegion`, which reads the OS locale.
//
// Prompt 11b analysed a regional overlay and shipped a single UK-leaning
// default instead, on the grounds that the real cost was curation rather
// than code. Prompt 15 accepts that cost. What region changes:
//   - the ORDER sports and competitions appear in (a sparse overlay on
//     catalogue priorities, applied server-side);
//   - the LABEL a few sports carry ("Soccer" vs "Football").
// What it must never change: WHAT EXISTS. A user in India must still
// find and follow the NFL as easily as anyone else — region reorders a
// list, it never filters one.
//
// DETECTION IS OS-LOCALE ONLY. No IP geolocation, no location
// permission: the country a phone is configured for is a better guess
// at what a person follows than the country they are standing in, and
// it costs no permission prompt and leaks nothing.

export type RegionKey =
  | 'uk-ie'
  | 'europe'
  | 'north-america'
  | 'south-asia'
  | 'latam'
  | 'oceania'
  | 'default';

export interface RegionConfig {
  key: RegionKey;
  label: string;
  // ISO 3166-1 alpha-2 codes. ADDING A REGION IS THIS TABLE plus a
  // catalogue overlay — no logic changes anywhere, which is the whole
  // point of keeping the mapping declarative.
  countries: readonly string[];
}

export const REGIONS: readonly RegionConfig[] = [
  { key: 'uk-ie', label: 'UK & Ireland', countries: ['GB', 'IE', 'IM', 'JE', 'GG'] },
  {
    key: 'europe',
    label: 'Europe',
    countries: [
      'FR', 'DE', 'ES', 'IT', 'PT', 'NL', 'BE', 'CH', 'AT', 'DK', 'SE',
      'NO', 'FI', 'IS', 'PL', 'CZ', 'SK', 'HU', 'RO', 'BG', 'GR', 'HR',
      'SI', 'RS', 'BA', 'MK', 'AL', 'ME', 'UA', 'BY', 'LT', 'LV', 'EE',
      'LU', 'MT', 'CY', 'TR', 'MD', 'XK',
    ],
  },
  { key: 'north-america', label: 'North America', countries: ['US', 'CA'] },
  {
    key: 'south-asia',
    label: 'South Asia',
    countries: ['IN', 'PK', 'BD', 'LK', 'NP', 'BT', 'MV', 'AF'],
  },
  {
    key: 'latam',
    label: 'Latin America',
    countries: [
      'MX', 'BR', 'AR', 'CO', 'CL', 'PE', 'VE', 'EC', 'UY', 'PY', 'BO',
      'CR', 'PA', 'GT', 'HN', 'SV', 'NI', 'DO', 'CU', 'PR',
    ],
  },
  { key: 'oceania', label: 'Australia & NZ', countries: ['AU', 'NZ', 'FJ', 'PG'] },
];

const BY_COUNTRY: ReadonlyMap<string, RegionKey> = new Map(
  REGIONS.flatMap((r) => r.countries.map((c) => [c, r.key] as const)),
);

export function regionLabel(key: RegionKey): string {
  return REGIONS.find((r) => r.key === key)?.label ?? 'Default';
}

// THE FALLBACK, stated: an unrecognised or absent country is
// 'default' — the existing ordering, unchanged. Every region the table
// does not name (most of Africa, the Middle East, East Asia) therefore
// gets the default, which leads with soccer. That is the right answer
// for most of them and an ADMITTED wrong one for Japan, where baseball
// leads; see the report. Adding Japan is a table entry, not a rewrite.
export function regionFromCountry(code: string | undefined): RegionKey {
  if (!code) return 'default';
  return BY_COUNTRY.get(code.trim().toUpperCase()) ?? 'default';
}

// 'en-GB' → uk-ie. 'en_US' → north-america. 'en' → default (a language
// with no region tells us nothing about what someone follows).
export function regionFromLocaleTag(tag: string | undefined): RegionKey {
  if (!tag) return 'default';
  // Accept both BCP-47 ('en-GB') and POSIX ('en_GB.UTF-8').
  const parts = tag.replace(/\..*$/, '').split(/[-_]/);
  // The region subtag is the first 2-letter ALL-CAPS part after the
  // language; a script subtag ('Hant') is 4 letters and skipped.
  const region = parts.slice(1).find((p) => /^[A-Za-z]{2}$/.test(p));
  return regionFromCountry(region);
}

// ─── Detection ────────────────────────────────────────────────────────
//
// Three sources, cheapest and most reliable first, because none is
// guaranteed on every platform build:
//   1. Intl — present in Hermes on both platforms and needs no native
//      module, but `resolvedOptions().locale` may answer with a bare
//      language ('en') on a device with no region set.
//   2. The platform's own locale identifier, which carries a region
//      even when Intl does not (iOS AppleLocale 'en_GB', Android
//      I18nManager.localeIdentifier).
//   3. Nothing — 'default'.
// Wrapped because a throwing Intl on a stripped build must degrade to
// the default ordering, never take the app down over a sort order.
export function detectRegionFrom(sources: {
  intlLocale?: string;
  platformLocale?: string;
}): RegionKey {
  const fromIntl = regionFromLocaleTag(sources.intlLocale);
  if (fromIntl !== 'default') return fromIntl;
  return regionFromLocaleTag(sources.platformLocale);
}
