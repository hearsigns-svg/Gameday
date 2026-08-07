// WTA — tournaments, draws and order of play from the WTA's own API.
//
// api.wtatennis.com is the API wtatennis.com itself runs on, approved by
// owner ruling 2026-08-02 (docs/DECISIONS.md, Prompt 5b): the same
// publisher whose site robots.txt is a blanket allow; not an aggregator,
// not a route around anyone's refusal. Everything here was verified
// live 2026-08-02 with plain unauthenticated GETs — no key, no cookie,
// no token — and the payloads are banked in __tests__/fixtures/
// (wta-tournaments-sample, wta-matches-sample, wta-oop-sample). If this
// API ever starts demanding a credential, the ruling says STOP, not
// work around.
//
// Three feeds, three jobs:
//   /tennis/tournaments/           — the calendar: parents, one fixture
//                                    per tournament (date_only span).
//   .../{id}/{year}/matches        — the DRAW: pairings with FULL names
//                                    and player ids, no times. This is
//                                    who is still in — the provisional
//                                    appearance source.
//   .../{id}/{year}/oop            — ORDER OF PLAY: per-day, per-court,
//                                    with real venue-local times
//                                    ("13:30-0400") — the confirmed
//                                    slot source. Follow-on matches
//                                    carry a day but no time, which is
//                                    a confirmed date_only, never an
//                                    invented instant.
//
// SINGLES ONLY in this version (DrawMatchType 'S'; doubles pair churn is
// a different model). ATP entries at joint events appear in the WTA OOP
// as skeletons (AssociationCode 'ATP', no player detail) and are
// skipped — ATP coverage stays with the Tennis TV ICS, per the ruling
// that atptour.com remains excluded.

import { appearanceFor } from '../appearances';
import { RoundCode } from '../fixture';
import { AppearanceDraft } from '../athletes';
import { Fixture } from '../fixture';
import { tournamentKey } from '../tennisTournaments';
import { ProviderFetch, requireArray } from './fetchResult';

const BASE = 'https://api.wtatennis.com/tennis';

export const USER_AGENT =
  'KickOffCal/1.0 (+https://kickoffcal.app; calendar sync; contact hearsigns@gmail.com)';

// Polite spacing between requests to the one host.
export const WTA_REQUEST_GAP_MS = 1_000;

// Draw + order of play are fetched only for tournaments that are live
// now or imminent, and never for more than this many in one poll — a
// bound on request count, not a coverage cap: every tournament's PARENT
// is always ingested, and the active window slides over each one.
export const MAX_ACTIVE_TOURNAMENTS = 5;
export const ACTIVE_LOOKAHEAD_DAYS = 3;

export interface WtaTournament {
  tournamentGroup?: { id?: number; name?: string; level?: string };
  year?: number;
  title?: string;
  startDate?: string; // YYYY-MM-DD
  endDate?: string; // inclusive
  surface?: string;
  city?: string;
  country?: string;
  status?: string; // past | inProgress | live | future (observed)
}

export interface WtaMatch {
  // LS001 = ladies singles; LD = doubles; RS/QS = qualifying.
  // THE NUMBER IS A BRACKET POSITION, not a sequence — see
  // roundFromMatchId below. We read only its second character until
  // Prompt 20b and threw the position away.
  MatchID?: string;
  DrawMatchType?: string; // 'S' | 'D'
  Winner?: string; // '0' = not decided; '2'/'3' winner side; '5' walkover
  PlayerNameFirstA?: string;
  PlayerNameLastA?: string;
  PlayerNameFirstB?: string;
  PlayerNameLastB?: string;
  PlayerIDA?: string;
  PlayerIDB?: string;
  RoundID?: string;
  // 'M' main draw, 'Q' qualifying. The gate that stops a qualifying
  // ladder being read as a main-draw one.
  DrawLevelType?: string;
}

// The OOP feed nests XML-converted JSON: single-element containers
// arrive as objects, multi-element as arrays. Normalise once.
function asArray<T>(v: T | T[] | null | undefined): T[] {
  if (v === null || v === undefined) return [];
  return Array.isArray(v) ? v : [v];
}

