// Men's ATP matches from the vendor, inside the function. PURE decisions
// plus two thin fetch helpers; everything that talks to Firestore stays
// in index.ts::pollAtpVendor.
//
// WHAT THIS REPLACES (Round 4 item 7, owner ruling 2026-09-02). Until
// now the vendor fetch lived in scripts/atp-sheet.gs — a Google Apps
// Script on its own 2-hourly trigger, writing a sheet that pollSheetAtp
// read into Firestore. That half of the chain was UNMONITORED: the
// script stopped on 2026-08-29, nothing paged, and for the first four
// days of the 2026 US Open pollSheetAtp failed its staleness check every
// sweep while zero men's matches published. The chain is now
// vendor → Function → Firestore. The sheet, the script and the Sheets
// read are gone; the status the sheet's tab used to hold is in the run
// record and in status/atpVendor.
//
// THE RULES IT KEEPS FROM THE SCRIPT, AND THE ONE IT DROPS:
//
// 1. VENDOR QUOTA IS THE SCARCE THING. Measured 2026-09-02 from the
//    vendor's own headers: `x-ratelimit-requests-limit: 50` per key per
//    day (DECISIONS 2026-08-06 measured the same). So: ask OUR OWN store
//    what is playing before spending a request, pay tournament
//    discovery once (a static map first, then a Firestore-cached
//    lookup), and stop when nothing is on — a week without ATP tennis
//    costs zero requests.
// 2. AN UNMAPPED PLAYER IS SKIPPED, NEVER GUESSED. Mapping is BY VENDOR
//    ID against our own directory (`providerIds.tennisapi1`, stamped by
//    the weekly ranking refresh — 491 of 502 men carry one). There is
//    no name matching anywhere in this path: a player without the id is
//    named in the run record as `unmapped_player` and publishes nothing.
// 3. DROPPED: KEY ROTATION. The script rotated three free keys on one
//    host — quota stacking, not redundancy (DECISIONS 2026-08-06). The
//    posture now is ONE key, `ATP_VENDOR_KEY`, no rotation; if a slam
//    fortnight does not fit its limit, the answer is the vendor's paid
//    tier on the same key, never a second free one.
//
// PAGINATION, measured on the live 2026 US Open (page 0 banked as
// __tests__/fixtures/tennisapi1-events-sample.json): `events/next/{page}`
// serves 30 events a page with a boolean `hasNextPage`, and you are done
// when it is false (36 upcoming matches on 2026-09-02: page 0 held 30
// with hasNextPage true, page 1 held 6 with hasNextPage false). The
// script only ever read page 0, so a 128-draw's first round — 64
// matches — was published one page out of three.

import { AppearanceDraft, AthleteRef } from '../athletes';
import { appearanceFor } from '../appearances';
import { Fixture, FixtureStatus } from '../fixture';
import { stageFrom } from '../stage';
import { requireArray } from './fetchResult';
import { HOST, normaliseForMatch, VENDOR } from './tennisApiAtp';
import { matchTitle, MatchRow, PublishablePair, publishable, SkippedRow } from './atpMatchRules';

// ─── Which tournaments are on ─────────────────────────────────────────

export interface ActiveWindow {
  tournamentKey: string; // tennis-t-<slug>
  name: string; // the parent's title — what a follower sees
  venueCity: string | null; // ICS LOCATION verbatim, e.g. "New York USA"
  startUtc: string;
  endUtc: string;
  parent: Fixture;
}

// Live now, or starting inside 48h — draws and the first order of play
// publish before play begins, and a calendar app that learns the time
// on the morning of the match has already lost.
export const WINDOW_LOOKAHEAD_MS = 48 * 3_600_000;

// The tour parents (competitionId tennis-atp) that are live or imminent,
// one per tournament key — the SOONEST live-or-upcoming edition owns the
// key. Cancelled parents are not windows. Sorted soonest first, which is
// the order the coverage plan spends in.
export function activeWindows(
  parents: readonly Fixture[],
  nowMs: number,
  lookaheadMs: number = WINDOW_LOOKAHEAD_MS,
): ActiveWindow[] {
  const byKey = new Map<string, ActiveWindow>();
  for (const f of parents) {
    if (f.status === 'cancelled') continue;
    const key = f.followKeys.find((k) => k.startsWith('tennis-t-'));
    if (!key) continue;
    const start = Date.parse(f.startUtc);
    if (!Number.isFinite(start)) continue;
    const end = start + (f.durationHours ?? 24) * 3_600_000;
    if (end <= nowMs || start >= nowMs + lookaheadMs) continue;
    const held = byKey.get(key);
    if (held && held.startUtc <= f.startUtc) continue;
    byKey.set(key, {
      tournamentKey: key,
      name: f.title,
      venueCity: f.venueCity ?? null,
      startUtc: f.startUtc,
      endUtc: new Date(end).toISOString(),
      parent: f,
    });
  }
  return [...byKey.values()].sort((a, b) => a.startUtc.localeCompare(b.startUtc));
}

