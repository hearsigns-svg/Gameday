// Per-event calendar settings (Prompt 16 A1).
//
// The rule being pinned: a reminder the user set on ONE fixture is ours,
// it beats the global preference, it reaches the calendar as a real
// operation, and it SURVIVES the delete-and-recreate that every
// all-day↔timed flip forces. That last one is the live bug this stage
// exists to fix — a "Time TBC" banner sharpening into a confirmed time
// destroyed whatever reminder the user had put on it.

import { Fixture } from '../../../fixtures/domain/fixture';
import {
  assumedAppliedReminder,
  EventSettingsMap,
  EVENT_SETTINGS_MAX_AGE_MS,
  hasReminderOverride,
  pruneEventSettings,
  reminderMinutesFor,
} from '../eventSettings';
import { DEFAULT_PREFS } from '../prefs';
import {
  desiredEventFor,
  Ledger,
  LedgerEntry,
  planSync,
  SyncOp,
} from '../syncPlan';

const HORIZON = '2026-08-01T00:00:00.000Z';
const KEY = 'pbc-cards';
const AT = (iso: string) => Date.parse(iso);

function fixture(overrides: Partial<Fixture> = {}): Fixture {
  return {
    id: 'pbc-fight-night',
    sport: 'boxing',
    competition: 'Premier Boxing Champions',
    competitionId: KEY,
    title: 'Romero v Lopez',
    followKeys: [KEY],
    startUtc: '2026-08-22T22:00:00.000Z',
    status: 'scheduled',
    updatedAt: '2026-08-01T00:00:00.000Z',
    ...overrides,
  };
}

// Exactly what the engine writes after applying an op — including the
// reminder it applied, which is what lets the next plan see a change.
function applied(ledger: Ledger, ops: SyncOp[]): Ledger {
  const next: Ledger = { ...ledger };
  for (const op of ops) {
    if (op.op === 'create' || op.op === 'update') {
      next[op.fixture.id] = {
        eventId: op.op === 'update' ? op.entry.eventId : `evt-${op.fixture.id}`,
        calendarId: 'cal-1',
        startUtc: op.desired.startUtc,
        endUtc: op.desired.endUtc,
        title: op.desired.title,
        allDay: op.desired.allDay,
        reminderMinutes: op.desired.reminderMinutes,
        extraReminders: op.desired.extraReminders,
      };
    } else {
      delete next[op.fixtureId];
    }
  }
  return next;
}

const NOW = AT('2026-08-02T12:00:00.000Z');

describe('reminderMinutesFor', () => {
  const settings: EventSettingsMap = {
    'pbc-fight-night': { reminderMinutes: 15, at: '2026-08-02T09:00:00.000Z' },
    quiet: { reminderMinutes: null, at: '2026-08-02T09:00:00.000Z' },
  };

  it('an override beats the global preference for that fixture only', () => {
    expect(reminderMinutesFor('pbc-fight-night', settings, DEFAULT_PREFS, false))
      .toBe(15);
    expect(reminderMinutesFor('some-other', settings, DEFAULT_PREFS, false))
      .toBe(DEFAULT_PREFS.reminderMinutes);
  });

  it('null is a real choice — "no reminder for this one", not "unset"', () => {
    expect(reminderMinutesFor('quiet', settings, DEFAULT_PREFS, false)).toBeNull();
    expect(hasReminderOverride('quiet', settings)).toBe(true);
    expect(hasReminderOverride('some-other', settings)).toBe(false);
  });

  it('an all-day placeholder takes no alarm, override or not', () => {
    // 15 minutes before a midnight day sentinel is 23:45 the night
    // before, for an event whose time nobody has published.
    expect(reminderMinutesFor('pbc-fight-night', settings, DEFAULT_PREFS, true))
      .toBeNull();
  });
});

describe('the plan carries the reminder', () => {
  it('a per-event override changes what the planner wants', () => {
    const f = fixture();
    const d = desiredEventFor(f, DEFAULT_PREFS, undefined, {
      [f.id]: { reminderMinutes: 30, at: '2026-08-02T09:00:00.000Z' },
    });
    expect(d?.reminderMinutes).toBe(30);
  });

  it('setting a reminder on a synced event produces exactly one update', () => {
    const f = fixture();
    const ledger = applied(
      {},
      planSync([f], {}, [KEY], DEFAULT_PREFS, HORIZON, new Set(), new Set(), NOW),
    );
    // Steady state first: nothing to do.
    expect(
      planSync([f], ledger, [KEY], DEFAULT_PREFS, HORIZON, new Set(), new Set(), NOW),
    ).toHaveLength(0);

    const settings: EventSettingsMap = {
      [f.id]: { reminderMinutes: 15, at: '2026-08-02T10:00:00.000Z' },
    };
    const ops = planSync(
      [f], ledger, [KEY], DEFAULT_PREFS, HORIZON, new Set(), new Set(), NOW,
      undefined, settings,
    );
    expect(ops).toHaveLength(1);
    expect(ops[0].op).toBe('update');
    if (ops[0].op === 'update') expect(ops[0].desired.reminderMinutes).toBe(15);

    // …and then it settles: applying it converges.
    const after = applied(ledger, ops);
    expect(
      planSync([f], after, [KEY], DEFAULT_PREFS, HORIZON, new Set(), new Set(), NOW,
        undefined, settings),
    ).toHaveLength(0);
  });

  it('changing the GLOBAL preference reaches events that already exist', () => {
    const f = fixture();
    const ledger = applied(
      {},
      planSync([f], {}, [KEY], DEFAULT_PREFS, HORIZON, new Set(), new Set(), NOW),
    );
    const ops = planSync(
      [f], ledger, [KEY],
      { ...DEFAULT_PREFS, reminderMinutes: 30 },
      HORIZON, new Set(), new Set(), NOW,
    );
    expect(ops).toHaveLength(1);
    if (ops[0].op === 'update') expect(ops[0].desired.reminderMinutes).toBe(30);
  });

  it('an entry with NO recorded reminder is unknown, and converges once', () => {
    // The reinstall shape: recovery rebuilds entries from calendar
    // events, and Android cannot read alarms back from a calendar scan
    // at all — so "no reminder recorded" must never be read as "matches
    // whatever we want".
    const f = fixture();
    const recovered: LedgerEntry = {
      eventId: 'evt-recovered',
      calendarId: 'cal-1',
      startUtc: '2026-08-22T22:00:00.000Z',
      endUtc: '2026-08-23T00:00:00.000Z',
      title: 'Romero v Lopez',
      allDay: false,
    };
    const ops = planSync(
      [f], { [f.id]: recovered }, [KEY], DEFAULT_PREFS, HORIZON,
      new Set(), new Set(), NOW,
    );
    expect(ops).toHaveLength(1);
    expect(ops[0].op).toBe('update');
    expect(
      planSync([f], applied({}, ops), [KEY], DEFAULT_PREFS, HORIZON,
        new Set(), new Set(), NOW),
    ).toHaveLength(0);
  });
});

