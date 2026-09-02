// The sweep executes routes submitted by CLIENT-WRITABLE device docs,
// so canonicalisePollPath is a security boundary: it must accept exactly
// our own poll routes and nothing else.

import {
  canonicalisePollPath,
  heldSliceKeys,
} from '../sweep';

describe('canonicalisePollPath — accepts real routes', () => {
  const real = [
    'pollFdTeam?teamId=64&season=2026',
    'pollFdCompetition?code=PL&season=2026',
    'pollMlbTeam?teamId=147&season=2026',
    'pollNhlTeam?abbrev=BOS&season=20262027',
    'pollF1?season=2026', // digit in the function name — regression pin
    'pollTsdbLeague?leagueId=4387&season=2025-2026&sport=basketball&durationHours=2.5',
    // The County Championship, at 96 hours. A single-digit durationHours
    // rule dropped this from every sweep since the day it was written.
    'pollTsdbLeague?leagueId=4458&season=2026&sport=cricket&durationHours=96',
  ];

  test.each(real)('%s', (path) => {
    expect(canonicalisePollPath(path)).toBe(path);
  });

  // The parameterless family — each has exactly one feed. Their
  // canonical form carries the trailing '?' (name + empty ordered
  // query); both spellings must stay accepted.
  test.each(['pollPbc', 'pollTennis', 'pollWtaTennis', 'pollAtpVendor', 'pollAthletics'])(
    '%s canonicalises to its ?-suffixed form',
    (name) => {
      expect(canonicalisePollPath(name)).toBe(`${name}?`);
      expect(canonicalisePollPath(`${name}?`)).toBe(`${name}?`);
    },
  );

  test('param order does not create duplicate work', () => {
    expect(canonicalisePollPath('pollFdTeam?season=2026&teamId=64')).toBe(
      'pollFdTeam?teamId=64&season=2026',
    );
  });
});

describe('canonicalisePollPath — rejects everything else', () => {
  const bad: Array<[string, string]> = [
    ['cache-busting extra param', 'pollF1?season=2026&x=1'],
    ['unknown function', 'pollEverything?season=2026'],
    ['non-poll function', 'listTeams?sport=soccer'],
    ['admin-ish name', 'mutateFixture?fixtureId=x'],
    ['missing param', 'pollFdTeam?teamId=64'],
    ['duplicate param', 'pollF1?season=2026&season=2027'],
    ['bad value type', 'pollMlbTeam?teamId=abc&season=2026'],
    ['oversized id', 'pollMlbTeam?teamId=123456789&season=2026'],
    ['duration out of range', 'pollTsdbLeague?leagueId=4458&season=2026&sport=cricket&durationHours=1000'],
    ['path traversal', 'pollF1?season=2026/../mutateFixture'],
    // QUARANTINED 2026-07-31 — these two were ACCEPTED until API-Sports'
    // account was suspended. Every call returns
    // `{"access":"Your account is suspended"}` at HTTP 200, so allowlisting
    // them spent a request and a 400ms delay per sweep on a route that
    // cannot succeed. The endpoints stay deployed; nothing routes to them.
    ['quarantined apisports team', 'pollTeam?teamId=40&season=2023'],
    ['quarantined apisports league', 'pollLeague?leagueId=39&season=2023'],
    // RETIRED 2026-09-02 (Round 4 item 7): the review-sheet route is gone
    // with the sheet; the vendor chain is pollAtpVendor. A device still
    // submitting the old path is dropped, not fetched.
    ['retired review-sheet route', 'pollSheetAtp'],
    ['absolute url', 'https://evil.example/pollF1?season=2026'],
    ['no query', 'pollF1'],
    ['empty', ''],
    ['injected separator', 'pollF1?season=2026#frag'],
  ];

  test.each(bad)('%s', (_label, path) => {
    expect(canonicalisePollPath(path)).toBeNull();
  });
});

// ─── Truncation accounting (Stage 1b item 5) ──────────────────────────
//
// `truncated` was a bare boolean: it said a ceiling was hit but never
// which competitions stopped being refreshed because of it. These pin the
// arithmetic that answers "what did this run never touch, and why".

import { summariseSkipped } from '../sweep';

const paths = (n: number): string[] =>
  Array.from({ length: n }, (_, i) => `pollF1?season=${2000 + i}`);

