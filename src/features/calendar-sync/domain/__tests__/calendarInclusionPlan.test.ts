// Per-follow calendar control (owner brief 2026-09-23) — the rule
// wired through the tier pass, the same-event dedupe and the planner,
// the way the engine runs them. The pure rule's tables live in
// follows/domain/__tests__/calendarInclusion.test.ts; these prove the
// PLAN: "filters apply after inclusion" (the tier still shapes an `in`
// tournament), and an `out` follow's events never reach the calendar.

import { Fixture } from '../../../fixtures/domain/fixture';
import { dedupeSameEvent } from '../../../fixtures/domain/sameBout';
import {
  CalendarPref,
  inclusionPredicate,
  InclusionFollow,
} from '../../../follows/domain/calendarInclusion';
import type { FollowableType } from '../../../follows/domain/sportsConfig';
import { CalendarPrefs } from '../prefs';
import { horizonStartFrom, planSync, PREFERENCE_DELETE_CAP, SyncOp } from '../syncPlan';
import { applyTournamentTiers, CLOSE_ID_SUFFIX } from '../tournamentTiers';

const NOW = Date.parse('2026-06-20T12:00:00.000Z');
const HORIZON = horizonStartFrom(NOW);

const PREFS: CalendarPrefs = {
  reminderMinutes: null,
  extraReminders: [null, null],
  allDayReminder: null,
  eventStyle: 'timed',
  seriesSessions: 'all',
  tournamentTier: 'all',
  autoDeletePast: false,
  newFollowsInCalendar: true,
  sessionRungs: {},
  separateSportCalendars: false,
};

const follow = (
  key: string,
  type: FollowableType,
  calendar: CalendarPref,
): InclusionFollow => ({ key, type, calendar, queryKeys: [key] });

const base = {
  status: 'scheduled' as const,
  updatedAt: '2026-06-01T00:00:00.000Z',
};

// ─── Tennis: Wimbledon, the men's draw ────────────────────────────────
const ALCARAZ = 'athlete_000012';
const SINNER = 'athlete_000001';
const WIMBLEDON = 'tennis-t-wimbledon';
const WIMBLEDON_M = 'tennis-t-wimbledon-m';

const parent: Fixture = {
  ...base,
  id: 'tennis-wimbledon-2026',
  sport: 'tennis',
  competition: 'ATP Tour',
  competitionId: 'tennis-atp',
  title: 'Wimbledon',
  followKeys: ['tennis-atp', WIMBLEDON, WIMBLEDON_M],
  startUtc: '2026-06-29T00:00:00.000Z',
  timePrecision: 'date_only',
  durationHours: 14 * 24,
};

const match = (
  id: string,
  athlete: string,
  title: string,
  round: 'f' | 'sf' | 'r128',
  day: number,
): Fixture => ({
  ...base,
  id,
  sport: 'tennis',
  competition: 'Wimbledon',
  competitionId: 'tennis-atp-appearances',
  title,
  followKeys: ['tennis-atp-appearances', athlete],
  parentFixtureId: parent.id,
  startUtc: `2026-07-${String(day).padStart(2, '0')}T13:00:00.000Z`,
  timePrecision: 'exact',
  durationHours: 3,
  stage: { round },
});

const alcarazR1 = match('m-alcaraz-r1', ALCARAZ, 'Alcaraz vs X — Wimbledon', 'r128', 1);
const alcarazF = match('m-alcaraz-f', ALCARAZ, 'Alcaraz vs Sinner — Wimbledon', 'f', 12);
const sinnerR1 = match('m-sinner-r1', SINNER, 'Sinner vs Y — Wimbledon', 'r128', 1);
const sinnerSf = match('m-sinner-sf', SINNER, 'Sinner vs Z — Wimbledon', 'sf', 10);
const draw = [alcarazR1, alcarazF, sinnerR1, sinnerSf];

