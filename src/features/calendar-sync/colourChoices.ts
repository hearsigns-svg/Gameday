// What the colour controls show and do (owner rulings 2026-09-25) — the
// store-reading half of domain/colourLayers.ts, shared by Settings, a
// follow's page and the fixture card, so the three can never disagree
// about what a dot shows or what a pick changes.
//
// PREMIUM (AGENTS rule 19): every colour control is shown to everyone; in
// the free state a tap goes to the offer (offerPremium) and changes
// NOTHING — no sheet opens, nothing is saved.

import { premiumLocked } from '../../core/entitlementStore';
import { offerPremium } from '../../core/premiumOffer';
import { Followable, loadFollowables, setFollowColour, toInclusionFollow } from '../follows/data/followStore';
import { calendarGroupOf, GroupableFixture } from '../follows/domain/sportCalendarGroup';
import { calendarCapabilities, calendarColour, paintSportCalendar } from './data/driver';
import { loadPrefs, savePrefs } from './data/prefsStore';
import { sportCalendarIds } from './data/sportCalendarStore';
import { colourPickStep } from './domain/calendarConnection';
import {
  ColourContext,
  colourSourceResolver,
  sportCalendarColourFor,
  sportDotColour,
} from './domain/colourLayers';
import { layoutOf } from './domain/sportCalendars';
import { sportCalendarTitle, sportGroupLabel } from './sportCalendarNames';
import { runSync } from './syncEngine';

// The calendar group a follow's events land in (F1 → Motorsport).
export function groupOfFollow(f: Pick<Followable, 'sportKey' | 'key'>): string {
  return calendarGroupOf({ sport: f.sportKey, followKeys: [f.key] });
}

// Whether the calendar layer can colour ONE event — Google Calendar can,
// EventKit cannot. A capability, never the platform (AGENTS rule 10):
// where it is false, the follow and event dots are simply absent, and a
// sport's dot exists only where the sport has a calendar of its own.
export function eventColoursPossible(): boolean {
  return calendarCapabilities().perEventColour;
}

export function colourContext(): ColourContext {
  const prefs = loadPrefs();
  return {
    layout: layoutOf(prefs),
    sportColours: prefs.sportColours,
    follows: loadFollowables().map((f) => ({
      ...toInclusionFollow(f),
      ...(f.colour ? { colour: f.colour } : {}),
    })),
    eventColours: eventColoursPossible(),
  };
}

// Is there a colour to choose for this sport, here? With a calendar for
// each sport, always (it is that calendar's colour); with one calendar,
// only where one event can be coloured.
export function sportColourChoosable(): boolean {
  return layoutOf(loadPrefs()) === 'per-sport' || eventColoursPossible();
}

// A sport's row: its name (the calendar's title with a calendar for each
// sport), what its dot shows, and what its sheet offers.
export function sportColourChoice(group: string): {
  title: string;
  colour: string;
  chosen: string | undefined;
  inherit?: { label: string; colour: string };
} {
  const prefs = loadPrefs();
  const layout = layoutOf(prefs);
  const chosen = prefs.sportColours[group];
  if (layout === 'per-sport') {
    return {
      title: sportCalendarTitle(group),
      // A calendar always has a colour: the picked one, else the one it
      // was made in.
      colour: sportCalendarColourFor(group, prefs.sportColours),
      chosen: sportCalendarColourFor(group, prefs.sportColours),
    };
  }
  return {
    title: sportGroupLabel(group),
    colour: sportDotColour(group, layout, prefs.sportColours, calendarColour()),
    chosen,
    // None of its own: its games wear KickOffCal's.
    inherit: { label: 'KickOffCal', colour: calendarColour() },
  };
}

// A follow's chip: its own colour, else its sport's.
export function followColourChoice(f: Followable): {
  colour: string;
  chosen: string | undefined;
  inherit: { label: string; colour: string };
} {
  const group = groupOfFollow(f);
  const sport = sportColourChoice(group);
  const inherit = { label: sportGroupLabel(group), colour: sport.colour };
  return { colour: f.colour ?? inherit.colour, chosen: f.colour, inherit };
}

// What an event with no colour of its own wears, and where that comes
// from — the fixture card's first choice.
export function eventInherit(f: GroupableFixture): { label: string; colour: string } {
  const ctx = colourContext();
  const source = colourSourceResolver(ctx)(f);
  if (source.kind === 'follow') {
    const follow = loadFollowables().find((x) => x.key === source.key);
    return { label: follow?.label ?? source.key, colour: source.colour };
  }
  if (source.kind === 'sport') return { label: sportGroupLabel(source.group), colour: source.colour };
  if (source.group === null) return { label: 'KickOffCal', colour: calendarColour() };
  return {
    label: sportCalendarTitle(source.group),
    colour: sportCalendarColourFor(source.group, ctx.sportColours),
  };
}

// A tap on any colour control: the sheet — or, in the free state, the offer.
export function colourTap(open: () => void): void {
  if (colourPickStep(premiumLocked()) === 'offer') {
    offerPremium();
    return;
  }
  open();
}

// A sport's colour. With a calendar for each sport it is that calendar's,
// painted now where the calendar exists (the pass paints it too, until it
// sticks); with one calendar, the next pass paints the sport's events.
export function pickSportColour(group: string, hex: string | undefined): 'offered' | 'saved' {
  if (colourPickStep(premiumLocked()) === 'offer') {
    offerPremium();
    return 'offered';
  }
  const prefs = loadPrefs();
  const { [group]: _was, ...others } = prefs.sportColours;
  const sportColours = hex ? { ...others, [group]: hex } : others;
  savePrefs({ ...prefs, sportColours });
  const calendarId = sportCalendarIds()[group];
  if (layoutOf(prefs) === 'per-sport' && calendarId) {
    void paintSportCalendar(calendarId, sportCalendarColourFor(group, sportColours));
  }
  void runSync();
  return 'saved';
}

// A follow's colour: the next pass paints the events it brings in.
export function pickFollowColour(key: string, hex: string | undefined): 'offered' | 'saved' {
  if (colourPickStep(premiumLocked()) === 'offer') {
    offerPremium();
    return 'offered';
  }
  setFollowColour(key, hex);
  void runSync();
  return 'saved';
}
