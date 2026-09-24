// Which sport calendar a fixture belongs to — PURE (owner brief
// 2026-09-24, "a separate calendar for each sport").
//
// The sport is the one the Following row's subtitle names: the fixture's
// own sport, folded onto the tile that hosts it — Formula 1 has no tile
// of its own and lives under Motorsport (the single-tile ruling), so F1
// and every other motorsport series share ONE calendar. Olympic events
// go in their own Olympics calendar, whatever discipline they are. The
// fixture decides, never the follow that wanted it: one event, one
// calendar, however many follows ask for it.

import { SPORTS, SportConfig } from './sportsConfig';

const OLYMPIC_KEY = /^olympics-\d{4}(?:-|$)/;

export interface GroupableFixture {
  sport: string;
  followKeys: readonly string[];
  competitionId?: string;
}

export function isOlympicFixture(f: GroupableFixture): boolean {
  return (
    f.sport === 'olympics' ||
    OLYMPIC_KEY.test(f.competitionId ?? '') ||
    f.followKeys.some((k) => OLYMPIC_KEY.test(k))
  );
}

export function calendarGroupOf(
  f: GroupableFixture,
  sports: readonly SportConfig[] = SPORTS,
): string {
  if (isOlympicFixture(f)) return 'olympics';
  const own = sports.find((s) => s.key === f.sport);
  if (own && !own.hiddenTile) return own.key;
  // A tile-less sport lives where a static row follows AS it (F1 under
  // Motorsport).
  const host = sports.find(
    (s) =>
      !s.hiddenTile &&
      (s.staticCompetitions ?? []).some((c) => c.followAs?.sportKey === f.sport),
  );
  return host ? host.key : f.sport;
}

// The colour a sport calendar is CREATED with — distinct per sport, so the
// calendars read apart in a calendar app's list. Chosen for separation,
// not taken from the sport accents (several of those are near neighbours:
// three blues, two violets, two greens). Set once at creation and never
// repainted: the user owns it from then on in their calendar app.
export const SPORT_CALENDAR_COLOURS: Readonly<Record<string, string>> = {
  soccer: '#16A34A', // green
  basketball: '#EA580C', // orange
  tennis: '#CA8A04', // mustard
  motorsport: '#DC2626', // red
  nfl: '#92400E', // brown
  baseball: '#1D4ED8', // royal blue
  'ice-hockey': '#0891B2', // cyan
  cricket: '#0F766E', // teal
  rugby: '#4338CA', // indigo
  golf: '#65A30D', // lime
  boxing: '#DB2777', // pink
  ufc: '#7E22CE', // purple
  athletics: '#475569', // slate
  olympics: '#C026D3', // magenta
};

export const FALLBACK_SPORT_CALENDAR_COLOUR = '#6B7280';

export function sportCalendarColour(group: string): string {
  return SPORT_CALENDAR_COLOURS[group] ?? FALLBACK_SPORT_CALENDAR_COLOUR;
}
