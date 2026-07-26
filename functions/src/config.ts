// Shared server config. ACTIVE_SEASON mirrors the client constant —
// the API-Sports free tier serves seasons 2022–24; lifted at M5.

export const ACTIVE_SEASON = 2023;

export interface CuratedLeague {
  id: number;
  name: string;
  country: string;
}

// Curated soccer directory for M3 browsing. M5 replaces curation with
// provider-driven discovery per sport.
export const CURATED_SOCCER_LEAGUES: CuratedLeague[] = [
  { id: 39, name: 'Premier League', country: 'England' },
  { id: 140, name: 'La Liga', country: 'Spain' },
  { id: 135, name: 'Serie A', country: 'Italy' },
  { id: 78, name: 'Bundesliga', country: 'Germany' },
  { id: 61, name: 'Ligue 1', country: 'France' },
  { id: 2, name: 'UEFA Champions League', country: 'Europe' },
  { id: 3, name: 'UEFA Europa League', country: 'Europe' },
  { id: 45, name: 'FA Cup', country: 'England' },
  { id: 48, name: 'League Cup', country: 'England' },
  { id: 1, name: 'World Cup', country: 'International' },
];
