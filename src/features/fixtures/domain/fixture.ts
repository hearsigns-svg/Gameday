// Canonical fixture model — the one shape every provider adapter
// normalises into and every consumer reads. Mirrors functions/src/fixture.ts
// (kept in sync by hand until a shared package is warranted).

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
  venueTz: string; // IANA zone; 'UTC' when provider omits venue zone
  status: FixtureStatus;
  updatedAt: string; // ISO 8601, server write time
}

export const FIXTURE_DURATION_HOURS = 2;
