// The motorsport session ladder (owner brief "Per-follow calendar control
// and motorsport sessions", Stage 5) — the rule, and the rule as the
// planner runs it over a real sprint weekend.
import { Fixture } from '../../../fixtures/domain/fixture';
import { CalendarPrefs, DEFAULT_PREFS } from '../prefs';
import {
  DEFAULT_SESSION_RUNG,
  ladderKeeps,
  migratedRung,
  rungAdmits,
  SessionRung,
  sessionTypeOf,
} from '../sessionLadder';
import { horizonStartFrom, planSync, PREFERENCE_DELETE_CAP } from '../syncPlan';

const NOW = Date.parse('2026-10-01T12:00:00.000Z');
const HORIZON = horizonStartFrom(NOW);
const F1 = 'f1-series-1';

// Marina Bay 2026, a sprint weekend: every session the provider names.
const SLUGS = ['fp1', 'sprintquali', 'sprint', 'quali', 'race'] as const;
const session = (slug: string, i: number, extra: Partial<Fixture> = {}): Fixture => ({
  id: `f1-2026-marina_bay-${slug}`,
  sport: 'f1',
  competition: 'Formula 1',
  competitionId: F1,
  title: `Singapore Grand Prix — ${slug}`,
  followKeys: [F1, 'athlete_000224'],
  startUtc: new Date(Date.parse('2026-10-09T09:00:00.000Z') + i * 6 * 3_600_000).toISOString(),
  status: 'scheduled',
  timePrecision: 'exact',
  sessionKind: slug === 'race' ? 'race' : 'support',
  updatedAt: '2026-09-01T00:00:00.000Z',
  ...extra,
});
const weekend = SLUGS.map((s, i) => session(s, i));
const prefsWith = (rung?: SessionRung): CalendarPrefs => ({
  ...DEFAULT_PREFS,
  seriesSessions: 'all',
  sessionRungs: rung ? { [F1]: rung } : {},
});
const created = (prefs: CalendarPrefs, fixtures = weekend, pinned = new Set<string>()) =>
  planSync(fixtures, {}, [F1], prefs, HORIZON, new Set(), pinned, NOW)
    .filter((o) => o.op === 'create')
    .map((o) => (o.op === 'create' ? o.fixture.id.split('-').pop() : ''))
    .sort();

describe('the rung decides which sessions go in', () => {
  test('the ladder table: sprint = race, shootout = qualifying, practice only under All', () => {
    expect(rungAdmits('race', 'race')).toBe(true);
    expect(rungAdmits('race', 'sprint')).toBe(true);
    expect(rungAdmits('race', 'qualifying')).toBe(false);
    expect(rungAdmits('race', 'sprint-qualifying')).toBe(false);
    expect(rungAdmits('race', 'practice')).toBe(false);
    expect(rungAdmits('qualifying', 'qualifying')).toBe(true);
    expect(rungAdmits('qualifying', 'sprint-qualifying')).toBe(true);
    expect(rungAdmits('qualifying', 'practice')).toBe(false);
    expect(rungAdmits('all', 'practice')).toBe(true);
  });

  test('Race only on a sprint weekend: the sprint plus the Grand Prix', () => {
    expect(created(prefsWith('race'))).toEqual(['race', 'sprint']);
  });

  test('Qualifying & race adds both qualifying sessions', () => {
    expect(created(prefsWith('qualifying'))).toEqual(['quali', 'race', 'sprint', 'sprintquali']);
  });

  test('All sessions is every session', () => {
    expect(created(prefsWith('all'))).toEqual(['fp1', 'quali', 'race', 'sprint', 'sprintquali']);
  });

  test('a series with no stored rung takes the default, Qualifying & race', () => {
    expect(DEFAULT_SESSION_RUNG).toBe('qualifying');
    expect(created(prefsWith())).toEqual(created(prefsWith('qualifying')));
  });

  test('the ladder beats the retired race-only preference for a laddered series', () => {
    const racesOnly = { ...prefsWith('all'), seriesSessions: 'race-only' as const };
    expect(created(racesOnly)).toEqual(['fp1', 'quali', 'race', 'sprint', 'sprintquali']);
  });

  test('a PIN beats the ladder: a pinned practice goes in under Race only', () => {
    const fp1 = weekend[0].id;
    expect(created(prefsWith('race'), weekend, new Set([fp1]))).toEqual(['fp1', 'race', 'sprint']);
  });
});

