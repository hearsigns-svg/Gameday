// The past-fixture rule and its consequences for the planner.
//
// Product rule: KickOffCal only ever creates, updates or deletes calendar
// events for fixtures that have NOT YET FINISHED. Finished fixtures are
// frozen — unless the user opts into removing past events.

import { Fixture } from '../../../fixtures/domain/fixture';
import {
  fixtureEndUtc,
  isBeyondRetention,
  isEndPast,
  isPast,
  MAX_FIXTURE_DURATION_HOURS,
  PAST_GRACE_HOURS,
  PAST_RETENTION_DAYS,
  queryHorizonUtc,
} from '../../../fixtures/domain/horizon';
import { DEFAULT_PREFS } from '../prefs';
import { desiredEventFor, Ledger, planSync } from '../syncPlan';

const AT = (iso: string): number => Date.parse(iso);

const fx = (over: Partial<Fixture> = {}): Fixture => ({
  id: 'f1',
  sport: 'soccer',
  competition: 'Premier League',
  competitionId: 'fdorg-comp-PL',
  title: 'A v B',
  followKeys: ['fdorg-comp-PL'],
  startUtc: '2026-08-01T15:00:00.000Z',
  venueTz: 'UTC',
  status: 'scheduled',
  durationHours: 2,
  updatedAt: '2026-07-31T00:00:00.000Z',
  ...over,
});

describe('past means FINISHED, not started', () => {
  test('a match is still live an hour after kick-off', () => {
    // 15:00 + 2h = 17:00. Not past at 16:00 by any reading.
    expect(isPast(fx(), AT('2026-08-01T16:00:00.000Z'))).toBe(false);
  });

  test('and stays live through the grace buffer after it ends', () => {
    // Ends 17:00; grace is 6h, so it freezes at 23:00.
    expect(isPast(fx(), AT('2026-08-01T18:00:00.000Z'))).toBe(false);
    expect(isPast(fx(), AT('2026-08-01T22:59:00.000Z'))).toBe(false);
    expect(isPast(fx(), AT('2026-08-01T23:00:00.000Z'))).toBe(true);
    expect(PAST_GRACE_HOURS).toBe(6);
  });

  test('a 96-hour cricket match is not past on day two', () => {
    // The County Championship is configured at durationHours: 96.
    const cricket = fx({ durationHours: 96, startUtc: '2026-08-01T10:00:00.000Z' });
    expect(isPast(cricket, AT('2026-08-03T10:00:00.000Z'))).toBe(false);
    // Ends 2026-08-05T10:00, +6h grace → 16:00.
    expect(isPast(cricket, AT('2026-08-05T15:59:00.000Z'))).toBe(false);
    expect(isPast(cricket, AT('2026-08-05T16:00:00.000Z'))).toBe(true);
  });

  test('a 5-hour golf round outlives a 2-hour assumption', () => {
    const golf = fx({ durationHours: 5, startUtc: '2026-08-01T08:00:00.000Z' });
    // A startUtc-based rule would have frozen this at 14:00.
    expect(isPast(golf, AT('2026-08-01T14:00:00.000Z'))).toBe(false);
  });

  test('an all-day TBC banner runs to the end of its day, not its sentinel', () => {
    // startUtc is a midnight sentinel; the banner covers the whole day.
    const tbd = fx({ status: 'tbd', startUtc: '2026-08-01T00:00:00.000Z' });
    expect(fixtureEndUtc(tbd)).toBe('2026-08-02T00:00:00.000Z');
    expect(isPast(tbd, AT('2026-08-01T20:00:00.000Z'))).toBe(false);
    expect(isPast(tbd, AT('2026-08-02T05:59:00.000Z'))).toBe(false);
    expect(isPast(tbd, AT('2026-08-02T06:00:00.000Z'))).toBe(true);
  });

  test('a postponement announced mid-event still reaches the calendar', () => {
    // The reason the rule is end-based: a postponed fixture keeps its day
    // sentinel and must remain writable while that day is running.
    const ppd = fx({ status: 'postponed', startUtc: '2026-08-01T00:00:00.000Z' });
    expect(isPast(ppd, AT('2026-08-01T18:00:00.000Z'))).toBe(false);
  });

  test('the end the rule uses is the end the planner writes', () => {
    // One definition: if these ever diverge, a frozen fixture and its
    // frozen event would disagree about when they finished.
    for (const f of [
      fx(),
      fx({ status: 'tbd', startUtc: '2026-08-01T00:00:00.000Z' }),
      fx({ status: 'postponed', startUtc: '2026-08-01T00:00:00.000Z' }),
      fx({ durationHours: 96 }),
    ]) {
      const desired = desiredEventFor(f, DEFAULT_PREFS);
      expect(desired).not.toBeNull();
      expect(desired!.endUtc).toBe(fixtureEndUtc(f));
    }
  });
});