interface OopPlayer {
  Player?: {
    FirstName?: string;
    SurName?: string;
    id?: number;
  };
  isKnown?: number;
}

interface OopMatch {
  MatchId?: string;
  AssociationCode?: string;
  NotBeforeISOTime?: string; // "13:30-0400" or ""
  Players?: OopPlayer[];
}

// The tournament's short display name: the API title carries the city
// tail ("Mubadala DC Open - Washington, DC, USA"); the calendar wants
// the event's name.
export function shortTitle(title: string): string {
  return title.split(' - ')[0].trim();
}

const dayStartUtc = (isoDate: string): string =>
  new Date(`${isoDate}T00:00:00.000Z`).toISOString();

export function tournamentToFixture(
  t: WtaTournament,
  updatedAt: string,
): Fixture | null {
  const id = t.tournamentGroup?.id;
  if (id === undefined || !t.title || !t.startDate || !t.year) return null;
  const start = Date.parse(`${t.startDate}T00:00:00.000Z`);
  if (Number.isNaN(start)) return null;
  const end = t.endDate ? Date.parse(`${t.endDate}T00:00:00.000Z`) : NaN;
  // endDate is INCLUSIVE (verified: DC Open 07-27..08-02 is a 7-day event).
  const days = Number.isNaN(end)
    ? 1
    : Math.max(1, Math.round((end - start) / 86_400_000) + 1);
  return {
    id: `wta-${id}-${t.year}`,
    sport: 'tennis',
    competition: 'WTA Tour',
    competitionId: 'tennis-wta',
    title: shortTitle(t.title),
    // The tour slice plus the YEAR-AGNOSTIC canonical tournament key
    // (Prompt 9): a joint event shares this key with its ICS parent,
    // which is what makes "Wimbledon" one followable, not two. A title
    // that normalises to nothing stamps no key.
    followKeys: [
      'tennis-wta',
      ...((k) => (k ? [k] : []))(tournamentKey(shortTitle(t.title))),
    ],
    ...((t.city ?? t.country)
      ? { venueCity: [t.city, t.country].filter(Boolean).join(' ') }
      : {}),
    startUtc: new Date(start).toISOString(),
    status: 'scheduled',
    durationHours: days * 24,
    timePrecision: 'date_only',
    confidence: 'confirmed',
    updatedAt,
  };
}

const fullName = (first?: string, last?: string): string | null => {
  const f = first?.trim();
  const l = last?.trim();
  return f && l ? `${f} ${l}` : null;
};

// A draw/OOP participant with the WTA's own numeric id where the feed
// carried one. THE ID IS THE POINT (Prompt 8): a name is ambiguous,
// `wta:320760` is not — the id is what makes canonical identity CERTAIN
// downstream, and what finally distinguishes two players who render to
// one name (F34).
export interface WtaPlayerRef {
  name: string;
  wtaId: string | null;
}

// Who is still in the singles draw: named in a match that has no
// decision yet. Winner '0' is the only "not decided" value observed;
// anything else ('2'/'3' winner side, '5' walkover) is a decided match.
// Deduped by id where known, by name only as the fallback — two ids
// sharing a rendered name stay TWO players.
export function playersStillIn(matches: readonly WtaMatch[]): WtaPlayerRef[] {
  const players = new Map<string, WtaPlayerRef>();
  for (const m of matches) {
    if (m.DrawMatchType !== 'S') continue;
    if ((m.Winner ?? '0') !== '0') continue;
    const sides: Array<[string | null, string | undefined]> = [
      [fullName(m.PlayerNameFirstA, m.PlayerNameLastA), m.PlayerIDA],
      [fullName(m.PlayerNameFirstB, m.PlayerNameLastB), m.PlayerIDB],
    ];
    for (const [name, rawId] of sides) {
      if (!name) continue;
      const wtaId = rawId?.trim() ? String(rawId).trim() : null;
      const key = wtaId ? `id:${wtaId}` : `name:${name}`;
      if (!players.has(key)) players.set(key, { name, wtaId });
    }
  }
  return [...players.values()];
}

