// Per-follow calendar control (owner brief 2026-09-23) — the inclusion
// rule and the starting state of a new follow. Every row of both of the
// brief's tables is pinned here by name.

import {
  CalendarPref,
  InclusionFollow,
  inclusionPredicate,
  specificityOf,
  startingCalendarPref,
  structuralParentKey,
} from '../calendarInclusion';
import type { FollowableType } from '../sportsConfig';

const f = (
  key: string,
  type: FollowableType,
  calendar: CalendarPref,
  queryKeys: string[] = [key],
): InclusionFollow => ({ key, type, calendar, queryKeys });

// Keys as the stored fixtures carry them.
const NBA = 'tsdb-league-4387';
const WARRIORS = 'tsdb-team-134865';
const LAKERS = 'tsdb-team-134867';
const CELTICS = 'tsdb-team-134860';
const ALCARAZ = 'athlete_000012';
const SINNER = 'athlete_000001';
const WIMBLEDON = 'tennis-t-wimbledon';
const WIMBLEDON_M = 'tennis-t-wimbledon-m';

const warriorsAtLakers = [NBA, WARRIORS, LAKERS];
const celticsAtLakers = [NBA, CELTICS, LAKERS];
const celticsAtWarriors = [NBA, CELTICS, WARRIORS];
// A Wimbledon match copy as the tier pass hands it to the planner: the
// players' keys plus the draw key it rides.
const alcarazMatch = ['tennis-atp-appearances', ALCARAZ, WIMBLEDON_M];
const sinnerMatch = ['tennis-atp-appearances', SINNER, WIMBLEDON_M];
// The Wimbledon block itself (the men's parent).
const wimbledonBlock = ['tennis-atp', WIMBLEDON, WIMBLEDON_M];
// Alcaraz's own appearance doc, fetched through his follow.
const alcarazAppearance = ['tennis-atp-appearances', ALCARAZ];

describe('the specificity ladder', () => {
  test('participant → container → competition, with a narrower slice of a level ahead of its whole', () => {
    expect(specificityOf({ key: WARRIORS, type: 'team' })).toEqual({ level: 'participant', rank: 0 });
    expect(specificityOf({ key: ALCARAZ, type: 'athlete' })).toEqual({ level: 'participant', rank: 0 });
    expect(specificityOf({ key: 'mma-israel-adesanya', type: 'athlete' }).level).toBe('participant');
    expect(specificityOf({ key: WIMBLEDON_M, type: 'competition' })).toEqual({ level: 'container', rank: 1 });
    expect(specificityOf({ key: WIMBLEDON, type: 'competition' })).toEqual({ level: 'container', rank: 2 });
    expect(specificityOf({ key: 'olympics-2028-athletics', type: 'competition' })).toEqual({ level: 'container', rank: 1 });
    expect(specificityOf({ key: 'olympics-2028', type: 'competition' })).toEqual({ level: 'container', rank: 2 });
    expect(specificityOf({ key: 'tsdb-league-4445-m', type: 'competition' })).toEqual({ level: 'competition', rank: 3 });
    expect(specificityOf({ key: NBA, type: 'competition' })).toEqual({ level: 'competition', rank: 4 });
    expect(specificityOf({ key: 'tennis-atp', type: 'competition' })).toEqual({ level: 'competition', rank: 4 });
    expect(specificityOf({ key: 'f1-series-1', type: 'series' })).toEqual({ level: 'competition', rank: 4 });
    // The retired finals slot key names no followable tournament.
    expect(specificityOf({ key: 'tennis-t-us-open-finals', type: 'competition' }).level).toBe('competition');
  });

  test('key-grammar containment', () => {
    expect(structuralParentKey(WIMBLEDON_M)).toBe(WIMBLEDON);
    expect(structuralParentKey('olympics-2028-athletics')).toBe('olympics-2028');
    expect(structuralParentKey('tsdb-league-4445-w')).toBe('tsdb-league-4445');
    expect(structuralParentKey(WIMBLEDON)).toBeNull();
    expect(structuralParentKey(NBA)).toBeNull();
    expect(structuralParentKey(WARRIORS)).toBeNull();
  });
});

