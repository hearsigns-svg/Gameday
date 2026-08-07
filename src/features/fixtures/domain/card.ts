// The full card — what an event is actually made of. PURE.
//
// The appearance model (Prompt 5) already stores a parent event's
// constituent parts as ordinary fixtures linked by parentFixtureId: an
// undercard bout on a fight card, a player's match in a draw. Until now
// nothing in the app could see them: parent and child share ZERO follow
// keys by design, so the fixture query that feeds Home and Schedule
// never returns a card's bouts alongside the card.
//
// This module is the shaping half — given a parent and the children a
// parentFixtureId query returned, decide what is worth showing.
//
// IT IS GENERIC BY CONSTRUCTION, because the storage is: a boxing card's
// bouts, a tennis tournament's matches and (if athletics ever gains a
// start-list connector) a meeting's events are the same shape. Nothing
// here is combat-specific except the vocabulary.

import { foldName, pairKey } from '../../../core/nameFold';
import { Fixture } from './fixture';
import { isPast } from './horizon';

// THE FOLD IS SHARED NOW (22c follow-up). This module carried a copy,
// sameBout.ts carried an identical one, and core/nameFold.ts carried a
// third that had DRIFTED — it spells `&` as " and " and these two dropped
// it. Nothing crossed between them so nothing was broken, but three
// answers to "are these the same name" is two too many, and the copy that
// decides whether to merge two calendar events is the last place to keep
// the weaker rule.

const VS = /\s+(?:vs\.?|v)\s+/i;

// The two names a child is between, from its athletes array when it has
// one and from its title otherwise. Tennis appearances are stored ONE
// PER PLAYER, so the same match arrives twice — "A vs B" for A's doc and
// "B vs A" for B's — and only a sorted pair collapses them.
function pairOf(f: Fixture): string | null {
  const fromAthletes =
    f.athletes && f.athletes.length === 2
      ? f.athletes.map(foldName)
      : null;
  const fromTitle = (() => {
    // Titles may carry a trailing qualifier ("A vs B — US Open").
    const base = f.title.split(' — ')[0];
    if (!VS.test(base)) return null;
    const parts = base.split(VS).map(foldName);
    return parts.length === 2 ? parts : null;
  })();
  const pair = fromAthletes ?? fromTitle;
  if (!pair || pair.some((p) => p.length === 0)) return null;
  return pairKey(pair[0], pair[1]);
}

export interface CardEntry {
  id: string;
  title: string;
  startUtc: string;
  status: string;
  competitionId: string;
  // Carried so a row can say "Time TBC" rather than print a day
  // sentinel as a clock time.
  timePrecision?: 'exact' | 'nominal' | 'date_only';
  followKeys: string[];
  athletes?: string[];
  // The headline. Marked only where the DATA says so — never guessed
  // from position, because the stored bouts of a card all share one
  // start time and their ids are alphabetical by name, so there is no
  // order in them to read.
  isMain: boolean;
}

// Does this child name the same two people as the parent's own title?
// The parent of a combat card carries the title-parsed headline pair in
// homeTeam/awayTeam (participants.ts::enrichBoutParticipants), which is
// present on every future combat parent in the store and is a better
// main-event signal today than the `-main` follow key: the key is
// stamped by only one connector.
function isParentHeadline(parent: CardParent, child: Fixture): boolean {
  if (!parent.homeTeam || !parent.awayTeam) return false;
  const parentPair = pairKey(
    foldName(parent.homeTeam),
    foldName(parent.awayTeam),
  );
  return parentPair.length > 1 && pairOf(child) === parentPair;
}

// The parent as this module needs it: an id, its ingest slice (for the
// main-event key) and the title-parsed pair. Structural so the app's own
// display snapshot works as well as a stored document.
export interface CardParent {
  id: string;
  competitionId?: string;
  startUtc: string;
  homeTeam?: string;
  awayTeam?: string;
}

export function cardEntries(
  parent: CardParent,
  children: readonly Fixture[],
  nowMs: number = Date.now(),
): CardEntry[] {
  const mainKey = `${parent.competitionId}-main`;
  const seen = new Set<string>();
  const entries: CardEntry[] = [];
  for (const child of children) {
    if (child.id === parent.id) continue;
    if (child.parentFixtureId !== parent.id) continue;
    // A scratched bout must not be listed as if it were still on: the
    // store holds cancelled children under live parents.
    if (child.status === 'cancelled') continue;
    // Nor a match that has already been played. Appearances are frozen
    // rather than deleted, so a live tournament's children are mostly
    // HISTORY — 24 of the 34 stored under one WTA event on 2026-08-04
    // had already finished. The same end-based rule the calendar uses
    // (horizon.ts), so a card and its calendar entries agree about what
    // is still to come.
    if (isPast(child, nowMs)) continue;
    const key = pairOf(child) ?? child.id;
    if (seen.has(key)) continue;
    seen.add(key);
    entries.push({
      id: child.id,
      // Tennis appearance titles carry the tournament as a suffix
      // ("A vs B — National Bank Open"). The screen's header already
      // names the tournament, and a one-line row truncated the matchup
      // to make room for the repetition.
      title: child.title.split(' — ')[0],
      startUtc: child.startUtc,
      status: child.status,
      competitionId: child.competitionId,
      followKeys: child.followKeys,
      ...(child.timePrecision ? { timePrecision: child.timePrecision } : {}),
      ...(child.athletes ? { athletes: child.athletes } : {}),
      isMain:
        child.followKeys.includes(mainKey) || isParentHeadline(parent, child),
    });
  }

  // A "full card" whose only entry is the fight you are already looking
  // at is noise — and that is the shape 10 of 14 stored combat parents
  // have, because their single child is the headline bout re-parsed
  // from the parent's own title. Say nothing rather than repeat.
  if (entries.length <= 1 && entries.every((e) => e.isMain)) return [];

  // The main event leads. Everything else keeps whatever order the data
  // supports: by time where the times differ (tennis), then by title
  // (a fight card's bouts all share one start).
  return entries.sort((a, b) => {
    if (a.isMain !== b.isMain) return a.isMain ? -1 : 1;
    return (
      a.startUtc.localeCompare(b.startUtc) || a.title.localeCompare(b.title)
    );
  });
}

// What this list is called, per sport. The vocabulary is the only
// sport-specific thing in the module.
export function cardSectionTitle(sportKey: string): string {
  switch (sportKey) {
    case 'boxing':
    case 'ufc':
      return 'Full card';
    case 'tennis':
      return 'Matches';
    case 'athletics':
      return 'Events';
    default:
      return 'Also on';
  }
}

// The caption under a bout that has no time of its own. Every bout on a
// card shares the card's start because no source publishes per-bout
// slots — saying so is better than printing the same time on each row
// as though it were a ringwalk.
export function boutTimingCaption(
  parent: CardParent,
  entry: CardEntry,
): string | null {
  if (entry.startUtc !== parent.startUtc) return null;
  return 'Time within the event not published';
}