// ─── Vendor tournament ids: static first, then discovery ──────────────

export interface KnownVendorId {
  // The vendor's uniqueTournament id for the MEN'S SINGLES draw. null =
  // not yet confirmed: runtime discovery handles the tournament (by
  // title, then city) and caches the answer; the owner fills the number
  // after checking it. NEVER a guess — a wrong id here publishes another
  // tournament's draw under this key.
  vendorTournamentId: number | null;
  // The entity name the vendor returned for that id, verbatim — what a
  // person checks the id against.
  vendorName?: string;
  note: string;
}

// The four slams and the nine ATP Masters 1000s, keyed by OUR
// tournament key (tennisTournaments.ts::tournamentKey over the ICS
// title; the Masters keys are the ones the live store mints, read from
// scripts/curated-marks-review.md). Ids marked "confirmed" were read
// from the vendor's own search results on 2026-09-02, entity names
// quoted verbatim.
//
// TODO (owner): fill the null ids. Each is one read-only vendor call —
// `GET /api/tennis/search/<city>` — accept the result with
// `category.name === 'ATP'` whose name is the bare city or the city
// with ", Men", never one containing "Doubles". Until filled, discovery
// does exactly that at runtime and caches it in
// status/atpVendorTournaments, so nothing is blocked — this is a
// two-requests-a-year saving and a guard against a mis-hit, not a gate.
export const KNOWN_VENDOR_IDS: Readonly<Record<string, KnownVendorId>> = {
  // ── Grand Slams ──
  'tennis-t-australian-open': {
    vendorTournamentId: 2363,
    vendorName: 'Australian Open, Men',
    note: 'confirmed 2026-09-02: "Australian Open, Men" (ATP). Not 2455 "Men Doubles", not 2403 "Mixed Doubles" (also category ATP), not the wildcard playoffs.',
  },
  'tennis-t-roland-garros': {
    vendorTournamentId: 2480,
    vendorName: 'Roland Garros, Men',
    note: 'confirmed 2026-09-02: "Roland Garros, Men" (ATP). Not 2393 "Men Doubles", not 2417 "Mixed Doubles".',
  },
  'tennis-t-wimbledon': {
    vendorTournamentId: 2361,
    vendorName: 'Wimbledon, Men',
    note: 'confirmed 2026-09-02: "Wimbledon, Men" (ATP). Not 2375 "Men Doubles", not 2364 "Mixed Doubles".',
  },
  'tennis-t-us-open': {
    vendorTournamentId: 2449,
    vendorName: 'US Open, Men',
    note: 'confirmed 2026-09-02: "US Open, Men" (ATP); season 2026 = 85956, its events page is the banked fixture. Not 2508 "Men Doubles", not 2402 "Mixed Doubles".',
  },
  // ── ATP Masters 1000 ──
  'tennis-t-bnp-paribas-open': {
    vendorTournamentId: 2487,
    vendorName: 'Indian Wells',
    note: 'Indian Wells — confirmed 2026-09-02: "Indian Wells" (ATP). Not 2619 (WTA, same name), not 2422 "Doubles", not the 107xx Challenger/WTA-125 entities.',
  },
  'tennis-t-miami-open-presented-by-itau': {
    vendorTournamentId: null,
    note: 'TODO — search "Miami"; expect the bare ATP entity beside a WTA one and a ", Doubles".',
  },
  'tennis-t-rolex-monte-carlo-masters': {
    vendorTournamentId: null,
    note: 'TODO — search "Monte-Carlo" (the venue is Roquebrune-Cap-Martin; the ICS city may not match, so this one benefits most from a static id).',
  },
  'tennis-t-mutua-madrid-open': {
    vendorTournamentId: null,
    note: 'TODO — search "Madrid". KEY UNVERIFIED offline: the Madrid parent was not in any banked key list — confirm the key against listTournaments before filling the id.',
  },
  'tennis-t-internazionali-bnl-d-italia': {
    vendorTournamentId: null,
    note: 'TODO — search "Rome".',
  },
  'tennis-t-national-bank-open': {
    vendorTournamentId: null,
    note: 'TODO — the men alternate Montreal (even years) and Toronto (odd years); the vendor may hold TWO entities. Discovery searches the ICS city each edition, and a discovered entry is re-resolved when the city changes — a static id here must be the one the vendor uses for BOTH cities, or stay null.',
  },
  'tennis-t-cincinnati-open': {
    vendorTournamentId: null,
    note: 'TODO — search "Cincinnati".',
  },
  'tennis-t-rolex-shanghai-masters': {
    vendorTournamentId: 2519,
    vendorName: 'Shanghai',
    note: 'confirmed 2026-09-02: "Shanghai" (ATP). Not 2440 "Shanghai, Doubles", not 4136 "Shanghai, China" (Challenger).',
  },
  'tennis-t-rolex-paris-masters': {
    vendorTournamentId: 2404,
    vendorName: 'Paris',
    note: 'confirmed 2026-09-02: "Paris" (ATP). Not 2656 "Paris" (WTA — same name, different category), not 2442 "Paris, Doubles", not 18568 "Paris, France" (WTA 125). Roland Garros is its own entity (2480) and never appears under "Paris".',
  },
};

