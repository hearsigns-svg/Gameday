// The follow cap, end to end through the planner.
//
// `fetchFixturesForFollows` truncated to 10 keys. This composes the real
// chunked fetch with the real planner over a user who has changed nothing,
// and asserts the thing that actually mattered: the old truncation planned
// DELETES against events that were correctly in the calendar.

import { Fixture } from '../../../fixtures/domain/fixture';
import { fetchInChunks } from '../../../fixtures/domain/fixtureQuery';
import { DEFAULT_PREFS } from '../prefs';
import { Ledger, planSync, SyncOp } from '../syncPlan';

const HORIZON = '2026-01-01T00:00:00.000Z';
const noSleep = async () => {};

// 40 followed teams, one upcoming fixture each — a plausible power user.
const FOLLOW_COUNT = 40;
const followKeys = Array.from(
  { length: FOLLOW_COUNT },
  (_, i) => `fdorg-team-${i}`,
);

const fixtures: Fixture[] = followKeys.map((key, i) => ({
  id: `fdorg-${i}`,
  sport: 'soccer',
  competition: 'Premier League',
  competitionId: 'fdorg-comp-PL',
  title: `Team ${i} v Someone`,
  homeTeam: `Team ${i}`,
  awayTeam: 'Someone',
  followKeys: [key],
  startUtc: '2026-12-25T15:00:00.000Z',
  venueTz: 'UTC',
  status: 'scheduled',
  updatedAt: '2026-07-31T00:00:00.000Z',
}));

// The calendar already holds all 40, exactly as the planner would want
// them: a steady state where a sync should do nothing at all.
const ledger: Ledger = Object.fromEntries(
  fixtures.map((f) => [
    f.id,
    {
      eventId: `ev-${f.id}`,
      calendarId: 'cal-1',
      startUtc: f.startUtc,
      endUtc: '2026-12-25T17:00:00.000Z',
      title: f.title,
      allDay: false,
      reminderMinutes: DEFAULT_PREFS.reminderMinutes,
    },
  ]),
);

// Stands in for Firestore: returns every fixture matching any key in the
// window, which is what array-contains-any does.
const backend = async (keys: readonly string[]): Promise<Fixture[]> =>
  fixtures.filter((f) => f.followKeys.some((k) => keys.includes(k)));

const opsOf = (fetched: Fixture[]): SyncOp[] =>
  planSync(fetched, ledger, followKeys, DEFAULT_PREFS, HORIZON);

describe('a user with 40 follows who has changed nothing', () => {
  test('THE BUG: truncating to 10 keys planned 30 deletions', async () => {
    // Exactly what the old fixturesRepo did: followedKeys.slice(0, 10).
    const truncated = await backend(followKeys.slice(0, 10));
    const ops = opsOf(truncated);
    const deletes = ops.filter((o) => o.op === 'delete');
    expect(deletes.length).toBe(30);
    // Not hypothetical events — these are ledgered, i.e. they exist in the
    // user's real calendar right now.
    expect(deletes.every((o) => o.op === 'delete' && ledger[o.fixtureId])).toBe(
      true,
    );
  });

  test('THE FIX: the chunked fetch plans nothing at all', async () => {
    const r = await fetchInChunks(followKeys, backend, { sleep: noSleep });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.chunks).toBe(2);
    expect(r.fixtures.length).toBe(FOLLOW_COUNT);
    expect(opsOf(r.fixtures)).toEqual([]);
  });

  test('a failed chunk yields no plan at all, rather than a destructive one', async () => {
    // The whole point of all-or-nothing: the caller gets an error and
    // planSync is never reached. If this ever became a partial success,
    // the previous test's 30 deletions are what would happen.
    const flaky = async (keys: readonly string[]) => {
      if (keys.includes('fdorg-team-30')) throw new Error('unavailable');
      return backend(keys);
    };
    const r = await fetchInChunks(followKeys, flaky, { sleep: noSleep });
    expect(r.ok).toBe(false);
  });
});

describe('pinned fixtures, which sat past the cap', () => {
  const pinKey = 'tsdb-league-4443';
  const pinned: Fixture = {
    ...fixtures[0],
    id: 'tsdb-999',
    title: 'UFC 324',
    competitionId: pinKey,
    followKeys: [pinKey],
  };
  const all = [...fixtures, pinned];
  const withPin = async (keys: readonly string[]): Promise<Fixture[]> =>
    all.filter((f) => f.followKeys.some((k) => keys.includes(k)));

  test('a pin key appended after 40 follows is fetched and kept', async () => {
    // syncEngine passes [...follows, ...pinFollowKeys()], so the pin key
    // was at index 40 and slice(0, 10) never saw it.
    const r = await fetchInChunks([...followKeys, pinKey], withPin, {
      sleep: noSleep,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.fixtures.map((f) => f.id)).toContain('tsdb-999');

    // And the planner creates it, because pins are wanted even though
    // nothing they belong to is followed.
    const ops = planSync(
      r.fixtures,
      ledger,
      followKeys,
      DEFAULT_PREFS,
      HORIZON,
      new Set(),
      new Set(['tsdb-999']),
    );
    expect(ops).toEqual([
      { op: 'create', fixture: pinned, desired: expect.anything() },
    ]);
  });
});
