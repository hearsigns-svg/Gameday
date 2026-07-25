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
  competition: string;
  homeTeam: string;
  awayTeam: string;
  teamIds: string[]; // followable keys, e.g. 'apisports-team-40'
  startUtc: string; // ISO 8601
  venueTz: string; // IANA zone; 'UTC' when provider omits venue zone
  status: FixtureStatus;
  updatedAt: string; // ISO 8601, server write time
}

// Statuses that mean "no timed calendar event should exist".
// M2 refines postponed into a placeholder rather than a removal.
export const UNSCHEDULED_STATUSES: readonly FixtureStatus[] = [
  'postponed',
  'cancelled',
];

export const FIXTURE_DURATION_HOURS = 2;
