// Declarative per-sport configuration — the follow taxonomy as data.
// Adding a sport is a config entry + a provider adapter, never new UI.

export type FollowableType = 'team' | 'competition' | 'athlete' | 'series';

export type BrowseLevelKind = 'competition' | 'team' | 'athlete';

export interface StaticCompetition {
  id: number | string;
  name: string;
  country: string;
  key: string;
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
  // Series sports (F1): the one followable, followed straight from the
  // sport row.
  seriesFollowable?: { key: string; label: string };
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
  { key: 'cricket', label: 'Cricket', glyph: '🏏', enabled: false, browse: ['competition', 'team'], followTypes: ['team', 'competition'] },
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
  { key: 'basketball', label: 'Basketball', glyph: '🏀', enabled: false, browse: ['competition', 'team'], followTypes: ['team', 'competition'] },
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
  { key: 'nfl', label: 'American football', glyph: '🏈', enabled: false, browse: ['competition', 'team'], followTypes: ['team', 'competition'] },
  { key: 'rugby', label: 'Rugby', glyph: '🏉', enabled: false, browse: ['competition', 'team'], followTypes: ['team', 'competition'] },
  { key: 'golf', label: 'Golf', glyph: '⛳', enabled: false, browse: ['competition'], followTypes: ['competition'] },
  {
    key: 'f1',
    label: 'Formula 1',
    glyph: '🏎️',
    enabled: true,
    browse: [],
    followTypes: ['series'],
    seriesFollowable: { key: 'f1-series-1', label: 'Formula 1' },
  },
  { key: 'ufc', label: 'UFC', glyph: '🥊', enabled: false, browse: ['athlete'], followTypes: ['athlete'] },
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