describe('summariseSkipped', () => {
  test('nothing skipped when everything fits and the clock holds', () => {
    const s = summariseSkipped(paths(10), 250, 10, false);
    expect(s.skippedByCap).toBe(0);
    expect(s.skippedByDeadline).toBe(0);
    expect(s.skippedPaths).toEqual([]);
    expect(s.truncationReason).toBeNull();
  });

  test('cap truncation names the paths beyond the ceiling', () => {
    const s = summariseSkipped(paths(260), 250, 250, false);
    expect(s.skippedByCap).toBe(10);
    expect(s.skippedByDeadline).toBe(0);
    expect(s.truncationReason).toBe('cap');
    // The 251st path onward — identified, not just counted.
    expect(s.skippedPaths[0]).toBe('pollF1?season=2250');
    expect(s.skippedPaths).toHaveLength(10);
  });

  test('deadline truncation names the tail the clock never reached', () => {
    // 100 paths, all within the cap, but only 40 attempted before the
    // 480s deadline broke the loop.
    const s = summariseSkipped(paths(100), 250, 40, true);
    expect(s.skippedByCap).toBe(0);
    expect(s.skippedByDeadline).toBe(60);
    expect(s.truncationReason).toBe('deadline');
    expect(s.skippedPaths[0]).toBe('pollF1?season=2040');
  });

  test('both ceilings at once are reported as both', () => {
    const s = summariseSkipped(paths(300), 250, 100, true);
    expect(s.skippedByCap).toBe(50); // 251..300
    expect(s.skippedByDeadline).toBe(150); // 101..250
    expect(s.truncationReason).toBe('cap+deadline');
    expect(s.skippedByCap + s.skippedByDeadline + 100).toBe(300);
  });

  test('the named list is capped, and says how many it named', () => {
    const s = summariseSkipped(paths(1000), 250, 250, false);
    expect(s.skippedByCap).toBe(750); // the true count is never truncated
    expect(s.skippedPaths).toHaveLength(200); // the LIST is
    expect(s.skippedPathsNamed).toBe(200); // and says so
  });

  test('a deadline hit on the very first path skips everything admitted', () => {
    const s = summariseSkipped(paths(30), 250, 0, true);
    expect(s.skippedByDeadline).toBe(30);
    expect(s.skippedByCap).toBe(0);
  });
});

// ─── Skipped paths get an identity (F10) ──────────────────────────────

import { sliceOfPollPath } from '../sweep';

describe('sliceOfPollPath', () => {
  test('every live route maps to the slice it covers', () => {
    expect(sliceOfPollPath('pollTsdbLeague?leagueId=4387&season=2025-2026&sport=basketball&durationHours=2.5'))
      .toEqual({ source: 'tsdb', sport: 'basketball', competitionId: 'tsdb-league-4387' });
    expect(sliceOfPollPath('pollFdCompetition?code=PL&season=2026'))
      .toEqual({ source: 'fdorg', sport: 'soccer', competitionId: 'fdorg-comp-PL' });
    expect(sliceOfPollPath('pollFdTeam?teamId=64&season=2026'))
      .toEqual({ source: 'fdorg', sport: 'soccer', competitionId: 'fdorg-team-64' });
    expect(sliceOfPollPath('pollMlbTeam?teamId=147&season=2026'))
      .toEqual({ source: 'mlb', sport: 'baseball', competitionId: 'mlb-team-147' });
    expect(sliceOfPollPath('pollNhlTeam?abbrev=BOS&season=20262027'))
      .toEqual({ source: 'nhl', sport: 'ice-hockey', competitionId: 'nhl-team-BOS' });
    expect(sliceOfPollPath('pollF1?season=2026'))
      .toEqual({ source: 'f1', sport: 'f1', competitionId: 'f1-series-1' });
    // The men's matches (Round 4 item 7): source is the vendor, the slice
    // is its own — its APPEARANCES land under tennis-atp-appearances,
    // which alerts.ts reads as this slice's yield.
    expect(sliceOfPollPath('pollAtpVendor?'))
      .toEqual({ source: 'tennisapi1', sport: 'tennis', competitionId: 'tennis-atp-vendor' });
    expect(sliceOfPollPath('pollSheetAtp?')).toBeNull();
  });

  test('an unknown route has no slice, so it records nothing', () => {
    expect(sliceOfPollPath('pollEverything?season=2026')).toBeNull();
    expect(sliceOfPollPath('pollTeam?teamId=40&season=2023')).toBeNull();
  });
});

// Round 4 item 5: a disabled (held) catalogue row resolves its alerts
// even though the sweep no longer demands it.
describe('heldSliceKeys', () => {
  test('maps disabled pollable rows to their slice keys; enabled and rank-only rows are not held', () => {
    const held = heldSliceKeys([
      { enabled: false, pollPath: 'pollTsdbLeague?leagueId=4460&season=2026&sport=cricket&durationHours=4' },
      { enabled: false, pollPath: 'pollTsdbLeague?leagueId=5103&season=2026&sport=cricket&durationHours=4' },
      { enabled: true, pollPath: 'pollTsdbLeague?leagueId=4445&season=2026&sport=boxing&durationHours=3' },
      { enabled: false, pollPath: '', rankOnly: true },
    ]);
    expect([...held].sort()).toEqual(['tsdb|tsdb-league-4460', 'tsdb|tsdb-league-5103']);
  });
});