// Search terms, in the order they are tried. TITLE FIRST, then the city
// (owner brief, Round 4 item 7): the title is what identifies a slam
// ("US Open" hits "US Open, Men"; its city "New York" hits nothing but
// wheelchair juniors), while a sponsor's title ("Rolex Shanghai
// Masters") misses and the city ("Shanghai") is the form the vendor
// indexes. The title is cut at a comma, an em/en dash or a spaced
// hyphen only — "Monte-Carlo" and "Winston-Salem" are one word.
//
// The city arrives as the ICS LOCATION, "New York USA" — city then
// country, no comma. Two forms are tried: the city with its trailing
// country token removed (the vendor's own naming), then the string
// verbatim.
export function discoveryCandidates(win: {
  name: string;
  venueCity: string | null;
}): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (raw: string | null | undefined) => {
    const term = String(raw ?? '').trim().replace(/\s+/g, ' ');
    if (term === '') return;
    const k = term.toLowerCase();
    if (seen.has(k)) return;
    seen.add(k);
    out.push(term);
  };
  push(win.name.split(/,|—|–| - /)[0]);
  if (win.venueCity) {
    const city = win.venueCity.trim();
    const beforeComma = city.split(',')[0].trim();
    if (beforeComma !== city) push(beforeComma);
    else {
      const tokens = city.split(/\s+/);
      if (tokens.length >= 2) push(tokens.slice(0, -1).join(' '));
    }
    push(city);
  }
  return out;
}

export interface SearchEntity {
  id: number;
  name: string;
  slug?: string;
  category?: { name?: string };
}

// Names that are ATP-category entities but NOT the men's singles main
// draw. Measured in the banked searches: "US Open, Mixed Doubles" and
// "Australian Open Asia-Pacific Wildcard Playoff" both carry
// category.name 'ATP'.
const NOT_MAIN_DRAW = /doubles|wildcard|playoff|play-off|qualif|junior|legend|wheelchair/i;

// The vendor entity for a search term: category ATP, singles, and NAMED
// FOR THE TERM. The script accepted the first ATP non-doubles hit; the
// Australian Open search shows why that is not enough — with the main
// draw missing from a result page, first-hit would have published a
// wildcard playoff under a slam's key. So the name must equal the term
// (with an optional ", Men" — the slams' form) or start with it at a
// comma ("Shanghai, China" style); anything else is a miss, and a miss
// is reported, never improvised.
export function pickAtpSinglesEntity(
  body: unknown,
  term: string,
): SearchEntity | null {
  if (body === null || body === undefined) return null; // 204: nothing there
  const results = requireArray(
    (body as { results?: unknown[] | null }).results,
    VENDOR,
    'results',
  );
  const want = normaliseForMatch(term);
  if (want === '') return null;
  let exact: SearchEntity | null = null;
  let prefixed: SearchEntity | null = null;
  for (const r of results) {
    const x = r as { type?: string; entity?: SearchEntity };
    const e = x.entity;
    if (!e || typeof e.id !== 'number' || typeof e.name !== 'string') continue;
    if (x.type !== undefined && x.type !== 'uniqueTournament') continue;
    if (e.category?.name !== 'ATP') continue;
    if (NOT_MAIN_DRAW.test(e.name)) continue;
    const bare = normaliseForMatch(e.name.replace(/,\s*men\s*$/i, ''));
    if (bare === want) {
      exact ??= e;
    } else if (
      e.name.toLowerCase().startsWith(`${term.toLowerCase()},`) &&
      normaliseForMatch(e.name.split(',')[0]) === want
    ) {
      prefixed ??= e;
    }
  }
  return exact ?? prefixed;
}

// The season id for a year. A seasons body without a `seasons` array is
// a shape change and throws (standing invariant); a year the vendor has
// not published is a legitimate null.
export function seasonIdFor(body: unknown, year: number): number | null {
  const seasons = requireArray(
    (body as { seasons?: unknown[] | null } | null)?.seasons,
    VENDOR,
    'seasons',
  );
  for (const s of seasons) {
    const x = s as { id?: number; year?: string | number };
    if (String(x.year) === String(year) && typeof x.id === 'number') return x.id;
  }
  return null;
}

