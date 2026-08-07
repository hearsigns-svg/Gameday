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

// The knockout rungs we normalise to. Deliberately short: these are the
// only positions that mean the same thing in every knockout format, and
// a rung we cannot recognise stays in `label` rather than being forced
// into the nearest one.
export type RoundCode =
  | 'r128'
  | 'r64'
  | 'r32'
  | 'r16'
  | 'qf'
  | 'sf'
  | 'f'
  | 'third-place';

export interface FixtureStage {
  label?: string; // verbatim provider text, never parsed for meaning
  round?: RoundCode; // knockout position, only where unambiguous
  group?: string; // pool label, orthogonal to round
  ordinal?: number; // matchday / golf round — a sequence, not a ladder
}

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
  // City + country as the feed publishes it (ICS LOCATION, WTA
  // city/country) — the tournament-photo disambiguator (Prompt 9c),
  // never a photo key by itself.
  venueCity?: string;
  // IANA zone of the VENUE, when the provider actually supplies one.
  // Absent means unknown — it used to be the literal 'UTC' on 10,395 of
  // 10,483 documents, which is a claim, not a default.
  venueTz?: string;
  // WHO PUTS THE CARD ON. Combat sports only, and ONLY where a human has
  // said so — today that means the review queue, which is the one path
  // where a person types it in.
  //
  // NEVER INFERRED (owner ruling 2026-08-07). It is tempting to derive
  // this from the venue or the headline fighter, and it would be right
  // most of the time: the O2 plus a Queensberry fighter is almost
  // certainly a Queensberry card. "Almost certainly" is the problem. A
  // wrong promoter is a confident, checkable, visibly false claim about
  // a real business, and boxers change promoters mid-career, which is
  // exactly when a fan is most likely to look. Neither TheSportsDB (its
  // competition string is the literal word "Boxing" on 17 of 19 cards)
  // nor boxing-data.com attributes cards to a promoter — the latter
  // names the promotions it COVERS without saying which card is whose.
  //
  // Absent therefore means "nobody told us", not "no promoter", and
  // nothing backfills it by guessing.
  promoter?: string;
  status: FixtureStatus;
  // WHERE THIS FIXTURE SITS IN ITS COMPETITION'S STRUCTURE.
  //
  // Every provider we use sends some of this and every adapter threw it
  // away at the interface boundary: TheSportsDB publishes `intRound` on
  // every event, football-data publishes `stage` and `group`, api-sports
  // publishes `league.round` (its banked payload literally reads
  // "Quarter-finals"), and the ATP review sheet carries a `round`
  // column. A census of all 14,018 production documents found ZERO
  // carrying any structural field — 556 of them in cup competitions that
  // genuinely have ladders, with the T20 World Cup final stored as
  // "India Cricket vs New Zealand Cricket", indistinguishable from a
  // group game.
  //
  // THE THREE CONCEPTS ARE KEPT APART ON PURPOSE (owner ruling: do not
  // flatten). "Quarter-final", "Group A" and "Matchday 5" answer
  // different questions, and a single string would make a scope ladder
  // guess which one it was holding:
  //   round   — position in a KNOCKOUT ladder. Normalised, and only
  //             where the provider is unambiguous.
  //   group   — a POOL label. Orthogonal to round: a World Cup fixture
  //             can be group-stage with no round, or knockout with no
  //             group.
  //   ordinal — a SEQUENCE number, where the competition is a series
  //             rather than a ladder: a league matchday, a golf round.
  //   label   — what the provider actually wrote, kept verbatim and
  //             never parsed for meaning, so nothing is lost when our
  //             normalisation does not recognise a value.
  stage?: FixtureStage;
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
