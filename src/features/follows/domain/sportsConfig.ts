// Declarative per-sport configuration — the follow taxonomy as data.
// Adding a sport is a config entry + a provider adapter, never new UI.

export type FollowableType = 'team' | 'competition' | 'athlete' | 'series';

export type BrowseLevelKind = 'competition' | 'team' | 'athlete';

export interface StaticCompetition {
  id: number | string;
  name: string;
  country: string;
  key: string;
  followOnly?: boolean; // no team drill-down
  pollPath?: string; // functions path polled when this follow syncs
  teamPollPath?: string; // path attached to team-follows made inside it
}

export interface SportConfig {
  key: string;
  label: string;
  glyph: string; // small identity accent only, per design system
  enabled: boolean; // false = data not yet live (M5 sport expansion)
  // Ordered drill-down levels, e.g. soccer: competitions → teams.
  browse: BrowseLevelKind[];
  // Which levels can be followed directly (competition rows get a
  // Follow button when 'competition' is listed here).
  followTypes: FollowableType[];
  // Single-league sports skip the server round-trip for the competition
  // level; the entry is config, not data.
  staticCompetitions?: StaticCompetition[];
  // Series sports (F1, UFC): the one followable, followed straight from
  // the sport row.
  seriesFollowable?: { key: string; label: string; pollPath?: string };
}

