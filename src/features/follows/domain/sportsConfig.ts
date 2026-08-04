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
  // False when the competition itself cannot be followed — only its teams
  // can. NHL and MLB are served by TEAM pollers with no league-level
  // route, so "Follow all" on those rows built pollNhlTeam?abbrev=1 and
  // pollMlbTeam?teamId=1: a 400 and an empty 200 respectively. A missing
  // button beats a broken one.
  followable?: boolean;
  pollPath?: string; // functions path polled when this follow syncs
  teamPollPath?: string; // path attached to team-follows made inside it
}

export interface SportConfig {
  key: string;
  label: string;
  glyph: string; // small identity accent only, per design system
  // Canonical sport hue — stored as data, never used raw: every surface
  // it touches goes through teamTheme() first. Fallback identity for
  // entities without a brand colour (the median case at launch).
  accent: string;
  enabled: boolean; // false = data not yet live (M5 sport expansion)
  // Ordered drill-down levels, e.g. soccer: competitions → teams.
  browse: BrowseLevelKind[];
  // Which levels can be followed directly (competition rows get a
  // Follow button when 'competition' is listed here).
  followTypes: FollowableType[];
  // Single-league sports skip the server round-trip for the competition
  // level; the entry is config, not data.
  staticCompetitions?: StaticCompetition[];
  // Tournament rows below the tour rows (Prompt 9): the competitions
  // people actually want — Wimbledon, not "ATP Tour" — served by
  // listTournaments with joint two-tour events merged under one key.
  tournamentBrowse?: boolean;
  // Series sports (F1, UFC): the one followable, followed straight from
  // the sport row.
  seriesFollowable?: { key: string; label: string; pollPath?: string };
  // What this sport's coverage honestly IS, said before a user has to
  // discover it (Prompt 7): where athlete-level data is absent, where
  // times arrive late, where a whole tour is missing. Shown on the
  // sport's browse screen. Absence of a note means full fixture-level
  // coverage with settled times.
  coverageNote?: string;
}

