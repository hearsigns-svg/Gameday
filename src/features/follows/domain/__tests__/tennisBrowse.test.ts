// Tennis is two sections of four rows, not one list. These pin where a
// tournament lands, because the placement rules are the whole design:
// the majors belong to BOTH tours, and 40 of 99 rows carry no `tours`
// claim at all and would otherwise vanish from browse.

import {
  tennisBrowseRows,
  tournamentsFor,
  isSlam,
  TournamentLike,
} from '../tennisBrowse';

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

const WIMBLEDON = t({ key: 'tennis-t-wimbledon', name: 'Wimbledon', tours: ['atp', 'wta'] });
const CINCY = t({ key: 'tennis-t-cincinnati-open', name: 'Cincinnati Open', tours: ['atp', 'wta'] });
const WARSAW = t({ key: 'tennis-t-warsaw', name: 'Warsaw Open', tours: ['wta'] });
const QUIET = t({ key: 'tennis-t-quiet', name: 'Quiet Open', coverage: ['atp'] });

describe('two sections, four rows each', () => {
  const rows = tennisBrowseRows(COMPS, [WIMBLEDON, CINCY, WARSAW, QUIET]);

  it('is exactly the shape the owner asked for', () => {
    expect(rows.map((r) => `${r.kind}:${r.id}`)).toEqual([
      'header:h-atp',
      'players:p-atp',
      'competition:c-tennis-atp',
      'slams:slams-atp',
      'others:others-atp',
      'header:h-wta',
      'players:p-wta',
      'competition:c-tennis-wta',
      'slams:slams-wta',
      'others:others-wta',
    ]);
  });

  it('NO INLINE TOURNAMENTS — the list lives behind its own entry', () => {
    // The ninety-five-rows problem, answered by structure rather than by
    // hiding rows six at a time.
    expect(rows).toHaveLength(10);
  });

  it('each section carries its OWN note — the tours differ now', () => {
    const notes = rows
      .filter((r) => r.kind === 'header')
      .map((r) => (r as { note: string }).note);
    expect(new Set(notes).size).toBe(notes.length);
    expect(notes[1]).toMatch(/order of play/); // WTA says what only it has
  });

  it('two Players rows, one per tour, not one shared list', () => {
    const players = rows.filter((r) => r.kind === 'players');
    expect(players.map((r) => (r as { tour: string }).tour)).toEqual(['atp', 'wta']);
  });

  it('counts what is behind each entry', () => {
    const atpOthers = rows.find((r) => r.id === 'others-atp') as { count: number };
    const wtaOthers = rows.find((r) => r.id === 'others-wta') as { count: number };
    // Men: Cincinnati + Quiet. Women: Cincinnati + Warsaw.
    expect(atpOthers.count).toBe(2);
    expect(wtaOthers.count).toBe(2);
  });
});

describe('placement', () => {
  it('THE MAJORS ARE IN BOTH SECTIONS — both tours play them', () => {
    // Not a duplicate: a follow from a section is scoped to that tour,
    // so these are two different subscriptions to one fortnight.
    expect(tournamentsFor([WIMBLEDON], 'atp', 'slams')).toHaveLength(1);
    expect(tournamentsFor([WIMBLEDON], 'wta', 'slams')).toHaveLength(1);
  });

  it('a slam never appears under Other tournaments', () => {
    expect(tournamentsFor([WIMBLEDON, CINCY], 'atp', 'others')).toEqual([CINCY]);
  });

  it("'all' is the full tour list, majors leading (Stage 6 — the expanded card's Tournaments)", () => {
    expect(tournamentsFor([CINCY, WIMBLEDON], 'atp', 'all')).toEqual([
      WIMBLEDON,
      CINCY,
    ]);
    // A single-tour event still only reaches its own tour's full list.
    expect(tournamentsFor([WIMBLEDON, WARSAW], 'atp', 'all')).toEqual([WIMBLEDON]);
  });

  it('a single-tour event appears under its tour only', () => {
    expect(tournamentsFor([WARSAW], 'atp', 'others')).toEqual([]);
    expect(tournamentsFor([WARSAW], 'wta', 'others')).toEqual([WARSAW]);
  });

  it('FALLS BACK TO COVERAGE when no tours claim is made', () => {
    // 40 of 99 live rows: ATP-feed events beyond the WTA horizon. Every
    // one has coverage ['atp'], so they land under the MEN'S Other
    // tournaments and nowhere else — until the women's window reaches
    // them and the server can claim both.
    expect(tournamentsFor([QUIET], 'atp', 'others')).toEqual([QUIET]);
    expect(tournamentsFor([QUIET], 'wta', 'others')).toEqual([]);
  });

  it('omits an entry we hold nothing for', () => {
    // A row promising a list, opening on nothing, is worse than no row.
    const rows = tennisBrowseRows(COMPS, [WARSAW]);
    expect(rows.some((r) => r.kind === 'slams')).toBe(false);
    expect(rows.some((r) => r.id === 'others-atp')).toBe(false);
    expect(rows.some((r) => r.id === 'others-wta')).toBe(true);
  });

  it('knows the four majors and nothing else', () => {
    expect(isSlam('tennis-t-us-open')).toBe(true);
    expect(isSlam('tennis-t-cincinnati-open')).toBe(false);
  });
});

describe('one follow per draw (Round 7 item 8)', () => {
  const { sexedTournamentRows, tournamentFollowKey, tournamentFollowLabel, tournamentDraws } = require('../tennisBrowse');
  const usOpen = { key: 'tennis-t-us-open', name: 'US Open', tours: ['atp', 'wta'], coverage: ['atp', 'wta'], startUtc: '2026-08-30T00:00:00.000Z', endUtc: '2026-09-14T00:00:00.000Z' };
  const mensOnly = { key: 'tennis-t-stockholm-open', name: 'Stockholm Open', coverage: ['atp'], startUtc: '2026-10-12T00:00:00.000Z', endUtc: '2026-10-19T00:00:00.000Z' };
  test('a joint tournament offers two follows, a single-tour one offers one', () => {
    expect(tournamentDraws(usOpen)).toEqual(['atp', 'wta']);
    expect(tournamentDraws(mensOnly)).toEqual(['atp']);
    expect(sexedTournamentRows(usOpen).map((r: { key: string }) => r.key)).toEqual(['tennis-t-us-open-m', 'tennis-t-us-open-w']);
    expect(sexedTournamentRows(mensOnly).map((r: { key: string }) => r.key)).toEqual(['tennis-t-stockholm-open-m']);
  });
  test('the follow key is the tour\'s draw; the label carries the sex, the name stays bare', () => {
    expect(tournamentFollowKey('tennis-t-wimbledon', 'wta')).toBe('tennis-t-wimbledon-w');
    expect(tournamentFollowLabel('Wimbledon', 'atp')).toBe('Wimbledon — Men’s');
    const rows = sexedTournamentRows(usOpen);
    expect(rows[1]).toMatchObject({ tour: 'wta', name: 'US Open', label: 'US Open — Women’s' });
  });
});