export const SPORTS: SportConfig[] = [
  {
    key: 'soccer',
    label: 'Soccer',
    glyph: '⚽',
    enabled: true,
    browse: ['competition', 'team'],
    followTypes: ['team', 'competition'],
  },
  {
    key: 'cricket',
    label: 'Cricket',
    glyph: '🏏',
    enabled: true,
    browse: ['competition', 'team'],
    followTypes: ['team', 'competition'],
    staticCompetitions: [
      {
        id: '4460',
        name: 'Indian Premier League',
        country: 'India',
        key: 'tsdb-league-4460',
        pollPath:
          'pollTsdbLeague?leagueId=4460&season=2026&sport=cricket&durationHours=4',
        teamPollPath:
          'pollTsdbLeague?leagueId=4460&season=2026&sport=cricket&durationHours=4',
      },
      {
        id: '4801',
        name: 'ODI Internationals',
        country: 'International',
        key: 'tsdb-league-4801',
        followOnly: true,
        pollPath:
          'pollTsdbLeague?leagueId=4801&season=2026&sport=cricket&durationHours=8',
      },
      {
        id: '4979',
        name: 'T20 Internationals',
        country: 'International',
        key: 'tsdb-league-4979',
        followOnly: true,
        pollPath:
          'pollTsdbLeague?leagueId=4979&season=2026&sport=cricket&durationHours=4',
      },
      {
        id: '5103',
        name: 'T20 World Cup',
        country: 'International',
        key: 'tsdb-league-5103',
        followOnly: true,
        pollPath:
          'pollTsdbLeague?leagueId=5103&season=2026&sport=cricket&durationHours=4',
      },
    ],
  },
  {
    key: 'ice-hockey',
    label: 'Ice hockey',
    glyph: '🏒',
    enabled: true,
    browse: ['competition', 'team'],
    followTypes: ['team', 'competition'],
    staticCompetitions: [
      { id: 1, name: 'NHL', country: 'North America', key: 'nhl-league-1' },
    ],
  },
  { key: 'tennis', label: 'Tennis', glyph: '🎾', enabled: false, browse: ['competition'], followTypes: ['competition', 'athlete'] },
  {
    key: 'basketball',
    label: 'Basketball',
    glyph: '🏀',
    enabled: true,
    browse: ['competition', 'team'],
    followTypes: ['team', 'competition'],
    staticCompetitions: [
      {
        id: '4387',
        name: 'NBA',
        country: 'North America',
        key: 'tsdb-league-4387',
        pollPath:
          'pollTsdbLeague?leagueId=4387&season=2025-2026&sport=basketball&durationHours=2.5',
        teamPollPath:
          'pollTsdbLeague?leagueId=4387&season=2025-2026&sport=basketball&durationHours=2.5',
      },
    ],
  },
  {
    key: 'baseball',
    label: 'Baseball',
    glyph: '⚾',
    enabled: true,
    browse: ['competition', 'team'],
    followTypes: ['team', 'competition'],
    staticCompetitions: [
      { id: 1, name: 'MLB', country: 'North America', key: 'mlb-league-1' },
    ],
  },
  {
    key: 'nfl',
    label: 'American football',
    glyph: '🏈',
    enabled: true,
    browse: ['competition', 'team'],
    followTypes: ['team', 'competition'],
    staticCompetitions: [
      {
        id: '4391',
        name: 'NFL',
        country: 'North America',
        key: 'tsdb-league-4391',
        pollPath:
          'pollTsdbLeague?leagueId=4391&season=2026&sport=nfl&durationHours=3',
        teamPollPath:
          'pollTsdbLeague?leagueId=4391&season=2026&sport=nfl&durationHours=3',
      },
    ],
  },
  {
    key: 'rugby',
    label: 'Rugby',
    glyph: '🏉',
    enabled: true,
    browse: ['competition'],
    followTypes: ['competition'],
    staticCompetitions: [
      {
        id: '4714',
        name: 'Six Nations',
        country: 'Europe',
        key: 'tsdb-league-4714',
        followOnly: true,
        pollPath:
          'pollTsdbLeague?leagueId=4714&season=2027&sport=rugby&durationHours=2',
      },
      {
        id: '4414',
        name: 'Premiership Rugby',
        country: 'England',
        key: 'tsdb-league-4414',
        followOnly: true,
        pollPath:
          'pollTsdbLeague?leagueId=4414&season=2025-2026&sport=rugby&durationHours=2',
      },
      {
        id: '4550',
        name: 'Champions Cup',
        country: 'Europe',
        key: 'tsdb-league-4550',
        followOnly: true,
        pollPath:
          'pollTsdbLeague?leagueId=4550&season=2025-2026&sport=rugby&durationHours=2',
      },
      {
        id: '4430',
        name: 'Top 14',
        country: 'France',
        key: 'tsdb-league-4430',
        followOnly: true,
        pollPath:
          'pollTsdbLeague?leagueId=4430&season=2025-2026&sport=rugby&durationHours=2',
      },
      {
        id: '4415',
        name: 'Super League',
        country: 'England',
        key: 'tsdb-league-4415',
        followOnly: true,
        pollPath:
          'pollTsdbLeague?leagueId=4415&season=2026&sport=rugby&durationHours=2',
      },
      {
        id: '4416',
        name: 'NRL',
        country: 'Australia',
        key: 'tsdb-league-4416',
        followOnly: true,
        pollPath:
          'pollTsdbLeague?leagueId=4416&season=2026&sport=rugby&durationHours=2',
      },
    ],
  },
  {
    key: 'golf',
    label: 'Golf',
    glyph: '⛳',
    enabled: true,
    browse: ['competition'],
    followTypes: ['competition'],
    staticCompetitions: [
      {
        id: '4425',
        name: 'PGA Tour',
        country: 'World',
        key: 'tsdb-league-4425',
        followOnly: true,
        pollPath:
          'pollTsdbLeague?leagueId=4425&season=2026&sport=golf&durationHours=5',
      },
      {
        id: '4426',
        name: 'DP World Tour',
        country: 'World',
        key: 'tsdb-league-4426',
        followOnly: true,
        pollPath:
          'pollTsdbLeague?leagueId=4426&season=2026&sport=golf&durationHours=5',
      },
      {
        id: '4553',
        name: 'LPGA Tour',
        country: 'World',
        key: 'tsdb-league-4553',
        followOnly: true,
        pollPath:
          'pollTsdbLeague?leagueId=4553&season=2026&sport=golf&durationHours=5',
      },
    ],
  },
  {
    key: 'f1',
    label: 'Formula 1',
    glyph: '🏎️',
    enabled: true,
    browse: [],
    followTypes: ['series'],
    seriesFollowable: { key: 'f1-series-1', label: 'Formula 1' },
  },
  {
    key: 'boxing',
    label: 'Boxing',
    glyph: '🥊',
    enabled: true,
    // Card-follow like UFC: one follow covers the major fight cards.
    // Times are announced late → tbd placeholders that sharpen.
    browse: [],
    followTypes: ['series'],
    seriesFollowable: {
      key: 'tsdb-league-4445',
      label: 'Boxing',
      pollPath:
        'pollTsdbLeague?leagueId=4445&season=2026&sport=boxing&durationHours=3',
    },
  },
  {
    key: 'ufc',
    label: 'UFC',
    glyph: '🥋',
    enabled: true,
    // Event-card follow (like F1): TSDB has cards, not per-fighter bouts,
    // so athlete-follow stays deferred until bout-level data exists.
    browse: [],
    followTypes: ['series'],
    seriesFollowable: {
      key: 'tsdb-league-4443',
      label: 'UFC',
      pollPath:
        'pollTsdbLeague?leagueId=4443&season=2026&sport=ufc&durationHours=4',
    },
  },
];

export const sportByKey = (key: string): SportConfig | undefined =>
  SPORTS.find((s) => s.key === key);

// Per-sport active seasons. Soccer runs on football-data.org's free
// tier at CURRENT seasons (season = start year: 2026 → 2026-27).
// ACTIVE_SEASON remains for legacy API-Sports follows only.
export const SOCCER_FD_SEASON = 2026;
export const ACTIVE_SEASON = 2023; // legacy apisports-* follows
export const MLB_SEASON = 2026;
export const NHL_SEASON_ID = '20262027';
export const F1_SEASON = 2026;