describe('the inclusion rule — the brief\'s worked cases', () => {
  test('NBA in, Warriors out → every NBA game except the Warriors\'', () => {
    const wanted = inclusionPredicate([f(NBA, 'competition', 'in'), f(WARRIORS, 'team', 'out')]);
    expect(wanted(celticsAtLakers)).toBe(true);
    expect(wanted(warriorsAtLakers)).toBe(false);
    expect(wanted(celticsAtWarriors)).toBe(false);
  });

  test('NBA out, Warriors in → only the Warriors\' games', () => {
    const wanted = inclusionPredicate([f(NBA, 'competition', 'out'), f(WARRIORS, 'team', 'in')]);
    expect(wanted(warriorsAtLakers)).toBe(true);
    expect(wanted(celticsAtWarriors)).toBe(true);
    expect(wanted(celticsAtLakers)).toBe(false);
  });

  test('Warriors out, Lakers in → Warriors @ Lakers included (among equals, any in wins)', () => {
    const wanted = inclusionPredicate([f(WARRIORS, 'team', 'out'), f(LAKERS, 'team', 'in')]);
    expect(wanted(warriorsAtLakers)).toBe(true);
    expect(wanted(celticsAtWarriors)).toBe(false);
  });

  test('Alcaraz in, Wimbledon out → only Alcaraz\'s Wimbledon matches', () => {
    const wanted = inclusionPredicate([f(ALCARAZ, 'athlete', 'in'), f(WIMBLEDON_M, 'competition', 'out')]);
    expect(wanted(alcarazMatch)).toBe(true);
    expect(wanted(alcarazAppearance)).toBe(true);
    expect(wanted(sinnerMatch)).toBe(false);
    expect(wanted(wimbledonBlock)).toBe(false);
  });

  test('Wimbledon in, Alcaraz out → Wimbledon matches except Alcaraz\'s', () => {
    const wanted = inclusionPredicate([f(WIMBLEDON_M, 'competition', 'in'), f(ALCARAZ, 'athlete', 'out')]);
    expect(wanted(sinnerMatch)).toBe(true);
    expect(wanted(wimbledonBlock)).toBe(true);
    expect(wanted(alcarazMatch)).toBe(false);
    expect(wanted(alcarazAppearance)).toBe(false);
  });
});

describe('the inclusion rule — the rest of its contract', () => {
  test('nothing matched is not included; an all-in follow set includes exactly what it matches (today\'s behaviour)', () => {
    const wanted = inclusionPredicate([f(NBA, 'competition', 'in'), f(WARRIORS, 'team', 'in')]);
    expect(wanted(['fdorg-comp-PL', 'fdorg-team-64'])).toBe(false);
    expect(wanted(celticsAtLakers)).toBe(true);
    expect(wanted(warriorsAtLakers)).toBe(true);
    expect(inclusionPredicate([])([NBA])).toBe(false);
  });

  test('a narrower draw beats its tournament and its tour, in both directions', () => {
    // Tour in, the women's US Open draw out: the draw decides.
    const outDraw = inclusionPredicate([
      f('tennis-wta', 'competition', 'in'),
      f('tennis-t-us-open-w', 'competition', 'out'),
    ]);
    expect(outDraw(['tennis-wta', 'tennis-t-us-open', 'tennis-t-us-open-w'])).toBe(false);
    expect(outDraw(['tennis-wta', 'tennis-t-cincinnati', 'tennis-t-cincinnati-w'])).toBe(true);
    // Bare tournament out, one draw in.
    const inDraw = inclusionPredicate([
      f('tennis-t-us-open', 'competition', 'out'),
      f('tennis-t-us-open-m', 'competition', 'in'),
    ]);
    expect(inDraw(['tennis-atp', 'tennis-t-us-open', 'tennis-t-us-open-m'])).toBe(true);
  });

  test('a joint card carrying both draws is in when either draw is in', () => {
    const wanted = inclusionPredicate([
      f('tennis-t-us-open-m', 'competition', 'in'),
      f('tennis-t-us-open-w', 'competition', 'out'),
    ]);
    expect(
      wanted(['tennis-wta', 'tennis-t-us-open', 'tennis-t-us-open-w', 'tennis-atp', 'tennis-t-us-open-m']),
    ).toBe(true);
  });

  test('matching uses a follow\'s QUERY keys (a final-round golf follow is found under its scoped key)', () => {
    const wanted = inclusionPredicate([
      f('tsdb-league-4425', 'competition', 'in', ['tsdb-league-4425-final']),
    ]);
    expect(wanted(['tsdb-league-4425', 'tsdb-league-4425-final'])).toBe(true);
    expect(wanted(['tsdb-league-4425'])).toBe(false);
  });

  test('a Games sport beats its edition; a sexed card stream beats its stream', () => {
    const games = inclusionPredicate([
      f('olympics-2028', 'competition', 'in'),
      f('olympics-2028-athletics', 'competition', 'out'),
    ]);
    expect(games(['olympics-2028', 'olympics-2028-athletics'])).toBe(false);
    expect(games(['olympics-2028', 'olympics-2028-swimming'])).toBe(true);
    const cards = inclusionPredicate([
      f('tsdb-league-4445', 'competition', 'out'),
      f('tsdb-league-4445-w', 'competition', 'in'),
    ]);
    expect(cards(['tsdb-league-4445', 'tsdb-league-4445-w'])).toBe(true);
    expect(cards(['tsdb-league-4445', 'tsdb-league-4445-m'])).toBe(false);
  });
});