// ─── The events page ──────────────────────────────────────────────────

export interface VendorTeam {
  id?: number;
  name?: string;
  slug?: string;
  country?: { alpha3?: string };
  subTeams?: unknown[];
  type?: number;
}

export interface VendorEvent {
  id?: number;
  slug?: string;
  startTimestamp?: number;
  roundInfo?: { round?: number; name?: string; slug?: string };
  status?: { code?: number; type?: string; description?: string };
  homeTeam?: VendorTeam;
  awayTeam?: VendorTeam;
  changes?: { changeTimestamp?: number; changes?: string[] };
}

export const EVENTS_PAGE_SIZE = 30; // measured 2026-09-02, both pages
// A runaway guard on the pagination loop, not a coverage cap: a 128-draw
// never has more than ~70 not-started matches (3 pages). Six pages is
// 180 matches — a vendor that serves that many for one draw has changed
// shape, and the loop stops and SAYS so rather than spending the day's
// quota on it.
export const MAX_EVENT_PAGES = 6;

export function parseEventsPage(body: unknown): {
  events: VendorEvent[];
  hasNextPage: boolean;
} {
  if (body === null || typeof body !== 'object') {
    throw new Error(`${VENDOR}: events response is not an object`);
  }
  const b = body as { events?: unknown[] | null; hasNextPage?: unknown };
  const events = requireArray(b.events, VENDOR, 'events') as VendorEvent[];
  // The flag is how a page knows it is the last one. Absent means the
  // vendor changed the contract, and reading absence as "last page"
  // would silently publish one page of a three-page draw.
  if (typeof b.hasNextPage !== 'boolean') {
    throw new Error(`${VENDOR}: events response missing boolean "hasNextPage"`);
  }
  return { events, hasNextPage: b.hasNextPage };
}

// The neutral record one vendor payload becomes — the same shape the
// script wrote to its raw_pulls tab, so the downstream rules did not
// change when the fetch moved.
export interface Observation {
  fetchedAt: string;
  vendor: string;
  tournamentKey: string;
  vendorTournamentId: number;
  vendorMatchId: string;
  round: string; // roundInfo.name — the text stage.ts keys on
  homeDisplay: string;
  homeVendorPlayerId: string;
  homeCountry: string | null;
  awayDisplay: string;
  awayVendorPlayerId: string;
  awayCountry: string | null;
  scheduledUtc: string | null;
  status: string; // status.type: notstarted | inprogress | suspended | canceled | ...
  changeTimestamp: number;
  // False for a doubles pairing that reached us anyway (a team with
  // sub-teams, or a "/" in the name). The entity picker already refuses
  // doubles draws; this is the belt over those braces.
  singles: boolean;
}

export function observationsFrom(
  events: readonly VendorEvent[],
  tournamentKey: string,
  vendorTournamentId: number,
  fetchedAt: string,
): { observations: Observation[]; malformed: number } {
  const observations: Observation[] = [];
  let malformed = 0;
  for (const e of events) {
    const home = e.homeTeam ?? {};
    const away = e.awayTeam ?? {};
    if (typeof e.id !== 'number' || !home.name || !away.name) {
      malformed++;
      continue;
    }
    const isSingles = (t: VendorTeam) =>
      !(Array.isArray(t.subTeams) && t.subTeams.length > 0) &&
      !/\//.test(t.name ?? '');
    observations.push({
      fetchedAt,
      vendor: VENDOR,
      tournamentKey,
      vendorTournamentId,
      vendorMatchId: String(e.id),
      round: e.roundInfo?.name ?? e.roundInfo?.slug ?? '',
      homeDisplay: home.name,
      homeVendorPlayerId: home.id !== undefined ? String(home.id) : '',
      homeCountry: home.country?.alpha3 ?? null,
      awayDisplay: away.name,
      awayVendorPlayerId: away.id !== undefined ? String(away.id) : '',
      awayCountry: away.country?.alpha3 ?? null,
      scheduledUtc:
        typeof e.startTimestamp === 'number' && e.startTimestamp > 0
          ? new Date(e.startTimestamp * 1000).toISOString()
          : null,
      status: e.status?.type ?? '',
      changeTimestamp: e.changes?.changeTimestamp ?? 0,
      singles: isSingles(home) && isSingles(away),
    });
  }
  return { observations, malformed };
}

// ─── Players, by vendor id, against our own directory ─────────────────

// vendor player id → our canonical athlete id, or null when the
// directory holds nobody with that id. No name fallback: that is the
// whole rule.
export type AthleteIdByVendorId = (vendorPlayerId: string) => string | null;