// The engine's pipeline, pure: fetch → dedupe → tier pass (every follow
// stamps; only `in` follows shape the parent) → dedupe → plan with the
// rule. `fetched` is what the follow keys would have returned.
function plan(
  follows: InclusionFollow[],
  fetched: Fixture[],
  children: Fixture[],
  tier: CalendarPrefs['tournamentTier'] = 'all',
): string[] {
  const keys = follows.flatMap((f) => f.queryKeys);
  const inKeys = new Set(follows.filter((f) => f.calendar === 'in').flatMap((f) => f.queryKeys));
  const wanted = inclusionPredicate(follows);
  const planFixtures = dedupeSameEvent(fetched, new Set(), new Set(keys));
  const tiered = dedupeSameEvent(
    applyTournamentTiers(
      planFixtures,
      tier,
      keys,
      { byParent: new Map([[parent.id, children]]) },
      new Map(),
      (k) => inKeys.has(k),
    ),
    new Set(),
    new Set(keys),
  );
  const ops: SyncOp[] = planSync(
    tiered,
    {},
    keys,
    { ...PREFS, tournamentTier: tier },
    HORIZON,
    new Set(),
    new Set(),
    NOW,
    undefined,
    {},
    { includes: (f) => wanted(f.followKeys) },
  );
  return ops
    .filter((o) => o.op === 'create')
    .map((o) => (o.op === 'create' ? o.fixture.id : ''))
    .sort();
}

describe('the brief\'s tennis rows, through the tier pass and the planner', () => {
  test('Alcaraz in, Wimbledon out → only Alcaraz\'s Wimbledon matches — every round, no bookends', () => {
    const created = plan(
      [follow(ALCARAZ, 'athlete', 'in'), follow(WIMBLEDON_M, 'competition', 'out')],
      // The draw follow still fetches the parent; Alcaraz's follow fetches
      // his appearances.
      [parent, alcarazR1, alcarazF],
      draw,
      'key',
    );
    expect(created).toEqual(['m-alcaraz-f', 'm-alcaraz-r1']);
  });

  test('Wimbledon in (All matches), Alcaraz out → every match but Alcaraz\'s, with the bookends', () => {
    const created = plan(
      [follow(WIMBLEDON_M, 'competition', 'in'), follow(ALCARAZ, 'athlete', 'out')],
      [parent, alcarazR1, alcarazF],
      draw,
      'all',
    );
    expect(created).toEqual(
      [parent.id, `${parent.id}${CLOSE_ID_SUFFIX}`, 'm-sinner-r1', 'm-sinner-sf'].sort(),
    );
  });

  test('Wimbledon in (Key rounds), Alcaraz out → the tier still applies after inclusion', () => {
    const created = plan(
      [follow(WIMBLEDON_M, 'competition', 'in'), follow(ALCARAZ, 'athlete', 'out')],
      [parent, alcarazR1, alcarazF],
      draw,
      'key',
    );
    expect(created).toEqual([parent.id, `${parent.id}${CLOSE_ID_SUFFIX}`, 'm-sinner-sf'].sort());
  });

  test('everything in → exactly what the tier pass delivered before the brief (no churn)', () => {
    const created = plan(
      [follow(WIMBLEDON_M, 'competition', 'in'), follow(ALCARAZ, 'athlete', 'in')],
      [parent, alcarazR1, alcarazF],
      draw,
      'key',
    );
    // Key rounds from the tournament; Alcaraz's first round through his own follow.
    expect(created).toEqual(
      [parent.id, `${parent.id}${CLOSE_ID_SUFFIX}`, 'm-alcaraz-f', 'm-alcaraz-r1', 'm-sinner-sf'].sort(),
    );
  });
});

