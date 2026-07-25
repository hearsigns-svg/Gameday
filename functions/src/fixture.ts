// Canonical fixture model — server copy. Mirrors
// src/features/fixtures/domain/fixture.ts in the app (kept in sync by
// hand until a shared package is warranted).

export type FixtureStatus =
  | 'scheduled'
  | 'tbd'
  | 'postponed'
  | 'cancelled'
  | 'in_play'
  | 'finished';

export interface Fixture {
  id: string;
  sport: 'soccer';
  competition: string;
  homeTeam: string;
  awayTeam: string;
  teamIds: string[];
  startUtc: string;
  venueTz: string;
  status: FixtureStatus;
  updatedAt: string;
}
