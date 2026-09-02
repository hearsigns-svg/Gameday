// Pure plan. Every instant is an ISO UTC string or Date.UTC(...) — the
// suite must pass identically under TZ=UTC and TZ=America/Los_Angeles.

import {
  desiredNotifications,
  DesiredNotification,
  diffNotifications,
  fixtureIdOfIdentifier,
  isNotifiable,
  isOurIdentifier,
  NOTIFICATION_ID_PREFIX,
  notificationIdentifier,
  PENDING_CAP,
  ReminderFixture,
  RESCHEDULE_TOLERANCE_MS,
  ScheduledNotification,
} from '../reminderPlan';

const NOW = Date.UTC(2026, 8, 2, 12, 0, 0); // 2026-09-02T12:00Z
const MIN = 60_000;
const HOUR = 60 * MIN;

function fixture(overrides: Partial<ReminderFixture> = {}): ReminderFixture {
  return {
    id: 'apisports-1',
    title: 'Liverpool v Everton',
    startUtc: '2026-09-10T19:00:00.000Z',
    status: 'scheduled',
    ...overrides,
  };
}

const body = (f: ReminderFixture, m: number) => `${f.title} in ${m} min`;

function desired(
  fixtures: readonly ReminderFixture[],
  opts: Partial<Parameters<typeof desiredNotifications>[1]> = {},
): DesiredNotification[] {
  return desiredNotifications(fixtures, {
    nowMs: NOW,
    minutesBefore: 60,
    body,
    ...opts,
  });
}

describe('identifiers', () => {
  test('prefix round-trips through identifier helpers', () => {
    const id = notificationIdentifier('apisports-77');
    expect(id).toBe(`${NOTIFICATION_ID_PREFIX}apisports-77`);
    expect(isOurIdentifier(id)).toBe(true);
    expect(fixtureIdOfIdentifier(id)).toBe('apisports-77');
  });

  test('foreign identifiers are not ours, even near-misses', () => {
    for (const foreign of ['fixtures:abc', 'Fixture:abc', 'abc:fixture:', 'apisports-1', '']) {
      expect(isOurIdentifier(foreign)).toBe(false);
      expect(fixtureIdOfIdentifier(foreign)).toBeNull();
    }
  });
});

describe('isNotifiable', () => {
  test('scheduled with a real time is notifiable; precision absent counts as real', () => {
    expect(isNotifiable(fixture())).toBe(true);
    expect(isNotifiable(fixture({ timePrecision: 'exact' }))).toBe(true);
    expect(isNotifiable(fixture({ timePrecision: 'nominal' }))).toBe(true);
    expect(isNotifiable(fixture({ status: 'tbd', timePrecision: 'exact' }))).toBe(true);
  });

  test('cancelled and postponed are not', () => {
    expect(isNotifiable(fixture({ status: 'cancelled' }))).toBe(false);
    expect(isNotifiable(fixture({ status: 'postponed' }))).toBe(false);
  });

  test('ATTACK: a date_only sentinel under a healthy status must not slip through', () => {
    expect(isNotifiable(fixture({ status: 'scheduled', timePrecision: 'date_only' }))).toBe(false);
  });
});

