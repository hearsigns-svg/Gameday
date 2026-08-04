// ATP ranking contract — pinned to the REAL wikitext captured
// 2026-08-04 from the MediaWiki Action API (page "Current tennis
// rankings"), trimmed to the two singles-ranking sections. The capture
// keeps every shape the parser has to survive in the live table:
//   - the No. 1 cell is a PIPED WIKI-LINK (`[[List of ATP…|1]]`), not a
//     bare number, so a naive `|\d+` row rule loses rank 1 silently;
//   - two players render `{{noflag}}[[Name]]` with no country;
//   - names carry diacritics (Jiří Lehečka, Jakub Menšík);
//   - the WTA section sits in the same payload, so a parser that
//     scanned the whole page would fold women into the men's roster.

import sample from './fixtures/wikipedia-atp-rankings-sample.json';
import { normaliseName } from '../identity';
import {
  ATP_RANK_SOURCE,
  EXPECTED_ROWS,
  gateRanking,
  MIN_CARRY_OVER,
  parseAsOf,
  parseAtpRankings,
  rankingEntries,
  warnIfStale,
} from '../providers/atpRankings';

const table = parseAtpRankings(sample);

test('the live table parses to a contiguous 1..N ranking', () => {
  expect(table.rows).toHaveLength(20);
  expect(table.rows.map((r) => r.rank)).toEqual(
    Array.from({ length: 20 }, (_, i) => i + 1),
  );
  // Rank 1 is the piped-link cell — the one most likely to be dropped.
  expect(table.rows[0]).toEqual({
    rank: 1,
    name: 'Jannik Sinner',
    countryCode: 'ITA',
  });
  expect(table.rows[1]).toMatchObject({ rank: 2, name: 'Carlos Alcaraz' });
});

test('a player with no flag template still parses, without a country', () => {
  const medvedev = table.rows.find((r) => r.name === 'Daniil Medvedev')!;
  expect(medvedev).toBeDefined();
  expect(medvedev.countryCode).toBeUndefined();
  expect(medvedev.rank).toBe(6);
});

test('diacritics survive intact — they are the join key to the directory', () => {
  expect(table.rows.map((r) => r.name)).toEqual(
    expect.arrayContaining(['Jiří Lehečka', 'Jakub Menšík', 'Rafael Jódar']),
  );
});

test('the WTA table in the same payload is NOT folded into the men', () => {
  // The section label is the contract. Women in the men's roster would
  // be the worst possible failure of this connector.
  expect(table.rows.map((r) => r.name)).not.toContain('Aryna Sabalenka');
  expect(table.rows).toHaveLength(20);
});

test('the table states its own as-of date', () => {
  expect(table.asOf).toBe('2026-08-03');
  expect(parseAsOf('no template here')).toBeUndefined();
});

test('entries carry rank, the men\'s group, and a source of their own', () => {
  const entries = rankingEntries(table);
  expect(entries).toHaveLength(20);
  expect(entries[0]).toEqual({
    source: ATP_RANK_SOURCE,
    externalId: null,
    name: 'Jannik Sinner',
    sport: 'tennis',
    grouping: 'ATP Tour — Men',
    groupingKey: 'atp',
    rank: 1,
    countryCode: 'ITA',
  });
  // NOT the 'atp' identity namespace: that one carries a real ATP
  // player id from Wikidata, and a null externalId under the same
  // source would overwrite it in the identity map.
  expect(ATP_RANK_SOURCE).not.toBe('atp');
});

test('shape rot throws — a moved section label is never an empty ranking', () => {
  expect(() => parseAtpRankings({})).toThrow(/missing parse.wikitext/);
  expect(() =>
    parseAtpRankings({ parse: { wikitext: { '*': 'nothing here' } } }),
  ).toThrow(/section .* not found/);
});

test('a non-contiguous table throws rather than publishing a false top-N', () => {
  const gappy = {
    parse: {
      wikitext: {
        '*':
          '<section begin=ATP singles ranking />\n' +
          '|1\n|{{flagathlete|[[A Player]]|ITA}}|| 1 || x\n|-\n' +
          '|3\n|{{flagathlete|[[B Player]]|ESP}}|| 2 || x\n' +
          '<section end=ATP singles ranking />',
      },
    },
  };
  expect(() => parseAtpRankings(gappy)).toThrow(/rank 2 missing/);
});

