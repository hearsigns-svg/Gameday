// Which sport calendar a fixture lands in (owner brief 2026-09-24).
import { SPORTS } from '../sportsConfig';
import {
  calendarGroupOf,
  SPORT_CALENDAR_COLOURS,
  sportCalendarColour,
  FALLBACK_SPORT_CALENDAR_COLOUR,
} from '../sportCalendarGroup';

const fx = (sport: string, followKeys: string[] = [], competitionId?: string) => ({
  sport,
  followKeys,
  ...(competitionId ? { competitionId } : {}),
});

test('Formula 1 and every other motorsport series share ONE Motorsport calendar', () => {
  expect(calendarGroupOf(fx('f1', ['f1-series-1'], 'f1-series-1'))).toBe('motorsport');
  expect(calendarGroupOf(fx('motorsport', ['tsdb-league-4407']))).toBe('motorsport');
});

test('an Olympic event goes in the Olympics calendar, whatever its discipline', () => {
  expect(calendarGroupOf(fx('athletics', ['olympics-2028-athletics']))).toBe('olympics');
  expect(calendarGroupOf(fx('basketball', ['olympics-2028']))).toBe('olympics');
  expect(calendarGroupOf(fx('olympics', []))).toBe('olympics');
  expect(calendarGroupOf(fx('soccer', [], 'olympics-2028-football'))).toBe('olympics');
  // …and a non-Olympic event of the same sport does not.
  expect(calendarGroupOf(fx('athletics', ['wa-calendar']))).toBe('athletics');
});

test('every other sport is its own tile', () => {
  for (const s of SPORTS.filter((x) => !x.hiddenTile && x.key !== 'olympics')) {
    expect(calendarGroupOf(fx(s.key, ['k']))).toBe(s.key);
  }
});

test('the fixture decides, not the follow: one event, one calendar', () => {
  // A Liverpool UCL game is soccer whether Liverpool or the UCL wanted it.
  const game = fx('soccer', ['fdorg-team-64', 'fdorg-comp-CL']);
  expect(calendarGroupOf(game)).toBe('soccer');
});

test('an unknown sport keeps its own key rather than vanishing', () => {
  expect(calendarGroupOf(fx('curling', ['x']))).toBe('curling');
});

test('every group has a colour, and no two are the same', () => {
  const groups = [...new Set(SPORTS.map((s) => calendarGroupOf(fx(s.key, ['k']))))];
  for (const g of groups) expect(SPORT_CALENDAR_COLOURS[g]).toBeDefined();
  const colours = Object.values(SPORT_CALENDAR_COLOURS).map((c) => c.toLowerCase());
  expect(new Set(colours).size).toBe(colours.length);
  expect(sportCalendarColour('curling')).toBe(FALLBACK_SPORT_CALENDAR_COLOUR);
});