describe('the reminder survives delete-and-recreate', () => {
  // THE BUG, reproduced as a sequence: a card announced without a time
  // is an all-day banner; the user asks for a 15-minute reminder; the
  // broadcast time is announced; the banner becomes a timed event, which
  // EventKit only tolerates as delete + recreate.
  const tbc = fixture({ status: 'tbd', timePrecision: 'date_only' });
  const confirmed = fixture({
    status: 'scheduled',
    timePrecision: 'exact',
    startUtc: '2026-08-22T22:00:00.000Z',
  });
  const settings: EventSettingsMap = {
    'pbc-fight-night': { reminderMinutes: 15, at: '2026-08-02T10:00:00.000Z' },
  };

  it('is kept while the time is unknown and applied the moment it lands', () => {
    const first = planSync(
      [tbc], {}, [KEY], DEFAULT_PREFS, HORIZON, new Set(), new Set(), NOW,
      undefined, settings,
    );
    expect(first).toHaveLength(1);
    if (first[0].op === 'create') {
      expect(first[0].desired.allDay).toBe(true);
      expect(first[0].desired.reminderMinutes).toBeNull(); // no alarm yet
    }
    const ledger = applied({}, first);

    const flip = planSync(
      [confirmed], ledger, [KEY], DEFAULT_PREFS, HORIZON, new Set(), new Set(), NOW,
      undefined, settings,
    );
    expect(flip).toHaveLength(1);
    expect(flip[0].op).toBe('update');
    if (flip[0].op === 'update') {
      // The engine turns an all-day→timed update into delete + create.
      // Whichever way it writes, the reminder comes from the PLAN, so
      // the recreated event carries the user's 15 minutes.
      expect((flip[0].entry.allDay ?? false) !== flip[0].desired.allDay).toBe(true);
      expect(flip[0].desired.reminderMinutes).toBe(15);
    }
  });

  it('a fixture with no override falls back to the preference on recreate', () => {
    const ledger = applied(
      {},
      planSync([tbc], {}, [KEY], DEFAULT_PREFS, HORIZON, new Set(), new Set(), NOW),
    );
    const flip = planSync(
      [confirmed], ledger, [KEY], DEFAULT_PREFS, HORIZON, new Set(), new Set(), NOW,
    );
    if (flip[0].op === 'update') {
      expect(flip[0].desired.reminderMinutes).toBe(DEFAULT_PREFS.reminderMinutes);
    }
  });
});

describe('assumedAppliedReminder', () => {
  it('is the preference for a timed entry and nothing for an all-day one', () => {
    expect(assumedAppliedReminder(false, DEFAULT_PREFS)).toBe(60);
    expect(assumedAppliedReminder(undefined, DEFAULT_PREFS)).toBe(60);
    expect(assumedAppliedReminder(true, DEFAULT_PREFS)).toBeNull();
  });
});

describe('pruneEventSettings', () => {
  const now = AT('2026-08-02T00:00:00.000Z');

  it('drops only settings older than a fixture could plausibly be', () => {
    const map: EventSettingsMap = {
      fresh: { reminderMinutes: 15, at: new Date(now - 1000).toISOString() },
      ancient: {
        reminderMinutes: 15,
        at: new Date(now - EVENT_SETTINGS_MAX_AGE_MS - 1000).toISOString(),
      },
    };
    expect(Object.keys(pruneEventSettings(map, now))).toEqual(['fresh']);
  });

  it('repairs a corrupt timestamp rather than dropping the setting', () => {
    const map: EventSettingsMap = {
      broken: { reminderMinutes: 30, at: 'not-a-date' },
    };
    const kept = pruneEventSettings(map, now);
    expect(kept.broken.reminderMinutes).toBe(30);
    expect(Date.parse(kept.broken.at)).toBe(now);
  });
});