describe('session types: stamped, or read from the F1 id', () => {
  test('the stamped field wins', () => {
    expect(sessionTypeOf({ id: 'f1-2026-x-race', competitionId: F1, sessionType: 'qualifying' })).toBe(
      'qualifying',
    );
  });
  test('an unstamped F1 doc is read from its id slug', () => {
    expect(weekend.map((f) => sessionTypeOf(f))).toEqual([
      'practice',
      'sprint-qualifying',
      'sprint',
      'qualifying',
      'race',
    ]);
    expect(sessionTypeOf({ id: 'f1-2026-red_bull_ring-2-fp3', competitionId: F1 })).toBe('practice');
  });
  test('a series without session data has no ladder and keeps the pre-ladder filter', () => {
    const motogp: Fixture = {
      ...session('race', 0),
      id: 'tsdb-event-1',
      competitionId: 'tsdb-league-4407',
      followKeys: ['tsdb-league-4407'],
      sessionKind: 'support',
    };
    expect(sessionTypeOf(motogp)).toBeUndefined();
    expect(ladderKeeps(motogp, { [F1]: 'race' })).toBeUndefined();
    // race-only still drops its support session; 'all' keeps it.
    const plan = (seriesSessions: 'all' | 'race-only') =>
      planSync([motogp], {}, ['tsdb-league-4407'], { ...prefsWith('race'), seriesSessions }, HORIZON, new Set(), new Set(), NOW).length;
    expect(plan('race-only')).toBe(0);
    expect(plan('all')).toBe(1);
  });
});

describe('lowering a rung removes only future sessions, under the delete cap', () => {
  test('All → Race only deletes the practice and qualifying sessions ahead; a finished one stays', () => {
    const finished = session('fp1', 0, {
      id: 'f1-2026-marina_bay-fp2',
      startUtc: '2026-09-20T09:00:00.000Z',
    });
    const ledger = Object.fromEntries(
      [...weekend, finished].map((f) => [
        f.id,
        {
          eventId: `ev-${f.id}`,
          calendarId: 'cal',
          startUtc: f.startUtc,
          endUtc: new Date(Date.parse(f.startUtc) + 3_600_000).toISOString(),
          title: f.title,
          reminderMinutes: null,
        },
      ]),
    );
    const held: number[] = [];
    const ops = planSync([...weekend, finished], ledger, [F1], prefsWith('race'), HORIZON, new Set(), new Set(), NOW, undefined, {}, {
      onRemovalsHeldBack: (n) => held.push(n),
    });
    const deleted = ops
      .filter((o) => o.op === 'delete')
      .map((o) => (o.op === 'delete' ? o.fixtureId.split('-').pop() : ''))
      .sort();
    expect(deleted).toEqual(['fp1', 'quali', 'sprintquali']);
    expect(held).toEqual([]); // 3 < the cap
    expect(PREFERENCE_DELETE_CAP).toBe(40);
  });
});

describe('existing follows keep what they deliver (the migration rule)', () => {
  test('global Race weekends → the matching rung', () => {
    expect(migratedRung([], 'all')).toBe('all');
    expect(migratedRung([], 'race-only')).toBe('race');
  });
  test('an explicit per-follow choice beats the global one; the most permissive explicit wins', () => {
    expect(migratedRung(['all'], 'race-only')).toBe('all');
    expect(migratedRung(['race-only'], 'all')).toBe('race');
    expect(migratedRung(['race-only', 'all'], 'race-only')).toBe('all');
  });
});