export function rowsFrom(
  observations: readonly Observation[],
  athleteIdOf: AthleteIdByVendorId,
): MatchRow[] {
  return observations.map((o) => ({
    tournamentKey: o.tournamentKey,
    round: o.round,
    homeAthleteId: o.homeVendorPlayerId === '' ? null : athleteIdOf(o.homeVendorPlayerId),
    awayAthleteId: o.awayVendorPlayerId === '' ? null : athleteIdOf(o.awayVendorPlayerId),
    homeDisplay: o.homeDisplay,
    awayDisplay: o.awayDisplay,
    homeVendorPlayerId: o.homeVendorPlayerId,
    awayVendorPlayerId: o.awayVendorPlayerId,
    scheduledUtc: o.scheduledUtc,
    timePrecision: o.scheduledUtc === null ? null : 'exact',
    status: o.status === '' ? null : o.status,
    vendors: o.vendor,
    vendorMatchId: o.vendorMatchId,
    updatedAt: o.fetchedAt,
  }));
}

// ─── Rows → appearance drafts ─────────────────────────────────────────
//
// ONE DOC PER PLAYER, exactly as the WTA provider does — not one per
// match. A single doc carrying BOTH players as id-bearing refs trips
// resolution's F34 guard (one provider id per doc id): the second ref is
// refused and the match reaches only one player's followers. Measured
// on the sheet chain's first live run (nine Montreal matches, each
// reaching one of its two players). Per-player docs give each ref its
// own doc id; both players get the match and neither can masquerade as
// the other. Titled from THIS player's side, so the event in their
// calendar names them first.
export function draftsFrom(
  publish: readonly PublishablePair[],
  parents: ReadonlyMap<string, Fixture>,
  nowIso: string,
): AppearanceDraft[] {
  return publish.flatMap((p) => {
    const parent = parents.get(p.row.tournamentKey);
    if (!parent) return [];
    const sides = [
      { name: p.row.homeDisplay, id: p.row.homeVendorPlayerId, opponent: p.row.awayDisplay },
      { name: p.row.awayDisplay, id: p.row.awayVendorPlayerId, opponent: p.row.homeDisplay },
    ];
    return sides.flatMap((side) => {
      const ref: AthleteRef = {
        name: side.name,
        ...(side.id ? { source: VENDOR, externalId: side.id } : {}),
      };
      const draft = appearanceFor(parent, {
        refs: [ref],
        title: matchTitle(
          { round: p.row.round, homeDisplay: side.name, awayDisplay: side.opponent },
          parent.title,
        ),
        updatedAt: nowIso,
        ...(p.cancelled || p.startUtc === ''
          ? {}
          : {
              slot: p.dayOnly
                ? { startUtc: p.startUtc, durationHours: 24, dayOnly: true }
                : { startUtc: p.startUtc, durationHours: 3 },
            }),
      });
      if (!draft) return [];
      // ROUND AS A FIELD, not only a title suffix: the suffix survives
      // for display, but "A vs B — National Bank Open presented by
      // Rogers, Round of 32" cannot be parsed back (tournament names
      // contain commas).
      const stage = stageFrom({ round: p.row.round });
      const withStage = stage
        ? { ...draft, fixture: { ...draft.fixture, stage } }
        : draft;
      // A withdrawal has to REMOVE an event already sitting in somebody's
      // calendar.
      return p.cancelled
        ? [
            {
              ...withStage,
              fixture: {
                ...withStage.fixture,
                status: 'cancelled' as FixtureStatus,
              },
            },
          ]
        : [withStage];
    });
  });
}

// ─── Quota: read from the vendor's headers, so exhaustion is predicted ─

export const DAILY_LIMIT_PER_KEY = 50; // x-ratelimit-requests-limit, measured
// Below this many requests left, the run stops taking on new tournaments
// and covers the soonest ones only — a FLOOR that keeps a thin day
// degrading freshness instead of failing wholesale on the last draw.
export const RESERVE = 8;
// What one tournament costs a run at worst: a seasons lookup plus up to
// three event pages (a 128-draw's first round). Discovery adds one more
// on a tournament's first appearance.
export const COST_PER_TOURNAMENT = 4;
export const SWEEPS_PER_DAY = 4; // the 6h sweep

export interface VendorQuota {
  limit: number;
  remaining: number;
  resetAt: string; // when the vendor said the window resets
  observedAt: string;
}

export function quotaFromHeaders(
  header: (name: string) => string | null | undefined,
  nowMs: number,
): VendorQuota | null {
  const limit = Number(header('x-ratelimit-requests-limit'));
  const remaining = Number(header('x-ratelimit-requests-remaining'));
  const resetSeconds = Number(header('x-ratelimit-requests-reset'));
  if (!Number.isFinite(limit) || !Number.isFinite(remaining)) return null;
  return {
    limit,
    remaining,
    resetAt: new Date(
      nowMs + (Number.isFinite(resetSeconds) ? resetSeconds : 0) * 1000,
    ).toISOString(),
    observedAt: new Date(nowMs).toISOString(),
  };
}

