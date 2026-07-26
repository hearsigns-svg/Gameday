// Declarative per-sport configuration — the follow taxonomy as data.
// Adding a sport is a config entry + a provider adapter, never new UI.

export type FollowableType = 'team' | 'competition' | 'athlete' | 'series';

export type BrowseLevelKind = 'competition' | 'team' | 'athlete';

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
  { key: 'ice-hockey', label: 'Ice hockey', glyph: '🏒', enabled: false, browse: ['competition', 'team'], followTypes: ['team', 'competition'] },
  { key: 'tennis', label: 'Tennis', glyph: '🎾', enabled: false, browse: ['competition'], followTypes: ['competition', 'athlete'] },
  { key: 'basketball', label: 'Basketball', glyph: '🏀', enabled: false, browse: ['competition', 'team'], followTypes: ['team', 'competition'] },
  { key: 'baseball', label: 'Baseball', glyph: '⚾', enabled: false, browse: ['competition', 'team'], followTypes: ['team', 'competition'] },
  { key: 'nfl', label: 'American football', glyph: '🏈', enabled: false, browse: ['competition', 'team'], followTypes: ['team', 'competition'] },
  { key: 'rugby', label: 'Rugby', glyph: '🏉', enabled: false, browse: ['competition', 'team'], followTypes: ['team', 'competition'] },
  { key: 'golf', label: 'Golf', glyph: '⛳', enabled: false, browse: ['competition'], followTypes: ['competition'] },
  { key: 'f1', label: 'Formula 1', glyph: '🏎️', enabled: false, browse: [], followTypes: ['series'] },
  { key: 'ufc', label: 'UFC', glyph: '🥊', enabled: false, browse: ['athlete'], followTypes: ['athlete'] },
];

export const sportByKey = (key: string): SportConfig | undefined =>
  SPORTS.find((s) => s.key === key);

// Free-tier data window (API-Sports serves seasons 2022–24 on the free
// plan). Single source; lifted to a paid-tier current season at M5.
export const ACTIVE_SEASON = 2023;
