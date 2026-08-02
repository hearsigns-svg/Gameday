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
// FOLLOW KEYS are the point of the model: an appearance carries the
// athlete keys of its FULL-NAMED participants (surname-only names are
// display-only, per the participants.ts rule — a surname is not an
// identity and this stage does not pretend otherwise), plus one
// non-followable SLICE KEY (`<parent competitionId>-appearances`) that
// exists so ingest can diff the slice and coverage can count it. Parent
// events carry NO athlete keys — the appearance is where an athlete
// follow attaches, whether the athlete headlines or opens the prelims.

import { Fixture } from './fixture';
import { normaliseName } from './identity';
import {
  athleteKey,
  isFollowableName,
  namesPeople,
  parseBout,
} from './participants';

// The ingest/coverage slice for a parent's appearances. Not offered as a
// followable anywhere; it rides in followKeys so the existing
// array-contains slice diff and the coverage join work unchanged.
export function appearanceSliceKey(parentCompetitionId: string): string {
  return `${parentCompetitionId}-appearances`;
}

const slug = (name: string): string =>
  normaliseName(name).replace(/\s+/g, '-');

// Stable across provisional → confirmed, and across re-polls: built only
// from the parent id and the participants' names. The ledger is keyed by
// this and the notes tag embeds it, so it must be born final.
export function appearanceId(
  parentId: string,
  athletes: readonly string[],
): string {
  return `${parentId}-app-${athletes.map(slug).join('-')}`;
}

export interface AppearanceSlot {
  startUtc: string; // the confirmed instant
  durationHours?: number;
}

// Build one appearance from its parent. Returns null when no participant
// has a followable (full) name — an appearance nobody can follow is a
// doc with no consumer.
//
// Without `slot`, the appearance is PROVISIONAL and carries the parent's
// window verbatim — including a date_only parent's day sentinel, so a
// tennis or athletics appearance renders as the parent-window banner
// until its slot is published. With `slot`, it is a confirmed exact
// instant.
export function appearanceFor(
  parent: Fixture,
  opts: {
    athletes: readonly string[]; // display names, first-named first
    title: string;
    updatedAt: string;
    slot?: AppearanceSlot;
  },
): Fixture | null {
  const keys = opts.athletes.filter(isFollowableName).map(athleteKey);
  if (keys.length === 0) return null;
  const base: Fixture = {
    id: appearanceId(parent.id, opts.athletes),
    sport: parent.sport,
    competition: parent.competition,
    competitionId: appearanceSliceKey(parent.competitionId),
    title: opts.title,
    followKeys: [
      appearanceSliceKey(parent.competitionId),
      ...new Set(keys),
    ],
    startUtc: opts.slot?.startUtc ?? parent.startUtc,
    status: parent.status,
    parentFixtureId: parent.id,
    athletes: [...opts.athletes],
    updatedAt: opts.updatedAt,
    ...(parent.venueTz ? { venueTz: parent.venueTz } : {}),
  };
  if (opts.slot) {
    return {
      ...base,
      timePrecision: 'exact',
      confidence: 'confirmed',
      ...(opts.slot.durationHours !== undefined
        ? { durationHours: opts.slot.durationHours }
        : {}),
    };
  }
  return {
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
  };
}

export interface ParsedBoutLike {
  first: string;
  second: string;
}

// Combat-card appearances derivable from a bout: both fighters on one
// doc — a bout is one thing, and a user following either fighter (or
// both) must get exactly one calendar event for it.
export function boutAppearance(
  parent: Fixture,
  bout: ParsedBoutLike,
  updatedAt: string,
): Fixture | null {
  return appearanceFor(parent, {
    athletes: [bout.first, bout.second],
    title: `${bout.first} vs ${bout.second}`,
    updatedAt,
  });
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
export function retiredAppearanceIds(
  existing: readonly Fixture[], // current docs of the appearance slice
  incoming: readonly Fixture[], // this run's appearance yield
  nowIso: string,
): string[] {
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
        e.startUtc >= nowIso, // the past is frozen, here as everywhere
    )
    .map((e) => e.id);
}

// The generic combat consumer: whatever a slice's card titles yield.
// TheSportsDB publishes no bout structure, so the HEADLINE bout parsed
// from the title is all a card can contribute here — UFC's surname-only
// titles yield nothing, honestly (a surname is not an identity), while
// full-named boxing titles yield the main bout. Providers with real
// bout-level data (PBC's JSON-LD) build their appearances themselves and
// skip this. Appearances are only derived for cards not already past —
// gated by the caller, which knows its window.
export function deriveBoutAppearances(
  fixtures: readonly Fixture[],
  updatedAt: string,
): Fixture[] {
  const out: Fixture[] = [];
  for (const f of fixtures) {
    if (!namesPeople(f.sport)) continue;
    if (f.parentFixtureId) continue; // never derive from an appearance
    const bout = parseBout(f.title, f.sport);
    if (!bout) continue;
    const a = boutAppearance(f, bout, updatedAt);
    if (a) out.push(a);
  }
  return out;
}
