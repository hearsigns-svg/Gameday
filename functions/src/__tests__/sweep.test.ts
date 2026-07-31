// The sweep executes routes submitted by CLIENT-WRITABLE device docs,
// so canonicalisePollPath is a security boundary: it must accept exactly
// our own poll routes and nothing else.

import { canonicalisePollPath } from '../sweep';

describe('canonicalisePollPath — accepts real routes', () => {
  const real = [
    'pollFdTeam?teamId=64&season=2026',
    'pollFdCompetition?code=PL&season=2026',
    'pollMlbTeam?teamId=147&season=2026',
    'pollNhlTeam?abbrev=BOS&season=20262027',
    'pollF1?season=2026', // digit in the function name — regression pin
    'pollTsdbLeague?leagueId=4387&season=2025-2026&sport=basketball&durationHours=2.5',
    'pollTeam?teamId=40&season=2023',
    'pollLeague?leagueId=39&season=2023',
  ];

  test.each(real)('%s', (path) => {
    expect(canonicalisePollPath(path)).toBe(path);
  });

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
    ['oversized id', 'pollTeam?teamId=123456789&season=2026'],
    ['path traversal', 'pollF1?season=2026/../mutateFixture'],
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
