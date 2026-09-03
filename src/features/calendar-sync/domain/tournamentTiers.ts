// Tournament calendar tiers (Round 3 B3) — PURE.
//
// A followed multi-day tournament used to write exactly one thing: the
// full-span all-day block. The tier setting decides what it writes now:
//
//   block — the block, unchanged, its description carrying the pointer
//           to the in-app card (where individual matches can be added).
//   key   — the block is REPLACED by two single-day all-day bookend
//           notes — opening day ("US Open begins", pointer text rides
//           here) and closing day ("US Open — final day") — with the
//           KEY-ROUND matches between them as ordinary events.
//   all   — bookends plus every match on the card.
//
// The opening note KEEPS the parent's fixture id, so an existing block
// entry morphs in place (one update op) instead of delete-and-create;
// the closing note is a second, derived id, ledger-tracked like any
// synced event — unfollow and erase remove the pair with everything
// else. A tournament spanning a single day collapses to one note.
//
// Matches ride on the parent's own follow key: children deliberately
// share no keys with their parent in storage (a card's followers are
// not auto-subscribed to every fighter on it — that design stands), so
// the tier pass stamps the FOLLOWED tournament key onto the copies it
// feeds the planner. Everything downstream — horizon, ledger, dedupe,
// exclusions, pins, delete caps — is untouched and applies to these
// like any fixture. Sweep: the shape test is structural (a multi-day
// date_only parent), so every block-synced tournament in every sport
// rides the same rules.

import { t } from '../../../core/i18n';
import { Fixture } from '../../fixtures/domain/fixture';
import {
  dateOnlySpanDays,
  eventEndUtc,
  timePrecisionOf,
} from '../../fixtures/domain/horizon';
import { TournamentTier } from './prefs';
import {
  isBareTennisKey,
  isTennisTournamentKey,
  sexedTennisKey,
  tennisEntrySex,
} from '../../fixtures/domain/tennisKeys';

// The calendar-description pointer (Round 3 B3): rides the tier-1
// block and the tier-2/3 opening note. Catalog-backed (Phase C) — the
// calendar-rewrite mechanism depends on every calendar-written string
// flowing through t().
export const TOURNAMENT_POINTER_NOTE = t('calendar.tournament.pointer');

// The block shape: a parent whose honest calendar form is the
// multi-day all-day span.
export function isBlockParent(f: Fixture): boolean {
  return (
    !f.parentFixtureId &&
    f.status !== 'postponed' &&
    f.status !== 'cancelled' &&
    timePrecisionOf(f) === 'date_only' &&
    dateOnlySpanDays(f.durationHours) > 1
  );
}

// KEY ROUNDS, where the data can name them. No stored fixture carries
// a structured round field today — the round lives in TITLE text where
// it lives anywhere ("A vs B — Final", golf's "… — Final Round") — so
// the classifier reads the title's em-dash segments, SKIPPING any
// segment that is the competition's own name: without that, every
// match of a tournament NAMED "…Finals" (the ATP Finals) would read as
// a key round. Where titles carry no round, the key tier honestly
// syncs no matches: the bookends and the pointer are the contract, and
// the classifier tightens the day a source states rounds.
const KEY_ROUND =
  /\b(?:finals?|semi[- ]?finals?|quarter[- ]?finals?|gold medal)\b/i;

// The rounds the key tier keeps, where the STRUCTURED field exists —
// WTA tour appearances carry a draw-derived rung today (96/132 at
// Cincinnati in prod), and any future source that states rounds lands
// here without touching the title heuristic.
const KEY_ROUND_CODES = new Set(['f', 'sf', 'qf']);

export function isKeyRound(f: Fixture): boolean {
  // Structure first: a stated round is an answer, not a guess — in
  // BOTH directions. A fixture whose source stamped r32 is NOT a key
  // round however its title reads.
  const round = f.stage?.round;
  if (round !== undefined) return KEY_ROUND_CODES.has(round);
  const competition = f.competition.trim().toLowerCase();
  return f.title
    .split(' — ')
    .some(
      (seg) =>
        seg.trim().toLowerCase() !== competition && KEY_ROUND.test(seg),
    );
}

function dayStartUtc(iso: string): string {
  const d = new Date(iso);
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
  ).toISOString();
}

// The final day's sentinel: the day the span ENDS in, not the day
// after (subtracting a millisecond keeps a span ending at midnight on
// its own last day).
function finalDayStartUtc(f: Fixture): string {
  const end = Date.parse(eventEndUtc(f.startUtc, f.durationHours));
  return dayStartUtc(new Date(end - 1).toISOString());
}

export const CLOSE_ID_SUFFIX = '::close';

export interface TournamentChildren {
  // Children per PARENT id — for a joint tournament the caller supplies
  // every sibling parent's children under that sibling's id, and the
  // pass unions whatever it finds for the parents it keeps.
  byParent: ReadonlyMap<string, readonly Fixture[]>;
}

// Tier order, for the one place two follows meet on one parent: follows
// are a union of wants, so the more permissive tier shapes the parent.
const TIER_RANK: Record<TournamentTier, number> = { block: 0, key: 1, all: 2 };

export function mostPermissiveTier(
  tiers: readonly TournamentTier[],
  fallback: TournamentTier,
): TournamentTier {
  let best: TournamentTier | undefined;
  for (const tier of tiers) {
    if (best === undefined || TIER_RANK[tier] > TIER_RANK[best]) best = tier;
  }
  return best ?? fallback;
}

