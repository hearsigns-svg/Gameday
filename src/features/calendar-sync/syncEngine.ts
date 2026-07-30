// Sync orchestrator: permission → dedicated calendar → fixture cache →
// pure plan → apply. The ledger is persisted after EVERY operation, so a
// sync killed mid-run converges on the next run. One run at a time.

import { err, messageOf, ok, Result } from '../../core/result';
import { readJson, writeJson } from '../../core/storage';
import { Fixture } from '../fixtures/domain/fixture';
import { fetchFixturesForFollows } from '../fixtures/data/fixturesRepo';
import { loadFollowKeys } from '../follows/data/followStore';
import { calendarChoice, setCalendarChoice } from './data/calendarChoice';
import { loadExclusions, pruneExclusions } from './data/exclusionStore';
import { pinFollowKeys, pinnedIds, prunePinStore } from './data/pinStore';
import { loadPrefs } from './data/prefsStore';
import { CalendarPrefs } from './domain/prefs';
import {
  createFixtureEvent,
  deleteFixtureEvent,
  ensureCalendarPermission,
  hasCalendarGrant,
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
import {
  horizonStartFrom,
  planSync,
  SnapshotFixture,
  upcomingSnapshot,
} from './domain/syncPlan';

const LAST_SYNC_KEY = 'lastSync.v1';
const UPCOMING_KEY = 'upcomingByFollow.v1';
const UPCOMING_FIXTURES_KEY = 'upcomingFixtures.v1';
const UPCOMING_FIXTURES_CAP = 60;

// Upcoming-fixture count per followed key, refreshed every sync.
export function upcomingByFollow(): Record<string, number> {
  return readJson<Record<string, number>>(UPCOMING_KEY, {});
}

// Presentation snapshot of what's ahead, refreshed after every applied
// sync so Home and Schedule render real fixtures offline. Read-only
// display data — the ledger remains the only record of what's in the
// calendar. Filtered by the CURRENT follows at read time so an
// unfollow whose sync later failed can't keep ghost fixtures on Home.
export type UpcomingFixture = SnapshotFixture;

export function upcomingFixtures(): UpcomingFixture[] {
  const followed = new Set(loadFollowKeys());
  const pins = pinnedIds();
  return readJson<UpcomingFixture[]>(UPCOMING_FIXTURES_KEY, []).filter(
    (f) => pins.has(f.id) || f.followKeys.some((k) => followed.has(k)),
  );
}

// Sync status subscription — screens stay live no matter which layer
// (mount, foreground, background task, manual) triggered the run.
// lastError carries the most recent run's failure (null after success)
// so the UI never claims "up to date" over a sync that actually failed.
export interface SyncState {
  running: boolean;
  last: SyncOutcome | null;
  lastError: string | null;
}
type SyncListener = (state: SyncState) => void;
const listeners = new Set<SyncListener>();
let lastErrorMessage: string | null = null;

export function subscribeSync(fn: SyncListener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function lastSyncError(): string | null {
  return lastErrorMessage;
}

function emit(running: boolean): void {
  const state: SyncState = {
    running,
    last: lastSync(),
    lastError: lastErrorMessage,
  };
  for (const fn of listeners) fn(state);
}

export interface SyncOutcome {
  created: number;
  updated: number;
  deleted: number;
  recovered?: number; // ledger entries rebuilt from calendar (reinstall)
  pruned?: number; // orphan tagged events deleted (ledger invariant)
  calendarSkipped?: boolean; // fixtures refreshed, calendar not opted in
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
    const result = await runSyncInner();
    lastErrorMessage = result.ok ? null : messageOf(result.error);
    return result;
  } catch (e) {
    // Nothing inside may leak an uncaught rejection to the UI.
    lastErrorMessage = 'Sync failed — will retry';
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

// Shared by both sync paths: refresh the per-follow counts and the
// presentation snapshot Home/Schedule render from.
function writePresentationState(
  fixtures: Fixture[],
  follows: string[],
  prefs: CalendarPrefs,
  horizonStart: string,
  excluded: ReadonlySet<string>,
): void {
  const upcoming: Record<string, number> = {};
  for (const key of follows) upcoming[key] = 0;
  for (const f of fixtures) {
    if (f.startUtc < horizonStart) continue;
    if (excluded.has(f.id)) continue; // removed events don't count
    for (const key of f.followKeys) {
      if (key in upcoming) upcoming[key]++;
    }
  }
  writeJson(UPCOMING_KEY, upcoming);
  // The snapshot KEEPS excluded fixtures — Schedule shows them greyed
  // with a restore affordance; silent disappearance reads as a bug.
  const snapshot = upcomingSnapshot(
    fixtures,
    prefs,
    horizonStart,
    UPCOMING_FIXTURES_CAP,
  );
  writeJson(UPCOMING_FIXTURES_KEY, snapshot);
  // Age-based: an exclusion must survive an unfollow/re-follow cycle
  // and the display cap — never prune merely because a fixture is
  // absent from this fetch.
  pruneExclusions();
  prunePinStore();
}

// Calendar not (yet) opted in: keep the app's view of fixtures fresh
// without touching the calendar or triggering the OS permission prompt.
// The permission dialog must only ever follow the primed explainer.
async function runFixturesOnlyInner(): Promise<Result<SyncOutcome>> {
  const follows = loadFollowKeys();
  const prefs = loadPrefs();
  // Pinned fixtures may belong to nothing followed — their competition
  // key has to join the query or they are never fetched.
  const fixtures = await fetchFixturesForFollows(
    [...new Set([...follows, ...pinFollowKeys()])],
  );
  if (!fixtures.ok) return fixtures;
  // Same circuit breaker as the full path: an anomalous empty fetch
  // must not blank the app's schedule view.
  if (
    follows.length > 0 &&
    fixtures.value.length === 0 &&
    readJson<SnapshotFixture[]>(UPCOMING_FIXTURES_KEY, []).length > 0
  ) {
    return err({ kind: 'suspect-empty' });
  }
  writePresentationState(
    fixtures.value,
    follows,
    prefs,
    horizonStartFrom(Date.now()),
    loadExclusions(),
  );
  const outcome: SyncOutcome = {
    created: 0,
    updated: 0,
    deleted: 0,
    calendarSkipped: true,
    at: new Date().toISOString(),
  };
  writeJson(LAST_SYNC_KEY, outcome);
  return ok(outcome);
}

async function runSyncInner(): Promise<Result<SyncOutcome>> {
  if (calendarChoice() !== 'enabled') {
    // Reinstall healing: storage loss wipes ledger AND choice together,
    // but an existing OS grant is durable evidence of a prior opt-in
    // through the primed flow. The probe never prompts; when it finds a
    // grant we latch enabled and fall through so recovery + prune run —
    // otherwise events left in the calendar would silently rot.
    if (calendarChoice() === 'unset' && (await hasCalendarGrant())) {
      setCalendarChoice('enabled');
    } else {
      return runFixturesOnlyInner();
    }
  }
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
    const fixtures = await fetchFixturesForFollows(
      [...new Set([...follows, ...pinFollowKeys()])],
    );
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
    const excluded = loadExclusions();
    const pins = pinnedIds();
    const ops = planSync(
      fixtures.value,
      ledger,
      follows,
      prefs,
      horizonStart,
      excluded,
      pins,
    );

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

    // Presentation state written only after every calendar op applied,
    // and gated by the same desiredEventFor the planner uses — the app
    // never shows a fixture the calendar doesn't want (cancelled,
    // race-only excluded), and never runs ahead of a sync that failed.
    writePresentationState(fixtures.value, follows, prefs, horizonStart, excluded);
    writeJson(LAST_SYNC_KEY, outcome);
    return ok(outcome);
  }
}

// Auto-sync is only appropriate once the user has engaged: it prompts for
// calendar permission, which must never happen on a cold first open.
export function shouldAutoSync(): boolean {
  return (
    loadFollowKeys().length > 0 ||
    pinnedIds().size > 0 ||
    Object.keys(loadLedger()).length > 0
  );
}
