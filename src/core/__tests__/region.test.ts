// Region detection and the terminology layer (Prompt 15).

import {
  detectRegionFrom,
  regionFromCountry,
  regionFromLocaleTag,
  REGIONS,
} from '../region';
import {
  FIXTURES_WORDED_SPORTS,
  fixturesWordFor,
  REGIONALLY_NAMED_SPORTS,
  sportLabelFor,
  sportMatches,
  sportSearchTerms,
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

// The competition card's first-segment word (27C) — same table
// discipline as the regional terms above.
describe('fixturesWordFor', () => {
  test('every worded sport is a REAL sport key', () => {
    // Same failure mode as the regional pin: a typo'd key would
    // silently say "Fixtures" forever.
    const keys = new Set(SPORTS.map((s) => s.key));
    for (const k of FIXTURES_WORDED_SPORTS) expect(keys.has(k)).toBe(true);
  });

  test('the owner-ruled words, and the mockup default', () => {
    expect(fixturesWordFor('boxing')).toBe('Fights');
    expect(fixturesWordFor('cricket')).toBe('Matches');
    expect(fixturesWordFor('tennis')).toBe('Tournaments');
    expect(fixturesWordFor('f1')).toBe('Events');
    // The mockup pins NBA (and every unlisted sport) at "Fixtures".
    expect(fixturesWordFor('basketball')).toBe('Fixtures');
    expect(fixturesWordFor('soccer')).toBe('Fixtures');
  });
});

// ---------------------------------------------------------------------------
// MATCHING vs DISPLAY (22c). The bug these pin: search filtered on the
// bundled config label while every screen displayed the regional one, so a
// UK user typed the exact word the app had shown them and got nothing.

describe('sportSearchTerms', () => {
  it('returns the bundled label plus every regional variant', () => {
    const terms = sportSearchTerms('soccer', 'Soccer');
    expect(terms).toContain('Soccer');
    expect(terms).toContain('Football');
  });

  it('de-duplicates: four regions say Football, the word appears once', () => {
    const terms = sportSearchTerms('soccer', 'Soccer');
    expect(terms.filter((t) => t === 'Football')).toHaveLength(1);
  });

  it('a sport with no regional variants is just its own label', () => {
    expect(sportSearchTerms('tennis', 'Tennis')).toEqual(['Tennis']);
  });

  it('never returns the sport KEY — these are names, not identifiers', () => {
    expect(sportSearchTerms('ice-hockey', 'Ice hockey')).not.toContain(
      'ice-hockey',
    );
  });
});

describe('sportMatches', () => {
  it('finds soccer by the word the UK app displays', () => {
    expect(sportMatches('soccer', 'Soccer', 'football')).toBe(true);
  });

  it('finds soccer by the word the config carries', () => {
    expect(sportMatches('soccer', 'Soccer', 'soccer')).toBe(true);
  });

  // The owner's specific concern: in North America "football" genuinely
  // names two sports, and neither may shadow the other.
  it('"football" surfaces BOTH soccer and NFL — neither shadows the other', () => {
    expect(sportMatches('soccer', 'Soccer', 'football')).toBe(true);
    expect(sportMatches('nfl', 'American football', 'football')).toBe(true);
  });

  it('matches on a prefix, the way a search box is actually used', () => {
    expect(sportMatches('athletics', 'Athletics', 'track')).toBe(true);
    expect(sportMatches('motorsport', 'Motorsport', 'auto')).toBe(true);
  });

  it('is case- and whitespace-insensitive', () => {
    expect(sportMatches('soccer', 'Soccer', '  FOOTball ')).toBe(true);
  });

  it('an empty needle matches nothing — it must not return every sport', () => {
    expect(sportMatches('soccer', 'Soccer', '')).toBe(false);
    expect(sportMatches('soccer', 'Soccer', '   ')).toBe(false);
  });

  it('does not match an unrelated word', () => {
    expect(sportMatches('soccer', 'Soccer', 'cricket')).toBe(false);
  });

  // Matching is region-blind BY DESIGN: people arrive with the word they
  // already have. Display stays regional, which is what distinguishes the
  // two rows once they are both on screen.
  it('matching does not depend on the active region, but display does', () => {
    expect(sportMatches('soccer', 'Soccer', 'football')).toBe(true);
    expect(sportLabelFor('soccer', 'Soccer', 'north-america')).toBe('Soccer');
    expect(sportLabelFor('soccer', 'Soccer', 'uk-ie')).toBe('Football');
  });

  it('every regionally-named sport is findable by all of its names', () => {
    for (const key of REGIONALLY_NAMED_SPORTS) {
      for (const name of sportSearchTerms(key, 'ZZUNUSED')) {
        if (name === 'ZZUNUSED') continue;
        expect(sportMatches(key, 'ZZUNUSED', name)).toBe(true);
      }
    }
  });
});
