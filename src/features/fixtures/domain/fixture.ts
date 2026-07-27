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
  sport: string; // sport key from the sports config, e.g. 'soccer'
  competition: string; // display name
  competitionId: string; // followable key, e.g. 'apisports-league-39'
  title: string; // calendar title base, e.g. 'Liverpool v Everton'
  homeTeam?: string; // team sports only
  awayTeam?: string;
  followKeys: string[]; // every followable this fixture belongs to
  startUtc: string; // ISO 8601
  venueTz: string; // IANA zone; 'UTC' when provider omits venue zone
  status: FixtureStatus;
  durationHours?: number; // event length; default 2 when absent
  sessionKind?: 'race' | 'support'; // series sports: race vs practice/quali
  // 'provisional' records come from sources whose timing may still move:
  // they render as all-day placeholders rather than precise events, and
  // sharpen when a trusted source confirms. Absent ⇒ confirmed.
  confidence?: 'confirmed' | 'provisional';
  firstSeenAt?: string;
  updatedAt: string; // ISO 8601, server write time
}

export const FIXTURE_DURATION_HOURS = 2;
