// Which follows have a working poll route, and which honestly have none.
//
// Returning a BROKEN path was the old behaviour and it cost twice: the
// follow rolled back on the 400, and the sweep spent a request and a 400ms
// delay on it every cycle thereafter.

import { Followable } from '../../data/followStore';
import { pollPathFor } from '../pollPaths';

const f = (over: Partial<Followable>): Followable => ({
  key: 'fdorg-team-64',
  label: 'Liverpool',
  sportKey: 'soccer',
  type: 'team',
  ...over,
});

describe('routes that exist', () => {
  test('an explicit pollPath always wins', () => {
    const path = 'pollTsdbLeague?leagueId=4387&season=2025-2026&sport=basketball&durationHours=2.5';
    expect(pollPathFor(f({ key: 'tsdb-team-1', pollPath: path }))).toBe(path);
  });

  test('football-data team and competition', () => {
    expect(pollPathFor(f({ key: 'fdorg-team-64', type: 'team' }))).toBe(
      'pollFdTeam?teamId=64&season=2026',
    );
    expect(
      pollPathFor(f({ key: 'fdorg-comp-PL', type: 'competition' })),
    ).toBe('pollFdCompetition?code=PL&season=2026');
  });

  test('team-pollered sports keep their team routes', () => {
    expect(
      pollPathFor(f({ key: 'mlb-team-147', sportKey: 'baseball' })),
    ).toBe('pollMlbTeam?teamId=147&season=2026');
    expect(
      pollPathFor(f({ key: 'nhl-team-BOS', sportKey: 'ice-hockey' })),
    ).toBe('pollNhlTeam?abbrev=BOS&season=20262027');
    expect(
      pollPathFor(f({ key: 'f1-series-1', sportKey: 'f1', type: 'series' })),
    ).toBe('pollF1?season=2026');
  });
});

describe('routes that honestly do not exist', () => {
  test('API-Sports follows are quarantined, not broken', () => {
    // The account is suspended: every call returns
    // `{"access":"Your account is suspended"}` at HTTP 200.
    expect(pollPathFor(f({ key: 'apisports-team-40' }))).toBeNull();
    expect(
      pollPathFor(f({ key: 'apisports-league-39', type: 'competition' })),
    ).toBeNull();
  });

  test('league-level keys for team-pollered sports have no route', () => {
    // These built pollNhlTeam?abbrev=1 (a 400) and pollMlbTeam?teamId=1
    // (an empty 200) by splitting the league id off the end of the key.
    expect(
      pollPathFor(
        f({ key: 'nhl-league-1', sportKey: 'ice-hockey', type: 'competition' }),
      ),
    ).toBeNull();
    expect(
      pollPathFor(
        f({ key: 'mlb-league-1', sportKey: 'baseball', type: 'competition' }),
      ),
    ).toBeNull();
  });

  test('an unknown sport is null rather than an invented route', () => {
    expect(
      pollPathFor(f({ key: 'tennis-player-1', sportKey: 'tennis' })),
    ).toBeNull();
  });

  test('a TEAM key in those sports still resolves — only the LEAGUE is null', () => {
    // The distinction that matters: following the Boston Bruins works,
    // following "the NHL" does not.
    expect(
      pollPathFor(f({ key: 'nhl-team-BOS', sportKey: 'ice-hockey', type: 'team' })),
    ).not.toBeNull();
  });

  test('canonical athlete follows carry no route of their own (Prompt 8)', () => {
    // Athlete follows ride the catalogue's warmth: no pollPath for
    // tennis or boxing athletes — the appearance reaches them through
    // the ordinary query path. F1 is the one deliberate exception: the
    // driver's fixtures ARE the session fixtures, and a driver-only
    // follower keeps the F1 slice registered exactly like a series
    // follower would.
    expect(
      pollPathFor(f({ key: 'athlete_000184', sportKey: 'tennis', type: 'athlete' })),
    ).toBeNull();
    expect(
      pollPathFor(f({ key: 'athlete_000201', sportKey: 'boxing', type: 'athlete' })),
    ).toBeNull();
    expect(
      pollPathFor(f({ key: 'athlete_000112', sportKey: 'f1', type: 'athlete' })),
    ).toMatch(/^pollF1\?season=\d{4}$/);
  });
});
