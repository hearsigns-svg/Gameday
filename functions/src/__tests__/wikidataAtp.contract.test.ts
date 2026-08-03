// ATP roster contract — pinned to REAL rows captured 2026-08-03 from
// the Wikidata Query Service (the shipped enumeration query, run under
// the owner's documented-programmatic-service ruling). The trimmed
// sample keeps the shapes the parser must survive: repeated rows for
// one player (multiple DOB/career statements), missing dob, 19th-
// century players, đ-carrying labels, ITF ids present and absent.

import sample from './fixtures/wikidata-atp-sample.json';
import {
  ATP_SINGLES_NO1_QIDS,
  atpRosterEntries,
  AtpPlayer,
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

test('roster entries: Q-id primary, atp+itf extras, curated No. 1s get the ONLY browse group', () => {
  const dj = rosterEntryOf(byQ.get('Q5812')!);
  expect(dj).toEqual({
    source: 'wikidata',
    externalId: 'Q5812',
    name: 'Novak Djokovic',
    sport: 'tennis',
    grouping: 'Former world No. 1s',
    groupingKey: 'atp-no1',
    honours: ['former-no1'],
    extraIdentities: [
      { source: 'atp', externalId: 'D643' },
      { source: 'itf', externalId: '100004087' },
    ],
  });
  const hm = rosterEntryOf(byQ.get('Q106962940')!);
  expect(hm.grouping).toBeUndefined(); // search-first, no arbitrary group
  expect(hm.groupingKey).toBeUndefined();
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
