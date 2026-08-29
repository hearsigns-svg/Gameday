// Season-roll drift guard: the server team-league table must carry the
// SAME pollPath strings the client attaches when following from browse.
// If a season roll touches only one side, this fails.
//
// Soccer is the exception, and deliberately so: its competition list is
// SERVER-supplied (listSoccerLeagues, with football-data seasons resolved
// per competition at request time), not client config. So soccer entries
// are checked against the server's own generator instead — the same drift
// risk, a different pair of sides.

import { TSDB_TEAM_LEAGUES } from '../src/search';
import { CATALOGUE_SEED } from '../src/catalogue';
import { listSoccerLeagues } from '../src/directory';
import { SPORTS } from '../../src/features/follows/domain/sportsConfig';

// STAGED entries (tsdbTeamLeagues.ts) are seeded ahead of their client
// rows — their league's catalogue row ships disabled, so there is
// deliberately nothing client-side to pin them to yet. They are
// excluded here and pinned by their own coherence test below.
const soccerEntries = Object.entries(TSDB_TEAM_LEAGUES).filter(
  ([, e]) => e.sportKey === 'soccer' && !e.staged,
);
const nonSoccerEntries = Object.entries(TSDB_TEAM_LEAGUES).filter(
  ([, e]) => e.sportKey !== 'soccer' && !e.staged,
);
const stagedEntries = Object.entries(TSDB_TEAM_LEAGUES).filter(
  ([, e]) => e.staged,
);

it('team-league pollPaths match client sportsConfig exactly', () => {
  const clientPaths = new Map<string, string>();
  for (const sport of SPORTS) {
    for (const comp of sport.staticCompetitions ?? []) {
      if (comp.teamPollPath && comp.key.startsWith('tsdb-league-')) {
        clientPaths.set(comp.key.replace('tsdb-league-', ''), comp.teamPollPath);
      }
    }
  }
  for (const [leagueId, entry] of nonSoccerEntries) {
    expect(clientPaths.get(leagueId)).toBe(entry.pollPath);
  }
  // And the table covers every client tsdb team-followable league.
  expect(nonSoccerEntries.map(([id]) => id).sort()).toEqual(
    [...clientPaths.keys()].sort(),
  );
});

it('soccer team-league pollPaths match what listSoccerLeagues serves', () => {
  // The seeded soccer directories (League One, League Two, the Scottish
  // Premiership) exist so those clubs have a canonical identity at all —
  // football-data's free tier structurally cannot cover them. Their browse
  // rows come from the server, so the server is what must agree.
  expect(soccerEntries.length).toBeGreaterThan(0);
  const served = new Map(
    listSoccerLeagues(new Map())
      .filter((l) => l.key.startsWith('tsdb-league-'))
      .map((l) => [l.key.replace('tsdb-league-', ''), l]),
  );
  for (const [leagueId, entry] of soccerEntries) {
    const row = served.get(leagueId);
    expect(row).toBeDefined();
    // The league poll and the team poll are the same call — TheSportsDB
    // has no per-team route, so following a club polls its league.
    expect(row!.pollPath).toBe(entry.pollPath);
    expect(row!.teamPollPath).toBe(entry.pollPath);
    // A seeded directory means the row is drillable, not follow-only.
    expect((row as { followOnly?: boolean }).followOnly).toBeUndefined();
  }
});

it('a STAGED table entry stays coherent: catalogue-disabled, no client row', () => {
  // The stage is one state, pinned from both sides. While staged, the
  // league's catalogue row must be DISABLED (a staged entry beside an
  // enabled row would mean the sweep polls a league search still hides)
  // and no client surface may offer it. The flip that enables the
  // catalogue row therefore FAILS HERE until it also removes `staged`
  // and lands the client browse row — the whole checklist, or a red CI.
  const clientKeys = new Set(
    SPORTS.flatMap((s) => (s.staticCompetitions ?? []).map((c) => c.key)),
  );
  for (const [leagueId, entry] of stagedEntries) {
    const seed = CATALOGUE_SEED.find(
      (e) => e.competitionId === `tsdb-league-${leagueId}`,
    );
    expect({ leagueId, seeded: !!seed, enabled: seed?.enabled }).toEqual({
      leagueId,
      seeded: true,
      enabled: false,
    });
    expect(clientKeys.has(`tsdb-league-${leagueId}`)).toBe(false);
    // The route itself must already be valid — staging defers the
    // client surface, never the correctness of what will be polled.
    expect(entry.pollPath).toBe(seed!.pollPath);
  }
});