describe('desiredNotifications', () => {
  test('fire time is start minus minutesBefore, in UTC milliseconds', () => {
    const [d] = desired([fixture()]);
    expect(d).toEqual({
      identifier: 'fixture:apisports-1',
      fixtureId: 'apisports-1',
      fireAtMs: Date.UTC(2026, 8, 10, 19) - HOUR,
      title: 'Liverpool v Everton',
      body: 'Liverpool v Everton in 60 min',
    });
  });

  test('body receives the fixture and minutesBefore; title override wins over f.title', () => {
    const [d] = desired([fixture()], {
      minutesBefore: 15,
      title: (f) => `Kick-off soon: ${f.id}`,
    });
    expect(d.fireAtMs).toBe(Date.UTC(2026, 8, 10, 19) - 15 * MIN);
    expect(d.body).toBe('Liverpool v Everton in 15 min');
    expect(d.title).toBe('Kick-off soon: apisports-1');
  });

  test('skips excluded ids', () => {
    const out = desired([fixture({ id: 'a' }), fixture({ id: 'b' })], {
      excluded: new Set(['a']),
    });
    expect(out.map((d) => d.fixtureId)).toEqual(['b']);
  });

  test('skips cancelled, postponed and date_only fixtures', () => {
    const out = desired([
      fixture({ id: 'c', status: 'cancelled' }),
      fixture({ id: 'p', status: 'postponed' }),
      fixture({ id: 'd', timePrecision: 'date_only' }),
      fixture({ id: 'ok' }),
    ]);
    expect(out.map((d) => d.fixtureId)).toEqual(['ok']);
  });

  test('skips anything that would already have fired: fireAt <= now is out, now + 1ms is in', () => {
    const startAtBoundary = new Date(NOW + HOUR).toISOString(); // fireAt === NOW
    const startJustAfter = new Date(NOW + HOUR + 1).toISOString(); // fireAt === NOW + 1
    const startLongAgo = '2026-01-01T12:00:00.000Z';
    const out = desired([
      fixture({ id: 'boundary', startUtc: startAtBoundary }),
      fixture({ id: 'just-after', startUtc: startJustAfter }),
      fixture({ id: 'past', startUtc: startLongAgo }),
    ]);
    expect(out.map((d) => d.fixtureId)).toEqual(['just-after']);
    expect(out[0].fireAtMs).toBe(NOW + 1);
  });

  test('skips an unparseable start rather than scheduling NaN', () => {
    const out = desired([fixture({ id: 'bad', startUtc: 'not a date' }), fixture({ id: 'ok' })]);
    expect(out.map((d) => d.fixtureId)).toEqual(['ok']);
  });

  test('sorted by fire time ascending regardless of input order', () => {
    const out = desired([
      fixture({ id: 'late', startUtc: '2026-09-12T19:00:00.000Z' }),
      fixture({ id: 'early', startUtc: '2026-09-03T19:00:00.000Z' }),
      fixture({ id: 'mid', startUtc: '2026-09-08T19:00:00.000Z' }),
    ]);
    expect(out.map((d) => d.fixtureId)).toEqual(['early', 'mid', 'late']);
  });

  test('ties on fire time break by id, so the order is deterministic', () => {
    const out = desired([fixture({ id: 'b' }), fixture({ id: 'a' }), fixture({ id: 'c' })]);
    expect(out.map((d) => d.fixtureId)).toEqual(['a', 'b', 'c']);
  });

  test('cap keeps the SOONEST, not the first listed', () => {
    const out = desired(
      [
        fixture({ id: 'late', startUtc: '2026-09-12T19:00:00.000Z' }),
        fixture({ id: 'early', startUtc: '2026-09-03T19:00:00.000Z' }),
        fixture({ id: 'mid', startUtc: '2026-09-08T19:00:00.000Z' }),
      ],
      { cap: 2 },
    );
    expect(out.map((d) => d.fixtureId)).toEqual(['early', 'mid']);
  });

  test('default cap is PENDING_CAP and it is under the iOS 64 ceiling', () => {
    expect(PENDING_CAP).toBeLessThan(64);
    // 80 fixtures, one per hour from 2026-09-03T00:00Z, listed latest-first.
    const many = Array.from({ length: 80 }, (_, i) =>
      fixture({
        id: `f${String(79 - i).padStart(2, '0')}`,
        startUtc: new Date(Date.UTC(2026, 8, 3) + (79 - i) * HOUR).toISOString(),
      }),
    );
    const out = desired(many);
    expect(out).toHaveLength(PENDING_CAP);
    expect(out[0].fixtureId).toBe('f00');
    expect(out[out.length - 1].fixtureId).toBe(`f${String(PENDING_CAP - 1).padStart(2, '0')}`);
  });

  test('cap of 0 yields nothing', () => {
    expect(desired([fixture()], { cap: 0 })).toEqual([]);
  });

  test('deduplicates by fixture id — the first record wins', () => {
    const out = desired([
      fixture({ id: 'dup', title: 'First' }),
      fixture({ id: 'dup', title: 'Second' }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].title).toBe('First');
  });
});

describe('diffNotifications', () => {
  const want = (id: string, fireAtMs: number): DesiredNotification => ({
    identifier: notificationIdentifier(id),
    fixtureId: id,
    fireAtMs,
    title: id,
    body: `${id} soon`,
  });
  const have = (identifier: string, fireAtMs: number | null): ScheduledNotification => ({
    identifier,
    fireAtMs,
  });
  const T = NOW + 24 * HOUR;

  // What the OS's pending set looks like after a diff is applied.
  function apply(
    scheduled: readonly ScheduledNotification[],
    diff: ReturnType<typeof diffNotifications>,
  ): ScheduledNotification[] {
    const cancelled = new Set(diff.toCancel);
    return [
      ...scheduled.filter((s) => !cancelled.has(s.identifier)),
      ...diff.toSchedule.map((d) => have(d.identifier, d.fireAtMs)),
    ];
  }

  test('nothing pending: schedule everything, cancel nothing', () => {
    const d = [want('a', T), want('b', T + HOUR)];
    expect(diffNotifications(d, [])).toEqual({ toCancel: [], toSchedule: d });
  });

  test('pending matches desired exactly: empty diff', () => {
    const d = [want('a', T)];
    expect(diffNotifications(d, [have('fixture:a', T)])).toEqual({ toCancel: [], toSchedule: [] });
  });

  test('drift under the tolerance is left alone; at the tolerance it is rescheduled', () => {
    const d = [want('a', T)];
    const under = diffNotifications(d, [have('fixture:a', T + RESCHEDULE_TOLERANCE_MS - 1)]);
    expect(under).toEqual({ toCancel: [], toSchedule: [] });
    const underNeg = diffNotifications(d, [have('fixture:a', T - RESCHEDULE_TOLERANCE_MS + 1)]);
    expect(underNeg).toEqual({ toCancel: [], toSchedule: [] });
    const at = diffNotifications(d, [have('fixture:a', T + RESCHEDULE_TOLERANCE_MS)]);
    expect(at).toEqual({ toCancel: ['fixture:a'], toSchedule: d });
  });

  test('an unreadable fire time is rescheduled', () => {
    const d = [want('a', T)];
    expect(diffNotifications(d, [have('fixture:a', null)])).toEqual({
      toCancel: ['fixture:a'],
      toSchedule: d,
    });
  });

  test('pending but no longer desired is cancelled', () => {
    expect(diffNotifications([], [have('fixture:gone', T)])).toEqual({
      toCancel: ['fixture:gone'],
      toSchedule: [],
    });
  });

  test('ATTACK: foreign pending notifications are never cancelled, whatever they are called', () => {
    const foreign = [
      have('fixtures:abc', T),
      have('Fixture:abc', null),
      have('abc:fixture:', T),
      have('some-other-feature', null),
      have('', T),
    ];
    expect(diffNotifications([], foreign)).toEqual({ toCancel: [], toSchedule: [] });
    // And with desired present alongside — still untouched.
    const d = [want('a', T)];
    expect(diffNotifications(d, foreign)).toEqual({ toCancel: [], toSchedule: d });
  });

  test('toSchedule is sorted by fire time even when reschedules and additions mix', () => {
    const d = [want('late', T + 2 * HOUR), want('mid', T + HOUR), want('early', T)];
    const diff = diffNotifications(d, [have('fixture:late', null)]);
    expect(diff.toSchedule.map((x) => x.fixtureId)).toEqual(['early', 'mid', 'late']);
  });

  test('a duplicated pending identifier is cancelled once', () => {
    const diff = diffNotifications([], [have('fixture:a', T), have('fixture:a', T)]);
    expect(diff.toCancel).toEqual(['fixture:a']);
  });

  test('idempotent: applying the diff and diffing again yields nothing', () => {
    const d = [want('a', T), want('b', T + HOUR), want('c', T + 2 * HOUR)];
    const pending = [
      have('fixture:a', T + 5 * MIN), // drifted → reschedule
      have('fixture:b', T + HOUR), // fine
      have('fixture:stale', T), // gone → cancel
      have('foreign', T), // not ours
      // c is missing → schedule
    ];
    const first = diffNotifications(d, pending);
    expect(first.toCancel.sort()).toEqual(['fixture:a', 'fixture:stale']);
    expect(first.toSchedule.map((x) => x.fixtureId)).toEqual(['a', 'c']);

    const after = apply(pending, first);
    expect(after.map((s) => s.identifier).sort()).toEqual(
      ['fixture:a', 'fixture:b', 'fixture:c', 'foreign'].sort(),
    );
    expect(diffNotifications(d, after)).toEqual({ toCancel: [], toSchedule: [] });
  });

  test('idempotency holds across a spread of pending states', () => {
    // Deterministic pseudo-random walk over (present/absent/drifted/null)
    // for a dozen desired notifications; the property must hold for all.
    let seed = 7;
    const rnd = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    for (let round = 0; round < 25; round++) {
      const d = Array.from({ length: 12 }, (_, i) => want(`f${i}`, T + i * HOUR));
      const pending: ScheduledNotification[] = [];
      for (const x of d) {
        const r = rnd();
        if (r < 0.25) continue; // absent
        if (r < 0.5) pending.push(have(x.identifier, x.fireAtMs)); // exact
        else if (r < 0.75) pending.push(have(x.identifier, x.fireAtMs + Math.round((rnd() - 0.5) * 6 * HOUR)));
        else pending.push(have(x.identifier, null));
      }
      pending.push(have('fixture:orphan', T), have('foreign-thing', null));
      const once = diffNotifications(d, pending);
      const after = apply(pending, once);
      expect(diffNotifications(d, after)).toEqual({ toCancel: [], toSchedule: [] });
      expect(after.some((s) => s.identifier === 'foreign-thing')).toBe(true);
      expect(after.some((s) => s.identifier === 'fixture:orphan')).toBe(false);
    }
  });
});