// The tier pass. Takes the planner's fixture list, returns the list the
// planner should actually see. `followedKeys` decides which parents the
// pass may touch at all — an unfollowed tournament in the fetch (a
// pinned child's parent, say) is not this feature's business.
// `overrides` (Round 7) is the per-tournament choice from the follow's
// own page: an explicit override on the owning follow key beats the
// global tier, the F1 seriesSessions pattern.
//
// THE TIER IS RESOLVED PER FOLLOW, NOT PER PARENT (owner, 2026-09-03).
// A joint tournament is two draws under two follows, each with its own
// chip on its own page. Resolving one tier off one "owner" key let the
// men's page's choice govern the women's matches — and, because the
// planner and the card can anchor on different parents, the calendar
// held one answer while the card showed another. Now each match copy
// is judged by the tier of the follow it rides, and the PARENT takes
// the most permissive tier any held follow asks for (bookends if any
// draw wants matches; the block only when every follow says so).
export function applyTournamentTiers(
  fixtures: readonly Fixture[],
  globalTier: TournamentTier,
  followedKeys: readonly string[],
  children: TournamentChildren = { byParent: new Map() },
  overrides: ReadonlyMap<string, TournamentTier> = new Map(),
): Fixture[] {
  const followed = new Set(followedKeys);
  const tierOf = (key: string): TournamentTier => overrides.get(key) ?? globalTier;
  const out: Fixture[] = [];
  for (const f of fixtures) {
    const followKey = ownerFollowKey(f.followKeys, followed, overrides);
    if (!isBlockParent(f) || followKey === undefined) {
      out.push(f);
      continue;
    }
    const kids = children.byParent.get(f.id) ?? [];
    // Which follow each child would ride, and so which tier judges it.
    // Decided BEFORE the parent's shape: with matches on the card, the
    // parent takes the most permissive tier among the follows its
    // matches ride (a draw's own page beats a whole-tour follow for
    // that draw, because childFollowKey prefers the draw key); with no
    // matches to judge, the owning key's tier decides, as it always did.
    const rides = kids
      .filter((child) => child.status !== 'cancelled')
      .map((child) => ({ child, stamp: childFollowKey(child, f, followed, followKey) }))
      .filter((r): r is { child: Fixture; stamp: string } => r.stamp !== null);
    const tier =
      rides.length > 0
        ? mostPermissiveTier(rides.map((r) => tierOf(r.stamp)), globalTier)
        : tierOf(followKey);
    if (tier === 'block') {
      // The pointer is only honest where the card actually OFFERS
      // matches — a Test match's five-day block has none to add.
      out.push(kids.length > 0 ? { ...f, tournamentPointer: true } : f);
      continue;
    }
    const singleDay = dayStartUtc(f.startUtc) === finalDayStartUtc(f);
    out.push({
      ...f,
      tournamentNote: 'open',
      // A single-day tournament collapses to one plain-titled note.
      title: singleDay
        ? f.title
        : t('calendar.tournament.begins', { title: f.title }),
      durationHours: 24,
    });
    if (!singleDay) {
      out.push({
        ...f,
        id: `${f.id}${CLOSE_ID_SUFFIX}`,
        tournamentNote: 'close',
        title: t('calendar.tournament.finalDay', { title: f.title }),
        startUtc: finalDayStartUtc(f),
        durationHours: 24,
      });
    }
    for (const { child, stamp } of rides) {
      // A draw nobody follows (the women's matches under a men's-only
      // follow) is not this follow's business — the union hands the
      // pass every sibling's children; the follow set decides (a null
      // stamp was dropped above). The tier that judges THIS copy is the
      // one on the follow it rides.
      const childTier = tierOf(stamp);
      if (childTier === 'block') continue;
      if (childTier === 'key' && !isKeyRound(child)) continue;
      out.push({
        ...child,
        // The copy rides the follow that carried its tournament, so
        // unfollowing removes matches, bookends and all in one plan.
        followKeys: [...child.followKeys, stamp],
      });
    }
  }
  return out;
}

// The followed key that OWNS a parent for the tier decision. A parent
// carries several keys a user may hold at once — the tour slice
// ('tennis-wta'), the bare joint key, its sexed draw key — and the
// per-tournament override lives on ONE of them. Preference: a followed
// key that carries an override, then a tournament key over a tour key,
// then parent order. (Before Round 7 the first followed key won, so a
// WTA Tour follower's US Open override was invisible to the pass.)
function ownerFollowKey(
  parentKeys: readonly string[],
  followed: ReadonlySet<string>,
  overrides: ReadonlyMap<string, TournamentTier>,
): string | undefined {
  const held = parentKeys.filter((k) => followed.has(k));
  return (
    held.find((k) => overrides.has(k)) ??
    held.find(isTennisTournamentKey) ??
    held[0]
  );
}

// The key a match COPY rides (Round 7 item 8). A tennis match belongs to
// ONE draw, and the joint union hands the pass both draws' matches, so
// each copy is stamped with the followed key of ITS OWN side: the sexed
// key where the user holds it, the bare joint key for a legacy follow,
// the tour slice for a whole-tour follower of that draw — or nothing,
// which drops the match. Every other sport keeps the owner key.
function childFollowKey(
  child: Fixture,
  parent: Fixture,
  followed: ReadonlySet<string>,
  ownerKey: string,
): string | null {
  const joint = parent.followKeys.find(isBareTennisKey);
  const sex = tennisEntrySex(child.competitionId);
  if (joint === undefined || sex === null) return ownerKey;
  const sexed = sexedTennisKey(joint, sex);
  if (followed.has(sexed)) return sexed;
  if (followed.has(joint)) return joint;
  const tourSlice = sex === 'm' ? 'tennis-atp' : 'tennis-wta';
  if (followed.has(tourSlice) && parent.followKeys.includes(tourSlice)) return tourSlice;
  return null;
}
