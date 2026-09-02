// boxing-data.com (via RapidAPI) — DEPTH, not breadth.
//
// This connector does not compete with TheSportsDB, it completes it.
// TSDB carries 77 days of boxing cards, coarsely: a title, a venue, and a
// date with no time on two thirds of them. This vendor sees SEVEN DAYS
// (the free tier refuses anything further — see `DateOutOfRange` below)
// but sees them properly: a real card start, a per-bout ring-walk time,
// and `card_billing` saying which bout is the main event. A card enters
// the window, gets enriched, and nothing regresses when it leaves.
//
// TIMES ARE UTC. The field carries no offset and no `Z`, so this was
// established before a single time was allowed near a calendar (22d):
//
//   Williamson vs Simpson 2, First Direct Bank Arena, Leeds — the vendor
//   says `2026-08-08T18:00:00`, and DAZN/ESPN publish the card as
//   streaming "from 7pm BST". BST is UTC+1, so 7pm BST IS 18:00 UTC.
//   Exact match. The same card's MAIN EVENT fight carries `21:00:00` —
//   22:00 BST, the standard UK ring-walk slot, and coherent with an
//   18:00 card start.
//
//   Nyika vs Masson, Auckland (UTC+12) — `07:00:00` reads as 7pm NZST,
//   just after the published 6:30pm doors. Read as venue-local it is 7am.
//   Teremoana vs Savage, Gold Coast (UTC+10) — `08:00:00` reads as 6pm
//   AEST; as local it is 8am. No boxing card has ever started at 8am.
//
// Two impossible-if-local readings plus one exact published match. That
// mattered more than the number of samples: a wrong time looks
// authoritative in a calendar, which is worse than no time at all.
//
// PROMOTER: `promotion` and `co_promotion` exist in the payload (the
// published docs show neither) and are `null` on every current card. Read
// anyway — if the vendor starts populating them we get it for free — but
// `Fixture.promoter` stays review-queue-only, because an absent promoter
// is honest and an inferred one is not.

import { appearanceFor } from '../appearances';
import { AppearanceDraft } from '../athletes';
import { Fixture } from '../fixture';
import { ProviderFetch } from './fetchResult';

export const HOST = 'boxing-data-api.p.rapidapi.com';
export const SOURCE = 'boxingdata';

// The free tier's real ceiling, found by probing rather than reading:
// `days=14`, `30` and `90` all return DateOutOfRange; `7` returns 200.
export const MAX_DAYS = 7;

export interface VendorEvent {
  id?: string;
  title?: string;
  date?: string;
  venue?: string | null;
  location?: string | null;
  promotion?: string | null;
  co_promotion?: string | null;
  updated_at?: string;
}

export interface VendorFighter {
  fighter_id?: string;
  name?: string;
  full_name?: string;
}

export interface VendorFight {
  id?: string;
  title?: string;
  date?: string;
  card_billing?: string | null;
  scheduled_rounds?: number | null;
  status?: string | null;
  fighters?: { fighter_1?: VendorFighter; fighter_2?: VendorFighter };
}

// ─── The envelope ─────────────────────────────────────────────────────
//
// THIS VENDOR REFUSES INSIDE A SUCCESS SHAPE. Asking for more than seven
// days returns HTTP 403 with a body that looks like a perfectly good
// empty result:
//
//   {"pagination":{"page":1,"items":0,"total_pages":1,"total_items":0},
//    "error":{"code":"DateOutOfRange","message":"..."},"data":null}
//
// A `?? []` on `data` turns "the request was refused" into "there is no
// boxing next month", silently, and the standing invariant exists for
// exactly this. So: a non-2xx is a failure whatever the body says, a
// populated `error` is a failure, and `data: null` is a failure even at
// 200 — this vendor has no null-means-empty convention to protect, unlike
// TheSportsDB. An empty ARRAY with `total_items: 0` is the only thing
// that legitimately means "nothing scheduled".
export function unwrapList<T>(
  status: number,
  body: unknown,
  path: string,
): T[] {
  if (status < 200 || status >= 300) {
    const code =
      (body as { error?: { code?: string } } | null)?.error?.code ?? 'none';
    throw new Error(`boxing-data ${path}: HTTP ${status} (error code ${code})`);
  }
  if (body === null || typeof body !== 'object') {
    throw new Error(`boxing-data ${path}: response is not an object`);
  }
  const b = body as {
    error?: Record<string, unknown>;
    pagination?: { total_items?: unknown };
    data?: unknown;
  };
  if (b.error && Object.keys(b.error).length > 0) {
    const e = b.error as { code?: string; message?: string };
    throw new Error(
      `boxing-data ${path}: ${e.code ?? 'error'} — ${e.message ?? 'no message'}`,
    );
  }
  // Pagination is how an empty result PROVES it is empty rather than
  // truncated. Its absence is shape rot.
  if (!b.pagination || typeof b.pagination.total_items !== 'number') {
    throw new Error(`boxing-data ${path}: response missing pagination.total_items`);
  }
  if (b.data === null || b.data === undefined) {
    throw new Error(
      `boxing-data ${path}: "data" is ${b.data === null ? 'null' : 'absent'} at HTTP ${status}`,
    );
  }
  if (!Array.isArray(b.data)) {
    throw new Error(`boxing-data ${path}: "data" is not an array`);
  }
  return b.data as T[];
}

