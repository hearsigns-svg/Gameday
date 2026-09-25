// Colour layers — PURE (owner rulings 2026-09-25).
//
// Three places choose a colour, each more specific than the last, and
// the more specific one wins:
//
//   SPORT   — Settings, and the sport chip on a follow's page. One colour
//             per sport (its calendar GROUP — follows/domain/
//             sportCalendarGroup.ts, so F1 is Motorsport's), kept when
//             the layout switch flips. With one calendar it paints that
//             sport's events; with a calendar for each sport it IS that
//             calendar's colour, and its events simply wear it.
//   FOLLOW  — the follow's own chip on its page: a team, a fighter, a
//             competition. Paints the events that follow brings in.
//   EVENT   — the fixture card's colour row (eventSettings.colour).
//
// NOTHING IS PAINTED UNTIL SOMEONE PICKS (ruling 9): a sport or follow
// with no colour of its own adds nothing to an event, so an upgrading
// install's calendar is not rewritten. An event with no colour at any
// layer wears its calendar's.
//
// Only a calendar layer that can colour ONE event (Google Calendar; not
// EventKit) paints events at all — `eventColours`. Without it the sport
// colour still reaches a sport calendar, because that is a calendar's
// colour, which every layer can set.
//
// WHICH FOLLOW, when several coloured follows want the same event: the
// inclusion rule's own ladder (follows/domain/calendarInclusion.ts) —
// the most specific wins, so a team beats its league and one draw beats
// its tournament. Only follows that are IN the calendar count: a follow
// kept out of it put nothing there to colour. Among equals, the one
// followed first.

import {
  calendarGroupOf,
  GroupableFixture,
  sportCalendarColour,
} from '../../follows/domain/sportCalendarGroup';
import { CalendarPref, specificityOf } from '../../follows/domain/calendarInclusion';
import type { FollowableType } from '../../follows/domain/sportsConfig';
import type { CalendarLayout } from './sportCalendars';

export interface ColourFollow {
  key: string;
  type: FollowableType;
  calendar: CalendarPref;
  // The fixture keys this follow is found under (its scope-expanded
  // query keys — the set the inclusion rule matches on).
  queryKeys: readonly string[];
  colour?: string;
}

export interface ColourContext {
  layout: CalendarLayout;
  // Picked sport colours, by calendar group. Absent = none of its own.
  sportColours: Readonly<Record<string, string>>;
  // Every follow, in the order they were followed.
  follows: readonly ColourFollow[];
  // Whether the calendar layer can colour one event
  // (data/driver.ts::calendarCapabilities().perEventColour).
  eventColours: boolean;
}

// Where an event's colour comes from when it has none of its own.
export type ColourSource =
  | { kind: 'follow'; key: string; colour: string }
  | { kind: 'sport'; group: string; colour: string }
  // The calendar's own colour: KickOffCal's (group null, one calendar) or
  // the sport calendar's.
  | { kind: 'calendar'; group: string | null };

interface Ranked {
  key: string;
  colour: string;
  rank: number;
  order: number;
}

// Fixture key → the coloured, in-the-calendar follows found under it.
// Built once per pass; a pass asks thousands of fixtures.
function colourIndex(follows: readonly ColourFollow[]): Map<string, Ranked[]> {
  const index = new Map<string, Ranked[]>();
  follows.forEach((f, order) => {
    if (!f.colour || f.calendar !== 'in') return;
    const ranked: Ranked = { key: f.key, colour: f.colour, rank: specificityOf(f).rank, order };
    for (const k of new Set(f.queryKeys)) {
      const list = index.get(k);
      if (list) list.push(ranked);
      else index.set(k, [ranked]);
    }
  });
  return index;
}

function bestOf(fixtureKeys: readonly string[], index: Map<string, Ranked[]>): Ranked | null {
  let best: Ranked | null = null;
  for (const k of fixtureKeys) {
    for (const r of index.get(k) ?? []) {
      if (
        !best ||
        r.rank < best.rank ||
        (r.rank === best.rank && r.order < best.order)
      ) {
        best = r;
      }
    }
  }
  return best;
}

