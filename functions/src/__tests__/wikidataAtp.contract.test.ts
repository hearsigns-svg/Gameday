// ATP roster contract — pinned to REAL rows captured 2026-08-03 from
// the Wikidata Query Service (the shipped enumeration query, run under
// the owner's documented-programmatic-service ruling). The trimmed
// sample keeps the shapes the parser must survive: repeated rows for
// one player (multiple DOB/career statements), missing dob, 19th-
// century players, đ-carrying labels, ITF ids present and absent.

import sample from './fixtures/wikidata-atp-sample.json';
import {
  ATP_ENUM_QUERY,
  ATP_SINGLES_NO1_QIDS,
  atpRosterEntries,
  AtpPlayer,
  isRetired,
  MIN_SELECTED,
  parseAtpPlayers,
  passesThreshold,
  plausiblyCurrent,
  rosterEntryOf,
} from '../providers/wikidataAtp';

const players = parseAtpPlayers(sample);
const byQ = new Map(players.map((p) => [p.qid, p]));

test('rows fold to one player per Q-id; repeated statements keep the widest career window', () => {
  const dj = byQ.get('Q5812')!;
  expect(dj).toMatchObject({
    label: 'Novak Djokovic',
    atpId: 'D643',
    dob: 1987,
    careerStart: 2003,
    everTop10: true,
    itfId: '100004087',
  });
  expect(dj.sitelinks).toBeGreaterThan(100);
});

test('the đ-label case that broke the validation join parses intact', () => {
  const hm = byQ.get('Q106962940')!;
  expect(hm.label).toBe('Hamad Međedović');
  expect(hm.atpId).toBe('M0JF');
  expect(passesThreshold(hm)).toBe(true); // dob 2003, 18 sitelinks
});

test('the threshold: current+notable in, 19th-century journeymen out, No. 1s always in', () => {
  // A pre-1900 player without top-10 history fails.
  const old = players.find((p) => (p.dob ?? 9999) < 1900 && !p.everTop10 && !ATP_SINGLES_NO1_QIDS.has(p.qid));
  expect(old).toBeDefined();
  expect(passesThreshold(old!)).toBe(false);
  // Agassi retired 2006 — NOT plausibly current, and his item records
  // no P1352=1 — imports via the curated singles-No. 1 arm alone.
  const agassi = byQ.get('Q7407')!;
  expect(plausiblyCurrent(agassi)).toBe(false);
  expect(passesThreshold(agassi)).toBe(true);
});

test('roster entries: Q-id primary, atp+itf extras, alphabetical directory group', () => {
  // This roster is the DIRECTORY: it places every man we are not told
  // has retired into the alphabetical group, and the live-ranking pass
  // that runs after it promotes its top 20 into the ranked one. The
  // curated world-No.-1s group and the `honours` field that existed
  // only to build it are gone.
  const dj = rosterEntryOf(byQ.get('Q5812')!);
  expect(dj).toEqual({
    source: 'wikidata',
    externalId: 'Q5812',
    name: 'Novak Djokovic',
    sport: 'tennis',
    grouping: 'More ATP players — A–Z',
    groupingKey: 'atp-directory',
    extraIdentities: [
      { source: 'atp', externalId: 'D643' },
      { source: 'itf', externalId: '100004087' },
    ],
  });
  // A retired man gets NO group — he is search-only, marked.
  const federer = rosterEntryOf(byQ.get('Q1426')!);
  expect(federer.groupingKey).toBeUndefined();
  expect(federer.careerStatus).toBe('retired');
});

// ─── Prompt 12: recorded retirement, and the men's split ──────────────
//
// NOTE ON THE FIXTURE: this capture predates the P570 (date of death)
// column added to ATP_ENUM_QUERY, so every player here parses with
// `died: undefined`. That is the honest majority case — 9 of the live
// 1,513 carry P570 — and the death arm is pinned synthetically below
// rather than by editing a real capture to say something it did not.

test('recorded retirement is right in both directions on this capture', () => {
  // Still playing: no P2032 anywhere on the item.
  for (const q of ['Q5812']) {
    const p = byQ.get(q)!;
    expect(p.careerEnd).toBeUndefined();
    expect(isRetired(p)).toBe(false);
    expect(rosterEntryOf(p).careerStatus).toBeUndefined();
  }
  // Retired: P2032 present. Federer 2022, Nadal 2024, Agassi 2006 —
  // three different eras, one rule. Retired players left browse
  // entirely (owner ruling 2026-08-04) and are reached only by search,
  // marked, with no follow offered.
  for (const [q, year] of [
    ['Q1426', 2022],
    ['Q10132', 2024],
    ['Q7407', 2006],
  ] as const) {
    const p = byQ.get(q)!;
    expect(isRetired(p)).toBe(true);
    const e = rosterEntryOf(p);
    // NO browse group at all: retired players are search-first.
    expect(e.groupingKey).toBeUndefined();
    expect(e.grouping).toBeUndefined();
    expect(e.rank).toBeUndefined();
    expect(e.careerStatus).toBe('retired');
    expect(e.careerEndYear).toBe(year);
  }
});

