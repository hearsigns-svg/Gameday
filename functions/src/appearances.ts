// Appearances — a named athlete competing within a parent event. PURE.
//
// One model, three consumers (Prompt 5): an undercard bout on a boxing
// card, a player in a tennis draw, an athlete on an athletics start list.
// An appearance is an ordinary fixtures-collection doc — same id
// namespace, same ledger path on the device, its own calendar event —
// linked to its parent by parentFixtureId and, crucially, by ID PREFIX:
// the appearance id embeds the parent id, so `id.split('-')[0]` still
// names the parent's provider. That one property buys two guarantees for
// free: the reconcile same-provider guard (identity.ts:providerOf) makes
// an appearance merge-inert against its own parent and siblings, and
// coverage source attribution (coverage.ts:sourceOfFixtureId) stays
// truthful.
//
// LIFECYCLE, using the Prompt 3 fields — no new state machine:
//   provisional — athlete entered / bout announced, exact slot unknown.
//     The appearance carries the PARENT's window (startUtc, duration,
//     timePrecision) with confidence 'provisional'.
//   confirmed — the exact slot is known. The SAME doc id carries the new
//     startUtc/durationHours with timePrecision 'exact'. Because the id
//     never changes, the device planner emits an in-place UPDATE against
//     the same ledger entry — never a second event.
//
// SINCE PROMPT 8 providers emit DRAFTS, not finished docs: the fixture
// plus one AthleteRef per participant (name, and the provider's numeric
// id where one exists). Follow keys are decided in ONE place —
// athletes.ts:resolveDrafts — against the canonical athlete directory:
// certain by provider id, confident by unique full name, ambiguous
// mints nothing. The word-count gate that F31 defeated is gone;
// directory membership is the test.

import { AppearanceDraft, AthleteRef } from './athletes';
import { Fixture } from './fixture';
import { nameSlug, normaliseName } from './identity';
import { namesPeople, parseBout } from './participants';

// The ingest/coverage slice for a parent's appearances. Not offered as a
// followable anywhere; it rides in followKeys so the existing
// array-contains slice diff and the coverage join work unchanged.
export function appearanceSliceKey(parentCompetitionId: string): string {
  return `${parentCompetitionId}-appearances`;
}

// The fourth independent copy of normalise-then-hyphenate, now the one
// constructor. It returns null for a name that normalises to nothing,
// which is what `appearanceId` has to handle rather than paper over.

// Stable across provisional → confirmed, and across re-polls: built only
// from the parent id and the participants' names. The ledger is keyed by
// this and the notes tag embeds it, so it must be born final.
//
// KNOWN LIMIT (F34, owner ruling pending): the id is name-built, so two
// distinct athletes sharing a rendered name inside one parent would
// collide. resolveDrafts detects that case, keeps the first,
// and REFUSES the second loudly rather than silently absorbing it.
// NULL WHEN ANY PARTICIPANT HAS NO SLUGGABLE NAME. The guard above it
// checks `refs.length === 0`, which is a different test: a
// punctuation-only participant passes it and used to produce
// `<parent>-app-` or `<parent>-app--smith`, so two different bouts under
// one parent collided on ONE document id — and this id keys the sync
// ledger and is embedded in the calendar note, so a collision does not
// merely duplicate, it overwrites somebody's event with somebody else's.
//
// Same shape as the F34 limit already recorded below: distinct people
// must not share an id. That one is detected and refused loudly; this one
// was not detected at all.
export function appearanceId(
  parentId: string,
  athletes: readonly string[],
): string | null {
  const slugs = athletes.map(nameSlug);
  if (slugs.some((s) => s === null)) return null;
  return `${parentId}-app-${slugs.join('-')}`;
}

export interface AppearanceSlot {
  startUtc: string; // the confirmed instant, or a day sentinel
  durationHours?: number;
  // A slot can be known to the DAY without a time: tennis order of play
  // lists follow-on matches ("after previous") with a date and court but
  // no instant. That is a confirmed date_only, never an invented time.
  dayOnly?: boolean;
}

// Build one appearance DRAFT from its parent. Returns null only when no
// participant ref was supplied at all — whether the draft survives to a
// stored doc is resolution's decision (a draft none of whose refs
// resolve to a followable athlete is dropped there).
//
// Without `slot`, the appearance is PROVISIONAL and carries the parent's
// window verbatim — including a date_only parent's day sentinel, so a
// tennis or athletics appearance renders as the parent-window banner
// until its slot is published. With `slot`, it is a confirmed exact
// instant.
export function appearanceFor(
  parent: Fixture,
  opts: {
    refs: readonly AthleteRef[]; // participants, first-named first
    title: string;
    updatedAt: string;
    slot?: AppearanceSlot;
  },
): AppearanceDraft | null {
  if (opts.refs.length === 0) return null;
  const names = opts.refs.map((r) => r.name);
  // No id, no appearance. `refs.length === 0` was the only guard, and it
  // does not catch a participant whose name normalises to nothing.
  const id = appearanceId(parent.id, names);
  if (id === null) return null;
  const base: Fixture = {
    id,
    sport: parent.sport,
    competition: parent.competition,
    competitionId: appearanceSliceKey(parent.competitionId),
    title: opts.title,
    followKeys: [appearanceSliceKey(parent.competitionId)],
    startUtc: opts.slot?.startUtc ?? parent.startUtc,
    status: parent.status,
    parentFixtureId: parent.id,
    athletes: [...names],
    updatedAt: opts.updatedAt,
    ...(parent.venueTz ? { venueTz: parent.venueTz } : {}),
  };
  if (opts.slot) {
    return {
      fixture: {
        ...base,
        timePrecision: opts.slot.dayOnly ? 'date_only' : 'exact',
        confidence: 'confirmed',
        ...(opts.slot.durationHours !== undefined
          ? { durationHours: opts.slot.durationHours }
          : {}),
      },
      refs: [...opts.refs],
    };
  }
  return {
    fixture: {
      ...base,
      // The parent's window, verbatim: a nominal card start stays nominal
      // (timed event, in-place update on confirmation), a date_only
      // tournament stays date_only (all-day span; confirmation is the
      // established placeholder-sharpening kind flip).
      ...(parent.durationHours !== undefined
        ? { durationHours: parent.durationHours }
        : {}),
      ...(parent.timePrecision ? { timePrecision: parent.timePrecision } : {}),
      confidence: 'provisional',
    },
    refs: [...opts.refs],
  };
}

