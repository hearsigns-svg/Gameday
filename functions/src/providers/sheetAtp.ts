// ATP men's matches from the review sheet. PURE (the fetch lives in
// index.ts; everything that decides anything is here).
//
// WHY A SHEET IS A SOURCE AT ALL. No feed we can use publishes men's
// draws (docs/DECISIONS.md 2026-08-05), so the men's tour is assembled
// from a vendor API into a Google Sheet that a human can correct. The
// sheet is an INGESTION SOURCE, never the serving layer: it lands in
// Firestore through the same appearance path the WTA provider uses, so
// provisional→confirmed in-place updates, the ledger, the horizon rule
// and the reaper all still apply. A row here is a claim; a stored doc
// is still ours.
//
// THREE RULES THIS FILE ENFORCES, in order of how badly they bite:
//
// 1. AN UNMAPPED PLAYER NEVER PUBLISHES. Vendors ship their own player
//    ids; the sheet's mapping tab turns those into OUR canonical athlete
//    ids. A row whose players are not mapped is skipped, not guessed —
//    F31/F34: a surname is not an identity, and a match attributed to
//    the wrong person reaches a real calendar.
// 2. THE OVERRIDE COLUMN WINS. Always, over every vendor. It is the
//    whole reason a human-editable sheet exists — a wrong time during a
//    final is fixed in a cell, not in a deploy — and the row records
//    that the value came from a person.
// 3. COLUMNS ARE READ BY HEADER NAME, NEVER BY POSITION. A human WILL
//    insert a column. Positional parsing would silently reassign every
//    field in the sheet, which is the worst failure this design can
//    have: plausible data, wrong everywhere.

export interface SheetRow {
  // What the row is about, in OUR vocabulary.
  tournamentKey: string; // tennis-t-<slug>
  round: string; // "Round of 32" — display, from the vendor
  homeAthleteId: string | null; // canonical athlete id, null = unmapped
  awayAthleteId: string | null;
  homeDisplay: string;
  awayDisplay: string;
  // The VENDOR's own player ids. Kept alongside our canonical ids so the
  // mapping the human curates in the sheet can be stamped onto the
  // athlete as a provider id — after which resolution is CERTAIN by id
  // and never has to think about names again (athletes.ts::matchAthlete).
  homeVendorPlayerId: string;
  awayVendorPlayerId: string;
  // What the vendors say.
  scheduledUtc: string | null;
  timePrecision: 'exact' | 'date_only' | null;
  status: string | null;
  // What a human says. Any of these present wins over the vendor value.
  overrideScheduledUtc: string | null;
  overrideStatus: string | null;
  // Provenance, so a vendor that dies can be re-sourced row by row.
  vendors: string;
  vendorMatchId: string;
  // When the Apps Script last rewrote this row. The ONLY signal we have
  // that the half of the chain we do not run is still alive.
  updatedAt: string;
}

export interface PublishablePair {
  row: SheetRow;
  startUtc: string;
  dayOnly: boolean;
  cancelled: boolean;
  // Did a person set this value? Recorded on the row so the sheet can
  // show what it is still overriding, and so a vendor correction never
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

// ─── Header-keyed parsing ─────────────────────────────────────────────

const REQUIRED = ['tournament_key', 'home_display', 'away_display'] as const;

export function parseSheet(
  values: readonly (readonly string[])[],
): { rows: SheetRow[]; error: string | null } {
  // A sheet with no header is not an empty sheet — it is a failed read,
  // a renamed tab, or a permission problem, and every one of those must
  // be loud (standing invariant).
  if (values.length === 0) return { rows: [], error: 'sheet returned no rows at all' };
  const header = values[0].map((h) => String(h).trim().toLowerCase());
  const missing = REQUIRED.filter((c) => !header.includes(c));
  if (missing.length > 0) {
    return { rows: [], error: `sheet header missing: ${missing.join(', ')}` };
  }
  const at = (r: readonly string[], name: string): string => {
    const i = header.indexOf(name);
    return i === -1 ? '' : String(r[i] ?? '').trim();
  };
  const orNull = (s: string): string | null => (s === '' ? null : s);
  const rows: SheetRow[] = [];
  for (const r of values.slice(1)) {
    // A wholly blank line is spreadsheet padding, not a row.
    if (r.every((c) => String(c ?? '').trim() === '')) continue;
    const precision = at(r, 'time_precision').toLowerCase();
    rows.push({
      tournamentKey: at(r, 'tournament_key'),
      round: at(r, 'round'),
      homeAthleteId: orNull(at(r, 'home_athlete_id')),
      awayAthleteId: orNull(at(r, 'away_athlete_id')),
      homeDisplay: at(r, 'home_display'),
      awayDisplay: at(r, 'away_display'),
      homeVendorPlayerId: at(r, 'home_vendor_player_id'),
      awayVendorPlayerId: at(r, 'away_vendor_player_id'),
      scheduledUtc: orNull(at(r, 'scheduled_utc')),
      timePrecision:
        precision === 'exact' || precision === 'date_only' ? precision : null,
      status: orNull(at(r, 'status')),
      overrideScheduledUtc: orNull(at(r, 'override_scheduled_utc')),
      overrideStatus: orNull(at(r, 'override_status')),
      vendors: at(r, 'vendors'),
      vendorMatchId: at(r, 'vendor_match_id'),
      updatedAt: at(r, 'updated_at'),
    });
  }
  return { rows, error: null };
}

// ─── What may be published ────────────────────────────────────────────

// Statuses that mean "this match is not going to happen as listed". The
// vendor's own vocabulary plus the words a human would actually type in
// a cell at 11pm during a rain delay.
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
  rows: readonly SheetRow[],
  knownTournamentKeys: ReadonlySet<string>,
): { publish: PublishablePair[]; skipped: SkippedRow[] } {
  const publish: PublishablePair[] = [];
  const skipped: SkippedRow[] = [];
  for (const row of rows) {
    const label = `${row.homeDisplay} vs ${row.awayDisplay}`;
    if (row.homeAthleteId === null || row.awayAthleteId === null) {
      skipped.push({ reason: 'unmapped_player', detail: label });
      continue;
    }
    if (row.homeAthleteId === row.awayAthleteId) {
      // Two vendor ids mapped onto one athlete: a mapping mistake that
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
    // RULE 2: the human's cell beats the vendor's.
    const overridden = row.overrideScheduledUtc !== null;
    const rawTime = row.overrideScheduledUtc ?? row.scheduledUtc;
    const status = (row.overrideStatus ?? row.status ?? '').toLowerCase();
    const cancelled = CANCELLING.has(status);
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
          overridden: overridden || row.overrideStatus !== null,
        });
        continue;
      }
      skipped.push({ reason: 'no_time', detail: label });
      continue;
    }
    const when = instantOf(rawTime);
    if (when === null) {
      // Never coerce. A cell a human fat-fingered must show up as a
      // skip in the run record, not as a match at the epoch.
      skipped.push({ reason: 'bad_time', detail: `${label}: "${rawTime}"` });
      continue;
    }
    publish.push({
      row,
      startUtc: when.iso,
      // An explicit date_only in the sheet wins; otherwise the shape of
      // the value decides.
      dayOnly: row.timePrecision === 'date_only' ? true : when.dayOnly,
      cancelled,
      overridden: overridden || row.overrideStatus !== null,
    });
  }
  return { publish, skipped };
}

