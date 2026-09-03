// Tournaments as followable competitions — the canonical key, the
// evidenced alias table, and the browse-row shaping with joint events
// merged. The join is a NAME+DATES heuristic, stated plainly (no
// shared id exists between the ICS and the WTA API); these tests pin
// the measured cases from the live store (2026-08-03).

import {
  canonicalDisplayName,
  shapeTournamentRows,
  tournamentKey,
  TournamentSource,
} from '../tennisTournaments';

const NOW = '2026-08-03T00:00:00.000Z';

const src = (over: Partial<TournamentSource>): TournamentSource => ({
  competitionId: 'tennis-atp',
  title: 'US Open',
  startUtc: '2026-08-30T00:00:00.000Z',
  durationHours: 15 * 24,
  status: 'scheduled',
  ...over,
});

describe('tournamentKey — year-agnostic, alias-aware', () => {
  test('exact normalised titles join across feeds and case', () => {
    // Toronto: "presented"/"Presented" folds (live evidence).
    expect(tournamentKey('National Bank Open presented by Rogers')).toBe(
      tournamentKey('National Bank Open Presented by Rogers'),
    );
    expect(tournamentKey('US Open')).toBe('tennis-t-us-open');
  });

  test('THE DC CASE: sponsor variants join via the curated alias, never fuzzy matching', () => {
    expect(tournamentKey('Mubadala DC Open')).toBe('tennis-t-dc-open');
    expect(tournamentKey('Mubadala Citi DC Open')).toBe('tennis-t-dc-open');
    expect(canonicalDisplayName('Mubadala Citi DC Open')).toBe('DC Open');
  });

  test('different tournaments never fold', () => {
    expect(tournamentKey('Cincinnati Open')).not.toBe(
      tournamentKey('China Open'),
    );
  });
});

