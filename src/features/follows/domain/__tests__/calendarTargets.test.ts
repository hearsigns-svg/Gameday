// The hero glyph's target (owner brief 2026-09-23): the entity the card
// wears, the most specific match without one, every followed draw of a
// joint tennis card, nothing for a card no follow claims.

import type { Followable } from '../../data/followStore';
import { calendarTargetsFor, targetsCalendarState } from '../calendarTargets';

const f = (key: string, extra: Partial<Followable> = {}): Followable => ({
  key,
  label: key,
  sportKey: 'basketball',
  type: 'team',
  ...extra,
});

const NBA = f('tsdb-league-4387', { type: 'competition', crestUrl: 'https://x/nba.png' });
const WARRIORS = f('tsdb-team-134865', { crestUrl: 'https://x/gsw.png' });
const LAKERS = f('tsdb-team-134867', { crestUrl: 'https://x/lal.png' });

test('the card\'s identity owner — a team outranks its league, as on the card itself', () => {
  expect(
    calendarTargetsFor(['tsdb-league-4387', 'tsdb-team-134865', 'tsdb-team-134860'], [NBA, WARRIORS]).map((t) => t.key),
  ).toEqual(['tsdb-team-134865']);
  // Two followed teams: follow order breaks the tie, the identity rule's own.
  expect(
    calendarTargetsFor(['tsdb-league-4387', 'tsdb-team-134865', 'tsdb-team-134867'], [LAKERS, WARRIORS]).map((t) => t.key),
  ).toEqual(['tsdb-team-134867']);
});

test('no identity-bearing follow → the most specific match', () => {
  const plainLeague = f('tsdb-league-4387', { type: 'competition' });
  const plainAthlete = f('athlete_000001', { type: 'athlete', sportKey: 'tennis' });
  expect(
    calendarTargetsFor(['tsdb-league-4387', 'athlete_000001'], [plainLeague, plainAthlete]).map((t) => t.key),
  ).toEqual(['athlete_000001']);
});

test('a joint tennis card acts on every followed draw; ✓ only when all are in', () => {
  const men = f('tennis-t-us-open-m', { type: 'competition', sportKey: 'tennis', calendar: 'in' });
  const women = f('tennis-t-us-open-w', { type: 'competition', sportKey: 'tennis', calendar: 'out' });
  const card = ['tennis-wta', 'tennis-t-us-open', 'tennis-t-us-open-w', 'tennis-atp', 'tennis-t-us-open-m'];
  const targets = calendarTargetsFor(card, [men, women], () => true);
  expect(targets.map((t) => t.key).sort()).toEqual(['tennis-t-us-open-m', 'tennis-t-us-open-w']);
  expect(targetsCalendarState(targets)).toBe('out');
  expect(targetsCalendarState([{ calendar: 'in' }, {}])).toBe('in'); // absent reads as in
});

test('a card no follow claims has no target — no glyph', () => {
  expect(calendarTargetsFor(['fdorg-comp-PL', 'fdorg-team-64'], [NBA, WARRIORS])).toEqual([]);
  expect(targetsCalendarState([])).toBe('out');
});

test('a follow is found under its QUERY keys (a final-round golf follow)', () => {
  const golf = f('tsdb-league-4425', { type: 'competition', sportKey: 'golf', scope: 'final-round' });
  expect(calendarTargetsFor(['tsdb-league-4425', 'tsdb-league-4425-final'], [golf]).map((t) => t.key)).toEqual([
    'tsdb-league-4425',
  ]);
  // The same league's other rounds are not this follow's to toggle.
  expect(calendarTargetsFor(['tsdb-league-4425'], [golf])).toEqual([]);
});