describe('the query lower bound cannot exclude a live fixture', () => {
  test('it is the longest fixture plus the grace', () => {
    expect(MAX_FIXTURE_DURATION_HOURS).toBe(96);
    const now = AT('2026-08-10T12:00:00.000Z');
    // 96h + 6h = 102h before now.
    expect(queryHorizonUtc(now)).toBe('2026-08-06T06:00:00.000Z');
  });

  test('every fixture the bound excludes really is past', () => {
    const now = AT('2026-08-10T12:00:00.000Z');
    const bound = queryHorizonUtc(now);
    // The worst case: the longest fixture we serve, starting exactly at
    // the bound, must still be considered past — otherwise the query
    // would drop something the planner still wants.
    const longest = fx({ durationHours: 96, startUtc: bound });
    expect(isPast(longest, now)).toBe(true);
    // …and one minute later it is NOT past, so the bound is not slack.
    const justInside = fx({
      durationHours: 96,
      startUtc: new Date(Date.parse(bound) + 60_000).toISOString(),
    });
    expect(isPast(justInside, now)).toBe(false);
  });
});

describe('freezing lives in the LEDGER, not the query', () => {
  const entryFor = (endUtc: string) => ({
    eventId: 'ev-1',
    calendarId: 'cal-1',
    startUtc: '2026-08-01T15:00:00.000Z',
    endUtc,
    title: 'A v B',
    allDay: false,
  });
  const HORIZON = '2026-01-01T00:00:00.000Z';

  test('THE CROSSING: a fixture synced while future plans nothing once past', () => {
    // The failure this rule exists to prevent: the fixture leaves the
    // fetch when it goes past, and "absent from the fetch" used to mean
    // "the user unfollowed it" — which deletes a real event.
    const f = fx();
    const ledger: Ledger = { f1: entryFor('2026-08-01T17:00:00.000Z') };

    // While future: steady state, no ops.
    expect(
      planSync([f], ledger, ['fdorg-comp-PL'], DEFAULT_PREFS, HORIZON, new Set(), new Set(), AT('2026-08-01T10:00:00.000Z')),
    ).toEqual([]);

    // Clock advances past endUtc + grace, and the fixture is GONE from
    // the fetch because the query no longer returns it.
    const ops = planSync([], ledger, ['fdorg-comp-PL'], DEFAULT_PREFS, HORIZON, new Set(), new Set(), AT('2026-08-02T12:00:00.000Z'));
    expect(ops).toEqual([]); // not a delete, not anything
  });

  test('a frozen entry is never deleted even when nothing is followed', () => {
    const ledger: Ledger = { f1: entryFor('2026-08-01T17:00:00.000Z') };
    // No follows at all — the strongest possible "we do not want this".
    const ops = planSync([], ledger, [], DEFAULT_PREFS, HORIZON, new Set(), new Set(), AT('2026-09-01T00:00:00.000Z'));
    expect(ops).toEqual([]);
  });

  test('a frozen fixture still in the fetch is not updated either', () => {
    // Title changed upstream after the match finished. Frozen means frozen.
    const f = fx({ title: 'A v B (corrected)' });
    const ledger: Ledger = { f1: entryFor('2026-08-01T17:00:00.000Z') };
    const ops = planSync([f], ledger, ['fdorg-comp-PL'], DEFAULT_PREFS, HORIZON, new Set(), new Set(), AT('2026-08-02T12:00:00.000Z'));
    expect(ops).toEqual([]);
  });

  test('a past fixture with NO ledger entry is never created', () => {
    const ops = planSync([fx()], {}, ['fdorg-comp-PL'], DEFAULT_PREFS, HORIZON, new Set(), new Set(), AT('2026-08-02T12:00:00.000Z'));
    expect(ops).toEqual([]);
  });

  test('a LIVE fixture that vanishes from the fetch is still deleted', () => {
    // The freeze must not become a blanket amnesty: an unfollow of a
    // future fixture has to keep working.
    const ledger: Ledger = { f1: entryFor('2026-08-01T17:00:00.000Z') };
    const ops = planSync([], ledger, [], DEFAULT_PREFS, HORIZON, new Set(), new Set(), AT('2026-08-01T10:00:00.000Z'));
    expect(ops).toHaveLength(1);
    expect(ops[0].op).toBe('delete');
  });
});