// Requests we can spend now. UNKNOWN COUNTS AS FULL: a key we have never
// called is not a key we know is empty, and treating unknown as zero
// would stall a fresh deploy for ever. A window that has reset since the
// last observation is full again.
export function quotaAvailable(
  q: VendorQuota | null | undefined,
  nowMs: number,
): number {
  if (!q) return DAILY_LIMIT_PER_KEY;
  if (Date.parse(q.resetAt) <= nowMs) return q.limit;
  return q.remaining;
}

// ADAPTIVE COVERAGE, as a floor. When the budget is thin we cover the
// tournaments STARTING SOONEST and say what we dropped — a stated gap
// beats a silent one, and beats a run that fails wholesale because the
// key ran dry on the ninth of thirteen draws.
export function planCoverage<T extends { startUtc: string }>(
  windows: readonly T[],
  available: number,
  reserve: number = RESERVE,
  costPerTournament: number = COST_PER_TOURNAMENT,
): { cover: T[]; deferred: T[] } {
  const affordable = Math.max(
    1,
    Math.floor((available - reserve) / costPerTournament),
  );
  const sorted = [...windows].sort((a, b) => a.startUtc.localeCompare(b.startUtc));
  return { cover: sorted.slice(0, affordable), deferred: sorted.slice(affordable) };
}

export interface QuotaForecast {
  spentThisRun: number;
  // This run's spend at the sweep cadence — what a day of runs like
  // this one costs against the daily limit.
  projectedDailySpend: number;
  remaining: number | null;
  // How many more runs of this size the window has room for. null when
  // the vendor has not told us yet.
  runsLeftInWindow: number | null;
  // True when the next run of this size would not fit, or a day of them
  // would exceed the limit — the signal to buy the paid tier on this
  // key, not to add a second one.
  exhaustionRisk: boolean;
}

export function forecastQuota(
  q: VendorQuota | null,
  spentThisRun: number,
  sweepsPerDay: number = SWEEPS_PER_DAY,
): QuotaForecast {
  const projectedDailySpend = spentThisRun * sweepsPerDay;
  const limit = q?.limit ?? DAILY_LIMIT_PER_KEY;
  const remaining = q?.remaining ?? null;
  const runsLeftInWindow =
    remaining === null ? null : spentThisRun === 0 ? Infinity : Math.floor(remaining / spentThisRun);
  return {
    spentThisRun,
    projectedDailySpend,
    remaining,
    runsLeftInWindow: runsLeftInWindow === Infinity ? null : runsLeftInWindow,
    exhaustionRisk:
      projectedDailySpend > limit ||
      (remaining !== null && spentThisRun > 0 && remaining < spentThisRun),
  };
}

// ─── The budget: a slam fortnight on one key ──────────────────────────

export function pagesFor(upcomingMatches: number): number {
  return Math.max(1, Math.ceil(upcomingMatches / EVENTS_PAGE_SIZE));
}

export interface FortnightBudget {
  pageSize: number;
  sweepsPerDay: number;
  dailyLimit: number;
  // Per calendar day of the fortnight, events pages × sweeps, plus the
  // one-time discovery on day 1. The ranking refresh (weekly, one call)
  // is added to the peak-day check rather than a specific day.
  perDay: number[];
  peakDay: number; // the worst single day of the round-by-round profile
  fortnightTotal: number;
  // If every sweep of the fortnight fetched a full first round — the
  // ceiling no real draw reaches.
  worstCaseDay: number;
  worstCaseFortnight: number;
  fitsPeakDay: boolean;
  fitsWorstCaseDay: boolean;
  marginOnPeakDay: number;
  marginOnWorstCaseDay: number;
}