// The resolver a planner pass uses: fixture → where its colour comes from.
export function colourSourceResolver(
  ctx: ColourContext,
): (f: GroupableFixture) => ColourSource {
  const index = colourIndex(ctx.follows);
  return (f) => {
    const group = calendarGroupOf(f);
    if (ctx.eventColours) {
      const follow = bestOf(f.followKeys, index);
      if (follow) return { kind: 'follow', key: follow.key, colour: follow.colour };
      if (ctx.layout === 'combined') {
        const sport = ctx.sportColours[group];
        if (sport) return { kind: 'sport', group, colour: sport };
      }
    }
    return { kind: 'calendar', group: ctx.layout === 'per-sport' ? group : null };
  };
}

// The colour an event INHERITS — what the planner writes on an event
// with no colour of its own. Undefined = the calendar's colour, which
// needs nothing written.
export function inheritedColourResolver(
  ctx: ColourContext,
): (f: GroupableFixture) => string | undefined {
  const source = colourSourceResolver(ctx);
  return (f) => {
    const s = source(f);
    return s.kind === 'calendar' ? undefined : s.colour;
  };
}

// A sport calendar's colour: the sport's picked colour, else the one it
// was created in.
export function sportCalendarColourFor(
  group: string,
  sportColours: Readonly<Record<string, string>>,
): string {
  return sportColours[group] ?? sportCalendarColour(group);
}

// ─── A sport calendar's colour, painted until it sticks ────────────────
//
// 'applied' = the calendar layer took this colour; 'pending' = not yet
// (offline, an expired grant, a calendar layer that failed) — painted
// again on the next pass; 'refused' = Google answered 403/400 for this
// colour, so it is not asked again until the user picks another. The
// same three states as KickOffCal's own colour (data/restCalendarDriver
// .ts), for the same reasons. A calendar with NO record is painted once:
// one made before this was recorded, or whose paint at creation failed
// (the Pixel, 2026-09-25: both colour requests died, and the calendars
// kept Google's default).
export type SportColourStatus = 'applied' | 'pending' | 'refused';

export interface SportColourState {
  hex: string;
  status: SportColourStatus;
}

const sameHex = (a: string, b: string): boolean =>
  a.trim().toLowerCase() === b.trim().toLowerCase();

export function sportColourNeedsPaint(
  state: SportColourState | undefined,
  want: string,
): boolean {
  if (!state || !sameHex(state.hex, want)) return true;
  return state.status === 'pending';
}

// What a sport's dot shows. One calendar: its own colour, else the
// calendar's (it has none of its own until picked). A calendar for each
// sport: that calendar's colour.
export function sportDotColour(
  group: string,
  layout: CalendarLayout,
  sportColours: Readonly<Record<string, string>>,
  calendarColour: string,
): string {
  if (layout === 'per-sport') return sportCalendarColourFor(group, sportColours);
  return sportColours[group] ?? calendarColour;
}

// The rows Settings lists under the calendar: the sports followed (not
// the teams), one per calendar group — and, with a calendar for each
// sport, any sport whose calendar is still there after its last follow
// went (it keeps the past games; ruling 2026-09-24). Sorted by the name
// shown, as a calendar app lists them.
export function colourGroups(
  follows: ReadonlyArray<{ sportKey: string; key: string }>,
  layout: CalendarLayout,
  recordedGroups: readonly string[],
  labelOf: (group: string) => string,
): string[] {
  const groups = new Set<string>();
  for (const f of follows) {
    groups.add(calendarGroupOf({ sport: f.sportKey, followKeys: [f.key] }));
  }
  if (layout === 'per-sport') for (const g of recordedGroups) groups.add(g);
  return [...groups].sort((a, b) => labelOf(a).localeCompare(labelOf(b)));
}