export interface PlayerSlot {
  startUtc: string;
  // When this slot stops being the thing to show. Timed: start + the
  // 3h we assign a match. Day-only: the day sentinel + 36h — ISODate is
  // the VENUE-LOCAL day while the sentinel is UTC midnight, so a plain
  // 24h window would drop a US night session hours before it happened.
  endUtc: string;
  dayOnly: boolean;
  opponent?: string;
}

export const SLOT_DURATION_HOURS = 3;
const DAY_ONLY_SLOT_MS = 36 * 3_600_000;
const SLOT_GRACE_MS = 6 * 3_600_000;

// "13:30-0400" on day "2026-08-02" → the instant. Anything that does
// not match the observed shape is treated as no-time (day-only), never
// guessed at.
const OOP_TIME = /^(\d{2}):(\d{2})([+-]\d{4})$/;

export function slotInstant(isoDate: string, notBefore: string): string | null {
  const m = OOP_TIME.exec(notBefore.trim());
  if (!m) return null;
  const ms = Date.parse(`${isoDate}T${m[1]}:${m[2]}:00${m[3]}`);
  return Number.isNaN(ms) ? null : new Date(ms).toISOString();
}

// EVERY scheduled singles slot per known player, unfiltered — liveness
// is pickLiveSlot's decision at selection time, not a fetch-time day
// filter (a day filter at UTC-day granularity kept already-played slots
// and dropped venue-local evenings; both wrong ways at once). Keyed by
// full name, the same key the draw yields — the OOP and draw carry the
// same names for the same people (verified in the banked payloads).
export interface OopExtract {
  slots: Map<string, PlayerSlot[]>;
  // name → WTA numeric id, where the OOP carried one. Same id namespace
  // as the draw's PlayerIDA/B (verified identical on the banked joint
  // payloads), so either feed can certify identity.
  ids: Map<string, string>;
}

export function playerSlots(oopBody: unknown): OopExtract {
  const body = oopBody as { orderOfPlay?: unknown };
  const raw = requireArray(
    body.orderOfPlay as string[] | null | undefined,
    'wta',
    'orderOfPlay',
  );
  const ids = new Map<string, string>();
  const slots = new Map<string, PlayerSlot[]>();
  for (const entry of raw) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(entry);
    } catch {
      throw new Error('wta: orderOfPlay entry is not JSON');
    }
    const schedule = (parsed as { OOP?: { Schedule?: { Day?: unknown } } })
      .OOP?.Schedule;
    if (!schedule) throw new Error('wta: orderOfPlay missing OOP.Schedule');
    // A Schedule without the Day KEY is shape rot, not an empty
    // schedule — the standing invariant's exact failure mode.
    if (!('Day' in (schedule as object))) {
      throw new Error('wta: orderOfPlay Schedule missing Day');
    }
    for (const day of asArray(schedule.Day as object | object[])) {
      const isoDate = (day as { ISODate?: string }).ISODate;
      if (!isoDate) continue;
      for (const court of asArray(
        (day as { Court?: object | object[] }).Court,
      )) {
        const matches = asArray(
          (court as { Matches?: { Match?: OopMatch | OopMatch[] } }).Matches
            ?.Match,
        );
        for (const m of matches) {
          if (m.AssociationCode === 'ATP') continue; // skeleton entries
          // Singles only: LS (main draw) and RS (qualifying) both count;
          // the second MatchId letter marks doubles (LD/QD/MD).
          if (m.MatchId && m.MatchId[1] === 'D') continue;
          const players = asArray(m.Players).filter(
            (p) => p.isKnown && p.Player,
          );
          const names: string[] = [];
          for (const p of players) {
            const n = fullName(p.Player!.FirstName, p.Player!.SurName);
            if (!n) continue;
            names.push(n);
            if (p.Player!.id !== undefined && !ids.has(n)) {
              ids.set(n, String(p.Player!.id));
            }
          }
          const instant = slotInstant(isoDate, m.NotBeforeISOTime ?? '');
          for (const name of names) {
            const opponent = names.find((n) => n !== name);
            const slot: PlayerSlot = instant
              ? {
                  startUtc: instant,
                  endUtc: new Date(
                    Date.parse(instant) + SLOT_DURATION_HOURS * 3_600_000,
                  ).toISOString(),
                  dayOnly: false,
                  ...(opponent ? { opponent } : {}),
                }
              : {
                  startUtc: dayStartUtc(isoDate),
                  endUtc: new Date(
                    Date.parse(dayStartUtc(isoDate)) + DAY_ONLY_SLOT_MS,
                  ).toISOString(),
                  dayOnly: true,
                  ...(opponent ? { opponent } : {}),
                };
            const list = slots.get(name) ?? [];
            list.push(slot);
            slots.set(name, list);
          }
        }
      }
    }
  }
  return { slots, ids };
}