// A knockout ladder from `drawSize` players, two days a round over a
// fortnight (a 128-draw is seven rounds: 64, 32, 16, 8, 4, 2, 1 matches
// upcoming). Each sweep reads the WHOLE upcoming set for the live
// tournament — 1 windows read (ours, free) + 0 discovery once cached +
// the pages — and player mapping costs no vendor call at all (by id,
// from our own directory).
export function slamFortnightBudget(
  opts: {
    drawSize?: number;
    sweepsPerDay?: number;
    discoveryCalls?: number; // search + seasons on first sight; 1 with a static id
    rankingCallsPerWeek?: number; // the weekly men's directory refresh
    dailyLimit?: number;
  } = {},
): FortnightBudget {
  const drawSize = opts.drawSize ?? 128;
  const sweepsPerDay = opts.sweepsPerDay ?? SWEEPS_PER_DAY;
  const discoveryCalls = opts.discoveryCalls ?? 2;
  const rankingCallsPerWeek = opts.rankingCallsPerWeek ?? 1;
  const dailyLimit = opts.dailyLimit ?? DAILY_LIMIT_PER_KEY;
  const rounds: number[] = [];
  for (let m = drawSize / 2; m >= 1; m = Math.ceil(m / 2)) {
    rounds.push(m);
    if (m === 1) break;
  }
  const perDay = rounds.flatMap((m) => [
    pagesFor(m) * sweepsPerDay,
    pagesFor(m) * sweepsPerDay,
  ]);
  perDay[0] += discoveryCalls;
  const rankingCalls = rankingCallsPerWeek * 2;
  const peakDay = Math.max(...perDay) + rankingCallsPerWeek;
  const fortnightTotal = perDay.reduce((a, b) => a + b, 0) + rankingCalls;
  const firstRoundPages = pagesFor(drawSize / 2);
  const worstCaseDay = firstRoundPages * sweepsPerDay + discoveryCalls + rankingCallsPerWeek;
  const worstCaseFortnight =
    firstRoundPages * sweepsPerDay * perDay.length + discoveryCalls + rankingCalls;
  return {
    pageSize: EVENTS_PAGE_SIZE,
    sweepsPerDay,
    dailyLimit,
    perDay,
    peakDay,
    fortnightTotal,
    worstCaseDay,
    worstCaseFortnight,
    fitsPeakDay: peakDay <= dailyLimit,
    fitsWorstCaseDay: worstCaseDay <= dailyLimit,
    marginOnPeakDay: dailyLimit - peakDay,
    marginOnWorstCaseDay: dailyLimit - worstCaseDay,
  };
}

// ─── The run record body: STATUS, where a person will read it ─────────

export type VendorRequestKind = 'search' | 'seasons' | 'events';
export type AtpVendorRunState = 'idle' | 'ok' | 'partial' | 'budgeted' | 'partial+budgeted';

export interface AtpVendorStatusInput {
  nowMs: number;
  windows: { seen: number; covered: string[]; deferred: string[] };
  discovery: { static: number; cached: number; discovered: number; misses: string[] };
  requests: Record<VendorRequestKind, number>;
  pages: number;
  quota: VendorQuota | null;
  rows: { fetched: number; malformed: number; notSingles: number; published: number };
  skipped: readonly SkippedRow[];
  errors: string[];
}

export interface AtpVendorStatus {
  status: AtpVendorRunState;
  windows: AtpVendorStatusInput['windows'];
  discovery: AtpVendorStatusInput['discovery'];
  requests: { spent: number; search: number; seasons: number; events: number; pages: number };
  quota: VendorQuota | null;
  forecast: QuotaForecast;
  rows: {
    fetched: number;
    malformed: number;
    notSingles: number;
    published: number;
    skipped: number;
    skippedByReason: Record<string, number>;
    // Named, not just counted: an unmapped player is a job for a human,
    // and a count alone tells them nothing about who.
    skippedDetail: string[];
  };
  errors: string[];
}

export function statusBody(input: AtpVendorStatusInput): AtpVendorStatus {
  const spent = input.requests.search + input.requests.seasons + input.requests.events;
  const budgeted = input.windows.deferred.length > 0;
  const partial = input.errors.length > 0;
  const status: AtpVendorRunState =
    input.windows.seen === 0
      ? 'idle'
      : partial && budgeted
        ? 'partial+budgeted'
        : partial
          ? 'partial'
          : budgeted
            ? 'budgeted'
            : 'ok';
  return {
    status,
    windows: input.windows,
    discovery: input.discovery,
    requests: { spent, ...input.requests, pages: input.pages },
    quota: input.quota,
    forecast: forecastQuota(input.quota, spent),
    rows: {
      ...input.rows,
      skipped: input.skipped.length,
      skippedByReason: input.skipped.reduce<Record<string, number>>((m, s) => {
        m[s.reason] = (m[s.reason] ?? 0) + 1;
        return m;
      }, {}),
      skippedDetail: input.skipped.slice(0, 25).map((s) => `${s.reason}: ${s.detail}`),
    },
    errors: input.errors,
  };
}

// ─── Tournament id cache (status/atpVendorTournaments) ────────────────

export interface TournamentCacheEntry {
  vendorTournamentId: number;
  vendorName: string; // the entity name the vendor returned
  venueCity: string | null; // the ICS city the discovery searched with
  via: 'static' | 'discovered';
  resolvedAt: string;
  seasons: Record<string, number>; // year → vendor season id
}