export interface ParsedBoutLike {
  first: string;
  second: string;
}

// Combat-card appearances derivable from a bout: both fighters on one
// draft — a bout is one thing, and a user following either fighter (or
// both) must get exactly one calendar event for it.
export function boutAppearance(
  parent: Fixture,
  bout: ParsedBoutLike,
  updatedAt: string,
): AppearanceDraft | null {
  return appearanceFor(parent, {
    refs: [{ name: bout.first }, { name: bout.second }],
    title: `${bout.first} vs ${bout.second}`,
    updatedAt,
  });
}

// When a stored appearance's event is over — the server-side mirror of
// the client's fixtureEndUtc + grace (horizon.ts): end-based, date_only
// spans its real days, postponed collapses to one, 6h grace. Kept in
// sync by hand, like the Fixture model itself.
const PAST_GRACE_MS = 6 * 3_600_000;

export function appearanceEndMs(f: Fixture): number {
  const dateOnly =
    f.timePrecision === 'date_only' ||
    (!f.timePrecision && (f.status === 'tbd' || f.status === 'postponed'));
  if (dateOnly || f.status === 'postponed') {
    const d = new Date(f.startUtc);
    const dayStart = Date.UTC(
      d.getUTCFullYear(),
      d.getUTCMonth(),
      d.getUTCDate(),
    );
    const days =
      f.status === 'postponed'
        ? 1
        : Math.max(1, Math.round((f.durationHours ?? 2) / 24));
    return dayStart + days * 86_400_000;
  }
  return Date.parse(f.startUtc) + (f.durationHours ?? 2) * 3_600_000;
}

// Which previously-stored appearances a fresh yield RETIRES. A bout is
// scratched or an opponent replaced routinely in combat sports; because
// the appearance id embeds the names, the replacement arrives under a
// NEW id and the old doc would otherwise sit scheduled forever, keeping
// a phantom event in every follower's calendar (ingest never deletes).
//
// THE EVIDENCE GUARD is the point: a parent may only retire appearances
// when its fresh yield contains AT LEAST ONE appearance for that same
// parent. A parent that yielded nothing proves nothing — a provider
// shape failure (or a page transiently missing its JSON-LD) must never
// be read as "every bout was scratched" and cancel real events. The
// cost of the guard is the miss it chooses: a withdrawal that leaves a
// one-bout card empty is not caught. Retired docs are CANCELLED, not
// deleted — cancellation is the status the whole pipeline already
// propagates as event deletion for followers.
//
// The freeze is END-based, the same boundary the client ledger uses. It
// was startUtc-based at first, which a WTA provisional appearance broke
// on day 2 of its tournament: it carries the PARENT window's day-1
// startUtc, so an eliminated player's week-long event could never be
// retired mid-tournament — while her event was still LIVE in every
// follower's calendar, implying she was still playing. An event that
// has not yet ended (plus grace) is retirable; an ended one is frozen.
export function retiredAppearanceIds(
  existing: readonly Fixture[], // current docs of the appearance slice
  incoming: readonly Fixture[], // this run's appearance yield
  nowIso: string,
): string[] {
  const nowMs = Date.parse(nowIso);
  const byParent = new Map<string, Set<string>>();
  for (const f of incoming) {
    if (!f.parentFixtureId) continue;
    const ids = byParent.get(f.parentFixtureId) ?? new Set<string>();
    ids.add(f.id);
    byParent.set(f.parentFixtureId, ids);
  }
  return existing
    .filter(
      (e) =>
        e.parentFixtureId !== undefined &&
        byParent.has(e.parentFixtureId) &&
        !byParent.get(e.parentFixtureId)!.has(e.id) &&
        e.status !== 'cancelled' &&
        appearanceEndMs(e) + PAST_GRACE_MS > nowMs, // ended ⇒ frozen
    )
    .map((e) => e.id);
}

// The generic combat consumer: whatever a slice's card titles yield.
// TheSportsDB publishes no bout structure, so the HEADLINE bout parsed
// from the title is all a card can contribute here — UFC's surname
// titles honestly yield nothing (a surname is not an identity), while
// full-named boxing titles yield the main bout as a draft. TITLE-PARSED
// names never CREATE directory athletes (resolution policy 'never' at
// the call site): a parsed title resolving against the directory is
// evidence; a parsed title inventing an identity is F31.
export function deriveBoutAppearances(
  fixtures: readonly Fixture[],
  updatedAt: string,
): AppearanceDraft[] {
  const out: AppearanceDraft[] = [];
  for (const f of fixtures) {
    if (!namesPeople(f.sport)) continue;
    if (f.parentFixtureId) continue; // never derive from an appearance
    const bout = parseBout(f.title, f.sport);
    if (!bout) continue;
    const a = boutAppearance(f, bout, updatedAt);
    if (a) {
      // TSDB publishes no bout structure, so the headline IS the only
      // bout — it carries the main-event scoped key (Prompt 11).
      a.fixture.followKeys.push(`${f.competitionId}-main`);
      out.push(a);
    }
  }
  return out;
}