// The slot to show NOW: the soonest whose window is still open — so an
// in-progress match keeps its confirmed time instead of regressing to a
// week-long provisional banner mid-rally, and a played morning slot
// yields to the same payload's evening final instead of shadowing it.
// When no window is open, the most recent within grace bridges the gap
// while the feed catches up (a finished final whose Winner has not
// flipped yet must not bounce provisional for six hours).
export function pickLiveSlot(
  slots: readonly PlayerSlot[],
  nowIso: string,
): PlayerSlot | undefined {
  const nowMs = Date.parse(nowIso);
  const open = slots
    .filter((s) => Date.parse(s.endUtc) > nowMs)
    .sort((a, b) => a.startUtc.localeCompare(b.startUtc));
  if (open.length > 0) return open[0];
  const graced = slots
    .filter((s) => Date.parse(s.endUtc) + SLOT_GRACE_MS > nowMs)
    .sort((a, b) => b.startUtc.localeCompare(a.startUtc));
  return graced[0];
}

// One appearance DRAFT per player: still-in-the-draw players get the
// parent window (provisional); players with a scheduled slot get it
// confirmed — timed when the order of play gives a time, date_only when
// it gives only the day. The id is the same either way, so every
// transition is an in-place update on the device.
//
// Participants are UNIONED BY NUMERIC ID where one exists (name only as
// the fallback), so two players whose romanised names render identically
// arrive downstream as two refs with two ids — resolution then keeps
// the doc-id collision LOUD instead of silently absorbing one player
// into the other (F34). The draw↔OOP slot join stays by full name: it
// is the join key both feeds carry, verified identical in the banked
// payloads.
export function buildTournamentAppearances(
  parent: Fixture,
  matches: readonly WtaMatch[],
  oopBody: unknown | null,
  nowIso: string,
): AppearanceDraft[] {
  const inDraw = playersStillIn(matches);
  const oop: OopExtract = oopBody
    ? playerSlots(oopBody)
    : { slots: new Map(), ids: new Map() };
  const players = new Map<string, WtaPlayerRef>();
  const keyOf = (p: WtaPlayerRef) => (p.wtaId ? `id:${p.wtaId}` : `name:${p.name}`);
  for (const p of inDraw) players.set(keyOf(p), p);
  for (const [name, slotList] of oop.slots) {
    void slotList;
    const p: WtaPlayerRef = { name, wtaId: oop.ids.get(name) ?? null };
    if (!players.has(keyOf(p))) players.set(keyOf(p), p);
  }
  const inDrawKeys = new Set(inDraw.map(keyOf));
  // WHERE EACH PLAYER STANDS IN THE DRAW, from the bracket position we
  // already receive. Keyed by player so the rung follows them as they
  // advance — the same rolling-slot behaviour the ATP side proved on
  // 2026-08-07, now available to the women without a vendor.
  const rungOf = new Map<string, RoundCode>();
  for (const m of matches) {
    if (m.DrawMatchType !== 'S') continue;
    const rung = roundFromMatchId(m.MatchID, m.DrawLevelType);
    if (!rung) continue;
    for (const nm of [
      [m.PlayerNameFirstA, m.PlayerNameLastA],
      [m.PlayerNameFirstB, m.PlayerNameLastB],
    ]) {
      const full = [nm[0], nm[1]].filter(Boolean).join(' ').trim();
      if (full) rungOf.set(full, rung);
    }
  }
  // The slot join is NAME-keyed (the only join key both feeds carry).
  // When two distinct ids share a rendered name, a name-joined slot
  // cannot be attributed: publishing it would hand one player's match
  // — opponent, time, title — to the other (review round, probe-
  // confirmed). Collided names get NO slot: both players stay at the
  // provisional parent window, which is honest, and the doc-id
  // collision downstream stays loud.
  const nameCount = new Map<string, number>();
  for (const p of players.values()) {
    nameCount.set(p.name, (nameCount.get(p.name) ?? 0) + 1);
  }
  const out: AppearanceDraft[] = [];
  // Deterministic order (ids first, ascending) so a name-collision
  // always resolves the same way run over run.
  const ordered = [...players.values()].sort((a, b) =>
    keyOf(a).localeCompare(keyOf(b)),
  );
  for (const p of ordered) {
    const nameCollided = (nameCount.get(p.name) ?? 0) > 1;
    const liveSlot = nameCollided
      ? undefined
      : pickLiveSlot(oop.slots.get(p.name) ?? [], nowIso);
    // A player with no open-or-graced slot and no live draw match has
    // been eliminated — their doc simply stops being emitted, and the
    // end-based retirement freeze keeps the played match in calendars.
    if (!inDrawKeys.has(keyOf(p)) && !liveSlot) continue;
    const title = liveSlot?.opponent
      ? `${p.name} vs ${liveSlot.opponent} — ${parent.title}`
      : `${p.name} — ${parent.title}`;
    const a = appearanceFor(parent, {
      refs: [
        {
          name: p.name,
          ...(p.wtaId ? { source: 'wta', externalId: p.wtaId } : {}),
        },
      ],
      title,
      updatedAt: nowIso,
      ...(liveSlot
        ? {
            slot: liveSlot.dayOnly
              ? { startUtc: liveSlot.startUtc, durationHours: 24, dayOnly: true }
              : {
                  startUtc: liveSlot.startUtc,
                  durationHours: SLOT_DURATION_HOURS,
                },
          }
        : {}),
    });
    if (!a) continue;
    const rung = rungOf.get(p.name);
    out.push(
      rung
        ? {
            ...a,
            fixture: {
              ...a.fixture,
              stage: { round: rung, label: ROUND_LABELS[rung] },
            },
          }
        : a,
    );
  }
  return out;
}