// ─── Time ─────────────────────────────────────────────────────────────

// `T00:00:00` IS THE NO-TIME-KNOWN SENTINEL, not midnight. Half the
// vendor's cards carry it, and writing it as a real instant would put an
// Orlando card at 8pm the previous evening for a US follower — a
// confident, checkable, wrong time, which is the one outcome this whole
// connector was gated on avoiding.
export function isTimeless(raw: string): boolean {
  return /T00:00:00(\.0+)?$/.test(raw.trim());
}

// Offset-free local-looking string → a real UTC instant. See the header
// for the evidence that UTC is the right reading.
export function toUtc(raw: string | undefined | null): string | null {
  if (typeof raw !== 'string' || raw.trim() === '') return null;
  const t = raw.trim();
  // Refuse anything that is not the shape we verified. A vendor that
  // starts sending offsets has changed its convention, and guessing
  // which one applies is how times go wrong.
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?$/.test(t)) return null;
  const ms = Date.parse(`${t}Z`);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

// ─── Cards ────────────────────────────────────────────────────────────

export const SLICE = 'boxingdata-cards';

export function eventToFixture(
  e: VendorEvent,
  updatedAt: string,
): Fixture | null {
  if (!e.id || !e.title || !e.date) return null;
  const startUtc = toUtc(e.date);
  if (!startUtc) return null;
  const timeless = isTimeless(e.date);
  return {
    id: `boxingdata-${e.id}`,
    sport: 'boxing',
    competition: 'Boxing',
    competitionId: SLICE,
    title: e.title,
    followKeys: [SLICE],
    startUtc,
    status: 'scheduled',
    durationHours: 4,
    // The card start is a real instant but an unsettled one — the same
    // reading PBC's card time gets. A timeless row claims no time at all.
    timePrecision: timeless ? 'date_only' : 'nominal',
    confidence: 'provisional',
    ...(e.venue ? { venue: e.venue } : {}),
    ...(e.location ? { venueCity: e.location } : {}),
    // Read, not yet supplied by the vendor. `Fixture.promoter` stays
    // review-queue-only until it is.
    ...(e.promotion ? { promoter: e.promotion } : {}),
    updatedAt,
  };
}

// ─── Bouts ────────────────────────────────────────────────────────────

// Card position is STORED, not derived: `card_billing` carries "Main
// Event" / "Main Card". The earlier read of the published docs said this
// field did not exist — it is simply undocumented.
export function isMainEvent(f: VendorFight): boolean {
  return (f.card_billing ?? '').trim().toLowerCase() === 'main event';
}

// A fighter is usable only with BOTH a stable id and a full name. The id
// is what makes the identity permanent; the full name is what lets it
// match our directory in the first place. A row missing either does not
// publish and does not mint (22d ruling).
function refOf(v: VendorFighter | undefined) {
  const id = v?.fighter_id?.trim();
  const name = v?.full_name?.trim();
  if (!id || !name) return null;
  return { name, source: SOURCE, externalId: id };
}

