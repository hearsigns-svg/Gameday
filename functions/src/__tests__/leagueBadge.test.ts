// The country-scoped badge join, and the definite-article fold that
// keeps it honest across providers (Round 3 mark audit v2): fd.org
// says "Netherlands", TSDB says "The Netherlands", and the join keyed
// on the exact normalised country — so the Eredivisie was the one
// badgeless soccer row. foldCountry is applied on BOTH sides
// (fetchTsdbLeagueBadges when building the maps, leagueBadgeFor when
// querying); these tests pin the lookup side with maps keyed the way
// the builder now keys them.

import { foldCountry, leagueBadgeFor } from '../providers/tsdb';

const normalise = (s: string) => s.toLowerCase();

// Maps as the builder constructs them post-fold: country keys folded.
const art = {
  byId: new Map([['4337', 'https://x/eredivisie.png']]),
  byCountryName: new Map([
    ['netherlands|eredivisie', 'https://x/eredivisie.png'],
    ['england|premier league', 'https://x/pl.png'],
  ]),
  namesByCountry: new Map([
    [
      'netherlands',
      [{ name: 'dutch eredivisie', badge: 'https://x/eredivisie.png' }],
    ],
    ['england', [{ name: 'english league championship', badge: 'https://x/champ.png' }]],
  ]),
};

test('foldCountry strips only a LEADING definite article', () => {
  expect(foldCountry('the netherlands')).toBe('netherlands');
  expect(foldCountry('netherlands')).toBe('netherlands');
  // Never mid-string: a country containing "the" elsewhere is intact.
  expect(foldCountry('gambia the')).toBe('gambia the');
});

test('both providers’ spellings of the country reach the same badge', () => {
  for (const country of ['Netherlands', 'The Netherlands']) {
    expect(
      leagueBadgeFor(art, { name: 'Eredivisie', country }, normalise),
    ).toBe('https://x/eredivisie.png');
  }
});

test('containment stays country-scoped after the fold', () => {
  // "Championship" resolves inside England only — the fold must not
  // widen the scope, just align the key.
  expect(
    leagueBadgeFor(art, { name: 'Championship', country: 'England' }, normalise),
  ).toBe('https://x/champ.png');
  expect(
    leagueBadgeFor(art, { name: 'Championship', country: 'The Netherlands' }, normalise),
  ).toBeUndefined();
});
