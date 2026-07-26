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
  listTaggedEvents,
  updateFixtureEvent,
} from './data/calendarDriver';
import {
  entriesFromRecoveredEvents,
  orphanEventIds,
} from './domain/recovery';
import {
  loadLedger,
  removeLedgerEntry,
  upsertLedgerEntry,
} from './data/ledger';
import { horizonStartFrom, planSync } from './domain/syncPlan';

const LAST_SYNC_KEY = 'lastSync.v1';
const UPCOMING_KEY = 'upcomingByFollow.v1';

// Upcoming-fixture count per followed key, refreshed every sync.
export function upcomingByFollow(): Record<string, number> {
  return readJson<Record<string, number>>(UPCOMING_KEY, {});
}

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
  recovered?: number; // ledger entries rebuilt from calendar (reinstall)
  pruned?: number; // orphan tagged events deleted (ledger invariant)
  at: string;
}

export function lastSync(): SyncOutcome | null {
  return readJson<SyncOutcome | null>(LAST_SYNC_KEY, null);
}

// Staleness metric: hours since the last successful sync. The number we
// watch to judge whether propagation layers are doing their job (M6);
// reported to server-side telemetry once real infra lands.
export function syncStalenessHours(): number | null {
  const last = lastSync();
  if (!last) return null;
  return (Date.now() - new Date(last.at).getTime()) / 3_600_000;
}

let syncRunning = false;
let syncStartedAt = 0;
let rerunQueued = false;

// A run interrupted by backgrounding has its JS paused mid-flight: the
// finally block never executes and the mutex would be held for the life
// of the process, silently killing every later sync (including
// push-triggered ones). Past this age a holder is treated as abandoned.
// Safe by construction: the ledger persists per operation and planning
// is idempotent, so a resumed zombie run finds nothing left to do.
const STALE_RUN_MS = 3 * 60_000;

export async function runSync(): Promise<Result<SyncOutcome>> {
  const heldFor = Date.now() - syncStartedAt;
  if (syncRunning && heldFor < STALE_RUN_MS) {
    // Coalesce: whatever changed (new follow, unfollow, pref) is picked
    // up by one queued re-run after the current run finishes. Without
    // this, an unfollow during a long sync silently never deletes.
    rerunQueued = true;
    return err({ kind: 'sync-in-progress' });
  }
  if (syncRunning) {
    console.warn(
      `[gameday] taking over abandoned sync (held ${Math.round(heldFor / 1000)}s)`,
    );
  }
  syncRunning = true;
  syncStartedAt = Date.now();
  emit(true);
  try {
    return await runSyncInner();
  } catch (e) {
    // Nothing inside may leak an uncaught rejection to the UI.
    return err({ kind: 'unknown', message: `sync failed: ${e}` });
  } finally {
    syncRunning = false;
    syncStartedAt = 0;
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

    // Reinstall recovery: an empty ledger with tagged events already in
    // the calendar means the app's storage was lost (uninstall) — the
    // events are the durable record. Rebuild before planning so the sync
    // updates instead of duplicating.
    let recovered = 0;
    if (Object.keys(loadLedger()).length === 0) {
      const scan = await listTaggedEvents(cal.value);
      if (scan.ok && scan.value.length > 0) {
        const rebuilt = entriesFromRecoveredEvents(scan.value, cal.value);
        for (const [fixtureId, entry] of Object.entries(rebuilt.ledger)) {
          upsertLedgerEntry(fixtureId, entry);
        }
        for (const eventId of rebuilt.surplusEventIds) {
          await deleteFixtureEvent(eventId);
        }
        recovered = Object.keys(rebuilt.ledger).length;
      }
    }
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

    const horizonStart = horizonStartFrom(Date.now());
    const ops = planSync(fixtures.value, ledger, follows, prefs, horizonStart);

    // Per-followable upcoming counts drive honest off-season messaging:
    // a followed team between seasons has fixtures, just none ahead.
    const upcoming: Record<string, number> = {};
    for (const key of follows) upcoming[key] = 0;
    for (const f of fixtures.value) {
      if (f.startUtc < horizonStart) continue;
      for (const key of f.followKeys) {
        if (key in upcoming) upcoming[key]++;
      }
    }
    writeJson(UPCOMING_KEY, upcoming);
    const outcome: SyncOutcome = {
      created: 0,
      updated: 0,
      deleted: 0,
      recovered,
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

    // Prune pass: delete any tagged event the ledger does not reference
    // (calendar ⊆ ledger invariant). Catches scan-window misses, zombie
    // dev runs, and anything else that slipped an event past the ledger.
    const postScan = await listTaggedEvents(cal.value);
    if (postScan.ok) {
      for (const eventId of orphanEventIds(postScan.value, loadLedger())) {
        await deleteFixtureEvent(eventId);
        outcome.pruned = (outcome.pruned ?? 0) + 1;
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
