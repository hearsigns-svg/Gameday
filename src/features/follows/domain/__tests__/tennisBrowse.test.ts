// Tennis is three things, not one list. These pin where a tournament
// lands, because the placement rules are the whole design: the slams
// belong to neither tour, and 40 of 99 rows carry no `tours` claim at
// all and would otherwise vanish from browse.

import { tennisBrowseRows, isSlam, TournamentLike } from '../tennisBrowse';

const t = (over: Partial<TournamentLike>): TournamentLike => ({
  key: 'tennis-t-x',
  name: 'X Open',
  startUtc: '2026-09-01T00:00:00.000Z',
  endUtc: '2026-09-08T00:00:00.000Z',
  ...over,
});

const COMPS = [
  { key: 'tennis-atp', name: 'ATP Tour' },
  { key: 'tennis-wta', name: 'WTA Tour' },
];

const kindsIn = (rows: ReturnType<typeof tennisBrowseRows>, from: string, to: string) => {
  const a = rows.findIndex((r) => r.id === from);
  const b = to === '' ? rows.length : rows.findIndex((r) => r.id === to);
  return rows.slice(a, b);
};

it('builds three sections, each with its own Players entry', () => {
  const rows = tennisBrowseRows(COMPS, [t({ key: 'tennis-t-wimbledon', name: 'Wimbledon' })]);
  expect(rows.filter((r) => r.kind === 'header').map((r) => (r as { title: string }).title))
    .toEqual(['ATP — Men’s', 'WTA — Women’s', 'Grand Slams']);
  // TWO players rows, one per tour — not one shared list with a filter.
  const players = rows.filter((r) => r.kind === 'players');
  expect(players).toHaveLength(2);
  expect(players.map((r) => (r as { tour: string }).tour)).toEqual(['atp', 'wta']);
});

it('each section carries its OWN note — the tours differ now', () => {
  const rows = tennisBrowseRows(COMPS, []);
  const notes = rows.filter((r) => r.kind === 'header').map((r) => (r as { note: string }).note);
  expect(new Set(notes).size).toBe(notes.length); // all distinct
  expect(notes[1]).toMatch(/order of play/); // WTA says what only it has
});

it('a slam goes to Grand Slams and NOT to either tour', () => {
  const wimbledon = t({
    key: 'tennis-t-wimbledon',
    name: 'Wimbledon',
    tours: ['atp', 'wta'],
  });
  const rows = tennisBrowseRows(COMPS, [wimbledon]);
  const atp = kindsIn(rows, 'h-atp', 'h-wta');
  const wta = kindsIn(rows, 'h-wta', 'h-slams');
  expect(atp.some((r) => r.id.includes('wimbledon'))).toBe(false);
  expect(wta.some((r) => r.id.includes('wimbledon'))).toBe(false);
  expect(rows.some((r) => r.id === 'slam-tennis-t-wimbledon')).toBe(true);
});

it('a joint non-slam appears under BOTH tours, because it is both', () => {
  const cincy = t({ key: 'tennis-t-cincinnati-open', name: 'Cincinnati Open', tours: ['atp', 'wta'] });
  const rows = tennisBrowseRows(COMPS, [cincy]);
  expect(rows.filter((r) => r.id.endsWith('tennis-t-cincinnati-open'))).toHaveLength(2);
});

it('FALLS BACK TO COVERAGE when the tournament makes no tours claim', () => {
  // 40 of 99 live rows are exactly this: an ATP-feed event beyond the
  // WTA horizon, so the server refuses to claim a tour. Dropping them
  // would empty most of the 2027 calendar out of browse.
  const unknown = t({ key: 'tennis-t-quiet', name: 'Quiet Open', coverage: ['atp'] });
  const rows = tennisBrowseRows(COMPS, [unknown]);
  expect(kindsIn(rows, 'h-atp', 'h-wta').some((r) => r.id.endsWith('tennis-t-quiet'))).toBe(true);
  expect(kindsIn(rows, 'h-wta', '').some((r) => r.id.endsWith('tennis-t-quiet'))).toBe(false);
});

it('offers a follow-all for the majors, and a way into each', () => {
  const rows = tennisBrowseRows(COMPS, [
    t({ key: 'tennis-t-wimbledon', name: 'Wimbledon' }),
    t({ key: 'tennis-t-us-open', name: 'US Open' }),
  ]);
  const all = rows.find((r) => r.kind === 'followAll') as { keys: string[] };
  expect(all.keys).toEqual(['tennis-t-wimbledon', 'tennis-t-us-open']);
  // …and each is still individually reachable.
  expect(rows.filter((r) => r.kind === 'tournament')).toHaveLength(2);
});

it('shows no Grand Slams section when we hold none', () => {
  // A header over nothing is worse than no header.
  const rows = tennisBrowseRows(COMPS, [t({ coverage: ['atp'] })]);
  expect(rows.some((r) => r.id === 'h-slams')).toBe(false);
});

it('knows the four majors and nothing else', () => {
  expect(isSlam('tennis-t-us-open')).toBe(true);
  expect(isSlam('tennis-t-cincinnati-open')).toBe(false);
});

describe('a section nobody can reach is not a section', () => {
  const many = (n: number, tour: 'atp' | 'wta') =>
    Array.from({ length: n }, (_, i) =>
      t({ key: `tennis-t-${tour}-${i}`, name: `${tour} ${i}`, tours: [tour] }),
    );

  it('previews each tour and offers the rest', () => {
    const rows = tennisBrowseRows(COMPS, many(20, 'atp'));
    expect(rows.filter((r) => r.kind === 'tournament')).toHaveLength(6);
    const more = rows.find((r) => r.kind === 'showAll') as { hidden: number };
    expect(more.hidden).toBe(14);
  });

  it('KEEPS GRAND SLAMS REACHABLE — the whole point of collapsing', () => {
    // The live shape: 57 ATP tournaments, 38 WTA, four majors.
    const rows = tennisBrowseRows(COMPS, [
      ...many(57, 'atp'),
      ...many(38, 'wta'),
      t({ key: 'tennis-t-wimbledon', name: 'Wimbledon' }),
    ]);
    // Two sections of ten rows each (header, players, tour, six
    // tournaments, "show all"), so the majors sit at 20 — a couple of
    // screens. Uncollapsed they sat below 95 tournament rows, which is
    // reachable in the same sense that page nine of search results is.
    expect(rows.findIndex((r) => r.id === 'h-slams')).toBe(20);
    // And the guard that actually matters: the position does not grow
    // with the number of tournaments. Quadruple both tours and the
    // majors sit exactly where they did.
    const bigger = tennisBrowseRows(COMPS, [
      ...many(200, 'atp'),
      ...many(200, 'wta'),
      t({ key: 'tennis-t-wimbledon', name: 'Wimbledon' }),
    ]);
    expect(bigger.findIndex((r) => r.id === 'h-slams')).toBe(20);
  });

  it('expands only the tour asked for', () => {
    const rows = tennisBrowseRows(COMPS, [...many(20, 'atp'), ...many(20, 'wta')], new Set(['atp']));
    const atpRows = kindsIn(rows, 'h-atp', 'h-wta').filter((r) => r.kind === 'tournament');
    const wtaRows = kindsIn(rows, 'h-wta', '').filter((r) => r.kind === 'tournament');
    expect(atpRows).toHaveLength(20);
    expect(wtaRows).toHaveLength(6);
  });
});
