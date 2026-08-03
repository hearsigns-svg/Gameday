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
      tours: 'joint',
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
    expect(rows[0].tours).toBe('joint');
  });

  test('a tour-specific event says which tour, and a finished edition falls off', () => {
    const rows = shapeTournamentRows(
      [
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
      ['Winston-Salem Open', 'atp'],
      ['Korea Open', 'wta'],
    ]);
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
