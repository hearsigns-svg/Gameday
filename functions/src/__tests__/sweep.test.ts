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
