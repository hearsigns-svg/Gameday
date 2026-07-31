// football-data season resolution. One global constant said 2026 for
// twelve competitions that do not share a season — verified live
// 2026-07-31, the Champions League was on 2025 and the European
// Championship on 2024, and both 404'd.

import { resolvableSeasons } from '../fdSeasons';

const NOW = '2026-07-31T12:00:00.000Z';

describe('resolvableSeasons', () => {
  test('a live season resolves to its START year', () => {
    // /matches?season= expects the start year, not the end year.
    const [pl] = resolvableSeasons(
      [{ code: 'PL', currentSeason: { startDate: '2026-08-21', endDate: '2027-05-30' } }],
      NOW,
    );
    expect(pl).toEqual({
      code: 'PL',
      seasonYear: 2026,
      startDate: '2026-08-21',
      endDate: '2027-05-30',
    });
  });

  test('a season that has ALREADY ENDED does not resolve', () => {
    // The real CL and EC rows. They resolve to a season the provider will
    // happily serve — and every match in it has been played.
    expect(
      resolvableSeasons(
        [
          { code: 'CL', currentSeason: { startDate: '2025-09-16', endDate: '2026-05-30' } },
          { code: 'EC', currentSeason: { startDate: '2024-06-14', endDate: '2024-07-14' } },
        ],
        NOW,
      ),
    ).toEqual([]);
  });

  test('a season ending TODAY still resolves — it may still be playing', () => {
    const r = resolvableSeasons(
      [{ code: 'X', currentSeason: { startDate: '2026-01-01', endDate: '2026-07-31' } }],
      NOW,
    );
    expect(r).toHaveLength(1);
  });

  test('a season starting in the future resolves — fixtures are published early', () => {
    // The Premier League's 2026-27 fixtures exist well before August.
    const r = resolvableSeasons(
      [{ code: 'PL', currentSeason: { startDate: '2026-08-21', endDate: '2027-05-30' } }],
      NOW,
    );
    expect(r[0].seasonYear).toBe(2026);
  });

  test('a missing or null currentSeason is skipped, not guessed', () => {
    expect(
      resolvableSeasons(
        [{ code: 'A' }, { code: 'B', currentSeason: null }, { code: 'C', currentSeason: {} }],
        NOW,
      ),
    ).toEqual([]);
  });

  test('a row with no code is skipped', () => {
    expect(
      resolvableSeasons(
        [{ currentSeason: { startDate: '2026-08-21', endDate: '2027-05-30' } }],
        NOW,
      ),
    ).toEqual([]);
  });
});
