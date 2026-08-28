// Stage 5: three reminder slots — resolution, vocabulary, and the
// planner-side propagation guarantees.

import { extraRemindersFor } from '../eventSettings';
import {
  DEFAULT_PREFS,
  OFFSET_HOUR_VALUES,
  OFFSET_MINUTE_VALUES,
  offsetLabel,
  offsetShortLabel,
  reminderSlotValues,
} from '../prefs';
import { desiredEventFor, Ledger, planSync } from '../syncPlan';
import { Fixture } from '../../../fixtures/domain/fixture';

const PAST_HORIZON = '2020-01-01T00:00:00.000Z';
const LIV = 'apisports-team-40';

const fixture = (overrides: Partial<Fixture> = {}): Fixture => ({
  id: 'apisports-1',
  sport: 'soccer',
  competition: 'Premier League',
  competitionId: 'apisports-league-39',
  title: 'Liverpool v Everton',
  followKeys: [LIV],
  startUtc: '2023-10-21T11:30:00.000Z',
  status: 'scheduled',
  updatedAt: '2023-10-01T00:00:00.000Z',
  ...overrides,
});

describe('the offset grid (the brief’s ruling)', () => {
  it('minutes run 1–59 in 1-minute steps', () => {
    expect(OFFSET_MINUTE_VALUES).toHaveLength(59);
    expect(OFFSET_MINUTE_VALUES[0]).toBe(1);
    expect(OFFSET_MINUTE_VALUES[58]).toBe(59);
  });

  it('hours run 1–24 then 12-hour steps to 72', () => {
    expect(OFFSET_HOUR_VALUES).toHaveLength(28);
    expect(OFFSET_HOUR_VALUES.slice(24)).toEqual([36, 48, 60, 72]);
  });

  it('labels say what a reminder is, days only for whole days', () => {
    expect(offsetLabel(null)).toBe('Off');
    expect(offsetLabel(45)).toBe('45 min before');
    expect(offsetLabel(60)).toBe('1 hour before');
    expect(offsetLabel(360)).toBe('6 hours before');
    expect(offsetLabel(1440)).toBe('1 day before');
    expect(offsetLabel(2160)).toBe('36 hours before');
    expect(offsetLabel(2880)).toBe('2 days before');
    expect(offsetShortLabel(45)).toBe('45m');
    expect(offsetShortLabel(60)).toBe('1h');
    expect(offsetShortLabel(1440)).toBe('1d');
    expect(offsetShortLabel(2160)).toBe('36h');
    expect(offsetShortLabel(4320)).toBe('3d');
  });
});

describe('extraRemindersFor', () => {
  const prefs = { ...DEFAULT_PREFS, reminderMinutes: 60, extraReminders: [360, 1440] };

  it('serves slots 2/3 for an unoverridden timed event', () => {
    expect(extraRemindersFor('f1', {}, prefs, false)).toEqual([360, 1440]);
  });

  it('empty on all-day entries — the day-shaped channel is theirs', () => {
    expect(extraRemindersFor('f1', {}, prefs, true)).toEqual([]);
  });

  it('a per-event override is the WHOLE answer: extras stand down', () => {
    const settings = { f1: { reminderMinutes: 30, at: 'now' } };
    expect(extraRemindersFor('f1', settings, prefs, false)).toEqual([]);
    // "Off, just this one" must mean zero reminders, not two.
    const off = { f1: { reminderMinutes: null, at: 'now' } };
    expect(extraRemindersFor('f1', off, prefs, false)).toEqual([]);
  });

  it('dedupes against the primary and between slots — never a double alarm', () => {
    expect(
      extraRemindersFor('f1', {}, { ...prefs, extraReminders: [60, 360] }, false),
    ).toEqual([360]);
    expect(
      extraRemindersFor('f1', {}, { ...prefs, extraReminders: [360, 360] }, false),
    ).toEqual([360]);
  });

  it('off slots contribute nothing', () => {
    expect(
      extraRemindersFor('f1', {}, { ...prefs, extraReminders: [null, 1440] }, false),
    ).toEqual([1440]);
  });
});

describe('reminderSlotValues (what the card chips display)', () => {
  it('every configured offset, deduped, in slot order', () => {
    expect(
      reminderSlotValues({ ...DEFAULT_PREFS, reminderMinutes: 60, extraReminders: [1440, 60] }),
    ).toEqual([60, 1440]);
    expect(
      reminderSlotValues({ ...DEFAULT_PREFS, reminderMinutes: null, extraReminders: [null, null] }),
    ).toEqual([]);
  });
});

describe('planner propagation (the brief’s reschedule guarantee)', () => {
  const prefs = { ...DEFAULT_PREFS, extraReminders: [360, null] };

  const syncedLedger = (withExtras: boolean): Ledger => {
    const d = desiredEventFor(fixture(), prefs);
    if (!d) throw new Error('no desired');
    return {
      'apisports-1': {
        eventId: 'evt-1',
        calendarId: 'cal-1',
        startUtc: d.startUtc,
        endUtc: d.endUtc,
        title: d.title,
        allDay: d.allDay,
        reminderMinutes: d.reminderMinutes,
        ...(withExtras ? { extraReminders: [360] } : {}),
      },
    };
  };

  it('an edited slot reaches every materialised reminder as an update op', () => {
    // The ledger recorded [360]; the user moves slot 2 to 2 hours.
    const edited = { ...prefs, extraReminders: [120, null] };
    const ops = planSync([fixture()], syncedLedger(true), [LIV], edited, PAST_HORIZON);
    expect(ops).toHaveLength(1);
    expect(ops[0].op).toBe('update');
    if (ops[0].op === 'update') {
      expect(ops[0].desired.extraReminders).toEqual([120]);
    }
  });

  it('recorded extras matching the desired set is a no-op, order-insensitively', () => {
    expect(
      planSync([fixture()], syncedLedger(true), [LIV], prefs, PAST_HORIZON),
    ).toHaveLength(0);
  });

  it('a LEGACY entry (no extras field) with no extras configured stays untouched — absent means empty, not unknown', () => {
    expect(
      planSync(
        [fixture()],
        syncedLedger(false),
        [LIV],
        { ...prefs, extraReminders: [null, null] },
        PAST_HORIZON,
      ),
    ).toHaveLength(0);
  });

  it('a legacy entry converges once slots are actually configured', () => {
    const ops = planSync([fixture()], syncedLedger(false), [LIV], prefs, PAST_HORIZON);
    expect(ops).toHaveLength(1);
    expect(ops[0].op).toBe('update');
  });
});

describe('offsetPickerLabel (Stage 5 redesign, mock-canonical)', () => {
  const { offsetPickerLabel } = jest.requireActual<
    typeof import('../prefs')
  >('../prefs');
  it('reads like the mock: compact, no "before"', () => {
    expect(offsetPickerLabel(null)).toBe('Off');
    expect(offsetPickerLabel(15)).toBe('15 m');
    expect(offsetPickerLabel(60)).toBe('1 hr');
    expect(offsetPickerLabel(300)).toBe('5 hrs');
    // Whole-day multiples say days; 36 and 60 stay in hrs.
    expect(offsetPickerLabel(1440)).toBe('1 day');
    expect(offsetPickerLabel(2880)).toBe('2 days');
    expect(offsetPickerLabel(4320)).toBe('3 days');
    expect(offsetPickerLabel(2160)).toBe('36 hrs');
    expect(offsetPickerLabel(3600)).toBe('60 hrs');
  });
});
