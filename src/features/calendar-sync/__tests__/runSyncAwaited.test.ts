// runSyncAwaited (per-follow calendar control, 2026-09-23): a caller
// that joins while a pass is running must be answered by the RERUN that
// carries its change — never by the pass that read the preferences
// before it, and never with a bare "coalesced" read as success.
//
// Drives the real engine lock. The pass is held open at its first await
// (the calendar permission check) and each pass's verdict is scripted.
jest.mock('../../../core/storage', () => {
  const mem = new Map<string, unknown>();
  return {
    readJson: (k: string, fallback: unknown) => (mem.has(k) ? mem.get(k) : fallback),
    writeJson: (k: string, v: unknown) => void mem.set(k, v),
    removeKey: (k: string) => void mem.delete(k),
  };
});
jest.mock('../../../core/firebase', () => ({ functionsBaseUrl: 'https://example.invalid' }));
jest.mock('firebase/firestore', () => ({}));
jest.mock('firebase/auth', () => ({}));
jest.mock('firebase/app', () => ({}));
jest.mock('../../../core/toast', () => ({ showToast: jest.fn() }));
jest.mock('../data/calendarConnection', () => ({ calendarConnection: () => 'connected' }));
const permissionChecks: Array<(r: unknown) => void> = [];
jest.mock('../data/driver', () => ({
  ensureCalendarPermission: () =>
    new Promise((resolve) => {
      permissionChecks.push(resolve);
    }),
}));

import { runSync, runSyncAwaited } from '../syncEngine';

const denied = { ok: false, error: { kind: 'permission-denied', canAskAgain: true } };
const offline = { ok: false, error: { kind: 'offline' } };
const flush = () => new Promise((r) => setImmediate(r));

beforeEach(() => {
  permissionChecks.length = 0;
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});

test('a caller that joins a running pass gets the queued rerun’s result', async () => {
  const first = runSync();
  await flush();
  expect(permissionChecks).toHaveLength(1); // pass 1 is parked
  const joined = runSyncAwaited();
  let settled = false;
  void joined.then(() => (settled = true));

  permissionChecks[0](denied); // pass 1 ends — with ITS verdict
  await expect(first).resolves.toEqual(denied);
  await flush();
  expect(settled).toBe(false); // not answered by the pass it joined
  expect(permissionChecks).toHaveLength(2); // the rerun started

  permissionChecks[1](offline); // the rerun carries the change
  await expect(joined).resolves.toEqual(offline);
});

test('every caller that joined shares the one rerun', async () => {
  const first = runSync();
  await flush();
  const a = runSyncAwaited();
  const b = runSyncAwaited();
  permissionChecks[0](denied);
  await first;
  await flush();
  expect(permissionChecks).toHaveLength(2); // ONE rerun for both
  permissionChecks[1]({ ok: false, error: { kind: 'timeout' } });
  await expect(a).resolves.toEqual({ ok: false, error: { kind: 'timeout' } });
  await expect(b).resolves.toEqual({ ok: false, error: { kind: 'timeout' } });
});

test('with nothing running it is an ordinary pass', async () => {
  const p = runSyncAwaited();
  await flush();
  expect(permissionChecks).toHaveLength(1);
  permissionChecks[0](offline);
  await expect(p).resolves.toEqual(offline);
});
