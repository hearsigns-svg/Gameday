// Own-calendar erase semantics (7B rider, owner-ruled), pinned against
// mocked drivers so the CONTRACT is asserted rather than assumed:
// exactly the ledger's events attempted (past included — nothing here
// is date-aware), container never touched in this mode, entries clear
// per success-or-confirmed-gone, failures keep theirs, and a partial
// erase aborts the delete flow before anything is destroyed.

import { err, ok } from '../../../../core/result';

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { clear: jest.fn(async () => undefined) },
}));
jest.mock('firebase/auth', () => ({
  deleteUser: jest.fn(async () => undefined),
  signOut: jest.fn(async () => undefined),
}));
jest.mock('firebase/firestore', () => ({
  deleteDoc: jest.fn(async () => undefined),
  doc: jest.fn(),
}));
jest.mock('../../../../core/firebase', () => ({
  auth: { currentUser: null },
  db: {},
  functionsBaseUrl: 'http://test.invalid',
}));
jest.mock('../../../../core/storage', () => ({
  wipeAllLocalData: jest.fn(),
}));
jest.mock('../driver', () => ({
  deleteFixtureEvent: jest.fn(),
  eraseAppCalendar: jest.fn(),
  surveyCalendars: jest.fn(),
  eraseSportCalendars: jest.fn(),
}));
jest.mock('../sportCalendarStore', () => ({
  sportCalendarIds: jest.fn(),
  forgetAllSportCalendars: jest.fn(),
}));
jest.mock('../ledger', () => ({
  clearLedger: jest.fn(),
  loadLedger: jest.fn(),
  removeLedgerEntry: jest.fn(),
}));
jest.mock('../calendarBackend', () => ({ activeBackend: jest.fn() }));
jest.mock('../calendarTargetStore', () => ({ storedTarget: jest.fn() }));
jest.mock('../googleCalendarAuth', () => ({
  disconnectGoogleCalendar: jest.fn(async () => undefined),
}));

import { deleteAllDataAndReset, eraseSyncedEvents } from '../accountReset';
import {
  deleteFixtureEvent,
  eraseAppCalendar,
  eraseSportCalendars,
  surveyCalendars,
} from '../driver';
import { forgetAllSportCalendars, sportCalendarIds } from '../sportCalendarStore';
import { clearLedger, loadLedger, removeLedgerEntry } from '../ledger';
import { activeBackend } from '../calendarBackend';
import { storedTarget } from '../calendarTargetStore';
import { disconnectGoogleCalendar } from '../googleCalendarAuth';
import { wipeAllLocalData } from '../../../../core/storage';

const mockDelete = deleteFixtureEvent as jest.Mock;
const mockErase = eraseAppCalendar as jest.Mock;
const mockLedger = loadLedger as jest.Mock;
const mockRemove = removeLedgerEntry as jest.Mock;
const mockBackend = activeBackend as jest.Mock;
const mockTarget = storedTarget as jest.Mock;

const ownCalendarMode = () => {
  mockBackend.mockReturnValue('provider');
  mockTarget.mockReturnValue({ kind: 'user', calendarId: 'user-cal', label: 'Home' });
};

const mockSportIds = sportCalendarIds as jest.Mock;
const mockSurvey = surveyCalendars as jest.Mock;
const mockEraseSport = eraseSportCalendars as jest.Mock;

// No calendar for each sport unless a test says otherwise.
const noSportCalendars = () => {
  mockSportIds.mockReturnValue({});
  mockSurvey.mockResolvedValue(ok({ present: new Set(), unrecordedSport: [] }));
};

beforeEach(() => {
  jest.clearAllMocks();
  noSportCalendars();
});

describe('eraseSyncedEvents — own-calendar mode', () => {
  it('attempts exactly the ledger ids (a past event included), clears success and confirmed-gone, keeps failures — container untouched', async () => {
    ownCalendarMode();
    mockLedger.mockReturnValue({
      past: { eventId: 'ev-past', startUtc: '2020-01-01T00:00:00.000Z' },
      gone: { eventId: 'ev-gone' },
      stuck: { eventId: 'ev-stuck' },
    });
    mockDelete.mockImplementation(async (id: string) =>
      id === 'ev-stuck'
        ? err({ kind: 'unknown', message: 'nope' })
        : ok(true), // the driver reports already-gone as success too
    );
    const r = await eraseSyncedEvents();
    expect(r).toEqual(ok({ mode: 'events', removed: 2, failed: 1 }));
    expect(mockDelete.mock.calls.map((c) => c[0]).sort()).toEqual([
      'ev-gone',
      'ev-past',
      'ev-stuck',
    ]);
    expect(mockRemove.mock.calls.map((c) => c[0]).sort()).toEqual(['gone', 'past']);
    // The calendar container survives this mode by construction.
    expect(mockErase).not.toHaveBeenCalled();
    expect(clearLedger).not.toHaveBeenCalled();
  });

  it('a mid-migration stray is attempted best-effort alongside its entry', async () => {
    ownCalendarMode();
    mockLedger.mockReturnValue({
      moved: { eventId: 'ev-new', strayEventId: 'ev-old' },
    });
    mockDelete.mockResolvedValue(ok(true));
    await eraseSyncedEvents();
    expect(mockDelete.mock.calls.map((c) => c[0])).toEqual(['ev-new', 'ev-old']);
  });

  it('an empty ledger erases nothing and says so', async () => {
    ownCalendarMode();
    mockLedger.mockReturnValue({});
    expect(await eraseSyncedEvents()).toEqual(
      ok({ mode: 'nothing', removed: 0, failed: 0 }),
    );
    expect(mockDelete).not.toHaveBeenCalled();
  });
});