export function fightsToAppearances(
  card: Fixture,
  fights: readonly VendorFight[],
  updatedAt: string,
): AppearanceDraft[] {
  const out: AppearanceDraft[] = [];
  // Running order, so a card reads top to bottom the way it is fought.
  const ordered = [...fights].sort((a, b) =>
    String(a.date ?? '').localeCompare(String(b.date ?? '')),
  );
  for (const f of ordered) {
    const one = refOf(f.fighters?.fighter_1);
    const two = refOf(f.fighters?.fighter_2);
    if (!one || !two) continue;
    // PER-BOUT TIMING is the thing this vendor has that nothing else
    // does: the card starts at 18:00 and the main event walks at 21:00.
    // Fall back to the card's own start when a bout carries none.
    const boutStart = toUtc(f.date) ?? card.startUtc;
    const timeless = f.date ? isTimeless(f.date) : card.timePrecision === 'date_only';
    const a = appearanceFor(
      { ...card, startUtc: boutStart, timePrecision: timeless ? 'date_only' : 'nominal' },
      {
        refs: [one, two],
        title: `${one.name} vs ${two.name}`,
        updatedAt,
      },
    );
    if (!a) continue;
    if (isMainEvent(f)) a.fixture.followKeys.push(`${SLICE}-main`);
    out.push(a);
  }
  return out;
}

// ─── Fetch ────────────────────────────────────────────────────────────

// ─── Quota ────────────────────────────────────────────────────────────
//
// 100 requests a MONTH. One schedule call plus one call per card, and if
// every card's bouts were refetched daily a five-card week would cost 180
// a month — the ceiling gone by the eleventh. So bouts are fetched on a
// SCHEDULE OF THEIR OWN, and this decides it. PURE, because a quota
// policy that can only be checked by spending the quota is not a policy.
//
// A card's undercard firms up over weeks, not hours. Fetch it once when
// it first appears, then once more as it gets close — that second fetch
// is where late additions and the ring-walk times actually land. Between
// those two moments there is nothing to learn and every call is waste.
export interface BoutFetchState {
  // vendor event id → when its bouts were last fetched.
  [eventId: string]: string | undefined;
}

export function shouldFetchBouts(
  eventId: string,
  cardStartUtc: string,
  state: BoutFetchState,
  nowMs: number,
  cfg: { nearDays?: number; refetchAfterMs?: number; finalHours?: number } = {},
): boolean {
  const last = state[eventId];
  if (!last) return true; // never seen — this is the first sight
  const lastMs = Date.parse(last);
  if (!Number.isFinite(lastMs)) return true; // unreadable marker: refetch
  const startMs = Date.parse(cardStartUtc);
  if (!Number.isFinite(startMs)) return false;
  const nearMs = (cfg.nearDays ?? 5) * 86_400_000;
  const isNear = startMs - nowMs <= nearMs;
  if (!isNear) return false;
  // ONE FINAL LOOK inside the last 24 hours (Round 4 close-out cadence):
  // ring-walk times land late, and a bout is otherwise up to three days
  // stale at fight time. At most three calls per card, ever.
  const finalMs = (cfg.finalHours ?? 24) * 3_600_000;
  const inFinalWindow = startMs - nowMs <= finalMs && startMs > nowMs;
  if (inFinalWindow) return startMs - lastMs > finalMs;
  // Near, but only worth one more look — not one a day.
  return nowMs - lastMs >= (cfg.refetchAfterMs ?? 3 * 86_400_000);
}

export interface BoxingDataFetch extends ProviderFetch {
  appearances: AppearanceDraft[];
  rawBouts: number;
  // Quota is 100 a MONTH, so the connector reports what it has left
  // rather than discovering the ceiling by hitting it.
  quotaRemaining: number | null;
  // The plan's window limit and when the window resets, from the same
  // headers — persisted by the poller so runway is predicted (item 6).
  quotaLimit: number | null;
  quotaResetAt: string | null;
  boutsFetchedFor: string[];
  skippedForCap: number;
  callsSpent: number;
}

// A non-2xx that still carried RapidAPI's metering headers. The route
// persists the figure from THIS too (Round 4 close-out): at the wall the
// vendor answers 429 with remaining=0, and a reserve gate that only ever
// learnt the quota from successes would keep knocking on it.
export class BoxingDataHttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly quota: { remaining: number | null; limit: number | null; resetSeconds: number | null },
  ) {
    super(message);
    this.name = 'BoxingDataHttpError';
  }
}