describe('opt-in removal of past events', () => {
  const entryFor = (endUtc: string) => ({
    eventId: 'ev-1',
    calendarId: 'cal-1',
    startUtc: endUtc,
    endUtc,
    title: 'A v B',
    allDay: false,
  });
  const HORIZON = '2026-01-01T00:00:00.000Z';
  const ledger: Ledger = { f1: entryFor('2026-08-01T17:00:00.000Z') };

  test('is OFF by default', () => {
    expect(DEFAULT_PREFS.autoDeletePast).toBe(false);
    expect(PAST_RETENTION_DAYS).toBe(30);
  });

  test('off means a decade-old event is still left alone', () => {
    const ops = planSync([], ledger, [], DEFAULT_PREFS, HORIZON, new Set(), new Set(), AT('2036-08-01T00:00:00.000Z'));
    expect(ops).toEqual([]);
  });

  test('on, it removes only what is beyond the retention window', () => {
    const on = { ...DEFAULT_PREFS, autoDeletePast: true };
    // 29 days after the end: still inside retention, untouched.
    expect(
      planSync([], ledger, [], on, HORIZON, new Set(), new Set(), AT('2026-08-30T17:00:00.000Z')),
    ).toEqual([]);
    // 31 days after: removed.
    const ops = planSync([], ledger, [], on, HORIZON, new Set(), new Set(), AT('2026-09-01T18:00:00.000Z'));
    expect(ops).toHaveLength(1);
    expect(ops[0].op).toBe('delete');
  });

  test('on, a still-live fixture is never caught by it', () => {
    const on = { ...DEFAULT_PREFS, autoDeletePast: true };
    const f = fx();
    // Entry matching what the planner would write, so a live fixture in
    // steady state is genuinely a no-op rather than an incidental update.
    const live: Ledger = {
      f1: {
        eventId: 'ev-1',
        calendarId: 'cal-1',
        startUtc: '2026-08-01T15:00:00.000Z',
        endUtc: '2026-08-01T17:00:00.000Z',
        title: 'A v B',
        allDay: false,
      },
    };
    const ops = planSync([f], live, ['fdorg-comp-PL'], on, HORIZON, new Set(), new Set(), AT('2026-08-01T10:00:00.000Z'));
    expect(ops).toEqual([]);
  });

  test('retention is measured from the END, not the start', () => {
    const on = { ...DEFAULT_PREFS, autoDeletePast: true };
    const longMatch: Ledger = {
      f1: {
        ...entryFor('2026-08-05T10:00:00.000Z'),
        startUtc: '2026-08-01T10:00:00.000Z',
      },
    };
    // 30 days after the START but only 26 after the END — keep.
    expect(
      planSync([], longMatch, [], on, HORIZON, new Set(), new Set(), AT('2026-08-31T12:00:00.000Z')),
    ).toEqual([]);
  });
});

describe('isEndPast agrees with isPast', () => {
  test('the entry-based and fixture-based rules give the same answer', () => {
    const f = fx();
    for (const at of [
      '2026-08-01T16:00:00.000Z',
      '2026-08-01T22:59:00.000Z',
      '2026-08-01T23:00:00.000Z',
      '2026-09-01T00:00:00.000Z',
    ]) {
      expect(isEndPast(fixtureEndUtc(f), AT(at))).toBe(isPast(f, AT(at)));
    }
  });

  test('retention is strictly later than freezing', () => {
    const end = '2026-08-01T17:00:00.000Z';
    const justFrozen = AT('2026-08-01T23:00:00.000Z');
    expect(isEndPast(end, justFrozen)).toBe(true);
    expect(isBeyondRetention(end, justFrozen)).toBe(false);
  });
});
