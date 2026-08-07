// Family-name-first is a convention, not a different person — but the
// widening that fixes Shang Juncheng must not be able to marry up two
// people whose names are each other's reversal.

import { buildAthleteIndex, matchAthlete, Athlete } from '../athletes';
import { athleteNames } from '../identity';

// searchName is DERIVED, so a fixture can never disagree with itself
// about what the athlete is called.
const athlete = (over: Partial<Athlete>): Athlete => {
  const displayName = over.displayName ?? 'Shang Juncheng';
  return {
    id: 'athlete_000001',
    sport: 'tennis',
    providerIds: {},
    identities: [],
    active: true,
    ...over,
    // Through the constructor, exactly like production. This used
    // `displayName.toLowerCase()` — the precise shape of the bug that put
    // 12 athletes beyond search — and the `as Athlete` cast meant the new
    // brand could not catch it here either. A fixture that models a broken
    // writer teaches the suite to accept one.
    ...athleteNames(displayName),
  } as Athlete;
};

const indexOf = (all: Athlete[]) => buildAthleteIndex(all);

it('finds a player written family-name-first', () => {
  const idx = indexOf([athlete({ countryCode: 'CHN' })]);
  const m = matchAthlete(idx, 'tennis', { name: 'Juncheng Shang' });
  expect(m.kind).toBe('confident');
  expect(m.athlete?.id).toBe('athlete_000001');
});

it('A STRAIGHT MATCH ALWAYS WINS — reversal never overrides one', () => {
  const straight = athlete({ id: 'athlete_A', displayName: 'Juncheng Shang' });
  const flipped = athlete({ id: 'athlete_B', displayName: 'Shang Juncheng' });
  const m = matchAthlete(indexOf([straight, flipped]), 'tennis', {
    name: 'Juncheng Shang',
  });
  expect(m.athlete?.id).toBe('athlete_A');
});

it('REFUSES when the countries contradict', () => {
  const idx = indexOf([
    athlete({ displayName: 'Martin Thomas', countryCode: 'FRA' }),
  ]);
  const m = matchAthlete(idx, 'tennis', {
    name: 'Thomas Martin',
    countryCode: 'USA',
  });
  expect(m.kind).toBe('unknown');
});

it('allows it when a country is missing on either side', () => {
  // An absence is not a contradiction — most feeds carry no country.
  const idx = indexOf([athlete({ displayName: 'Shang Juncheng' })]);
  expect(matchAthlete(idx, 'tennis', { name: 'Juncheng Shang' }).kind).toBe(
    'confident',
  );
});

it('REFUSES a three-token name — that is noise, not a convention', () => {
  // "Adolfo Daniel Vallejo" reversed is "Vallejo Daniel Adolfo", which
  // no naming convention produces. 155 of our athletes carry 3+ tokens.
  const idx = indexOf([
    athlete({ displayName: 'Vallejo Daniel Adolfo' }),
  ]);
  expect(
    matchAthlete(idx, 'tennis', { name: 'Adolfo Daniel Vallejo' }).kind,
  ).toBe('unknown');
});

it('REFUSES an ambiguous reversal', () => {
  const a = athlete({ id: 'athlete_A', displayName: 'Shang Juncheng' });
  const b = athlete({ id: 'athlete_B', displayName: 'Shang Juncheng' });
  expect(matchAthlete(indexOf([a, b]), 'tennis', { name: 'Juncheng Shang' }).kind)
    .toBe('unknown');
});

it('never crosses sports', () => {
  const boxer = athlete({ sport: 'boxing', displayName: 'Shang Juncheng' });
  expect(matchAthlete(indexOf([boxer]), 'tennis', { name: 'Juncheng Shang' }).kind)
    .toBe('unknown');
});

it('a palindromic name says nothing and is refused', () => {
  const idx = indexOf([athlete({ displayName: 'Ali Ali' })]);
  // Straight match still works; it is the REVERSAL that must not fire.
  expect(matchAthlete(idx, 'tennis', { name: 'Ali Ali' }).kind).toBe('confident');
});