// The title a follower sees. Round is included because "Round of 32"
// is the one piece of context that makes a bare pair of names mean
// something in a calendar three weeks out.
export function matchTitle(row: SheetRow, tournamentName: string): string {
  const pair = `${row.homeDisplay} vs ${row.awayDisplay}`;
  return row.round === ''
    ? `${pair} — ${tournamentName}`
    : `${pair} — ${tournamentName}, ${row.round}`;
}

// ─── The mapping the sheet teaches the directory ──────────────────────
//
// Tab 3 is a human deciding that vendor player 348853 IS our
// athlete_000102. That decision is worth more than one row: stamped onto
// the athlete as a provider id, every future match involving that player
// resolves CERTAIN by id, and the name-matching path — the one F31/F34
// exist to distrust — is never consulted for them again.
//
// Emitted as intents and applied by the caller, because a pure function
// does not write to Firestore. Additive only: an athlete already
// carrying a DIFFERENT id from this vendor is a collision to report, not
// a value to overwrite.

export interface MappingIntent {
  athleteId: string;
  vendorPlayerId: string;
  displayName: string;
}

export function mappingIntents(rows: readonly SheetRow[]): MappingIntent[] {
  const out = new Map<string, MappingIntent>();
  for (const r of rows) {
    const pairs: [string | null, string, string][] = [
      [r.homeAthleteId, r.homeVendorPlayerId, r.homeDisplay],
      [r.awayAthleteId, r.awayVendorPlayerId, r.awayDisplay],
    ];
    for (const [athleteId, vendorPlayerId, displayName] of pairs) {
      if (athleteId === null || vendorPlayerId === '') continue;
      // Keyed by the PAIR: the same mapping repeated across twenty
      // matches is one intent, while two different athletes claiming one
      // vendor id survive as two, so the caller can see the collision
      // instead of inheriting whichever row happened to come first.
      out.set(`${athleteId}|${vendorPlayerId}`, {
        athleteId,
        vendorPlayerId,
        displayName,
      });
    }
  }
  return [...out.values()];
}

// ─── Is the half of the chain we do not run still alive? ──────────────
//
// `yield_died` CANNOT cover this source. It keys on futureDated, and
// this slice publishes zero fixtures by design — its matches are
// appearances, and the alert file states that an appearance funnel
// dying alone never pages. So a dead Apps Script (trigger removed,
// vendor quota gone, payload shape changed) would leave pollSheetAtp
// succeeding against a frozen sheet, publishing the same stale rows,
// for ever — the exact silent outage the standing invariant exists to
// forbid, arriving through the one door nothing was watching.
//
// The sheet stamps every row with the time it was rewritten. If the
// newest stamp is far older than the script's own cadence WHILE a
// tournament is live, the script has stopped and this run must FAIL —
// which turns an invisible outage into `no_success_24h`.
//
// Only while a tournament is live: with nothing on, the script no-ops
// by design and the stamps go legitimately stale.

export function newestStamp(rows: readonly SheetRow[]): number | null {
  let newest: number | null = null;
  for (const r of rows) {
    const ms = Date.parse(r.updatedAt);
    if (!Number.isFinite(ms)) continue;
    if (newest === null || ms > newest) newest = ms;
  }
  return newest;
}

export function stalenessError(
  rows: readonly SheetRow[],
  nowMs: number,
  maxAgeMs: number,
): string | null {
  const newest = newestStamp(rows);
  if (newest === null) {
    // Rows exist but not one carries a readable stamp: either the
    // script never wrote them or the column was renamed. Both mean we
    // cannot tell whether this data is current, and "cannot tell" is
    // not "fine".
    return rows.length === 0 ? null : 'sheet rows carry no readable updated_at';
  }
  const ageMs = nowMs - newest;
  if (ageMs <= maxAgeMs) return null;
  return `sheet is stale: newest row written ${Math.round(ageMs / 60_000)} min ago while a tournament is live`;
}
