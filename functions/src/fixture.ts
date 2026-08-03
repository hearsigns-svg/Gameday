// Canonical fixture model — server copy. Mirrors
// src/features/fixtures/domain/fixture.ts in the app (kept in sync by
// hand until a shared package is warranted).

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
  sport: string; // sport key from the client config, e.g. 'soccer'
  competition: string; // display name
  competitionId: string; // followable key, e.g. 'apisports-league-39'
  title: string; // calendar title base, e.g. 'Liverpool v Everton'
  homeTeam?: string; // team sports only
  awayTeam?: string;
  followKeys: string[]; // every followable this fixture belongs to
  startUtc: string; // ISO 8601
  // The venue's NAME, where the provider publishes a real one (TSDB
  // strVenue — golf courses, stadiums). A fact, not imagery; the
  // licensed venue-photography layer keys on it (Prompt 9b).
  venue?: string;
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
  // APPEARANCE fields (Prompt 5). An appearance is a named athlete (or a
  // bout of two) competing WITHIN a parent event: an undercard bout on a
  // card, a player in a draw, an athlete on a start list. It is an
  // ordinary fixture — same id namespace, same ledger path, its own
  // calendar event — whose id embeds the parent's (so the provider
  // prefix, and with it the same-provider merge guard and coverage
  // source attribution, are inherited). While the exact slot is unknown
  // the appearance carries the PARENT's window with
  // confidence 'provisional'; a confirmed slot arrives as new
  // startUtc/timePrecision on the SAME id, so the calendar entry
  // updates in place instead of duplicating.
  parentFixtureId?: string; // present ⇒ this fixture is an appearance
  athletes?: string[]; // display names, first-named first
  firstSeenAt?: string; // first ingest — decides which id users keep
  updatedAt: string;
}
