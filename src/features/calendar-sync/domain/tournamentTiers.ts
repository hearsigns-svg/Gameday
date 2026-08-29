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

import { Fixture } from '../../fixtures/domain/fixture';
import {
  dateOnlySpanDays,
  eventEndUtc,
  timePrecisionOf,
} from '../../fixtures/domain/horizon';
import { TournamentTier } from './prefs';

// The calendar-description pointer (Round 3 B3): rides the tier-1
// block and the tier-2/3 opening note.
export const TOURNAMENT_POINTER_NOTE =
  'Individual matches can be added from the tournament’s card in the app.';

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

export function isKeyRound(f: Fixture): boolean {
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

// The tier pass. Takes the planner's fixture list, returns the list the
// planner should actually see. `followedKeys` decides which parents the
// pass may touch at all — an unfollowed tournament in the fetch (a
// pinned child's parent, say) is not this feature's business.
export function applyTournamentTiers(
  fixtures: readonly Fixture[],
  tier: TournamentTier,
  followedKeys: readonly string[],
  children: TournamentChildren = { byParent: new Map() },
): Fixture[] {
  const followed = new Set(followedKeys);
  const out: Fixture[] = [];
  for (const f of fixtures) {
    const followKey = f.followKeys.find((k) => followed.has(k));
    if (!isBlockParent(f) || followKey === undefined) {
      out.push(f);
      continue;
    }
    const kids = children.byParent.get(f.id) ?? [];
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
      title: singleDay ? f.title : `${f.title} begins`,
      durationHours: 24,
    });
    if (!singleDay) {
      out.push({
        ...f,
        id: `${f.id}${CLOSE_ID_SUFFIX}`,
        tournamentNote: 'close',
        title: `${f.title} — final day`,
        startUtc: finalDayStartUtc(f),
        durationHours: 24,
      });
    }
    for (const child of kids) {
      if (tier === 'key' && !isKeyRound(child)) continue;
      if (child.status === 'cancelled') continue;
      out.push({
        ...child,
        // The copy rides the follow that carried its tournament, so
        // unfollowing removes matches, bookends and all in one plan.
        followKeys: [...child.followKeys, followKey],
      });
    }
  }
  return out;
}
