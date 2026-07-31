// Season rollover must be deterministic and must never leave a league
// stuck on a finished season. These pin the calendar maths; the poll
// route then picks whichever candidate actually has upcoming fixtures.

import {
  bestSeason,
  seasonCandidates,
  seasonShapeOf,
  seasonsToTry,
} from '../season';

const at = (iso: string) => new Date(iso);

it('recognises the two season shapes', () => {
  expect(seasonShapeOf('2025-2026')).toBe('split');
  expect(seasonShapeOf('2026')).toBe('calendar');
});

describe('split seasons (NBA/NHL/rugby shape)', () => {
  it('prefers the upcoming season once the old one has finished', () => {
    // Late July 2026: 2025-26 is over, 2026-27 is what fans want.
    expect(seasonCandidates('split', at('2026-07-30T00:00:00Z'))[0]).toBe(
      '2026-2027',
    );
  });

  it('stays on the running season mid-campaign', () => {
    expect(seasonCandidates('split', at('2027-02-01T00:00:00Z'))[0]).toBe(
      '2026-2027',
    );
  });

  it('always offers the previous season as a fallback', () => {
    expect(seasonCandidates('split', at('2026-07-30T00:00:00Z'))).toEqual([
      '2026-2027',
      '2025-2026',
    ]);
  });
});

describe('calendar seasons (NFL/MLB/F1 shape)', () => {
  it('uses the current year in season', () => {
    expect(seasonCandidates('calendar', at('2026-07-30T00:00:00Z'))[0]).toBe(
      '2026',
    );
  });

  it('rolls to next year once the new one is published in November', () => {
    expect(seasonCandidates('calendar', at('2026-11-15T00:00:00Z'))[0]).toBe(
      '2027',
    );
  });
});

describe('seasonsToTry', () => {
  it('tries the persisted hint first — old follows stay cheap', () => {
    const list = seasonsToTry('2025-2026', at('2026-07-30T00:00:00Z'));
    expect(list[0]).toBe('2025-2026');
    expect(list).toContain('2026-2027'); // …but the roll is reachable
  });

  it('never repeats a season', () => {
    const list = seasonsToTry('2026-2027', at('2026-07-30T00:00:00Z'));
    expect(new Set(list).size).toBe(list.length);
  });

  it('works with no hint at all', () => {
    expect(seasonsToTry(undefined, at('2026-07-30T00:00:00Z')).length).toBeGreaterThan(0);
  });
});

describe('bestSeason', () => {
  const now = at('2026-07-30T00:00:00Z');
  const past = { startUtc: '2026-01-01T00:00:00.000Z' };
  const future = { startUtc: '2026-09-01T00:00:00.000Z' };

  it('prefers the season with upcoming fixtures over a bigger finished one', () => {
    const pick = bestSeason(
      [
        { season: '2025-2026', fixtures: [past, past, past] },
        { season: '2026-2027', fixtures: [future] },
      ],
      now,
    );
    expect(pick?.season).toBe('2026-2027');
  });

  it('does NOT fall back to a finished season', () => {
    // SUPERSEDED 2026-07-31. This previously asserted the opposite —
    // caching a completed season rather than nothing — and the cost was
    // invisible at HTTP 200: 873 dead FA Cup fixtures, 1,380 dead NBA
    // games, none of which the horizon rule will ever write to a calendar,
    // and all of which would give Stage 4's reaper a stale truth to
    // reconcile a live slice against.
    const pick = bestSeason(
      [
        { season: '2026-2027', fixtures: [] },
        { season: '2025-2026', fixtures: [past, past] },
      ],
      now,
    );
    expect(pick).toBeNull();
  });

  it('returns null when every candidate is empty', () => {
    expect(
      bestSeason([{ season: '2026', fixtures: [] }], now),
    ).toBeNull();
  });
});

// ─── A dead season is never selected (Prompt 2) ───────────────────────
//
// bestSeason used to keep a season with zero upcoming events "as a last
// resort so a genuinely off-season league still caches something". The
// cost was invisible: the FA Cup resolved to a finished 2025-26 season and
// cached 873 fixtures nobody would see, the NBA to a completed 1,380-game
// season. Both looked healthy at HTTP 200.

describe('bestSeason never selects a finished season', () => {
  const NOW = new Date('2026-07-31T12:00:00.000Z');
  const past = { startUtc: '2026-01-01T00:00:00.000Z' };
  const future = { startUtc: '2026-12-01T00:00:00.000Z' };

  test('every candidate finished → null, not a consolation prize', () => {
    const r = bestSeason(
      [
        { season: '2025-2026', fixtures: [past, past, past] },
        { season: '2026-2027', fixtures: [] },
      ],
      NOW,
    );
    expect(r).toBeNull();
  });

  test('the FA Cup case: 873 past fixtures is still null', () => {
    const fa = Array.from({ length: 873 }, () => past);
    expect(bestSeason([{ season: '2025-2026', fixtures: fa }], NOW)).toBeNull();
  });

  test('a season with even one upcoming fixture still wins', () => {
    const r = bestSeason(
      [
        { season: '2025-2026', fixtures: [past, past, past] },
        { season: '2026-2027', fixtures: [future] },
      ],
      NOW,
    );
    expect(r?.season).toBe('2026-2027');
  });

  test('between two live seasons, the one with more upcoming wins', () => {
    const r = bestSeason(
      [
        { season: 'a', fixtures: [future] },
        { season: 'b', fixtures: [future, future] },
      ],
      NOW,
    );
    expect(r?.season).toBe('b');
  });

  test('no attempts at all is still null', () => {
    expect(bestSeason([], NOW)).toBeNull();
  });
});