describe('the starting state of a new follow — the brief\'s table', () => {
  const warriorsFollow = { key: WARRIORS, type: 'team' as const, queryKeys: [WARRIORS] };
  // What is in view: the snapshot of everything followed.
  const inView = [{ followKeys: warriorsAtLakers }, { followKeys: celticsAtLakers }];

  test('NBA in, setting off → the new follow starts in (already covered)', () => {
    expect(startingCalendarPref(warriorsFollow, [f(NBA, 'competition', 'in')], inView, 'out')).toBe('in');
  });

  test('NBA out, setting on → in (the setting)', () => {
    expect(startingCalendarPref(warriorsFollow, [f(NBA, 'competition', 'out')], inView, 'in')).toBe('in');
  });

  test('NBA out, setting off → out', () => {
    expect(startingCalendarPref(warriorsFollow, [f(NBA, 'competition', 'out')], inView, 'out')).toBe('out');
  });

  test('no broader follow → the setting, on or off', () => {
    expect(startingCalendarPref(warriorsFollow, [], inView, 'in')).toBe('in');
    expect(startingCalendarPref(warriorsFollow, [], inView, 'out')).toBe('out');
  });
});

describe('the starting state — how coverage is judged', () => {
  test('an EQUAL follow that is in does not count as broader', () => {
    const lakersIn = [f(LAKERS, 'team', 'in')];
    expect(
      startingCalendarPref(
        { key: WARRIORS, type: 'team', queryKeys: [WARRIORS] },
        lakersIn,
        [{ followKeys: warriorsAtLakers }],
        'out',
      ),
    ).toBe('out');
  });

  test('a broader follow that shares no fixture with the new one does not cover it', () => {
    expect(
      startingCalendarPref(
        { key: WARRIORS, type: 'team', queryKeys: [WARRIORS] },
        [f('tsdb-league-4424', 'competition', 'in')], // a different league
        [{ followKeys: warriorsAtLakers }],
        'out',
      ),
    ).toBe('out');
  });

  test('key grammar covers with nothing scheduled: a draw inside its followed tournament, a Games sport inside its edition', () => {
    expect(
      startingCalendarPref(
        { key: WIMBLEDON_M, type: 'competition', queryKeys: [WIMBLEDON_M] },
        [f(WIMBLEDON, 'competition', 'in')],
        [],
        'out',
      ),
    ).toBe('in');
    expect(
      startingCalendarPref(
        { key: 'olympics-2028-athletics', type: 'competition', queryKeys: ['olympics-2028-athletics'] },
        [f('olympics-2028', 'competition', 'in')],
        [],
        'out',
      ),
    ).toBe('in');
  });

  test('a player inside a followed tournament is covered through the tournament\'s match copies', () => {
    expect(
      startingCalendarPref(
        { key: ALCARAZ, type: 'athlete', queryKeys: [ALCARAZ] },
        [f(WIMBLEDON_M, 'competition', 'in')],
        [{ followKeys: alcarazMatch }],
        'out',
      ),
    ).toBe('in');
  });
});