describe('the brief\'s NBA rows, through the planner', () => {
  const NBA = 'tsdb-league-4387';
  const WARRIORS = 'tsdb-team-134865';
  const LAKERS = 'tsdb-team-134867';
  const CELTICS = 'tsdb-team-134860';
  const game = (id: string, home: string, away: string): Fixture => ({
    ...base,
    id,
    sport: 'basketball',
    competition: 'NBA',
    competitionId: NBA,
    title: id,
    followKeys: [NBA, home, away],
    startUtc: '2026-07-02T02:00:00.000Z',
    timePrecision: 'exact',
  });
  const games = [game('gsw-lal', WARRIORS, LAKERS), game('bos-lal', CELTICS, LAKERS), game('bos-gsw', CELTICS, WARRIORS)];
  const created = (follows: InclusionFollow[]) => {
    const wanted = inclusionPredicate(follows);
    return planSync(games, {}, follows.flatMap((f) => f.queryKeys), PREFS, HORIZON, new Set(), new Set(), NOW, undefined, {}, {
      includes: (f) => wanted(f.followKeys),
    })
      .filter((o) => o.op === 'create')
      .map((o) => (o.op === 'create' ? o.fixture.id : ''))
      .sort();
  };

  test('NBA in, Warriors out', () => {
    expect(created([follow(NBA, 'competition', 'in'), follow(WARRIORS, 'team', 'out')])).toEqual(['bos-lal']);
  });
  test('NBA out, Warriors in', () => {
    expect(created([follow(NBA, 'competition', 'out'), follow(WARRIORS, 'team', 'in')])).toEqual(['bos-gsw', 'gsw-lal']);
  });
  test('Warriors out, Lakers in', () => {
    expect(created([follow(WARRIORS, 'team', 'out'), follow(LAKERS, 'team', 'in')])).toEqual(['bos-lal', 'gsw-lal']);
  });
});

describe('removal: turning a follow out drains only its future events', () => {
  test('ledgered Warriors games not claimed by an in follow are deleted; past and still-claimed events stay', () => {
    const NBA = 'tsdb-league-4387';
    const WARRIORS = 'tsdb-team-134865';
    const LAKERS = 'tsdb-team-134867';
    const future: Fixture = {
      ...base,
      id: 'gsw-future',
      sport: 'basketball',
      competition: 'NBA',
      competitionId: NBA,
      title: 'future',
      followKeys: [NBA, WARRIORS, 'tsdb-team-1'],
      startUtc: '2026-07-02T02:00:00.000Z',
      timePrecision: 'exact',
    };
    const withLakers: Fixture = { ...future, id: 'gsw-lal', followKeys: [NBA, WARRIORS, LAKERS] };
    const entry = (startUtc: string) => ({
      eventId: `ev-${startUtc}`,
      calendarId: 'cal',
      startUtc,
      endUtc: new Date(Date.parse(startUtc) + 2 * 3_600_000).toISOString(),
      title: 'x',
      reminderMinutes: null,
    });
    const ledger = {
      'gsw-future': entry(future.startUtc),
      'gsw-lal': { ...entry(withLakers.startUtc), title: withLakers.title },
      // Finished weeks ago: the horizon rule keeps it whatever happens.
      'gsw-past': entry('2026-05-01T02:00:00.000Z'),
    };
    const follows = [follow(WARRIORS, 'team', 'out'), follow(LAKERS, 'team', 'in')];
    const wanted = inclusionPredicate(follows);
    const ops = planSync([future, withLakers], ledger, [WARRIORS, LAKERS], PREFS, HORIZON, new Set(), new Set(), NOW, undefined, {}, {
      includes: (f) => wanted(f.followKeys),
    });
    const deleted = ops.filter((o) => o.op === 'delete').map((o) => (o.op === 'delete' ? o.fixtureId : ''));
    expect(deleted).toEqual(['gsw-future']);
  });
});

