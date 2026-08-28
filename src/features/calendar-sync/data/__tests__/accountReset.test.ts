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
import { deleteFixtureEvent, eraseAppCalendar } from '../driver';
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

beforeEach(() => {
  jest.clearAllMocks();
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