// A cached DISCOVERED entry is trusted only for the city it was found
// with: the National Bank Open alternates Montreal and Toronto, and the
// vendor may hold them as two tournaments. A static entry is the owner's
// word and is trusted regardless.
export function cacheEntryUsable(
  entry: TournamentCacheEntry | undefined,
  win: { venueCity: string | null },
): entry is TournamentCacheEntry {
  if (!entry || typeof entry.vendorTournamentId !== 'number') return false;
  if (entry.via === 'static') return true;
  return (entry.venueCity ?? null) === (win.venueCity ?? null);
}

export interface ResolvedIds {
  tournamentId: number;
  seasonId: number;
  via: 'static' | 'cached' | 'discovered';
  searched: string[]; // terms spent on discovery, in order
  entry: TournamentCacheEntry; // what to persist
}

export type VendorGet = (kind: VendorRequestKind, path: string) => Promise<unknown>;

// Vendor tournament + season ids for one window. Static map first (free),
// then the Firestore cache (free), then discovery (one search per term
// until a hit). The season lookup is paid once per tournament per year
// and cached beside the id.
export async function resolveVendorIds(
  win: ActiveWindow,
  cache: Readonly<Record<string, TournamentCacheEntry>>,
  get: VendorGet,
  nowIso: string,
): Promise<ResolvedIds> {
  const year = new Date(win.startUtc).getUTCFullYear();
  const known = KNOWN_VENDOR_IDS[win.tournamentKey];
  const cached = cache[win.tournamentKey];
  let entry: TournamentCacheEntry;
  let via: ResolvedIds['via'];
  const searched: string[] = [];
  if (known && known.vendorTournamentId !== null) {
    via = 'static';
    entry =
      cached && cached.vendorTournamentId === known.vendorTournamentId
        ? { ...cached, via: 'static' }
        : {
            vendorTournamentId: known.vendorTournamentId,
            vendorName: known.vendorName ?? '',
            venueCity: win.venueCity,
            via: 'static',
            resolvedAt: nowIso,
            seasons: {},
          };
  } else if (cacheEntryUsable(cached, win)) {
    via = 'cached';
    entry = cached;
  } else {
    via = 'discovered';
    let hit: SearchEntity | null = null;
    for (const term of discoveryCandidates(win)) {
      searched.push(term);
      const body = await get('search', `/api/tennis/search/${encodeURIComponent(term)}`);
      hit = pickAtpSinglesEntity(body, term);
      if (hit) break;
    }
    if (!hit) {
      throw new Error(
        `no ATP singles entity for ${win.tournamentKey}; searched ${searched.join(', ')} — fill KNOWN_VENDOR_IDS`,
      );
    }
    entry = {
      vendorTournamentId: hit.id,
      vendorName: hit.name,
      venueCity: win.venueCity,
      via: 'discovered',
      resolvedAt: nowIso,
      seasons: {},
    };
  }
  let seasonId = entry.seasons?.[String(year)];
  if (typeof seasonId !== 'number') {
    const body = await get('seasons', `/api/tennis/tournament/${entry.vendorTournamentId}/seasons`);
    const found = seasonIdFor(body, year);
    if (found === null) {
      throw new Error(
        `no ${year} season for vendor tournament ${entry.vendorTournamentId} (${win.tournamentKey})`,
      );
    }
    seasonId = found;
    entry = { ...entry, seasons: { ...(entry.seasons ?? {}), [String(year)]: seasonId } };
  }
  return { tournamentId: entry.vendorTournamentId, seasonId, via, searched, entry };
}

// ─── The fetch ────────────────────────────────────────────────────────

// One GET against the vendor with the ONE key. The quota headers are
// read on EVERY answer, 429s included — a refusal is the most important
// quota observation there is — before the status is judged. 204 is
// "genuinely nothing there" (the script's convention, kept); anything
// else non-2xx throws `tennisapi1 http <status>` so the run record
// recovers the real status.
export async function vendorGet(
  path: string,
  key: string,
  onQuota: (q: VendorQuota) => void,
  fetchImpl: typeof fetch = fetch,
): Promise<unknown | null> {
  const r = await fetchImpl(`https://${HOST}${path}`, {
    headers: { 'x-rapidapi-host': HOST, 'x-rapidapi-key': key },
  });
  const q = quotaFromHeaders((n) => r.headers.get(n), Date.now());
  if (q) onQuota(q);
  if (r.status === 204) return null;
  if (!r.ok) {
    throw new Error(
      `${VENDOR} http ${r.status} on ${path}: ${(await r.text()).slice(0, 200)}`,
    );
  }
  return (await r.json()) as unknown;
}

// Re-exported so the route imports one module for the whole chain.
export { publishable, matchTitle };
export type { MatchRow, PublishablePair, SkippedRow };
