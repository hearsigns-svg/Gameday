// Competition art for the client's STATIC competitions (Prompt 13
// follow-up): the id set comes from the catalogue so it cannot drift,
// and the payload carries only what browse actually offers.

import {
  artIsFresh,
  mergeCuratedMarks,
  COMPETITION_ART_ALIASES,
  COMPETITION_ART_TTL_MS,
  narrowToServed,
  TSDB_ART_SPORTS,
  tsdbLeagueIdsFrom,
} from '../competitionArt';
import { CATALOGUE_SEED } from '../catalogue';

test('the served id set is DERIVED from the catalogue, not hand-kept', () => {
  const ids = tsdbLeagueIdsFrom(CATALOGUE_SEED.map((e) => e.competitionId));
  // The competitions the owner named, plus their neighbours.
  expect(ids).toEqual(expect.arrayContaining(['4387', '4391', '4460']));
  // Non-TSDB keys contribute nothing: no soccer fd codes, no Olympic
  // rows, no `sport:` weights, no tennis tours.
  expect(ids.every((id) => /^\d+$/.test(id))).toBe(true);
  expect(ids).not.toContain('olympics-2028');
});

test('keys that are not TSDB league keys are ignored', () => {
  expect(
    tsdbLeagueIdsFrom([
      'tsdb-league-4387',
      'fdorg-comp-PL',
      'sport:basketball',
      'olympics-2028-athletics',
      'tsdb-team-133604', // a TEAM key, not a league
      undefined,
      'tsdb-league-notanumber',
    ]),
  ).toEqual(['4387']);
});

test('the payload is narrowed to served ids — not the whole badge set', () => {
  // Ten sports carry well over a thousand leagues between them;
  // shipping all of it would be ~80KB of URLs nobody renders.
  const byId = new Map([
    ['4387', 'https://x/nba.png'],
    ['4391', 'https://x/nfl.png'],
    ['9999', 'https://x/unserved.png'],
  ]);
  expect(narrowToServed(byId, ['4387', '4391'])).toEqual({
    '4387': 'https://x/nba.png',
    '4391': 'https://x/nfl.png',
  });
  // A served id the provider has no badge for is simply absent —
  // never an empty string, which would render as a broken image.
  expect(narrowToServed(byId, ['4387', '1234'])).toEqual({
    '4387': 'https://x/nba.png',
  });
});

test('every sport we browse is covered by the fetch list', () => {
  // Verified live 2026-08-04 (Tennis 2026-08-28, Athletics 2026-08-29):
  // each of these returns leagues and every league carries a badge. A
  // sport missing here means its competitions silently keep monograms —
  // and an ALIAS whose sport is missing resolves to nothing, which is
  // exactly how athletics stayed markless while its aliases were
  // "correct" on paper (Round 3 mark audit v2).
  for (const s of [
    'Soccer',
    'Basketball',
    'American Football',
    'Ice Hockey',
    'Baseball',
    'Cricket',
    'Rugby',
    'Golf',
    'Fighting',
    'Motorsport',
    'Tennis',
    'Athletics',
  ]) {
    expect(TSDB_ART_SPORTS).toContain(s);
  }
});

test('no alias ever touches an Olympic key — statute, not preference', () => {
  // TSDB holds "Olympics Athletics" (4994) and "Olympics Tennis" (5040)
  // badges; aliasing an olympics-* follow key to either would put an
  // excluded mark back on an excluded row. imagery.ts drops olympics-*
  // downstream, but the alias map must never rely on that net.
  for (const key of Object.keys(COMPETITION_ART_ALIASES)) {
    expect(key).not.toMatch(/^(?:olympics|paralympics)/);
  }
  // The four majors are DELIBERATELY absent FROM THE ALIAS MAP — no
  // per-slam TSDB league exists (1,530-league sweep, 2026-08-29).
  // Their marks now arrive through the CURATED layer instead (owner
  // ruling 2026-08-30, superseding the hand-import bar); an alias
  // entry appearing here would mean a TSDB league nobody verified.
  for (const slam of [
    'tennis-t-us-open',
    'tennis-t-wimbledon',
    'tennis-t-roland-garros',
    'tennis-t-australian-open',
  ]) {
    expect(COMPETITION_ART_ALIASES).not.toHaveProperty(slam);
  }
});

test('the art cache expires daily and a bad timestamp is never fresh', () => {
  const now = Date.parse('2026-08-04T12:00:00.000Z');
  expect(artIsFresh('2026-08-04T11:00:00.000Z', now)).toBe(true);
  expect(artIsFresh('2026-08-03T11:00:00.000Z', now)).toBe(false);
  expect(artIsFresh(undefined, now)).toBe(false);
  expect(artIsFresh('nonsense', now)).toBe(false);
  expect(COMPETITION_ART_TTL_MS).toBe(24 * 3_600_000);
});

// Owner ruling 2026-08-30 (broadened curated marks): the merge's three
// laws — gaps only, provider wins, statute unbreachable.
test('curated marks fill gaps only; a provider badge always wins', () => {
  const merged = mergeCuratedMarks(
    { '4387': 'https://tsdb/nba.png' },
    {
      '4387': { url: 'https://ours/nba-curated.png' }, // must LOSE
      'tennis-t-us-open': { url: 'https://ours/usopen.png' },
      'tennis-t-wimbledon': {}, // no url — contributes nothing
    },
  );
  expect(merged['4387']).toBe('https://tsdb/nba.png');
  expect(merged['tennis-t-us-open']).toBe('https://ours/usopen.png');
  expect(merged).not.toHaveProperty('tennis-t-wimbledon');
});

test('the Olympic statute holds at the curated merge, whatever was imported', () => {
  const merged = mergeCuratedMarks(
    {},
    {
      'olympics-2028': { url: 'https://ours/rings.png' },
      'paralympics-2028': { url: 'https://ours/agitos.png' },
      'pbc-cards': { url: 'https://ours/pbc.png' },
    },
  );
  expect(Object.keys(merged)).toEqual(['pbc-cards']);
});