test('NADAL AND MURRAY: retired here even though plausiblyCurrent says otherwise', () => {
  // The import threshold hard-codes `careerEnd < 2023`, so a 2024
  // retirement reads as "plausibly current" to it. Career status must
  // NOT inherit that bug — the two predicates answer different
  // questions and this pins them apart.
  const nadal = byQ.get('Q10132')!;
  expect(nadal.careerEnd).toBe(2024);
  expect(plausiblyCurrent(nadal)).toBe(true); // the threshold's view
  expect(isRetired(nadal)).toBe(true); // the product's view
});

test('a man the roster does not group still carries his retirement', () => {
  // 1,484 of the 1,513 have no browse group at all and are reached
  // only by search — the marker is what makes those pages honest.
  const stefanki = byQ.get('Q463719')!; // Larry Stefanki, end 1988
  expect(stefanki.careerEnd).toBe(1988);
  const e = rosterEntryOf(stefanki);
  expect(e.groupingKey).toBeUndefined();
  expect(e.careerStatus).toBe('retired');
  expect(e.careerEndYear).toBe(1988);
});

test('an unmarked man lands in the alphabetical group, ungrouped only if retired', () => {
  const hm = rosterEntryOf(byQ.get('Q106962940')!); // Hamad Međedović
  expect(hm.groupingKey).toBe('atp-directory');
  expect(hm.careerStatus).toBeUndefined();
});

test('a date of death retires a player with no recorded career end, and shows no year', () => {
  const dead: AtpPlayer = {
    qid: 'Q999999',
    label: 'Deceased Player',
    atpId: 'Z001',
    dob: 1930,
    sitelinks: 4,
    everTop10: false,
    died: 2019,
  };
  expect(isRetired(dead)).toBe(true);
  const e = rosterEntryOf(dead);
  expect(e.careerStatus).toBe('retired');
  // A death year is NOT a career end and is never displayed as one.
  expect(e.careerEndYear).toBeUndefined();
});

test('absence of every retirement statement is UNKNOWN, never a claim', () => {
  // The standing invariant, applied to a career: 92% of the roster
  // carries no marker, and that must produce no assertion at all.
  const unmarked: AtpPlayer = {
    qid: 'Q888888',
    label: 'Unmarked Player',
    atpId: 'Z002',
    dob: 1988,
    sitelinks: 12,
    everTop10: false,
  };
  expect(isRetired(unmarked)).toBe(false);
  const e = rosterEntryOf(unmarked);
  expect(e.careerStatus).toBeUndefined();
  expect(e.careerEndYear).toBeUndefined();
});

test('the enumeration query asks for the death column the status rule reads', () => {
  // A rule reading a field the query never requests is dead code that
  // typechecks — the Prompt 6 lesson, in its cheapest possible form.
  expect(ATP_ENUM_QUERY).toContain('wdt:P570');
  expect(ATP_ENUM_QUERY).toContain('?death');
});

test('the curated singles-No. 1 list is exactly 29 and P1352 alone would get it wrong both ways', () => {
  expect(ATP_SINGLES_NO1_QIDS.size).toBe(29);
  // Missing from P1352=1 on Wikidata, present in the curated truth:
  for (const q of ['Q7407', 'Q10125', 'Q106113', 'Q272532']) {
    expect(ATP_SINGLES_NO1_QIDS.has(q)).toBe(true);
  }
});

test('selection bounds refuse a truncated or drifted feed', () => {
  // The trimmed sample is far below MIN_SELECTED by construction.
  expect(() => atpRosterEntries(players)).toThrow(/outside \[/);
  const synthetic: AtpPlayer[] = Array.from({ length: MIN_SELECTED }, (_, i) => ({
    qid: `Q${i}`,
    label: `Player ${i} Name`,
    atpId: `X${i}`,
    dob: 1995,
    sitelinks: 5,
    everTop10: false,
  }));
  expect(atpRosterEntries(synthetic)).toHaveLength(MIN_SELECTED);
});

test('shape rot throws — missing bindings is never an empty roster', () => {
  expect(() => parseAtpPlayers({})).toThrow(/missing results.bindings/);
  expect(() => parseAtpPlayers({ results: { bindings: [] } })).toThrow(/zero P536/);
  expect(() =>
    parseAtpPlayers({ results: { bindings: [{ atp: { value: 'X' } }] } }),
  ).toThrow(/row missing/);
});