test('a table that is not EXACTLY twenty rows is not applied', () => {
  const tiny = { rows: [{ rank: 1, name: 'Only One' }] };
  expect(() => rankingEntries(tiny)).toThrow(/expected exactly 20/);
  // A deepened table is refused too — welcome upstream, but it is a
  // deliberate one-line change here, not a silent one.
  const deep = {
    rows: Array.from({ length: 50 }, (_, i) => ({
      rank: i + 1,
      name: `Player ${i} X`,
    })),
  };
  expect(() => rankingEntries(deep)).toThrow(/expected exactly 20/);
  expect(EXPECTED_ROWS).toBe(20);
});

// ─── The gates that need the directory (Prompt 12b) ───────────────────

const entriesOf = (names: readonly string[]) =>
  names.map((name, i) => ({
    source: ATP_RANK_SOURCE,
    externalId: null,
    name,
    sport: 'tennis',
    rank: i + 1,
  }));

const NAMES_20 = Array.from({ length: 20 }, (_, i) => `Player ${i} Surname`);
const resolvable = (names: readonly string[]) =>
  new Set(names.map((n) => normaliseName(n)));
const previousOf = (names: readonly string[]) =>
  new Map(names.map((n, i) => [normaliseName(n), i + 1] as const));

test('a name that resolves to no directory athlete refuses the whole update', () => {
  const entries = entriesOf([...NAMES_20.slice(0, 19), 'Vandalised Nonsense']);
  expect(() =>
    gateRanking(
      entries,
      {
        resolvableNames: resolvable(NAMES_20),
        previous: previousOf(NAMES_20),
      },
      normaliseName,
    ),
  ).toThrow(/resolve to no directory athlete/);
});

test('a WTA-only name does not count as resolved — the men must join to men', () => {
  // resolvableNames is built from tennis athletes WITHOUT a wta id, so
  // a name that exists only as a woman is absent from the set.
  const entries = entriesOf([...NAMES_20.slice(0, 19), 'Aryna Sabalenka']);
  expect(() =>
    gateRanking(
      entries,
      { resolvableNames: resolvable(NAMES_20), previous: new Map() },
      normaliseName,
    ),
  ).toThrow(/resolve to no directory athlete/);
});

test('wholesale replacement is refused as a different table, not a week of movement', () => {
  const fresh = Array.from({ length: 20 }, (_, i) => `Other ${i} Person`);
  expect(() =>
    gateRanking(
      entriesOf(fresh),
      {
        resolvableNames: resolvable([...NAMES_20, ...fresh]),
        previous: previousOf(NAMES_20),
      },
      normaliseName,
    ),
  ).toThrow(/different table/);
});

test('a realistic post-slam week passes: six in, six out, order churned', () => {
  const churned = [
    ...NAMES_20.slice(6).reverse(),
    ...Array.from({ length: 6 }, (_, i) => `Riser ${i} Surname`),
  ];
  expect(churned).toHaveLength(20);
  expect(() =>
    gateRanking(
      entriesOf(churned),
      {
        resolvableNames: resolvable([...NAMES_20, ...churned]),
        previous: previousOf(NAMES_20),
      },
      normaliseName,
    ),
  ).not.toThrow();
  // 14 carried of 20 — exactly the floor, so the floor is reachable by
  // real movement and not set below it.
  expect(MIN_CARRY_OVER).toBe(14);
});

test('the first ever run has nothing to compare against and is not blocked', () => {
  expect(() =>
    gateRanking(
      entriesOf(NAMES_20),
      { resolvableNames: resolvable(NAMES_20), previous: new Map() },
      normaliseName,
    ),
  ).not.toThrow();
});

test('the real captured table passes both gates against a matching directory', () => {
  const entries = rankingEntries(table);
  expect(() =>
    gateRanking(
      entries,
      {
        resolvableNames: resolvable(entries.map((e) => e.name)),
        previous: new Map(
          entries.map((e) => [normaliseName(e.name), e.rank!] as const),
        ),
      },
      normaliseName,
    ),
  ).not.toThrow();
});

test('a table that stopped being maintained pages the owner but still serves', () => {
  const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  warnIfStale('2026-01-01', '2026-08-04T00:00:00.000Z');
  expect(spy).toHaveBeenCalledWith(
    expect.stringContaining('[kickoffcal-alert] atp_ranking_stale'),
  );
  spy.mockClear();
  warnIfStale('2026-08-03', '2026-08-04T00:00:00.000Z');
  expect(spy).not.toHaveBeenCalled();
  spy.mockRestore();
});