// ─── The round, derived from the draw we already fetch ───────────────
//
// THIS IS WHY THE VENDOR IS NOT USED FOR WOMEN'S ROUNDS. The WTA feed's
// MatchID is a BRACKET POSITION in a full 2^k tree laid out top-down: 1
// is the final, 2–3 the semi-finals, 4–7 the quarters, 8–15 the round of
// 16, 16–31 the round of 32. The rung is simply the depth of the slot,
// and we have been fetching and discarding it since this connector
// shipped.
//
// WHAT PROVES IT IS A BRACKET AND NOT A COUNTER: on the DC Open's last
// day the WTA singles final, the ATP singles final and the ATP doubles
// final are LS001, MS001 and MD001 — three draws, two tours, one
// number. And LS028 exists in a 28-player draw, which plays only 27
// matches; a contiguous per-round counter could never mint a 28, so the
// numbering must be full-bracket-with-byes. That is also why COUNTING
// the first round would have shipped a bug: 28 players with 4 byes give
// 12 first-round matches, and 2 × 12 = 24 is not a round.
//
// Four refusals, each a wrong rung avoided rather than a nicety:
//   - QUALIFYING is excluded. RS007 is a qualifying match and would
//     otherwise read as a quarter-final; a qualifying draw's last round
//     is not one.
//   - A DEPTH BEYOND THE LADDER yields nothing, not the nearest rung.
//   - A MALFORMED id yields nothing. Never a default (invariant 4), and
//     never a fixed slice(2) — a longer prefix must not silently shift.
//   - r64 and r128 ARE PREDICTED, NOT OBSERVED: the only draw we hold is
//     28/32. The arithmetic says Rome and the slams will emit them; the
//     first one that appears is a checkpoint to confirm, not a fact yet.
const RUNGS: RoundCode[] = ['f', 'sf', 'qf', 'r16', 'r32', 'r64', 'r128'];

