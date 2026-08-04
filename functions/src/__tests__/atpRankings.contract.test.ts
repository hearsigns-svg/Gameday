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
import {
  ATP_RANK_SOURCE,
  MIN_RANKED,
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

test('a table outside the expected band is not applied', () => {
  const tiny = { rows: [{ rank: 1, name: 'Only One' }] };
  expect(() => rankingEntries(tiny)).toThrow(/outside \[/);
  expect(MIN_RANKED).toBeGreaterThan(1);
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
