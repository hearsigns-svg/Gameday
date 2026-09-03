// UFC roster connector, pinned to a REAL captured wikitext slice of
// Wikipedia's "List of current UFC fighters" (2026-09-03): the champions
// table, the Heavyweights and Light heavyweights sections (the latter
// with the page's inline HTML comment on its heading) and the Women's
// strawweights section. Expectations are literal values read off the
// banked page.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  mergeEntries,
  parseChampions,
  parseFlagCell,
  parseNameCell,
  rosterFromWikitext,
  sectionsOf,
  tableRows,
  UFC_DIVISIONS,
  ufcGroupingKey,
} from '../providers/ufcRoster';

const sample = readFileSync(
  join(__dirname, 'fixtures', 'wikipedia-ufc-roster-sample.txt'),
  'utf8',
);

// The sample holds three of the eleven divisions; the full-page gate
// (every division present, 300+ fighters) is exercised with the sample
// duplicated under the missing headings below.
// The page's own heading text per division (the slice holds three).
const PAGE_HEADINGS: Record<string, string> = {
  'mma-middleweight': 'Middleweights (185 lb, 84 kg)',
  'mma-welterweight': 'Welterweights (170 lb, 77 kg)',
  'mma-lightweight': 'Lightweights (155 lb, 70 kg)',
  'mma-featherweight': 'Featherweights (145 lb, 65 kg)',
  'mma-bantamweight': 'Bantamweights (135 lb, 61 kg)',
  'mma-flyweight': 'Flyweights (125 lb, 56 kg)',
  'mma-w-bantamweight': "Women's bantamweights (135 lb, 61 kg)",
  'mma-w-flyweight': "Women's flyweights (125 lb, 56 kg)",
};
function fullPageFrom(slice: string): string {
  const missing = UFC_DIVISIONS.filter(
    (d) => !sectionsOf(slice).some((s) => d.heading.test(s.heading)),
  );
  const heavy = sectionsOf(slice).find((s) => /^Heavyweights/.test(s.heading))!;
  return (
    slice +
    missing
      .map((d) => `\n===${PAGE_HEADINGS[ufcGroupingKey(d)]}===\n${heavy.body}`)
      .join('')
  );
}

describe('wikitext helpers', () => {
  test('sections: level-3 headings found through the inline HTML comment', () => {
    const headings = sectionsOf(sample).map((s) => s.heading);
    expect(headings).toContain('Heavyweights (265lb, 120 kg)');
    expect(headings).toContain('Light heavyweights (205 lb, 93 kg)');
    expect(headings).toContain("Women's strawweights (115 lb, 52 kg)");
  });

  test('name cells: sortname, sortname with article, wikilink with display, plain text', () => {
    expect(parseNameCell('{{sortname|Derrick|Lewis}}')).toEqual({
      name: 'Derrick Lewis',
      article: 'Derrick Lewis',
    });
    expect(parseNameCell('{{sortname|Alexander|Volkov|Alexander Volkov (fighter)}}')).toEqual({
      name: 'Alexander Volkov',
      article: 'Alexander Volkov (fighter)',
    });
    expect(parseNameCell('[[Mario Pinto|Mário Pinto]]')).toEqual({
      name: 'Mário Pinto',
      article: 'Mario Pinto',
    });
    expect(parseNameCell('Thomas Petersen')).toEqual({ name: 'Thomas Petersen', article: null });
    expect(parseNameCell('{{sortname|Jon|Jones|nolink}}')).toEqual({ name: 'Jon Jones', article: null });
    expect(parseNameCell('')).toBeNull();
  });

  test('flag cells: three-letter codes only — a spelled-out country is not guessed', () => {
    expect(parseFlagCell('{{flagicon|USA}}')).toBe('USA');
    expect(parseFlagCell('{{flagicon|POL}}')).toBe('POL');
    expect(parseFlagCell('{{flagicon|Myanmar}}')).toBeUndefined();
    expect(parseFlagCell('')).toBeUndefined();
  });

  test('table rows: the heavyweight table yields one row per fighter, header excluded', () => {
    const heavy = sectionsOf(sample).find((s) => /^Heavyweights/.test(s.heading))!;
    const rows = tableRows(heavy.body);
    expect(rows.length).toBeGreaterThanOrEqual(40);
    expect(rows[0][0]).toContain('{{flagicon|USA}}');
    expect(rows[0][1]).toContain('Derrick');
  });
});