export function rejectHttp(
  r: { status: number; body: unknown; remaining: number | null; limit: number | null; resetSeconds: number | null },
  path: string,
): void {
  if (r.status >= 200 && r.status < 300) return;
  const code = (r.body as { error?: { code?: string } } | null)?.error?.code ?? 'none';
  throw new BoxingDataHttpError(
    `boxing-data ${path}: HTTP ${r.status} (error code ${code})`,
    r.status,
    { remaining: r.remaining, limit: r.limit, resetSeconds: r.resetSeconds },
  );
}

async function get(
  key: string,
  path: string,
): Promise<{
  body: unknown;
  status: number;
  remaining: number | null;
  limit: number | null;
  resetSeconds: number | null;
}> {
  const res = await fetch(`https://${HOST}${path}`, {
    headers: { 'x-rapidapi-host': HOST, 'x-rapidapi-key': key },
  });
  // RapidAPI's metering headers: remaining requests in the window, the
  // plan's window limit, and seconds until the window resets (Round 4
  // item 6 — persisted so exhaustion is predicted, not discovered).
  const num = (h: string): number | null => {
    const raw = res.headers.get(h);
    const n = raw === null ? NaN : Number(raw);
    return Number.isFinite(n) ? n : null;
  };
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    throw new Error(`boxing-data ${path}: response was not JSON (HTTP ${res.status})`);
  }
  return {
    body,
    status: res.status,
    remaining: num('x-ratelimit-requests-remaining'),
    limit: num('x-ratelimit-requests-limit'),
    resetSeconds: num('x-ratelimit-requests-reset'),
  };
}

// One schedule call, then one fights call per card. Boxing changes slowly
// — a card's undercard firms up over weeks, not minutes — so this runs
// daily rather than hourly, and the seven-day window means every card
// passes through it several times before it happens.
export async function fetchBoxingData(
  key: string,
  updatedAt: string,
  opts: {
    days?: number;
    maxCards?: number;
    // Which cards are due a bouts call this run. Defaults to all of them,
    // which is only right in a test.
    due?: (eventId: string, cardStartUtc: string) => boolean;
  } = {},
): Promise<BoxingDataFetch> {
  const days = Math.min(opts.days ?? MAX_DAYS, MAX_DAYS);
  const sched = await get(
    key,
    `/v2/events/schedule?days=${days}&page_size=100&date_sort=ASC`,
  );
  rejectHttp(sched, 'events/schedule');
  const events = unwrapList<VendorEvent>(sched.status, sched.body, 'events/schedule');
  let remaining = sched.remaining;
  let limit = sched.limit;
  let resetSeconds = sched.resetSeconds;

  const fixtures: Fixture[] = [];
  const appearances: AppearanceDraft[] = [];
  let rawBouts = 0;
  const cards = events.map((e) => eventToFixture(e, updatedAt)).filter((f): f is Fixture => f !== null);

  // A cap the caller can set, so a busy week cannot silently eat a
  // month's quota. Anything dropped is REPORTED, never silent.
  const cap = opts.maxCards ?? cards.length;
  const due = opts.due ?? (() => true);
  const fetchedFor: string[] = [];
  let skippedForCap = 0;
  for (const card of cards) {
    fixtures.push(card);
    const vendorId = card.id.replace(/^boxingdata-/, '');
    if (!due(vendorId, card.startUtc)) continue;
    if (fetchedFor.length >= cap) {
      skippedForCap++;
      continue;
    }
    fetchedFor.push(vendorId);
    const r = await get(key, `/v2/fights?event_id=${encodeURIComponent(vendorId)}&page_size=100`);
    remaining = r.remaining ?? remaining;
    limit = r.limit ?? limit;
    resetSeconds = r.resetSeconds ?? resetSeconds;
    rejectHttp(r, 'fights');
    const fights = unwrapList<VendorFight>(r.status, r.body, 'fights');
    rawBouts += fights.length;
    appearances.push(...fightsToAppearances(card, fights, updatedAt));
  }
  return {
    rawCount: events.length,
    fixtures,
    appearances,
    rawBouts,
    quotaRemaining: remaining,
    quotaLimit: limit,
    quotaResetAt:
      resetSeconds === null ? null : new Date(Date.now() + resetSeconds * 1000).toISOString(),
    boutsFetchedFor: fetchedFor,
    // NEVER A SILENT TRUNCATION. If the cap bit, the run says so.
    skippedForCap,
    // 1 schedule + one per card actually fetched.
    callsSpent: 1 + fetchedFor.length,
  };
}