describe('removal by preference runs under the delete cap', () => {
  const NBA = 'tsdb-league-4387';
  const game = (i: number): Fixture => ({
    ...base,
    id: `nba-${i}`,
    sport: 'basketball',
    competition: 'NBA',
    competitionId: NBA,
    title: `game ${i}`,
    followKeys: [NBA],
    startUtc: new Date(Date.parse('2026-07-01T00:00:00.000Z') + i * 3_600_000).toISOString(),
    timePrecision: 'exact',
  });
  const games = Array.from({ length: 100 }, (_, i) => game(i));
  const ledger = Object.fromEntries(
    games.map((g) => [
      g.id,
      {
        eventId: `ev-${g.id}`,
        calendarId: 'cal',
        startUtc: g.startUtc,
        endUtc: new Date(Date.parse(g.startUtc) + 2 * 3_600_000).toISOString(),
        title: g.title,
        reminderMinutes: null,
      },
    ]),
  );
  const deletes = (fixtures: Fixture[], follows: InclusionFollow[], heard: number[]) => {
    const wanted = inclusionPredicate(follows);
    return planSync(fixtures, ledger, [NBA], PREFS, HORIZON, new Set(), new Set(), NOW, undefined, {}, {
      includes: (f) => wanted(f.followKeys),
      onRemovalsHeldBack: (n) => heard.push(n),
    }).filter((o) => o.op === 'delete').length;
  };

  test('NBA taken out: 40 removals this pass, the other 60 held back for the next', () => {
    const heard: number[] = [];
    expect(PREFERENCE_DELETE_CAP).toBe(40);
    expect(deletes(games, [follow(NBA, 'competition', 'out')], heard)).toBe(40);
    expect(heard).toEqual([60]);
  });

  test('the pass after drains the next 40 — the count only falls', () => {
    const heard: number[] = [];
    const remaining = Object.fromEntries(Object.entries(ledger).slice(40));
    const wanted = inclusionPredicate([follow(NBA, 'competition', 'out')]);
    const ops = planSync(games, remaining, [NBA], PREFS, HORIZON, new Set(), new Set(), NOW, undefined, {}, {
      includes: (f) => wanted(f.followKeys),
      onRemovalsHeldBack: (n) => heard.push(n),
    });
    expect(ops.filter((o) => o.op === 'delete')).toHaveLength(40);
    expect(heard).toEqual([20]);
  });

  test('an UNFOLLOW (fixtures gone from the fetch) keeps its uncapped path', () => {
    const heard: number[] = [];
    expect(deletes([], [], heard)).toBe(100);
    expect(heard).toEqual([]);
  });

  test('nothing held back → the engine is not told anything', () => {
    const heard: number[] = [];
    expect(deletes(games, [follow(NBA, 'competition', 'in')], heard)).toBe(0);
    expect(heard).toEqual([]);
  });
});

describe('the same-event dedupe keeps every key that wants the event', () => {
  test('a joint tennis card: men\'s draw in, women\'s draw out → one card, in the calendar', () => {
    const wta: Fixture = {
      ...base,
      id: 'wta-905-2026',
      sport: 'tennis',
      competition: 'WTA Tour',
      competitionId: 'tennis-wta',
      title: 'US Open',
      followKeys: ['tennis-wta', 'tennis-t-us-open', 'tennis-t-us-open-w'],
      startUtc: '2026-08-30T00:00:00.000Z',
      timePrecision: 'date_only',
      durationHours: 15 * 24,
    };
    const atp: Fixture = {
      ...wta,
      id: 'tennis-uso2026',
      competition: 'ATP Tour',
      competitionId: 'tennis-atp',
      followKeys: ['tennis-atp', 'tennis-t-us-open', 'tennis-t-us-open-m'],
    };
    const kept = dedupeSameEvent([wta, atp], new Set(), new Set(['tennis-t-us-open-m', 'tennis-t-us-open-w']));
    expect(kept).toHaveLength(1);
    expect(kept[0].id).toBe('wta-905-2026'); // the joint survivor rule is unchanged
    expect(kept[0].followKeys).toEqual([
      'tennis-wta',
      'tennis-t-us-open',
      'tennis-t-us-open-w',
      'tennis-atp',
      'tennis-t-us-open-m',
    ]);
    const wanted = inclusionPredicate([
      follow('tennis-t-us-open-m', 'competition', 'in'),
      follow('tennis-t-us-open-w', 'competition', 'out'),
    ]);
    expect(wanted(kept[0].followKeys)).toBe(true);
  });

  test('a survivor that absorbed nothing is the same object', () => {
    const solo: Fixture = {
      ...base,
      id: 'solo',
      sport: 'soccer',
      competition: 'PL',
      competitionId: 'fdorg-comp-PL',
      title: 'A v B',
      followKeys: ['fdorg-comp-PL'],
      startUtc: '2026-07-01T14:00:00.000Z',
    };
    expect(dedupeSameEvent([solo])[0]).toBe(solo);
  });
});
