// Region detection and the terminology layer (Prompt 15).

import {
  detectRegionFrom,
  regionFromCountry,
  regionFromLocaleTag,
  REGIONS,
} from '../region';
import {
  REGIONALLY_NAMED_SPORTS,
  sportLabelFor,
} from '../../features/follows/domain/sportTerms';
import { SPORTS } from '../../features/follows/domain/sportsConfig';

describe('locale → region', () => {
  test('the shapes an OS actually hands us', () => {
    expect(regionFromLocaleTag('en-GB')).toBe('uk-ie');
    expect(regionFromLocaleTag('en_US')).toBe('north-america'); // POSIX
    expect(regionFromLocaleTag('en_IN.UTF-8')).toBe('south-asia'); // with charset
    expect(regionFromLocaleTag('pt-BR')).toBe('latam');
    expect(regionFromLocaleTag('en-AU')).toBe('oceania');
    expect(regionFromLocaleTag('de-DE')).toBe('europe');
  });

  test('a script subtag does not get mistaken for a region', () => {
    // 'zh-Hant-TW' — the 4-letter script must be skipped, not parsed.
    expect(regionFromLocaleTag('zh-Hant-TW')).toBe('default');
    expect(regionFromLocaleTag('sr-Latn-RS')).toBe('europe');
  });

  test('a language with no region tells us nothing, and says so', () => {
    expect(regionFromLocaleTag('en')).toBe('default');
    expect(regionFromLocaleTag('')).toBe('default');
    expect(regionFromLocaleTag(undefined)).toBe('default');
  });

  test('an unlisted country falls back rather than guessing', () => {
    // Most of Africa and the Middle East: the default leads with
    // soccer, which is right for them — that is WHY they need no entry.
    expect(regionFromCountry('NG')).toBe('default');
    expect(regionFromCountry('EG')).toBe('default');
    // And the admitted miss, recorded rather than hidden: Japan gets
    // the soccer-led default though baseball leads there.
    expect(regionFromCountry('JP')).toBe('default');
  });

  test('detection prefers Intl but falls through when it has no region', () => {
    expect(
      detectRegionFrom({ intlLocale: 'en-GB', platformLocale: 'en_US' }),
    ).toBe('uk-ie');
    // Intl answering a bare language must not mask a platform locale
    // that does carry the region.
    expect(
      detectRegionFrom({ intlLocale: 'en', platformLocale: 'en_US' }),
    ).toBe('north-america');
    expect(detectRegionFrom({})).toBe('default');
  });

  test('no country is claimed by two regions', () => {
    const seen = new Set<string>();
    for (const r of REGIONS) {
      for (const c of r.countries) {
        expect(seen.has(c)).toBe(false);
        seen.add(c);
      }
    }
  });
});

describe('terminology is a display layer only', () => {
  test('football and soccer swap where the word is contested', () => {
    expect(sportLabelFor('soccer', 'Soccer', 'uk-ie')).toBe('Football');
    expect(sportLabelFor('soccer', 'Soccer', 'europe')).toBe('Football');
    expect(sportLabelFor('soccer', 'Soccer', 'north-america')).toBe('Soccer');
    // Australia and NZ keep "Soccer" deliberately — "football" there
    // means the AFL or rugby league.
    expect(sportLabelFor('soccer', 'Soccer', 'oceania')).toBe('Soccer');
  });

  test('the two football words never collide on one screen', () => {
    // North America is the only region where gridiron is "Football",
    // and it is exactly the region where soccer is "Soccer".
    const na = 'north-america' as const;
    expect(sportLabelFor('nfl', 'American football', na)).toBe('Football');
    expect(sportLabelFor('soccer', 'Soccer', na)).toBe('Soccer');
  });

  test('"Hockey" means ice hockey ONLY in North America', () => {
    expect(sportLabelFor('ice-hockey', 'Ice hockey', 'north-america')).toBe(
      'Hockey',
    );
    // In South Asia and Oceania "hockey" means field hockey — and this
    // app lists "Field hockey" as an Olympic discipline, so the clash
    // would be on our own screens, not merely in principle.
    for (const r of ['south-asia', 'oceania', 'uk-ie', 'default'] as const) {
      expect(sportLabelFor('ice-hockey', 'Ice hockey', r)).toBe('Ice hockey');
    }
  });

  test('an unlisted sport or region always falls through to the bundled label', () => {
    expect(sportLabelFor('cricket', 'Cricket', 'south-asia')).toBe('Cricket');
    expect(sportLabelFor('tennis', 'Tennis', 'north-america')).toBe('Tennis');
    expect(sportLabelFor('soccer', 'Soccer', 'default')).toBe('Soccer');
  });

  test('every regionally-named sport is a REAL sport key', () => {
    // A typo here would silently never apply — the label would look
    // fine and the override would be dead.
    const keys = new Set(SPORTS.map((s) => s.key));
    for (const k of REGIONALLY_NAMED_SPORTS) expect(keys.has(k)).toBe(true);
  });
});
