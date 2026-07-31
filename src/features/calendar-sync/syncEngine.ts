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
  applyTargetRequest,
  createFixtureEvent,
  deleteFixtureEvent,
  deleteVacatedCalendarIfOurs,
  ensureCalendarPermission,
  hasCalendarGrant,
  ensureCalendarTarget,
  EventInput,
  getCalendarObject,
  listTaggedEvents,
  ResolvedTarget,
  TargetRequest,
  updateFixtureEvent,
} from './data/calendarDriver';
import {
  entriesFromRecoveredEvents,
  orphanEventIds,
} from './domain/recovery';
import {
  clearedStray,
  movedEntry,
  planTargetMigration,
  strayEventIds,
  vacatedCalendarIds,
} from './domain/calendarMigration';
import {
  loadLedger,
  removeLedgerEntry,
  upsertLedgerEntry,
} from './data/ledger';
import {
  capOps,
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
  moved?: number; // events relocated to a new calendar target
  calendarSkipped?: boolean; // fixtures refreshed, calendar not opted in
  // Shape of the fixture query that fed this run. Recorded so a cap
  // cannot silently reappear at a new threshold: followKeyCount should
  // track the user's follows, and queryChunks should be
  // ceil(followKeyCount / 30). If either flatlines while follows grow,
  // something is truncating again.
  followKeyCount?: number;
  queryChunks?: number;
  // Ops this pass did not get to. A first sync can plan thousands of
  // creates; applying them all in one pass outlasts STALE_RUN_MS and
  // invites a second concurrent run. Non-zero means another pass is
  // queued, not that anything was lost.
  deferred?: number;
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

// One calendar-touching run at a time, whichever kind it is: an ordinary
// sync and a target switch both rewrite the ledger, so they must never
// interleave.
async function withSyncLock<T>(
  run: () => Promise<Result<T>>,
): Promise<Result<T>> {
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
    const result = await run();
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

export function runSync(): Promise<Result<SyncOutcome>> {
  return withSyncLock(runSyncInner);
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
    fixtures.value.fixtures.length === 0 &&
    readJson<SnapshotFixture[]>(UPCOMING_FIXTURES_KEY, []).length > 0
  ) {
    return err({ kind: 'suspect-empty' });
  }
  writePresentationState(
    fixtures.value.fixtures,
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
    followKeyCount: fixtures.value.keys,
    queryChunks: fixtures.value.chunks,
    at: new Date().toISOString(),
  };
  writeJson(LAST_SYNC_KEY, outcome);
  return ok(outcome);
}

// ─── Calendar target migration ────────────────────────────────────────

function inputFor(
  fixtureId: string,
  entry: { title: string; startUtc: string; endUtc: string; allDay?: boolean },
  prefs: CalendarPrefs,
): EventInput {
  const allDay = entry.allDay ?? false;
  return {
    fixtureId,
    title: entry.title,
    startUtc: entry.startUtc,
    endUtc: entry.endUtc,
    allDay,
    reminderMinutesBefore: allDay ? null : prefs.reminderMinutes,
  };
}

// Leftovers from an interrupted switch: an event we already replaced in
// the new calendar but never managed to delete from the old one. Drained
// at the top of every sync, so an abandoned migration converges without
// the user doing anything. The old calendar is not scanned by prune, so
// this is the ONLY thing that can clean them up.
async function drainStrays(): Promise<void> {
  for (const { fixtureId, eventId } of strayEventIds(loadLedger())) {
    const del = await deleteFixtureEvent(eventId);
    if (!del.ok) continue; // try again next sync; never lose the record
    const entry = loadLedger()[fixtureId];
    if (entry) upsertLedgerEntry(fixtureId, clearedStray(entry));
  }
}

export interface MoveProgress {
  moved: number;
  total: number;
}

// Move every ledgered fixture that still lives somewhere else into the
// target: create in the new calendar, repoint the ledger, delete the
// old. Idempotent — re-running after a kill picks up exactly what's
// left (see domain/calendarMigration.ts for the convergence argument).
async function migrateToTarget(
  targetCalendarId: string,
  calObj: Parameters<typeof createFixtureEvent>[0],
  prefs: CalendarPrefs,
  onProgress?: (p: MoveProgress) => void,
): Promise<Result<number>> {
  const steps = planTargetMigration(loadLedger(), targetCalendarId);
  if (steps.length === 0) return ok(0);
  let moved = 0;
  onProgress?.({ moved, total: steps.length });
  for (const step of steps) {
    const created = await createFixtureEvent(
      calObj,
      inputFor(step.fixtureId, step.entry, prefs),
    );
    if (!created.ok) return created;
    // ONE write: the ledger now points at the new event and owes the old
    // one a delete. Splitting these would strand an event in a calendar
    // nothing scans again.
    upsertLedgerEntry(
      step.fixtureId,
      movedEntry(step.entry, created.value, targetCalendarId),
    );
    const del = await deleteFixtureEvent(step.entry.eventId);
    if (del.ok) {
      const entry = loadLedger()[step.fixtureId];
      if (entry) upsertLedgerEntry(step.fixtureId, clearedStray(entry));
    }
    moved++;
    onProgress?.({ moved, total: steps.length });
  }
  return ok(moved);
}

// Changing where fixtures are written. Everything already in a calendar
// MOVES — never orphaned, never duplicated — and a calendar of ours that
// we emptied on the way out is removed. A user's calendar never is.
export async function switchCalendarTarget(
  request: TargetRequest,
  onProgress?: (p: MoveProgress) => void,
): Promise<Result<{ target: ResolvedTarget; moved: number }>> {
  return withSyncLock(async () => {
    // The OS dialog may only ever follow the primed explainer, so this
    // path never gets to be the thing that raises it. The picker routes
    // an unconnected user to priming instead of calling us.
    if (calendarChoice() !== 'enabled') {
      return err({ kind: 'unknown', message: 'Connect your calendar first.' });
    }
    const perm = await ensureCalendarPermission();
    if (!perm.ok) return perm;
    const before = loadLedger();
    const target = await applyTargetRequest(request);
    if (!target.ok) return target;

    const calObj = await getCalendarObject(target.value.calendarId);
    if (!calObj.ok) return calObj;
    await drainStrays();
    const moved = await migrateToTarget(
      target.value.calendarId,
      calObj.value,
      loadPrefs(),
      onProgress,
    );
    if (!moved.ok) return moved;

    // Bin what we left behind, but only ever our own empty calendar.
    for (const id of vacatedCalendarIds(before, target.value.calendarId)) {
      await deleteVacatedCalendarIfOurs(id);
    }
    // Reconcile the rest — prune in the new target catches any duplicate
    // a previously interrupted attempt left there.
    const sync = await runSyncInner();
    if (!sync.ok) return sync;
    return ok({ target: target.value, moved: moved.value });
  });
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
    const target = await ensureCalendarTarget();
    if (!target.ok) return target;
    const calendarId = target.value.calendarId;

    // Reinstall recovery: an empty ledger with tagged events already in
    // the calendar means the app's storage was lost (uninstall) — the
    // events are the durable record. Rebuild before planning so the sync
    // updates instead of duplicating. Only OUR events are adopted: in a
    // user's calendar everything else is invisible to us.
    let recovered = 0;
    if (Object.keys(loadLedger()).length === 0) {
      const scan = await listTaggedEvents(calendarId);
      if (scan.ok && scan.value.length > 0) {
        const rebuilt = entriesFromRecoveredEvents(scan.value, calendarId);
        for (const [fixtureId, entry] of Object.entries(rebuilt.ledger)) {
          upsertLedgerEntry(fixtureId, entry);
        }
        for (const eventId of rebuilt.surplusEventIds) {
          await deleteFixtureEvent(eventId);
        }
        recovered = Object.keys(rebuilt.ledger).length;
      }
    }
    const calObj = await getCalendarObject(calendarId);
    if (!calObj.ok) return calObj;

    const follows = loadFollowKeys();
    const prefs = loadPrefs();

    // Self-healing target moves. An interrupted switch leaves strays; a
    // target that changed under us (the chosen calendar was deleted in
    // Google Calendar, say) leaves ledger entries pointing at a calendar
    // we no longer write to. Both are repaired here, before planning, so
    // the plan below only ever deals with events in the current target.
    await drainStrays();
    const moved = await migrateToTarget(calendarId, calObj.value, prefs);
    if (!moved.ok) return moved;

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
      fixtures.value.fixtures.length === 0 &&
      Object.keys(ledger).length > 0
    ) {
      return err({ kind: 'suspect-empty' });
    }

    const horizonStart = horizonStartFrom(Date.now());
    const excluded = loadExclusions();
    const pins = pinnedIds();
    const ops = planSync(
      fixtures.value.fixtures,
      ledger,
      follows,
      prefs,
      horizonStart,
      excluded,
      pins,
    );

    // Bounded pass: corrections first, creates fill the remainder.
    const { apply, deferred } = capOps(ops);
    const outcome: SyncOutcome = {
      created: 0,
      updated: 0,
      deleted: 0,
      recovered,
      ...(deferred > 0 ? { deferred } : {}),
      ...(moved.value > 0 ? { moved: moved.value } : {}),
      followKeyCount: fixtures.value.keys,
      queryChunks: fixtures.value.chunks,
      at: new Date().toISOString(),
    };

    for (const op of apply) {
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
          calendarId,
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
    // listTaggedEvents is the ownership gate: in a user's calendar it
    // returns ONLY events carrying our tag, so an appointment of theirs
    // can never become an "orphan".
    const postScan = await listTaggedEvents(calendarId);
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
    writePresentationState(
      fixtures.value.fixtures,
      follows,
      prefs,
      horizonStart,
      excluded,
    );
    writeJson(LAST_SYNC_KEY, outcome);
    // Drain the remainder on the next pass. Reuses the lock's existing
    // coalescing hop rather than recursing here, so the run finishes and
    // releases before the next one starts.
    if (deferred > 0) rerunQueued = true;
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
