// Canonical fixture model — the one shape every provider adapter
// normalises into and every consumer reads. Mirrors functions/src/fixture.ts
// (kept in sync by hand until a shared package is warranted).

export type TimePrecision = 'exact' | 'nominal' | 'date_only';

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
  // IANA zone of the VENUE, when the provider actually supplies one.
  // Absent means unknown — it used to be the literal 'UTC' on 10,395 of
  // 10,483 documents, which is a claim, not a default.
  venueTz?: string;
  status: FixtureStatus;
  durationHours?: number; // event length; default 2 when absent
  sessionKind?: 'race' | 'support'; // series sports: race vs practice/quali
  // HOW PRECISELY THE START TIME IS KNOWN. Separate from `status`, which
  // conflated "no time" with "time not confirmed" and left startUtc
  // carrying a midnight sentinel with two meanings.
  //   exact      — the provider published a real, settled kick-off
  //   nominal    — a real instant, but not the settled one: football-data
  //                SCHEDULED (a placeholder kick-off), or a combat card's
  //                broadcast start rather than the ringwalk
  //   date_only  — only the day is known; startUtc is a day sentinel
  // Absent on records written before this field existed; consumers fall
  // back to the status (see timePrecisionOf in domain/horizon.ts).
  timePrecision?: TimePrecision;
  // How much we trust this record's timing to STAY put. Orthogonal to
  // precision: a nominal time is a real instant we expect to move.
  // Absent ⇒ confirmed.
  confidence?: 'confirmed' | 'provisional';
  firstSeenAt?: string;
  updatedAt: string; // ISO 8601, server write time
}

export const FIXTURE_DURATION_HOURS = 2;
