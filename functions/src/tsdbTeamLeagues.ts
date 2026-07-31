// The ONE table of TSDB leagues with team-level follows: drives the
// listTeams directory route, the federated search filter, and the
// pollPath a search/browse-created team follow carries. pollPath
// strings are pinned byte-for-byte to client sportsConfig by
// functions/__tests__/searchRoutes.test.ts — a season roll that
// touches only one side fails CI.
//
// Every league here was verified live (2026-07-29) to return a full
// team list with badges from search_all_teams.php. tsdbName must match
// TSDB's strLeague EXACTLY — the teams endpoint queries by name.

export interface TsdbTeamLeague {
  tsdbName: string; // TSDB's exact league name (search_all_teams input)
  cacheKey: string; // teamDirectory doc id
  sportKey: string; // client sportsConfig key
  label: string; // display label
  pollPath: string;
}

export const TSDB_TEAM_LEAGUES: Record<string, TsdbTeamLeague> = {
  // ── Soccer leagues football-data's free tier structurally cannot cover.
  // Their clubs had no canonical entity at ALL: 1,078 unresolved
  // participant strings in the coverage audit were dominated by these
  // three, because the alias table is built from team directories and
  // there were none. Seeding them gives every club an identity AND turns
  // the browse rows from follow-only into team drill-downs.
  '4396': {
    tsdbName: 'English League 1',
    cacheKey: 'soccer-4396',
    sportKey: 'soccer',
    label: 'League One',
    pollPath:
      'pollTsdbLeague?leagueId=4396&season=2026-2027&sport=soccer&durationHours=2',
  },
  '4397': {
    tsdbName: 'English League 2',
    cacheKey: 'soccer-4397',
    sportKey: 'soccer',
    label: 'League Two',
    pollPath:
      'pollTsdbLeague?leagueId=4397&season=2026-2027&sport=soccer&durationHours=2',
  },
  '4330': {
    tsdbName: 'Scottish Premier League',
    cacheKey: 'soccer-4330',
    sportKey: 'soccer',
    label: 'Scottish Premiership',
    pollPath:
      'pollTsdbLeague?leagueId=4330&season=2026-2027&sport=soccer&durationHours=2',
  },
  '4387': {
    tsdbName: 'NBA',
    cacheKey: 'basketball-nba',
    sportKey: 'basketball',
    label: 'NBA',
    pollPath:
      'pollTsdbLeague?leagueId=4387&season=2025-2026&sport=basketball&durationHours=2.5',
  },
  '4516': {
    tsdbName: 'WNBA',
    cacheKey: 'basketball-4516',
    sportKey: 'basketball',
    label: 'WNBA',
    pollPath:
      'pollTsdbLeague?leagueId=4516&season=2026&sport=basketball&durationHours=2.5',
  },
  '4391': {
    tsdbName: 'NFL',
    cacheKey: 'nfl-nfl',
    sportKey: 'nfl',
    label: 'NFL',
    pollPath:
      'pollTsdbLeague?leagueId=4391&season=2026&sport=nfl&durationHours=3',
  },
  '4460': {
    tsdbName: 'Indian Premier League',
    cacheKey: 'cricket-ipl',
    sportKey: 'cricket',
    label: 'IPL',
    pollPath:
      'pollTsdbLeague?leagueId=4460&season=2026&sport=cricket&durationHours=4',
  },
  '4801': {
    tsdbName: 'One Day International Series',
    cacheKey: 'cricket-4801',
    sportKey: 'cricket',
    label: 'ODI Internationals',
    pollPath:
      'pollTsdbLeague?leagueId=4801&season=2026&sport=cricket&durationHours=8',
  },
  '4979': {
    tsdbName: 'Twenty20 International Series',
    cacheKey: 'cricket-4979',
    sportKey: 'cricket',
    label: 'T20 Internationals',
    pollPath:
      'pollTsdbLeague?leagueId=4979&season=2026&sport=cricket&durationHours=4',
  },
  '4414': {
    tsdbName: 'English Prem Rugby',
    cacheKey: 'rugby-4414',
    sportKey: 'rugby',
    label: 'Premiership Rugby',
    pollPath:
      'pollTsdbLeague?leagueId=4414&season=2025-2026&sport=rugby&durationHours=2',
  },
  '4415': {
    tsdbName: 'English Rugby League Super League',
    cacheKey: 'rugby-4415',
    sportKey: 'rugby',
    label: 'Super League',
    pollPath:
      'pollTsdbLeague?leagueId=4415&season=2026&sport=rugby&durationHours=2',
  },
  '4416': {
    tsdbName: 'Australian National Rugby League',
    cacheKey: 'rugby-4416',
    sportKey: 'rugby',
    label: 'NRL',
    pollPath:
      'pollTsdbLeague?leagueId=4416&season=2026&sport=rugby&durationHours=2',
  },
  '4430': {
    tsdbName: 'French Top 14',
    cacheKey: 'rugby-4430',
    sportKey: 'rugby',
    label: 'Top 14',
    pollPath:
      'pollTsdbLeague?leagueId=4430&season=2025-2026&sport=rugby&durationHours=2',
  },
  '4550': {
    tsdbName: 'European Rugby Champions Cup',
    cacheKey: 'rugby-4550',
    sportKey: 'rugby',
    label: 'Champions Cup',
    pollPath:
      'pollTsdbLeague?leagueId=4550&season=2025-2026&sport=rugby&durationHours=2',
  },
  '4714': {
    tsdbName: 'Six Nations Championship',
    cacheKey: 'rugby-4714',
    sportKey: 'rugby',
    label: 'Six Nations',
    pollPath:
      'pollTsdbLeague?leagueId=4714&season=2027&sport=rugby&durationHours=2',
  },
  '4920': {
    tsdbName: 'Russian KHL',
    cacheKey: 'ice-hockey-4920',
    sportKey: 'ice-hockey',
    label: 'KHL',
    pollPath:
      'pollTsdbLeague?leagueId=4920&season=2026-2027&sport=ice-hockey&durationHours=2.5',
  },
  '4931': {
    tsdbName: 'Finnish Liiga',
    cacheKey: 'ice-hockey-4931',
    sportKey: 'ice-hockey',
    label: 'Liiga',
    pollPath:
      'pollTsdbLeague?leagueId=4931&season=2026-2027&sport=ice-hockey&durationHours=2.5',
  },
  '4419': {
    tsdbName: 'Swedish Hockey League',
    cacheKey: 'ice-hockey-4419',
    sportKey: 'ice-hockey',
    label: 'SHL',
    pollPath:
      'pollTsdbLeague?leagueId=4419&season=2026-2027&sport=ice-hockey&durationHours=2.5',
  },
  '4591': {
    tsdbName: 'Nippon Baseball League',
    cacheKey: 'baseball-4591',
    sportKey: 'baseball',
    label: 'NPB',
    pollPath:
      'pollTsdbLeague?leagueId=4591&season=2026&sport=baseball&durationHours=3',
  },
  '4830': {
    tsdbName: 'Korean KBO League',
    cacheKey: 'baseball-4830',
    sportKey: 'baseball',
    label: 'KBO League',
    pollPath:
      'pollTsdbLeague?leagueId=4830&season=2026&sport=baseball&durationHours=3',
  },
};