describe('champions', () => {
  test('the champions table names the current title-holders per division', () => {
    const champs = parseChampions(sample);
    expect(champs).toContain('Mackenzie Dern');
    expect(champs).toContain('Joshua Van');
    expect(champs.some((c) => /vacant/i.test(c))).toBe(false);
  });
});

describe('rosterFromWikitext', () => {
  const { entries, divisions } = rosterFromWikitext(fullPageFrom(sample));

  test('every division parsed, grouping keys heavy→light men then women', () => {
    expect(Object.keys(divisions)).toEqual(UFC_DIVISIONS.map(ufcGroupingKey));
    expect(divisions['mma-heavyweight']).toBeGreaterThanOrEqual(40);
    expect(divisions['mma-w-strawweight']).toBeGreaterThanOrEqual(35);
  });

  test('entries carry source, sport, division, country and the article as the id', () => {
    const lewis = entries.find((e) => e.name === 'Derrick Lewis' && e.groupingKey === 'mma-heavyweight')!;
    expect(lewis).toMatchObject({
      source: 'wikipedia',
      externalId: 'Derrick Lewis',
      sport: 'ufc',
      grouping: 'Heavyweight',
      groupingKey: 'mma-heavyweight',
      countryCode: 'USA',
    });
    const volkov = entries.find((e) => e.name === 'Alexander Volkov')!;
    expect(volkov.externalId).toBe('Alexander Volkov (fighter)');
    // An unlinked fighter is name-keyed and says so.
    const petersen = entries.find((e) => e.name === 'Thomas Petersen')!;
    expect(petersen.externalId).toBeNull();
  });

  test('the champion carries the UFC belt on her division entry', () => {
    const dern = entries.find((e) => e.name === 'Mackenzie Dern')!;
    expect(dern.groupingKey).toBe('mma-w-strawweight');
    expect(dern.championOf).toEqual(['UFC']);
    // Nobody else in that division is a champion.
    expect(
      entries.filter((e) => e.groupingKey === 'mma-w-strawweight' && e.championOf).length,
    ).toBe(1);
  });

  test('all-or-nothing: a page missing a division throws; a thin division throws', () => {
    expect(() => rosterFromWikitext(sample)).toThrow(/division section missing/);
    const thin = fullPageFrom(sample).replace(
      /(===Heavyweights[^\n]*\n)[\s\S]*?(?=\n===)/,
      '$1{| class="wikitable"\n|-\n|{{flagicon|USA}}\n|{{sortname|Only|One}}\n',
    );
    expect(() => rosterFromWikitext(thin)).toThrow(/parsed 1 rows/);
  });
});

describe('mergeEntries', () => {
  test('a fighter rendered twice in one division is one entry; belts union; an id fills a name-keyed twin', () => {
    const base = { source: 'wikipedia', sport: 'ufc', grouping: 'Heavyweight', groupingKey: 'mma-heavyweight' };
    const merged = mergeEntries([
      { ...base, externalId: null, name: 'Tom Aspinall' },
      { ...base, externalId: 'Tom Aspinall', name: 'Tom Aspinall', championOf: ['UFC'] },
      { ...base, externalId: 'Ciryl Gane', name: 'Ciryl Gane' },
    ]);
    expect(merged).toHaveLength(2);
    expect(merged[0]).toMatchObject({ externalId: 'Tom Aspinall', championOf: ['UFC'] });
  });
});