// The label a person reads. Derived rather than provider text, because
// this feed publishes no round NAME at all — only the position.
export const ROUND_LABELS: Record<RoundCode, string> = {
  f: 'Final',
  sf: 'Semi-final',
  qf: 'Quarter-final',
  'third-place': 'Third-place play-off',
  r16: 'Round of 16',
  r32: 'Round of 32',
  r64: 'Round of 64',
  r128: 'Round of 128',
};

export function roundFromMatchId(
  matchId: string | undefined,
  drawLevelType?: string,
): RoundCode | undefined {
  if (!matchId) return undefined;
  if (drawLevelType !== undefined && drawLevelType !== 'M') return undefined;
  const m = /^([A-Za-z])([SDsd])(\d+)$/.exec(matchId.trim());
  if (!m) return undefined;
  const bracket = m[1].toUpperCase();
  if (bracket === 'R' || bracket === 'Q') return undefined; // qualifying draws
  const n = Number(m[3]);
  if (!Number.isInteger(n) || n < 1) return undefined;
  // Exact floor(log2) with no floating point: the slot's depth in a full
  // binary bracket.
  return RUNGS[31 - Math.clz32(n)];
}

// COMPETITION-SCOPED ROUND SLOTS (Prompt 11): "follow Wimbledon,
// finals only". The FINAL is the one round the feed marks with a
// verified value (RoundID 'F' in the banked draw; semi markers are
// UNSEEN in any capture, so "semis onward" waits for real data — the
// F22 rule). One doc per active tournament, born final
// (`<parentId>-slot-final`), provisional on the tournament's LAST day
// until the order of play schedules the RoundID-F match — the
// established provisional→confirmed in-place update, reused not
// rebuilt. Carries ONLY the scoped key (`<tournamentKey>-finals`): the
// block follower must not receive it. No athlete refs — it exists
// before anyone knows who plays; players join the title when known.
export function buildFinalSlot(
  parent: Fixture,
  matches: readonly WtaMatch[],
  oopBody: unknown | null,
  nowIso: string,
): Fixture | null {
  const tKey = parent.followKeys.find((k) => k.startsWith('tennis-t-'));
  if (!tKey) return null;
  const finalMatch = matches.find(
    (m) => m.DrawMatchType === 'S' && m.RoundID === 'F',
  );
  // A DECIDED final ('0' is the only undecided value the live feed
  // shows; '2'/'3' are winner sides, '5' a walkover) must end FROZEN
  // as its confirmed self, never demoted and never retired. Returning
  // null the moment Winner flips looked right and was the review
  // round's HIGH: the finalists' rolling appearances stay in the fresh
  // yield for the grace window, satisfying retirement's per-parent
  // evidence guard, so an absent slot doc was soft-cancelled — and the
  // push DELETED the final from finals-scoped calendars on the night
  // of the final. So a decided final keeps emitting its confirmed
  // shape for exactly as long as its OOP slot is live-or-graced (the
  // rolling appearances' own proven exposure — same 6h grace, same
  // strict compare as the retirement freeze), and only stops once the
  // stored doc is already inside the freeze. What a decided final may
  // never do is fall back to the PROVISIONAL banner.
  const decided =
    finalMatch?.Winner !== undefined && finalMatch.Winner !== '0';
  const names = finalMatch
    ? [
        fullName(finalMatch.PlayerNameFirstA, finalMatch.PlayerNameLastA),
        fullName(finalMatch.PlayerNameFirstB, finalMatch.PlayerNameLastB),
      ].filter((n): n is string => n !== null)
    : [];
  // Confirmed slot: an OOP match of finalist A AGAINST finalist B —
  // opponent-checked, both names required. On finals eve A's slot list
  // can still hold her semi inside its grace window, and a semi must
  // never confirm the final's time.
  let slot: PlayerSlot | undefined;
  if (oopBody && names.length === 2) {
    const oop = playerSlots(oopBody);
    const vsOtherFinalist = (oop.slots.get(names[0]) ?? []).filter(
      (s) => s.opponent === names[1],
    );
    slot = pickLiveSlot(vsOtherFinalist, nowIso);
  }
  const title =
    names.length === 2
      ? `${names[0]} vs ${names[1]} — ${parent.title} Final`
      : `${parent.title} — Final`;
  // Provisional home: the parent window's LAST day, not the whole
  // span — the final is the closing match by construction, and a
  // fortnight-wide "Final" banner is noise. If weather moves it, the
  // confirmed slot corrects the same id in place.
  const lastDayUtc = new Date(
    Date.parse(parent.startUtc) +
      Math.max(0, Math.round((parent.durationHours ?? 24) / 24) - 1) *
        86_400_000,
  ).toISOString();
  const base: Fixture = {
    id: `${parent.id}-slot-final`,
    sport: 'tennis',
    competition: parent.competition,
    competitionId: `${parent.competitionId}-appearances`,
    title,
    followKeys: [`${parent.competitionId}-appearances`, `${tKey}-finals`],
    startUtc: slot?.startUtc ?? lastDayUtc,
    status: parent.status,
    parentFixtureId: parent.id,
    ...(names.length > 0 ? { athletes: names } : {}),
    updatedAt: nowIso,
  };
  if (slot && !slot.dayOnly) {
    return {
      ...base,
      durationHours: SLOT_DURATION_HOURS,
      timePrecision: 'exact',
      confidence: 'confirmed',
    };
  }
  if (slot && slot.dayOnly) {
    // The OOP names the day but not the time — CONFIRMED date_only,
    // the same convention rolling appearances use for follow-on
    // matches. A time is never invented.
    return {
      ...base,
      durationHours: 24,
      timePrecision: 'date_only',
      confidence: 'confirmed',
    };
  }
  // No live-or-graced slot. A decided final is history — the stored
  // doc is frozen by now (see above); an undecided one waits on its
  // provisional day.
  if (decided) return null;
  return {
    ...base,
    durationHours: 24,
    timePrecision: 'date_only',
    confidence: 'provisional',
  };
}

