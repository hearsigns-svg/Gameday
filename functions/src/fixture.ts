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
  sport: string; // sport key from the client config, e.g. 'soccer'
  competition: string; // display name
  competitionId: string; // followable key, e.g. 'apisports-league-39'
  title: string; // calendar title base, e.g. 'Liverpool v Everton'
  homeTeam?: string; // team sports only
  awayTeam?: string;
  followKeys: string[]; // every followable this fixture belongs to
  startUtc: string; // ISO 8601
  venueTz: string;
  status: FixtureStatus;
  durationHours?: number; // event length; default 2 when absent
  sessionKind?: 'race' | 'support'; // series sports: race vs practice/quali
  updatedAt: string;
}
