// ATP men's match rules — what may be published, and how it is titled.
// PURE. The vendor connector (providers/tennisApiAtpEvents.ts +
// index.ts::pollAtpVendor) turns the vendor's events into MatchRows and
// asks this file what to do with them.
//
// HISTORY. These rules were born as providers/sheetAtp.ts, when men's
// matches arrived through a Google Sheet that an Apps Script filled from
// the vendor (docs/DECISIONS.md 2026-08-06). Round 4 item 7 (2026-09-02)
// retired the sheet — the vendor fetch now runs inside the Cloud
// Function — and the rules survived unchanged, because they were never
// about the sheet. They are about what a match must carry before it may
// reach a real calendar:
//
// 1. AN UNMAPPED PLAYER NEVER PUBLISHES. The vendor ships its own player
//    ids; our directory carries them as `providerIds.tennisapi1`. A row
//    whose players are not both mapped is skipped, not guessed — F31/F34:
//    a surname is not an identity, and a match attributed to the wrong
//    person reaches a real calendar.
// 2. A HUMAN OVERRIDE WINS, ALWAYS. The override fields outrank the
//    vendor's values and the row records that a person set them. The
//    sheet was their only writer; nothing fills them today. They stay
//    optional on the row so a future correction path (the review queue)
//    lands in a slot the rules already honour rather than in a deploy.
// 3. A CANCELLATION PUBLISHES WITHOUT A TIME. Its whole point is to
//    remove an event already sitting in somebody's calendar, and a
//    withdrawal rarely arrives with a fresh timestamp.

export interface MatchRow {
  // What the row is about, in OUR vocabulary.
  tournamentKey: string; // tennis-t-<slug>
  round: string; // "Round of 32" — display, from the vendor
  homeAthleteId: string | null; // canonical athlete id, null = unmapped
  awayAthleteId: string | null;
  homeDisplay: string;
  awayDisplay: string;
  // The VENDOR's own player ids. Resolution is CERTAIN by id
  // (athletes.ts::matchAthlete) — the name path is never consulted.
  homeVendorPlayerId: string;
  awayVendorPlayerId: string;
  // What the vendor says.
  scheduledUtc: string | null;
  timePrecision: 'exact' | 'date_only' | null;
  status: string | null;
  // What a human says. Either present wins over the vendor value.
  overrideScheduledUtc?: string | null;
  overrideStatus?: string | null;
  // Provenance, so a vendor that dies can be re-sourced row by row.
  vendors: string;
  vendorMatchId: string;
  // When this row was last built from the vendor's answer.
  updatedAt: string;
}

export interface PublishablePair {
  row: MatchRow;
  startUtc: string;
  dayOnly: boolean;
  cancelled: boolean;
  // Did a person set this value? Recorded so a vendor correction never
  // silently reverts a human decision without anyone seeing it.
  overridden: boolean;
}

export interface SkippedRow {
  reason:
    | 'unmapped_player'
    | 'no_time'
    | 'bad_time'
    | 'unknown_tournament'
    | 'same_player';
  detail: string;
}

// ─── What may be published ────────────────────────────────────────────

// Statuses that mean "this match is not going to happen as listed". The
// vendor's own vocabulary plus the words a human would actually type
// during a rain delay.
const CANCELLING = new Set([
  'cancelled',
  'canceled',
  'withdrawn',
  'walkover',
  'retired',
  'postponed',
]);

function instantOf(raw: string): { iso: string; dayOnly: boolean } | null {
  // A date with no time is a legitimate order-of-play state ("after
  // previous match"), not a defect — it becomes a day-precision entry
  // rather than an invented o'clock.
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const ms = Date.parse(`${raw}T00:00:00.000Z`);
    return Number.isFinite(ms)
      ? { iso: new Date(ms).toISOString(), dayOnly: true }
      : null;
  }
  const ms = Date.parse(raw);
  if (!Number.isFinite(ms)) return null;
  return { iso: new Date(ms).toISOString(), dayOnly: false };
}

export function publishable(
  rows: readonly MatchRow[],
  knownTournamentKeys: ReadonlySet<string>,
): { publish: PublishablePair[]; skipped: SkippedRow[] } {
  const publish: PublishablePair[] = [];
  const skipped: SkippedRow[] = [];
  for (const row of rows) {
    const label = `${row.homeDisplay} vs ${row.awayDisplay}`;
    if (row.homeAthleteId === null || row.awayAthleteId === null) {
      // NAME THE SIDE. "unmapped_player: A vs B" tells a human a match
      // is stuck; it does not tell them which player lacks the vendor
      // id in our directory, and making them work that out by hand is
      // work the machine already did.
      const who = [
        row.homeAthleteId === null ? row.homeDisplay : null,
        row.awayAthleteId === null ? row.awayDisplay : null,
      ].filter(Boolean);
      skipped.push({
        reason: 'unmapped_player',
        detail: `${who.join(' + ')} (in ${label})`,
      });
      continue;
    }
    if (row.homeAthleteId === row.awayAthleteId) {
      // Two vendor ids mapped onto one athlete: a directory mistake that
      // would otherwise publish somebody playing themselves.
      skipped.push({ reason: 'same_player', detail: label });
      continue;
    }
    if (!knownTournamentKeys.has(row.tournamentKey)) {
      // No parent means no window to hang a provisional appearance on,
      // and inventing one would put a match in a tournament we do not
      // hold.
      skipped.push({
        reason: 'unknown_tournament',
        detail: `${row.tournamentKey} (${label})`,
      });
      continue;
    }
    // RULE 2: the human's value beats the vendor's.
    const overrideTime = row.overrideScheduledUtc ?? null;
    const overrideStatus = row.overrideStatus ?? null;
    const rawTime = overrideTime ?? row.scheduledUtc;
    const status = (overrideStatus ?? row.status ?? '').toLowerCase();
    const cancelled = CANCELLING.has(status);
    const overridden = overrideTime !== null || overrideStatus !== null;
    if (rawTime === null) {
      // Cancellation still publishes WITHOUT a time — the whole point is
      // to remove an event already in someone's calendar, and a
      // withdrawal rarely arrives with a fresh timestamp.
      if (cancelled) {
        publish.push({
          row,
          startUtc: '',
          dayOnly: true,
          cancelled: true,
          overridden,
        });
        continue;
      }
      skipped.push({ reason: 'no_time', detail: label });
      continue;
    }
    const when = instantOf(rawTime);
    if (when === null) {
      // Never coerce. A value nobody can parse must show up as a skip in
      // the run record, not as a match at the epoch.
      skipped.push({ reason: 'bad_time', detail: `${label}: "${rawTime}"` });
      continue;
    }
    publish.push({
      row,
      startUtc: when.iso,
      // An explicit date_only wins; otherwise the shape of the value
      // decides.
      dayOnly: row.timePrecision === 'date_only' ? true : when.dayOnly,
      cancelled,
      overridden,
    });
  }
  return { publish, skipped };
}

// The title a follower sees. Round is included because "Round of 32"
// is the one piece of context that makes a bare pair of names mean
// something in a calendar three weeks out.
export function matchTitle(
  row: Pick<MatchRow, 'homeDisplay' | 'awayDisplay' | 'round'>,
  tournamentName: string,
): string {
  const pair = `${row.homeDisplay} vs ${row.awayDisplay}`;
  return row.round === ''
    ? `${pair} — ${tournamentName}`
    : `${pair} — ${tournamentName}, ${row.round}`;
}