// A tournament whose draw and order of play are worth fetching now. A
// tournament the API itself calls 'past' never is — finished draws were
// occupying fetch slots ahead of events starting the next day.
export function isActive(t: WtaTournament, nowIso: string): boolean {
  if (t.status === 'past') return false;
  if (t.status === 'live' || t.status === 'inProgress') return true;
  if (!t.startDate) return false;
  const start = Date.parse(`${t.startDate}T00:00:00.000Z`);
  if (Number.isNaN(start)) return false;
  const lookahead = ACTIVE_LOOKAHEAD_DAYS * 86_400_000;
  const ms = Date.parse(nowIso);
  // Started but unfinished tournaments whose status field lies fall in
  // here too: endDate inclusive, plus a day of slack.
  const end = t.endDate
    ? Date.parse(`${t.endDate}T00:00:00.000Z`) + 2 * 86_400_000
    : start + 15 * 86_400_000;
  return start <= ms + lookahead && ms <= end;
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`wta http ${res.status} for ${url}`);
  return res.json();
}

export interface WtaFetch extends ProviderFetch {
  appearances: AppearanceDraft[];
  // Competition-scoped round slots (no athlete resolution needed).
  roundSlots: Fixture[];
  // Funnel stage A for the appearance slice: singles draw records seen
  // across the active tournaments, before the still-in and named gates.
  appearanceRawCount: number;
  activeTournaments: number;
  // Bounded, and says so: actives beyond MAX_ACTIVE_TOURNAMENTS wait for
  // the next poll rather than silently never being fetched.
  activeSkipped: number;
}

