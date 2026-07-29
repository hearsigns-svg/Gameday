// Season-roll drift guard: the server search table must carry the SAME
// pollPath strings the client attaches when following from browse.
// If a season roll touches only one side, this fails.

import { TSDB_TEAM_LEAGUES } from '../src/search';
import { SPORTS } from '../../src/features/follows/domain/sportsConfig';

it('search pollPaths match client sportsConfig teamPollPaths exactly', () => {
  const clientPaths = new Map<string, string>();
  for (const sport of SPORTS) {
    for (const comp of sport.staticCompetitions ?? []) {
      if (comp.teamPollPath && comp.key.startsWith('tsdb-league-')) {
        clientPaths.set(comp.key.replace('tsdb-league-', ''), comp.teamPollPath);
      }
    }
  }
  for (const [leagueId, entry] of Object.entries(TSDB_TEAM_LEAGUES)) {
    expect(clientPaths.get(leagueId)).toBe(entry.pollPath);
  }
  // And the table covers every client tsdb team-followable league.
  expect(Object.keys(TSDB_TEAM_LEAGUES).sort()).toEqual(
    [...clientPaths.keys()].sort(),
  );
});