describe('eraseSyncedEvents — container mode', () => {
  it('an ours target deletes the container and clears the whole ledger', async () => {
    mockBackend.mockReturnValue('provider');
    mockTarget.mockReturnValue({ kind: 'ours', calendarId: 'our-cal' });
    mockErase.mockResolvedValue(ok(true));
    expect(await eraseSyncedEvents()).toEqual(
      ok({ mode: 'container', removed: 0, failed: 0 }),
    );
    expect(clearLedger).toHaveBeenCalled();
    expect(mockDelete).not.toHaveBeenCalled();
  });
});

describe('deleteAllDataAndReset — partial erase aborts', () => {
  it('a failed delete blocks the flow before anything is destroyed', async () => {
    ownCalendarMode();
    mockLedger.mockReturnValue({ stuck: { eventId: 'ev-stuck' } });
    mockDelete.mockResolvedValue(err({ kind: 'unknown', message: 'nope' }));
    const r = await deleteAllDataAndReset({ eraseCalendar: true });
    expect(r.ok).toBe(false);
    // Nothing downstream of the abort may run: the kept ledger entries
    // ARE the failed events' protection, and the wipe would destroy it.
    expect(wipeAllLocalData).not.toHaveBeenCalled();
    expect(disconnectGoogleCalendar).not.toHaveBeenCalled();
  });
});

// A calendar for each sport (owner brief 2026-09-24): those calendars are
// containers of ours whatever the target is, so the erase takes each one
// whole — recorded ones, and on the provider the unrecorded ones proved
// ours — and forgets the record.
describe('eraseSyncedEvents — sport calendars', () => {
  const withSportCalendars = () => {
    mockSportIds.mockReturnValue({ soccer: 'cal-soccer', tennis: 'cal-tennis' });
    // cal-tennis was deleted by hand; cal-orphan is ours but unrecorded.
    mockSurvey.mockResolvedValue(
      ok({ present: new Set(['cal-soccer']), unrecordedSport: ['cal-orphan'] }),
    );
    mockEraseSport.mockResolvedValue(ok(2));
  };

  it('container mode: every sport calendar goes whole, the ledger clears even with no KickOffCal left', async () => {
    withSportCalendars();
    mockBackend.mockReturnValue('provider');
    mockTarget.mockReturnValue(null); // the combined calendar was vacated
    mockErase.mockResolvedValue(ok(false));
    expect(await eraseSyncedEvents()).toEqual(
      ok({ mode: 'container', removed: 0, failed: 0 }),
    );
    expect(mockEraseSport).toHaveBeenCalledWith([
      { id: 'cal-soccer', recorded: true },
      { id: 'cal-orphan', recorded: false },
    ]);
    expect(forgetAllSportCalendars).toHaveBeenCalled();
    expect(clearLedger).toHaveBeenCalled();
  });

  it('own-calendar mode: the sport calendars go too, and the ledger walk deletes in each entry’s own calendar', async () => {
    withSportCalendars();
    ownCalendarMode();
    mockLedger.mockReturnValue({
      a: { eventId: 'ev-a', calendarId: 'cal-soccer' },
      b: { eventId: 'ev-b', calendarId: 'user-cal', strayEventId: 'ev-b0', strayCalendarId: 'cal-soccer' },
    });
    mockDelete.mockResolvedValue(ok(true));
    expect(await eraseSyncedEvents()).toEqual(ok({ mode: 'events', removed: 2, failed: 0 }));
    expect(mockEraseSport).toHaveBeenCalled();
    expect(mockDelete.mock.calls).toEqual([
      ['ev-a', 'cal-soccer'],
      ['ev-b', 'user-cal'],
      ['ev-b0', 'cal-soccer'],
    ]);
  });

  it('a failed sport-calendar erase fails the erase before anything else is touched', async () => {
    withSportCalendars();
    mockEraseSport.mockResolvedValue(err({ kind: 'unknown', message: 'nope' }));
    mockBackend.mockReturnValue('provider');
    mockTarget.mockReturnValue({ kind: 'ours', calendarId: 'our-cal' });
    const r = await eraseSyncedEvents();
    expect(r.ok).toBe(false);
    expect(mockErase).not.toHaveBeenCalled();
    expect(forgetAllSportCalendars).not.toHaveBeenCalled();
    expect(clearLedger).not.toHaveBeenCalled();
  });

  it('a survey that cannot read the calendars fails the erase — never read as "none"', async () => {
    mockSportIds.mockReturnValue({ soccer: 'cal-soccer' });
    mockSurvey.mockResolvedValue(err({ kind: 'unknown', message: 'No calendars available yet.' }));
    mockBackend.mockReturnValue('provider');
    mockTarget.mockReturnValue({ kind: 'ours', calendarId: 'our-cal' });
    expect((await eraseSyncedEvents()).ok).toBe(false);
    expect(forgetAllSportCalendars).not.toHaveBeenCalled();
  });
});