export const SPORTS: SportConfig[] = [
  {
    key: 'soccer',
    label: 'Soccer',
    accent: '#16A34A',
    glyph: '⚽',
    enabled: true,
    browse: ['competition', 'team'],
    followTypes: ['team', 'competition'],
  },
  {
    key: 'cricket',
    label: 'Cricket',
    coverageNote:
      'White-ball internationals and leading leagues; Test series beyond the County Championship are not covered.',
    accent: '#0D9488',
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
        pollPath:
          'pollTsdbLeague?leagueId=4801&season=2026&sport=cricket&durationHours=8',
        teamPollPath:
          'pollTsdbLeague?leagueId=4801&season=2026&sport=cricket&durationHours=8',
      },
      {
        id: '4979',
        name: 'T20 Internationals',
        country: 'International',
        key: 'tsdb-league-4979',
        pollPath:
          'pollTsdbLeague?leagueId=4979&season=2026&sport=cricket&durationHours=4',
        teamPollPath:
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
      {
        id: '4458',
        name: 'County Championship',
        country: 'England',
        key: 'tsdb-league-4458',
        followOnly: true,
        pollPath:
          'pollTsdbLeague?leagueId=4458&season=2026&sport=cricket&durationHours=96',
      },
    ],
  },
  {
    key: 'ice-hockey',
    label: 'Ice hockey',
    accent: '#0284C7',
    glyph: '🏒',
    enabled: true,
    browse: ['competition', 'team'],
    followTypes: ['team', 'competition'],
    staticCompetitions: [
      {
        id: 1,
        name: 'NHL',
        country: 'North America',
        key: 'nhl-league-1',
        followable: false, // team-level only; see StaticCompetition
      },
      {
        id: '4920',
        name: 'KHL',
        country: 'Europe',
        key: 'tsdb-league-4920',
        pollPath:
          'pollTsdbLeague?leagueId=4920&season=2026-2027&sport=ice-hockey&durationHours=2.5',
        teamPollPath:
          'pollTsdbLeague?leagueId=4920&season=2026-2027&sport=ice-hockey&durationHours=2.5',
      },
      {
        id: '4931',
        name: 'Liiga',
        country: 'Finland',
        key: 'tsdb-league-4931',
        pollPath:
          'pollTsdbLeague?leagueId=4931&season=2026-2027&sport=ice-hockey&durationHours=2.5',
        teamPollPath:
          'pollTsdbLeague?leagueId=4931&season=2026-2027&sport=ice-hockey&durationHours=2.5',
      },
      {
        id: '4419',
        name: 'SHL',
        country: 'Sweden',
        key: 'tsdb-league-4419',
        pollPath:
          'pollTsdbLeague?leagueId=4419&season=2026-2027&sport=ice-hockey&durationHours=2.5',
        teamPollPath:
          'pollTsdbLeague?leagueId=4419&season=2026-2027&sport=ice-hockey&durationHours=2.5',
      },
    ],
  },
  { key: 'tennis', label: 'Tennis',
    coverageNote:
      'Both ranked lists are live: the women’s from the WTA’s own feed, the men’s from Wikipedia’s weekly table, which publishes the top 20 only. Every other man we hold is listed A–Z below them — we are not told which of those are still competing. Women get draws and match times; men’s have no approved source yet, so following a man delivers his events the moment one exists. Retired players stay findable by name, but are not browsable and cannot be followed.',
    accent: '#65A30D',
    glyph: '🎾',
    enabled: true,
    browse: ['competition', 'athlete'],
    followTypes: ['competition', 'athlete'],
    tournamentBrowse: true,
    // ATP: TOURNAMENT level from the ICS feed Tennis TV publishes for
    // subscription — atptour.com itself refuses this agent and is
    // permanently excluded (docs/DECISIONS.md). WTA: tournaments PLUS
    // draws and order of play from the WTA's own API (owner ruling
    // 2026-08-02) — following a player rides APPEARANCE docs, reached
    // through global search.
    staticCompetitions: [
      {
        id: 'atp',
        name: 'ATP Tour',
        country: 'World',
        key: 'tennis-atp',
        followOnly: true,
        pollPath: 'pollTennis',
      },
      {
        id: 'wta',
        name: 'WTA Tour',
        country: 'World',
        key: 'tennis-wta',
        followOnly: true,
        pollPath: 'pollWtaTennis',
      },
    ] },
  {
    key: 'athletics',
    label: 'Athletics',
    coverageNote:
      'Meeting-level coverage. Individual athletes are not followable yet — World Athletics publishes rankings only as web pages, and start lists arrive when federations publish them.',
    accent: '#0369A1',
    glyph: '🏃',
    enabled: true,
    // MEETING level. The World Athletics calendar carries ~1,250 meetings
    // for a five-month window, overwhelmingly minor road races — so the
    // followables are the SERIES a fan actually follows, not the calendar
    // as a whole. Every row polls the same feed; they differ in which
    // group key the follow matches.
    browse: ['competition'],
    followTypes: ['competition'],
    staticCompetitions: [
      {
        id: 'diamond',
        name: 'Wanda Diamond League',
        country: 'World',
        key: 'wa-wanda-diamond-league-meeting',
        followOnly: true,
        pollPath: 'pollAthletics',
      },
      {
        id: 'wch',
        name: 'World Athletics Championships',
        country: 'World',
        key: 'wa-world-athletics-championships-world-athletics-series',
        followOnly: true,
        pollPath: 'pollAthletics',
      },
      {
        id: 'ct-gold',
        name: 'Continental Tour Gold',
        country: 'World',
        key: 'wa-world-athletics-continental-tour-gold',
        followOnly: true,
        pollPath: 'pollAthletics',
      },
      {
        id: 'indoor-gold',
        name: 'Indoor Tour Gold',
        country: 'World',
        key: 'wa-world-athletics-indoor-tour-gold',
        followOnly: true,
        pollPath: 'pollAthletics',
      },
      {
        id: 'xc',
        name: 'Cross Country Tour Gold',
        country: 'World',
        key: 'wa-world-athletics-cross-country-tour-gold',
        followOnly: true,
        pollPath: 'pollAthletics',
      },
      {
        id: 'nationals',
        name: 'National Championships',
        country: 'World',
        key: 'wa-national-senior-outdoor-championships',
        followOnly: true,
        pollPath: 'pollAthletics',
      },
      {
        id: 'all',
        name: 'Everything on the calendar',
        country: 'World',
        key: 'wa-calendar',
        followOnly: true,
        pollPath: 'pollAthletics',
      },
    ],
  },
  {
    key: 'basketball',
    label: 'Basketball',
    accent: '#EA580C',
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
      {
        id: '4516',
        name: 'WNBA',
        country: 'North America',
        key: 'tsdb-league-4516',
        pollPath:
          'pollTsdbLeague?leagueId=4516&season=2026&sport=basketball&durationHours=2.5',
        teamPollPath:
          'pollTsdbLeague?leagueId=4516&season=2026&sport=basketball&durationHours=2.5',
      },
      {
        id: '4549',
        name: 'FIBA World Cup qualifiers',
        country: 'International',
        key: 'tsdb-league-4549',
        followOnly: true,
        pollPath:
          'pollTsdbLeague?leagueId=4549&season=2027&sport=basketball&durationHours=2',
      },
    ],
  },
  {
    key: 'baseball',
    label: 'Baseball',
    accent: '#1D4ED8',
    glyph: '⚾',
    enabled: true,
    browse: ['competition', 'team'],
    followTypes: ['team', 'competition'],
    staticCompetitions: [
      {
        id: 1,
        name: 'MLB',
        country: 'North America',
        key: 'mlb-league-1',
        followable: false, // team-level only; see StaticCompetition
      },
      {
        id: '4591',
        name: 'NPB',
        country: 'Japan',
        key: 'tsdb-league-4591',
        pollPath:
          'pollTsdbLeague?leagueId=4591&season=2026&sport=baseball&durationHours=3',
        teamPollPath:
          'pollTsdbLeague?leagueId=4591&season=2026&sport=baseball&durationHours=3',
      },
      {
        id: '4830',
        name: 'KBO League',
        country: 'South Korea',
        key: 'tsdb-league-4830',
        pollPath:
          'pollTsdbLeague?leagueId=4830&season=2026&sport=baseball&durationHours=3',
        teamPollPath:
          'pollTsdbLeague?leagueId=4830&season=2026&sport=baseball&durationHours=3',
      },
    ],
  },
  {
    key: 'nfl',
    label: 'American football',
    accent: '#854D0E',
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
    accent: '#4F46E5',
    glyph: '🏉',
    enabled: true,
    browse: ['competition', 'team'],
    followTypes: ['team', 'competition'],
    staticCompetitions: [
      {
        id: '4714',
        name: 'Six Nations',
        country: 'Europe',
        key: 'tsdb-league-4714',
        pollPath:
          'pollTsdbLeague?leagueId=4714&season=2027&sport=rugby&durationHours=2',
        teamPollPath:
          'pollTsdbLeague?leagueId=4714&season=2027&sport=rugby&durationHours=2',
      },
      {
        id: '4414',
        name: 'Premiership Rugby',
        country: 'England',
        key: 'tsdb-league-4414',
        pollPath:
          'pollTsdbLeague?leagueId=4414&season=2025-2026&sport=rugby&durationHours=2',
        teamPollPath:
          'pollTsdbLeague?leagueId=4414&season=2025-2026&sport=rugby&durationHours=2',
      },
      {
        id: '4550',
        name: 'Champions Cup',
        country: 'Europe',
        key: 'tsdb-league-4550',
        pollPath:
          'pollTsdbLeague?leagueId=4550&season=2025-2026&sport=rugby&durationHours=2',
        teamPollPath:
          'pollTsdbLeague?leagueId=4550&season=2025-2026&sport=rugby&durationHours=2',
      },
      {
        id: '4430',
        name: 'Top 14',
        country: 'France',
        key: 'tsdb-league-4430',
        pollPath:
          'pollTsdbLeague?leagueId=4430&season=2025-2026&sport=rugby&durationHours=2',
        teamPollPath:
          'pollTsdbLeague?leagueId=4430&season=2025-2026&sport=rugby&durationHours=2',
      },
      {
        id: '4415',
        name: 'Super League',
        country: 'England',
        key: 'tsdb-league-4415',
        pollPath:
          'pollTsdbLeague?leagueId=4415&season=2026&sport=rugby&durationHours=2',
        teamPollPath:
          'pollTsdbLeague?leagueId=4415&season=2026&sport=rugby&durationHours=2',
      },
      {
        id: '4416',
        name: 'NRL',
        country: 'Australia',
        key: 'tsdb-league-4416',
        pollPath:
          'pollTsdbLeague?leagueId=4416&season=2026&sport=rugby&durationHours=2',
        teamPollPath:
          'pollTsdbLeague?leagueId=4416&season=2026&sport=rugby&durationHours=2',
      },
      {
        id: '5852',
        name: 'Nations Championship',
        country: 'International',
        key: 'tsdb-league-5852',
        followOnly: true,
        pollPath:
          'pollTsdbLeague?leagueId=5852&season=2026&sport=rugby&durationHours=2',
      },
      {
        id: '5806',
        name: 'Rugby League World Cup',
        country: 'International',
        key: 'tsdb-league-5806',
        followOnly: true,
        pollPath:
          'pollTsdbLeague?leagueId=5806&season=2026&sport=rugby&durationHours=2',
      },
      {
        id: '5479',
        name: 'Rugby Championship',
        country: 'International',
        key: 'tsdb-league-5479',
        followOnly: true,
        pollPath:
          'pollTsdbLeague?leagueId=5479&season=2026&sport=rugby&durationHours=2',
      },
    ],
  },
  {
    key: 'golf',
    label: 'Golf',
    coverageNote:
      'Round-level events; tee times are not tracked.',
    accent: '#047857',
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
      {
        id: '5329',
        name: 'LIV Golf',
        country: 'World',
        key: 'tsdb-league-5329',
        followOnly: true,
        pollPath:
          'pollTsdbLeague?leagueId=5329&season=2026&sport=golf&durationHours=5',
      },
    ],
  },
  {
    key: 'f1',
    label: 'Formula 1',
    accent: '#E10600',
    glyph: '🏎️',
    enabled: true,
    // Drivers are browsable and followable (Prompt 8): a driver follow
    // yields the race weekends — every session, filtered by the same
    // race-only preference as a series follow, because driver keys ride
    // ON the session fixtures rather than separate appearance docs.
    browse: ['athlete'],
    followTypes: ['series', 'athlete'],
    seriesFollowable: { key: 'f1-series-1', label: 'Formula 1' },
  },
  {
    key: 'boxing',
    label: 'Boxing',
    coverageNote:
      'Card times are the broadcast start, not ringwalks. The fighter directory covers world champions and IBF-rated contenders, plus fighters on announced cards.',
    accent: '#BE123C',
    glyph: '🥊',
    enabled: true,
    // Card-follow: one follow covers the fight cards. Times published are
    // the CARD start, not the main-event ringwalk, so they arrive nominal
    // and say so rather than pretending to a minute they do not know.
    // Athlete follows attach to APPEARANCE docs (every PBC bout,
    // undercard included; the headline bout elsewhere). Since Prompt 8
    // fighters are BROWSABLE — champions and IBF-rated contenders by
    // weight class from the canonical directory — as well as searchable.
    browse: ['competition', 'athlete'],
    followTypes: ['competition', 'athlete'],
    staticCompetitions: [
      {
        id: '4445',
        name: 'Major fight cards',
        country: 'World',
        key: 'tsdb-league-4445',
        followOnly: true,
        pollPath:
          'pollTsdbLeague?leagueId=4445&season=2026&sport=boxing&durationHours=3',
      },
      {
        // The one promoter publishing structured data (JSON-LD
        // SportsEvent + a sitemap). Matchroom, BOXXER and Queensberry go
        // through the review queue instead — see docs/DECISIONS.md.
        id: 'pbc',
        name: 'Premier Boxing Champions',
        country: 'USA',
        key: 'pbc-cards',
        followOnly: true,
        pollPath: 'pollPbc',
      },
    ],
  },
  {
    key: 'ufc',
    coverageNote:
      'Card-level coverage only. Individual fighters cannot be followed: no MMA body publishes a usable roster, so a fighter directory would be guesswork — we would rather be honest than wrong.',
    // Was a UFC-only series row; promotions beyond the UFC carry real
    // upcoming cards, so this became a browse level. Card-follows ONLY
    // since Prompt 8: with no MMA roster source (no body publishes one;
    // ufc.com is structured-data-free) the canonical directory holds no
    // MMA athletes, so search can never offer one and the athlete type
    // was unreachable config claiming otherwise.
    label: 'MMA',
    accent: '#6D28D9',
    glyph: '🥋',
    enabled: true,
    browse: ['competition'],
    followTypes: ['competition'],
    staticCompetitions: [
      {
        id: '4443',
        name: 'UFC',
        country: 'World',
        key: 'tsdb-league-4443',
        followOnly: true,
        pollPath:
          'pollTsdbLeague?leagueId=4443&season=2026&sport=ufc&durationHours=4',
      },
      {
        id: '4495',
        name: 'ONE Championship',
        country: 'Asia',
        key: 'tsdb-league-4495',
        followOnly: true,
        pollPath:
          'pollTsdbLeague?leagueId=4495&season=2026&sport=ufc&durationHours=4',
      },
      {
        id: '5430',
        name: 'PFL',
        country: 'World',
        key: 'tsdb-league-5430',
        followOnly: true,
        pollPath:
          'pollTsdbLeague?leagueId=5430&season=2026&sport=ufc&durationHours=4',
      },
      {
        id: '4567',
        name: 'Bare Knuckle FC',
        country: 'World',
        key: 'tsdb-league-4567',
        followOnly: true,
        pollPath:
          'pollTsdbLeague?leagueId=4567&season=2026&sport=ufc&durationHours=4',
      },
    ],
  },
  {
    key: 'motorsport',
    label: 'Motorsport',
    accent: '#52525B',
    glyph: '🏍️',
    enabled: true,
    // Formula 1 keeps its own row (per-session events + race-only
    // preference); these series are followed whole.
    browse: ['competition'],
    followTypes: ['competition'],
    staticCompetitions: [
      {
        id: '4407',
        name: 'MotoGP',
        country: 'World',
        key: 'tsdb-league-4407',
        followOnly: true,
        pollPath:
          'pollTsdbLeague?leagueId=4407&season=2026&sport=motorsport&durationHours=2',
      },
      {
        id: '4393',
        name: 'NASCAR Cup Series',
        country: 'North America',
        key: 'tsdb-league-4393',
        followOnly: true,
        pollPath:
          'pollTsdbLeague?leagueId=4393&season=2026&sport=motorsport&durationHours=4',
      },
      {
        id: '4373',
        name: 'IndyCar',
        country: 'North America',
        key: 'tsdb-league-4373',
        followOnly: true,
        pollPath:
          'pollTsdbLeague?leagueId=4373&season=2026&sport=motorsport&durationHours=3',
      },
      {
        id: '4486',
        name: 'Formula 2',
        country: 'World',
        key: 'tsdb-league-4486',
        followOnly: true,
        pollPath:
          'pollTsdbLeague?leagueId=4486&season=2026&sport=motorsport&durationHours=1.5',
      },
      {
        id: '4413',
        name: 'World Endurance Championship',
        country: 'World',
        key: 'tsdb-league-4413',
        followOnly: true,
        pollPath:
          'pollTsdbLeague?leagueId=4413&season=2026&sport=motorsport&durationHours=6',
      },
    ],
  },
];

export const sportByKey = (key: string): SportConfig | undefined =>
  SPORTS.find((s) => s.key === key);

// Per-sport active seasons.
//
// Soccer no longer has one: football-data seasons are resolved
// PER COMPETITION from the provider's own `currentSeason`, server-side and
// cached (functions/src/fdSeasons.ts). One constant said 2026 for all
// twelve while the Champions League was on 2025 and the European
// Championship on 2024, which 404'd both.
//
// FD_ROUTE_SEASON only fills the season slot the sweep's route validator
// requires; the server overrides it with the resolved season on every
// call. It is a route shape, NOT a claim about which season is live.
export const FD_ROUTE_SEASON = 2026;
export const MLB_SEASON = 2026;
export const NHL_SEASON_ID = '20262027';
export const F1_SEASON = 2026;