// Pages accumulate until the reported total is covered; entries dedupe
// by (id, year) because the pagination semantics are only partly
// documented (the live probe saw numPages:0 beside numEntries:46) — a
// page that adds nothing new ends the loop rather than trusting either
// counter alone.
const MAX_TOURNAMENT_PAGES = 3;

export async function fetchWtaTennis(
  fromDate: string, // YYYY-MM-DD
  toDate: string,
  nowIso: string = new Date().toISOString(),
): Promise<WtaFetch> {
  const tournaments: WtaTournament[] = [];
  const seen = new Set<string>();
  let numEntries = Infinity;
  for (let page = 0; page < MAX_TOURNAMENT_PAGES; page++) {
    if (page > 0) await wait(WTA_REQUEST_GAP_MS);
    const body = (await getJson(
      `${BASE}/tournaments/?page=${page}&pageSize=100&excludeLevels=ITF&from=${fromDate}&to=${toDate}`,
    )) as {
      content?: WtaTournament[];
      pageInfo?: { numEntries?: number };
    };
    const content = requireArray(body.content, 'wta', 'content');
    if (typeof body.pageInfo?.numEntries === 'number') {
      numEntries = body.pageInfo.numEntries;
    }
    let added = 0;
    for (const t of content) {
      const key = `${t.tournamentGroup?.id}-${t.year}`;
      if (seen.has(key)) continue;
      seen.add(key);
      tournaments.push(t);
      added++;
    }
    if (added === 0 || tournaments.length >= numEntries) break;
  }
  const fixtures: Fixture[] = [];
  for (const t of tournaments) {
    const f = tournamentToFixture(t, nowIso);
    if (f) fixtures.push(f);
  }
  // Newest start first: the freshest draws — and tomorrow's first
  // rounds — must never be starved by events already winding down when
  // the cap bites.
  const active = tournaments
    .filter((t) => isActive(t, nowIso))
    .sort((a, b) => (b.startDate ?? '').localeCompare(a.startDate ?? ''));
  const fetchable = active.slice(0, MAX_ACTIVE_TOURNAMENTS);
  const appearances: AppearanceDraft[] = [];
  const roundSlots: Fixture[] = [];
  let appearanceRawCount = 0;
  for (const t of fetchable) {
    const id = t.tournamentGroup?.id;
    const parent = tournamentToFixture(t, nowIso);
    if (id === undefined || !parent) continue;
    await wait(WTA_REQUEST_GAP_MS);
    const matchesBody = (await getJson(
      `${BASE}/tournaments/${id}/${t.year}/matches?from=${t.startDate}&to=${t.endDate}`,
    )) as { matches?: WtaMatch[] };
    const matches = requireArray(matchesBody.matches, 'wta', 'matches');
    appearanceRawCount += matches.filter((m) => m.DrawMatchType === 'S').length;
    await wait(WTA_REQUEST_GAP_MS);
    let oop: unknown | null = null;
    try {
      oop = await getJson(`${BASE}/tournaments/${id}/${t.year}/oop`);
    } catch (e) {
      // A missing order of play is a real state (pre-draw tournaments
      // 404 here); a draw with no OOP still yields provisional
      // appearances. Anything else re-throws — a failed read must not
      // impersonate "no schedule yet".
      if (!/http 404/.test(String(e))) throw e;
    }
    appearances.push(
      ...buildTournamentAppearances(parent, matches, oop, nowIso),
    );
    const slot = buildFinalSlot(parent, matches, oop, nowIso);
    if (slot) roundSlots.push(slot);
  }
  return {
    rawCount: tournaments.length,
    fixtures,
    appearances,
    roundSlots,
    appearanceRawCount,
    activeTournaments: active.length,
    activeSkipped: Math.max(0, active.length - fetchable.length),
  };
}