describe('shapeTournamentRows', () => {
  test('a joint event is ONE row carrying both tours', () => {
    const rows = shapeTournamentRows(
      [
        src({ competitionId: 'tennis-atp' }),
        src({ competitionId: 'tennis-wta', durationHours: 14 * 24 }),
      ],
      NOW,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      key: 'tennis-t-us-open',
      tours: ['atp', 'wta'],
      coverage: ['atp', 'wta'],
      startUtc: '2026-08-30T00:00:00.000Z',
    });
    // The widest same-edition span wins the row's end.
    expect(rows[0].endUtc).toBe('2026-09-14T00:00:00.000Z');
  });

  test('editions collapse to the SOONEST — never two US Opens', () => {
    const rows = shapeTournamentRows(
      [
        src({ startUtc: '2027-08-29T00:00:00.000Z' }), // 2027 first
        src({ startUtc: '2026-08-30T00:00:00.000Z' }),
        src({
          competitionId: 'tennis-wta',
          startUtc: '2026-08-30T00:00:00.000Z',
        }),
      ],
      NOW,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].startUtc).toBe('2026-08-30T00:00:00.000Z');
    expect(rows[0].tours).toEqual(['atp', 'wta']);
  });

  test('a tour-specific event says which tour, and a finished edition falls off', () => {
    const rows = shapeTournamentRows(
      [
        // Both feeds publish beyond every row below, so a single-tour
        // observation here is a real observation (the horizon rule).
        src({ title: 'Next Year Cup', startUtc: '2027-06-01T00:00:00.000Z' }),
        src({
          competitionId: 'tennis-wta',
          title: 'Next Year Cup',
          startUtc: '2027-06-01T00:00:00.000Z',
        }),
        src({
          title: 'Winston-Salem Open',
          startUtc: '2026-08-23T00:00:00.000Z',
          durationHours: 7 * 24,
        }),
        src({
          competitionId: 'tennis-wta',
          title: 'Korea Open',
          startUtc: '2026-09-21T00:00:00.000Z',
          durationHours: 7 * 24,
        }),
        src({
          title: 'Mubadala Citi DC Open',
          startUtc: '2026-07-26T00:00:00.000Z', // ended before NOW
          durationHours: 7 * 24,
        }),
      ],
      NOW,
    );
    expect(rows.map((r) => [r.name, r.tours])).toEqual([
      ['Winston-Salem Open', ['atp']],
      ['Korea Open', ['wta']],
      ['Next Year Cup', ['atp', 'wta']],
    ]);
  });

  // ── Which draws does it have? A feed's silence is not an answer. ──

  test('WIMBLEDON IS NOT A MEN\'S EVENT — the slams are joint by definition', () => {
    // Live, 2026-08-05: the only future Wimbledon doc anywhere in the
    // store is the ATP ICS's 2027 edition, because the WTA API's
    // rolling window stops in November 2026. The row browsed as
    // "28 Jun – 11 Jul · ATP". Same for Roland Garros and Melbourne.
    const rows = shapeTournamentRows(
      [
        src({ title: 'Wimbledon', startUtc: '2027-06-28T00:00:00.000Z' }),
        src({ title: 'Roland Garros', startUtc: '2027-05-23T00:00:00.000Z' }),
        src({
          title: 'Australian Open',
          startUtc: '2027-01-17T00:00:00.000Z',
        }),
      ],
      NOW,
    );
    // The tournament IS joint; what we HOLD is the men's banner alone.
    // Two facts, two fields, never merged.
    expect(rows.map((r) => r.tours)).toEqual([
      ['atp', 'wta'],
      ['atp', 'wta'],
      ['atp', 'wta'],
    ]);
    expect(rows.map((r) => r.coverage)).toEqual([['atp'], ['atp'], ['atp']]);
  });

  test('a PAST joint edition proves the tournament is joint', () => {
    // Draws do not change year to year. The 2025 China Open ran in both
    // feeds; the 2026 edition has only reached the ATP ICS so far.
    const rows = shapeTournamentRows(
      [
        src({
          title: 'China Open',
          startUtc: '2025-09-25T00:00:00.000Z',
          durationHours: 10 * 24,
        }),
        src({
          competitionId: 'tennis-wta',
          title: 'China Open',
          startUtc: '2025-09-25T00:00:00.000Z',
          durationHours: 10 * 24,
        }),
        src({
          title: 'China Open',
          startUtc: '2026-09-30T00:00:00.000Z',
          durationHours: 10 * 24,
        }),
      ],
      NOW,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].startUtc).toBe('2026-09-30T00:00:00.000Z');
    expect(rows[0].tours).toEqual(['atp', 'wta']);
    // …but only the ATP feed has reached the 2026 edition.
    expect(rows[0].coverage).toEqual(['atp']);
  });

  test('BEYOND A FEED\'S HORIZON, SILENCE IS NOT AN ANSWER — no claim at all', () => {
    // A 2027 ATP-only 250 with the WTA feed stopping in 2026: we have
    // not observed the women's tour looking that far, so the row says
    // nothing about tours rather than asserting men's-only.
    const rows = shapeTournamentRows(
      [
        src({
          competitionId: 'tennis-wta',
          title: 'Korea Open',
          startUtc: '2026-09-21T00:00:00.000Z',
          durationHours: 7 * 24,
        }),
        src({
          title: 'Winston-Salem Open',
          startUtc: '2027-08-16T00:00:00.000Z',
          durationHours: 7 * 24,
        }),
      ],
      NOW,
    );
    const ws = rows.find((r) => r.name === 'Winston-Salem Open');
    expect(ws).toBeDefined();
    expect(ws).not.toHaveProperty('tours');
    // Inside both horizons the claim still gets made.
    expect(rows.find((r) => r.name === 'Korea Open')?.tours).toEqual(['wta']);
  });

  test('an IN-PROGRESS tournament stays listed until its span ends', () => {
    const rows = shapeTournamentRows(
      [
        src({
          title: 'Cincinnati Open',
          startUtc: '2026-07-30T00:00:00.000Z',
          durationHours: 11 * 24, // ends Aug 10 — live at NOW Aug 3
        }),
      ],
      NOW,
    );
    expect(rows).toHaveLength(1);
  });

  test('cancelled docs contribute nothing', () => {
    expect(
      shapeTournamentRows([src({ status: 'cancelled' })], NOW),
    ).toHaveLength(0);
  });
});

describe('sex-scoped tournament keys (Round 7 item 8)', () => {
  const { tournamentKeysFor, sexedTournamentKey } = require('../tennisTournaments');
  test('a tour parent carries the bare joint key AND its own draw key', () => {
    expect(tournamentKeysFor('US Open', 'atp')).toEqual(['tennis-t-us-open', 'tennis-t-us-open-m']);
    expect(tournamentKeysFor('US Open', 'wta')).toEqual(['tennis-t-us-open', 'tennis-t-us-open-w']);
    // Aliases resolve BEFORE the suffix, so both feeds' variants share a base.
    expect(tournamentKeysFor('Mubadala Citi DC Open', 'atp')).toEqual(['tennis-t-dc-open', 'tennis-t-dc-open-m']);
    expect(sexedTournamentKey('tennis-t-wimbledon', 'wta')).toBe('tennis-t-wimbledon-w');
  });
  test('a title that normalises to nothing stamps no key at all', () => {
    expect(tournamentKeysFor('—', 'atp')).toEqual([]);
  });
});
