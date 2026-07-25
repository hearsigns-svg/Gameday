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
  id: string; // provider-scoped stable id, e.g. 'apisports-1030318'
  sport: 'soccer';
  competition: string; // display name
  competitionId: string; // followable key, e.g. 'apisports-league-39'
  homeTeam: string;
  awayTeam: string;
  followKeys: string[]; // every followable this fixture belongs to:
  // both team keys + the competition key
  startUtc: string; // ISO 8601
  venueTz: string;
  status: FixtureStatus;
  updatedAt: string;
}
