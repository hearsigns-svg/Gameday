// Sync orchestrator: permission → dedicated calendar → fixture cache →
// pure plan → apply. The ledger is persisted after EVERY operation, so a
// sync killed mid-run converges on the next run. One run at a time.

import { err, ok, Result } from '../../core/result';
import { readJson, writeJson } from '../../core/storage';
import { fetchFixturesForFollows } from '../fixtures/data/fixturesRepo';
import { loadFollowKeys } from '../follows/data/followStore';
import { loadPrefs } from './data/prefsStore';
import {
  createFixtureEvent,
  deleteFixtureEvent,
  ensureCalendarPermission,
  ensureGamedayCalendar,
  getGamedayCalendarObject,
  updateFixtureEvent,
} from './data/calendarDriver';
import {
  loadLedger,
  removeLedgerEntry,
  upsertLedgerEntry,
} from './data/ledger';
import { planSync } from './domain/syncPlan';

const LAST_SYNC_KEY = 'lastSync.v1';

// Sync status subscription — screens stay live no matter which layer
// (mount, foreground, background task, manual) triggered the run.
export interface SyncState {
  running: boolean;
  last: SyncOutcome | null;
}
type SyncListener = (state: SyncState) => void;
const listeners = new Set<SyncListener>();

export function subscribeSync(fn: SyncListener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit(running: boolean): void {
  const state: SyncState = { running, last: lastSync() };
  for (const fn of listeners) fn(state);
}

export interface SyncOutcome {
  created: number;
  updated: number;
  deleted: number;
  at: string;
}

export function lastSync(): SyncOutcome | null {
  return readJson<SyncOutcome | null>(LAST_SYNC_KEY, null);
}

let syncRunning = false;
let rerunQueued = false;

export async function runSync(): Promise<Result<SyncOutcome>> {
  if (syncRunning) {
    // Coalesce: whatever changed (new follow, unfollow, pref) is picked
    // up by one queued re-run after the current run finishes. Without
    // this, an unfollow during a long sync silently never deletes.
    rerunQueued = true;
    return err({ kind: 'sync-in-progress' });
  }
  syncRunning = true;
  emit(true);
  try {
    return await runSyncInner();
  } catch (e) {
    // Nothing inside may leak an uncaught rejection to the UI.
    return err({ kind: 'unknown', message: `sync failed: ${e}` });
  } finally {
    syncRunning = false;
    emit(false);
    if (rerunQueued) {
      rerunQueued = false;
      void runSync();
    }
  }
}

async function runSyncInner(): Promise<Result<SyncOutcome>> {
  {
    const perm = await ensureCalendarPermission();
    if (!perm.ok) return perm;
    const cal = await ensureGamedayCalendar();
    if (!cal.ok) return cal;
    const calObj = await getGamedayCalendarObject(cal.value);
    if (!calObj.ok) return calObj;

    const follows = loadFollowKeys();
    const prefs = loadPrefs();
    const fixtures = await fetchFixturesForFollows(follows);
    if (!fixtures.ok) return fixtures;

    const ledger = loadLedger();
    // Circuit breaker: active follows but zero fixtures against a
    // non-trivial ledger means an upstream/cache anomaly, not a real
    // "everything is cancelled". Never mass-delete on that signal.
    if (
      follows.length > 0 &&
      fixtures.value.length === 0 &&
      Object.keys(ledger).length > 0
    ) {
      return err({ kind: 'suspect-empty' });
    }

    const ops = planSync(fixtures.value, ledger, follows, prefs);
    const outcome: SyncOutcome = {
      created: 0,
      updated: 0,
      deleted: 0,
      at: new Date().toISOString(),
    };

    for (const op of ops) {
      if (op.op === 'create' || op.op === 'update') {
        const f = op.fixture;
        const d = op.desired;
        const input = {
          fixtureId: f.id,
          title: d.title,
          startUtc: d.startUtc,
          endUtc: d.endUtc,
          allDay: d.allDay,
          // No reminder on placeholders/all-day — an alert for an
          // unknown time is noise; timed events get the pref reminder.
          reminderMinutesBefore: d.allDay ? null : prefs.reminderMinutes,
        };
        // EventKit half-applies all-day ↔ timed conversions on update
        // (flag flips, dates don't). A kind change is always delete +
        // recreate; same-kind changes update in place.
        const kindFlip =
          op.op === 'update' &&
          (op.entry.allDay ?? false) !== op.desired.allDay;
        if (kindFlip) await deleteFixtureEvent(op.entry.eventId);
        const r =
          op.op === 'create' || kindFlip
            ? await createFixtureEvent(calObj.value, input)
            : await updateFixtureEvent(op.entry.eventId, input);
        if (!r.ok) return r;
        upsertLedgerEntry(f.id, {
          eventId: r.value,
          calendarId: cal.value,
          startUtc: input.startUtc,
          endUtc: input.endUtc,
          title: input.title,
          allDay: input.allDay,
        });
        if (op.op === 'create') outcome.created++;
        else outcome.updated++;
      } else {
        const del = await deleteFixtureEvent(op.entry.eventId);
        if (!del.ok) return del; // never drop a ledger entry on a failed delete
        removeLedgerEntry(op.fixtureId);
        outcome.deleted++;
      }
    }

    writeJson(LAST_SYNC_KEY, outcome);
    return ok(outcome);
  }
}

// Auto-sync is only appropriate once the user has engaged: it prompts for
// calendar permission, which must never happen on a cold first open.
export function shouldAutoSync(): boolean {
  return loadFollowKeys().length > 0 || Object.keys(loadLedger()).length > 0;
}
