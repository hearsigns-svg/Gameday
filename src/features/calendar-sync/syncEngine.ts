// Sync orchestrator: permission → dedicated calendar → fixture cache →
// pure plan → apply. The ledger is persisted after EVERY operation, so a
// sync killed mid-run converges on the next run. One run at a time.

import { currentLanguage, LANGUAGE_NAMES, t } from '../../core/i18n';
import { AppError, err, messageOf, ok, Result } from '../../core/result';
import { showToast } from '../../core/toast';
import { readJson, writeJson } from '../../core/storage';
import { planEntitlement } from '../../core/entitlementStore';
import { Fixture } from '../fixtures/domain/fixture';
import { dedupeSameEvent } from '../fixtures/domain/sameBout';
import {
  fetchFixturesByIds,
  fetchFixturesForFollows,
  missingFixtureIds,
} from '../fixtures/data/fixturesRepo';
import {
  calendarPrefOf,
  fixtureWantedByFollows,
  loadFollowables,
  loadFollowKeys,
  toInclusionFollow,
} from '../follows/data/followStore';
import { inheritedColourResolver, sportCalendarColourFor } from './domain/colourLayers';
import { sportCalendarTitle } from './sportCalendarNames';
import {
  followQueryKeys,
  seriesScopesFrom,
  tournamentTierOverridesFrom,
} from '../follows/domain/followScopes';
import { calendarGroupOf } from '../follows/domain/sportCalendarGroup';
import { activeBackend } from './data/calendarBackend';
import { calendarChoice, setCalendarChoice } from './data/calendarChoice';
import { calendarConnection } from './data/calendarConnection';
import { grantMayLatch } from './domain/calendarConnection';
import {
  loadEventSettings,
  pruneEventSettingsStore,
} from './data/eventSettingsStore';
import { loadExclusions, pruneExclusions } from './data/exclusionStore';
import { pinFollowKeys, pinnedIds, prunePinStore } from './data/pinStore';
import { loadPrefs } from './data/prefsStore';
import { fetchTournamentChildrenFor } from './data/tournamentChildren';
import { applyTournamentTiers } from './domain/tournamentTiers';
import {
  assumedAppliedReminder,
  EventSettingsMap,
  extraRemindersFor,
  reminderMinutesFor,
  allDayReminderFor,
} from './domain/eventSettings';
import { CalendarPrefs } from './domain/prefs';
import {
  applyTargetRequest,
  calendarCapabilities,
  CalendarHandle,
  conformSportCalendarColours,
  createFixtureEvents,
  deleteFixtureEvents,
  updateFixtureEvents,
  writeBatchSize,
  createFixtureEvent,
  createSportCalendar,
  currentTargetId,
  deleteFixtureEvent,
  deleteSportCalendarIfEmpty,
  deleteVacatedCalendarIfOurs,
  ensureCalendarPermission,
  hasCalendarGrant,
  ensureCalendarTarget,
  EventInput,
  getCalendarObject,
  listTaggedEvents,
  nativeSyncRoute,
  ResolvedTarget,
  surveyCalendars,
  TargetRequest,
  updateFixtureEvent,
  vacateTargetIfEmpty,
} from './data/driver';
import { isScanAnomaly, orphanEventIds, RecoveredEvent } from './domain/recovery';
import { pastEntriesWithRecordGone, pastRecordIds } from './domain/recordGone';
import {
  drainStrayEvents,
  relocate,
  RelocationDeps,
  WrittenEvent,
} from './data/layoutRelocation';
import {
  forgetSportCalendar,
  pendingLayoutMove,
  recordSportCalendar,
  setPendingLayoutMove,
  sportCalendarIds,
} from './data/sportCalendarStore';
import {
  CalendarLayout,
  layoutOf,
  lookupIdOf,
  mergeRecoveredCalendars,
  Placement,
  planLayoutRelocation,
  RelocationStep,
  unreferencedCalendarIds,
} from './domain/sportCalendars';
import { isEndPast, isPast } from '../fixtures/domain/horizon';
import {
  planTargetMigration,
  strayEventIds,
  vacatedCalendarIds,
} from './domain/calendarMigration';
import {
  loadLedger,
  removeLedgerEntry,
  stampMissingReminders,
  upsertLedgerEntry,
} from './data/ledger';
import {
  DesiredEvent,
  desiredEventFor,
  DOWNGRADE_DELETE_CAP,
  horizonStartFrom,
  isRunAbandoned,
  Ledger,
  LedgerEntry,
  nowFromHorizon,
  orderOps,
  passBudgetMs,
  planSync,
  shouldStopPass,
  SnapshotFixture,
  SyncOp,
  upcomingSnapshot,
} from './domain/syncPlan';
import { fixturesInWindow } from './domain/schedulePaging';
import { presentationFixtures } from './domain/presentation';

const LAST_SYNC_KEY = 'lastSync.v1';
const UPCOMING_KEY = 'upcomingByFollow.v1';
const UPCOMING_FIXTURES_KEY = 'upcomingFixtures.v1';
// The language the calendar's events were last written in (Phase C) —
// compared against the device language at each pass so the deliberate
// language-switch rewrite can announce itself exactly once.
const CALENDAR_LANGUAGE_KEY = 'calendarLanguage.v1';

// Upcoming-fixture count per followed key, refreshed every sync.
export function upcomingByFollow(): Record<string, number> {
  return readJson<Record<string, number>>(UPCOMING_KEY, {});
}

// Presentation snapshot of what's ahead, refreshed after every applied
// sync so Home and Schedule render real fixtures offline. Read-only
// display data — the ledger remains the only record of what's in the
// calendar. Filtered by the CURRENT follows at read time so an
// unfollow whose sync later failed can't keep ghost fixtures on Home.
// UNCAPPED (Round 5 ruling 4): the FULL upcoming set, sorted by start —
// Schedule pages it by date window, Home takes the soonest few.
export type UpcomingFixture = SnapshotFixture;

export function upcomingFixtures(): UpcomingFixture[] {
  const followed = new Set(loadFollowKeys());
  const pins = pinnedIds();
  return readJson<UpcomingFixture[]>(UPCOMING_FIXTURES_KEY, []).filter(
    (f) => pins.has(f.id) || f.followKeys.some((k) => followed.has(k)),
  );
}

// The same set windowed by start: [fromUtc, toUtc), same follow/pin
// filter. The windowing rule is the pure one Schedule pages with
// (domain/schedulePaging.ts), so a screen reading one month and a
// screen reading everything can never disagree about a boundary.
export function upcomingFixturesInWindow(
  fromUtc: string,
  toUtc: string,
): UpcomingFixture[] {
  return fixturesInWindow(upcomingFixtures(), fromUtc, toUtc);
}

// Sync status subscription — screens stay live no matter which layer
// (mount, foreground, background task, manual) triggered the run.
// lastError carries the most recent run's failure (null after success)
// so the UI never claims "up to date" over a sync that actually failed.
export interface SyncState {
  running: boolean;
  last: SyncOutcome | null;
  lastError: string | null;
  // The KIND behind lastError (null after success). A screen that must
  // act differently on ONE failure class reads this, never the message:
  // the Google-connected row offers a reconnect only on 'auth-expired'
  // (Round 4 B4 item 2).
  lastErrorKind: AppError['kind'] | null;
}
type SyncListener = (state: SyncState) => void;
const listeners = new Set<SyncListener>();
let lastErrorMessage: string | null = null;
let lastErrorKindValue: AppError['kind'] | null = null;

export function subscribeSync(fn: SyncListener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function lastSyncError(): string | null {
  return lastErrorMessage;
}

export function lastSyncErrorKind(): AppError['kind'] | null {
  return lastErrorKindValue;
}

function emit(running: boolean): void {
  const state: SyncState = {
    running,
    last: lastSync(),
    lastError: lastErrorMessage,
    lastErrorKind: lastErrorKindValue,
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
  // What the pass actually cost. Recorded so real-world throughput —
  // against a CLOUD-backed calendar, which no simulator here could
  // measure — becomes visible once this ships.
  opsApplied?: number;
  passMs?: number;
  // Events deleted because recovery found MORE THAN ONE tagged event for
  // the same fixture id. Counted apart from `deleted` so the one-time
  // corrective pass — every iOS install carrying historical duplicates
  // will run one — is distinguishable in the wild from an ordinary
  // unfollow.
  surplusDeleted?: number;
  // The impossible state: a calendar scan returned no tagged events while
  // the ledger holds entries. Recorded rather than acted on; see the guard
  // in runSyncInner.
  scanAnomaly?: boolean;
  scannedTagged?: number;
  ledgerEntries?: number;
  // Finished events whose fixture record was asked about this pass, and
  // those removed because the store confirmed the record gone (owner
  // ruling 2026-09-24). Counted apart from `deleted`, the way
  // surplusDeleted is: the future-only rule's one exception must be
  // visible in the wild as itself.
  pastChecked?: number;
  recordGone?: number;
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
// Liveness, refreshed by the running pass. NOT the start time: a slow but
// alive run must never be mistaken for an abandoned one.
let syncHeartbeatAt = 0;
let rerunQueued = false;
// Callers waiting on the run queued behind the current one (see
// runSyncAwaited). Handed that run's result when it completes.
let queuedWaiters: Array<(r: Result<SyncOutcome>) => void> = [];

// Called from every long-running loop so the lock can tell "still working"
// from "died mid-flight". Deliberately NOT a per-op timeout: abandoning a
// native calendar write leaves its commit state indeterminate, which is
// precisely how untracked events get created.
function beat(): void {
  syncHeartbeatAt = Date.now();
}

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
  const silentFor = Date.now() - syncHeartbeatAt;
  if (syncRunning && !isRunAbandoned(syncHeartbeatAt, Date.now(), STALE_RUN_MS)) {
    // Coalesce: whatever changed (new follow, unfollow, pref) is picked
    // up by one queued re-run after the current run finishes. Without
    // this, an unfollow during a long sync silently never deletes.
    rerunQueued = true;
    return err({ kind: 'sync-in-progress' });
  }
  if (syncRunning) {
    console.warn(
      `[gameday] taking over abandoned sync (no heartbeat for ${Math.round(silentFor / 1000)}s)`,
    );
  }
  syncRunning = true;
  beat();
  emit(true);
  try {
    const result = await run();
    lastErrorMessage = result.ok ? null : messageOf(result.error);
    lastErrorKindValue = result.ok ? null : result.error.kind;
    // Logcat is the only instrument a hardware session has. A wedged
    // sync aborted invisibly for forty minutes on a physical Pixel
    // because every failure exit was silent: the UI string above is
    // in-memory, and the foreground call sites discard the Result.
    if (!result.ok) {
      // The RAW error, not messageOf: that maps kinds to user-facing
      // copy, and "Something went wrong — we will retry." cost a second
      // 17-minute build-and-reinstall cycle to learn nothing. Diagnostic
      // channels carry diagnostics.
      console.warn(`[gameday] sync failed: ${JSON.stringify(result.error)}`);
    }
    return result;
  } catch (e) {
    // Nothing inside may leak an uncaught rejection to the UI.
    lastErrorMessage = t('core.status.updateFailed');
    lastErrorKindValue = 'unknown';
    // Same lesson as the Result branch above, for the THROW exit: this
    // was the one failure path with no logcat line, which made "a run
    // threw" indistinguishable from "no run happened" on a device.
    console.warn(`[gameday] sync threw: ${e}`);
    return err({ kind: 'unknown', message: `sync failed: ${e}` });
  } finally {
    syncRunning = false;
    syncHeartbeatAt = 0;
    emit(false);
    if (rerunQueued) {
      rerunQueued = false;
      const waiters = queuedWaiters;
      queuedWaiters = [];
      void runSync().then((r) => {
        for (const w of waiters) w(r);
      });
    }
  }
}

export function runSync(): Promise<Result<SyncOutcome>> {
  return withSyncLock(runSyncInner);
}

// runSync for a caller that must know how ITS change landed (the
// per-follow calendar glyph reverts when the calendar write fails). A
// run already in flight read the preferences before the change, so the
// change lands in the rerun queued behind it — and this resolves with
// THAT run's result instead of reading "coalesced" as success. The
// waiter is registered synchronously with the queue flag, so the
// running pass's finally can never hand the rerun out before it joins.
export function runSyncAwaited(): Promise<Result<SyncOutcome>> {
  if (syncRunning && !isRunAbandoned(syncHeartbeatAt, Date.now(), STALE_RUN_MS)) {
    rerunQueued = true;
    return new Promise((resolve) => {
      queuedWaiters.push(resolve);
    });
  }
  return runSync();
}

// Outbound channels other than the calendar (Round 5: system-notification
// reminders) subscribe here and receive the refreshed fixture set after
// EVERY sync path — connected or fixtures-only — with the prefs and
// exclusions the planner used. A hook failure is logged, never fatal:
// a notification channel must not be able to fail a sync.
export interface FixturesRefreshed {
  fixtures: readonly Fixture[];
  prefs: CalendarPrefs;
  excluded: ReadonlySet<string>;
  calendarConnected: boolean;
}
type RefreshHook = (event: FixturesRefreshed) => void | Promise<void>;
const refreshHooks = new Set<RefreshHook>();
export function onFixturesRefreshed(hook: RefreshHook): () => void {
  refreshHooks.add(hook);
  return () => {
    refreshHooks.delete(hook);
  };
}
function emitFixturesRefreshed(event: FixturesRefreshed): void {
  for (const hook of refreshHooks) {
    try {
      const r = hook(event);
      if (r && typeof (r as Promise<void>).catch === 'function') {
        (r as Promise<void>).catch((e) =>
          console.warn(`[kickoffcal] refresh hook failed: ${e}`),
        );
      }
    } catch (e) {
      console.warn(`[kickoffcal] refresh hook failed: ${e}`);
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
  // Counts are keyed by the FOLLOW's own key (what Following reads),
  // counted against its scope-expanded QUERY keys — a final-round golf
  // follow's fixtures carry only the scoped key, and its caption must
  // not read empty for that (Prompt 11).
  const followables = loadFollowables();
  const upcoming: Record<string, number> = {};
  for (const key of follows) upcoming[key] = 0;
  for (const fw of followables) upcoming[fw.key] = 0;
  const queryKeysByFollow = followables.map(
    (fw) => [fw.key, followQueryKeys(fw)] as const,
  );
  const countNowMs = nowFromHorizon(horizonStart);
  for (const f of fixtures) {
    // Not yet FINISHED, the same rule the snapshot uses (P0 2026-09-02):
    // a live tournament block still counts for its follow.
    if (isPast(f, countNowMs)) continue;
    if (excluded.has(f.id)) continue; // removed events don't count
    const seen = new Set<string>();
    for (const [key, queryKeys] of queryKeysByFollow) {
      if (queryKeys.some((k) => f.followKeys.includes(k))) {
        upcoming[key]++;
        seen.add(key);
      }
    }
    // Pin keys and any other bare entries keep their original rule.
    for (const key of f.followKeys) {
      if (key in upcoming && !seen.has(key)) upcoming[key]++;
    }
  }
  writeJson(UPCOMING_KEY, upcoming);
  // The snapshot KEEPS excluded fixtures — Schedule shows them greyed
  // with a restore affordance; silent disappearance reads as a bug.
  // And it keeps EVERYTHING upcoming (Round 5 ruling 4): no display cap
  // — the screens window it by date.
  const snapshot = upcomingSnapshot(
    fixtures,
    prefs,
    horizonStart,
    seriesScopesFrom(loadFollowables()),
    new Set(pinnedIds()),
  );
  writeJson(UPCOMING_FIXTURES_KEY, snapshot);
  // Age-based: an exclusion must survive an unfollow/re-follow cycle —
  // never prune merely because a fixture is absent from this fetch.
  pruneExclusions();
  prunePinStore();
  pruneEventSettingsStore();
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
  // One real event, one entry: the same bout or joint tennis
  // tournament can arrive from two providers (sameBout.ts).
  const deduped = dedupeSameEvent(
    fixtures.value.fixtures,
    pinnedIds(),
    new Set(follows),
  );
  const excludedNow = loadExclusions();
  writePresentationState(
    deduped,
    follows,
    prefs,
    horizonStartFrom(Date.now()),
    excludedNow,
  );
  emitFixturesRefreshed({
    fixtures: deduped,
    prefs,
    excluded: excludedNow,
    calendarConnected: false,
  });
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
  entry: {
    title: string;
    startUtc: string;
    endUtc: string;
    allDay?: boolean;
    reminderMinutes?: number | null;
    note?: string;
    colour?: string;
  },
  prefs: CalendarPrefs,
  settings: EventSettingsMap,
): EventInput {
  const allDay = entry.allDay ?? false;
  return {
    // What the event SAID and how it LOOKED travel with it too
    // (2026-09-24): its note, and a per-event colour — a move used to
    // drop both, and the planner (which diffs neither the note nor, once
    // the ledger carries it forward, the colour) never put them back.
    ...(entry.note ? { note: entry.note } : {}),
    ...(entry.colour ? { colour: entry.colour } : {}),
    fixtureId,
    title: entry.title,
    startUtc: entry.startUtc,
    endUtc: entry.endUtc,
    allDay,
    // A MOVE IS NOT A RESET. This rebuilds the event in a different
    // calendar, so it must carry the same reminder the old one did —
    // the per-event override first, the preference behind it. Reading
    // only the preference here silently discarded a per-event choice
    // every time the calendar target changed.
    reminderMinutesBefore: reminderMinutesFor(
      fixtureId,
      settings,
      prefs,
      allDay,
    ),
    extraRemindersBefore: extraRemindersFor(fixtureId, settings, prefs, allDay),
    allDayReminder: allDayReminderFor(fixtureId, settings, prefs, allDay),
  };
}

// Leftovers from an interrupted switch: an event we already replaced in
// the new calendar but never managed to delete from the old one. Drained
// at the top of every sync, so an abandoned migration converges without
// the user doing anything. The old calendar is not scanned by prune, so
// this is the ONLY thing that can clean them up.
async function drainStrays(): Promise<void> {
  // Each leftover names its calendar (2026-09-24): a REST delete has to.
  // Fifty to a request where the layer takes a batch (2026-09-25).
  const size = writeBatchSize();
  await drainStrayEvents({
    ledger: loadLedger,
    upsert: upsertLedgerEntry,
    deleteEvent: deleteFixtureEvent,
    beat,
    ...(size > 1 ? { batch: { size, deleteEvents: deleteFixtureEvents } } : {}),
  });
}

// What a moved event was written with — recorded so the next plan
// compares against it.
function writtenFrom(eventId: string, input: EventInput): WrittenEvent {
  return {
    eventId,
    reminderMinutes: input.reminderMinutesBefore,
    allDayReminder: input.allDayReminder,
    extraReminders: input.extraRemindersBefore,
    ...(input.note ? { note: input.note } : {}),
    colour: input.colour ?? null,
  };
}

// A move's writes MANY AT ONCE (owner ruling 2026-09-25): where the
// calendar layer takes a batch (Google, fifty to a request), the move's
// creates and deletes go that way — a move of hundreds of games was
// spending its minutes on one round trip per write. The device's own
// store is local and keeps its one-event step (no batch).
function moveBatch(
  inputOf: (step: RelocationStep) => EventInput,
  handleFor: (calendarId: string) => Promise<Result<CalendarHandle>>,
): RelocationDeps['batch'] {
  const size = writeBatchSize();
  if (size <= 1) return undefined;
  return {
    size,
    create: async (items) => {
      const handles: CalendarHandle[] = [];
      for (const it of items) {
        const h = await handleFor(it.calendarId);
        if (!h.ok) return h;
        handles.push(h.value);
      }
      const inputs = items.map((it) => inputOf(it.step));
      const made = await createFixtureEvents(
        items.map((_it, k) => ({ handle: handles[k], input: inputs[k] })),
      );
      if (!made.ok) return made;
      return ok(made.value.map((r, k) => (r.ok ? ok(writtenFrom(r.value, inputs[k])) : r)));
    },
    deleteEvents: (items) => deleteFixtureEvents(items),
  };
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
  settings: EventSettingsMap,
  onProgress?: (p: MoveProgress) => void,
): Promise<Result<number>> {
  const steps = planTargetMigration(loadLedger(), targetCalendarId);
  if (steps.length === 0) return ok(0);
  onProgress?.({ moved: 0, total: steps.length });
  // The one move routine (data/layoutRelocation.ts), every step aimed at
  // the target: create, ONE ledger write (repoint + owe the delete), the
  // delete, the debt cleared — fifty at a time where the layer batches.
  // No time budget: a target switch runs to the end, as it always has.
  const inputOf = (step: RelocationStep) => inputFor(step.fixtureId, step.entry, prefs, settings);
  const rel = await relocate(
    steps.map((step) => ({ ...step, to: { calendarId: targetCalendarId } })),
    {
      ledger: loadLedger,
      upsert: upsertLedgerEntry,
      calendarFor: async () => ok(targetCalendarId),
      create: async (_calendarId, step) => {
        const input = inputOf(step);
        const made = await createFixtureEvent(calObj, input);
        if (!made.ok) return made;
        return ok(writtenFrom(made.value, input));
      },
      deleteEvent: (eventId, calendarId) => deleteFixtureEvent(eventId, calendarId),
      stop: () => false,
      beat,
      onMoved: (moved) => onProgress?.({ moved, total: steps.length }),
      batch: moveBatch(inputOf, async () => ok(calObj)),
    },
  );
  if (!rel.ok) return rel;
  return ok(rel.value.moved);
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
    // an unconnected user to priming instead of calling us. Connected
    // means THROUGH A WRITE PATH (B4 item 5), not merely opted in.
    if (calendarConnection() !== 'connected') {
      return err({ kind: 'unknown', message: 'Connect your calendar first.' });
    }
    // A calendar per sport has no one target to switch (the picker is
    // absent in that layout); refused here too, never half-applied.
    if (layoutOf(loadPrefs()) === 'per-sport') {
      return err({ kind: 'unknown', message: 'Each sport has its own calendar.' });
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
      loadEventSettings(),
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

// ─── A calendar per sport (owner brief 2026-09-24) ────────────────────
//
// The layout (domain/sportCalendars.ts) decides WHERE events live, never
// which. These are the pass's effects for it; the move itself is
// data/layoutRelocation.ts, the same create → repoint-and-owe → delete
// step a target switch takes.

// "KickOffCal · <the sport as the Following row names it>" — the region's
// and language's word at the moment the calendar is created. Never
// renamed after: from then on the calendar is the user's to edit.

// A sport's calendar: the recorded one, or a new one — created, in its
// sport's colour, and RECORDED before any event goes in it (the prune and
// the empty-calendar sweep work from that record), the first time the
// sport has an event.
async function sportCalendarFor(group: string): Promise<Result<string>> {
  const known = sportCalendarIds()[group];
  if (known) return ok(known);
  // The sport's picked colour, else its own distinct one (2026-09-25).
  const colour = sportCalendarColourFor(group, loadPrefs().sportColours);
  const created = await createSportCalendar(sportCalendarTitle(group), colour);
  if (!created.ok) return created;
  recordSportCalendar(group, created.value);
  // Recorded first, THEN painted where the colour did not come with the
  // calendar (Google) — and a paint that fails is the next pass's.
  await conformSportCalendarColours([{ calendarId: created.value, hex: colour }]);
  return created;
}

interface OurCalendars {
  present: Set<string>;
  // "KickOffCal · …" calendars provably ours but not in our record
  // (provider only): recovered from, pruned, and removed once empty.
  unrecordedSport: string[];
}

// Every calendar a pass may rely on, checked against the store ONCE. A
// recorded sport calendar that is gone — the user deleted it in their
// calendar app — is forgotten here, before anything is placed by it: its
// sport's next event creates a fresh one, and the move recreates what was
// in it there.
async function surveyOurCalendars(
  layout: CalendarLayout,
  home: string | null,
): Promise<Result<OurCalendars>> {
  const recorded = Object.values(sportCalendarIds());
  const candidates = new Set<string>(recorded);
  for (const e of Object.values(loadLedger())) {
    candidates.add(e.calendarId);
    if (e.strayCalendarId) candidates.add(e.strayCalendarId);
  }
  if (home !== null) candidates.add(home);
  // The combined layout's calendar was resolved a moment ago.
  if (layout === 'combined' && home !== null) candidates.delete(home);
  const survey = await surveyCalendars([...candidates], recorded);
  if (!survey.ok) return survey;
  const present = new Set(survey.value.present);
  if (layout === 'combined' && home !== null) present.add(home);
  for (const id of survey.value.unrecordedSport) present.add(id);
  for (const id of recorded) if (!present.has(id)) forgetSportCalendar(id);
  return ok({ present, unrecordedSport: survey.value.unrecordedSport });
}

// Fixture documents asked for by id that do not exist — not asked about
// again this session. Their events stay where they are.
const fixturesNotFound = new Set<string>();

// The sport of every ledgered event: stamped on the entry when it was
// written; else read off this pass's fixtures; else looked up by id — a
// finished game is never fetched again, and a move places EVERY event.
// `complete` is false when the lookup failed: what it would have placed
// stays put this pass, and the move is not yet done.
async function sportsOfLedger(
  ledger: Ledger,
  fixtures: readonly Fixture[],
): Promise<{ groups: Map<string, string>; complete: boolean }> {
  const byId = new Map(fixtures.map((f) => [f.id, f] as const));
  const groups = new Map<string, string>();
  const ask = new Set<string>();
  for (const [fixtureId, entry] of Object.entries(ledger)) {
    if (entry.sport) {
      groups.set(fixtureId, entry.sport);
      continue;
    }
    const f = byId.get(fixtureId) ?? byId.get(lookupIdOf(fixtureId));
    if (f) groups.set(fixtureId, calendarGroupOf(f));
    else if (!fixturesNotFound.has(lookupIdOf(fixtureId))) ask.add(lookupIdOf(fixtureId));
  }
  if (ask.size === 0) return { groups, complete: true };
  const found = await fetchFixturesByIds([...ask]);
  if (!found.ok) return { groups, complete: false };
  const fetched = new Map(found.value.map((f) => [f.id, f] as const));
  for (const id of ask) if (!fetched.has(id)) fixturesNotFound.add(id);
  for (const fixtureId of Object.keys(ledger)) {
    if (groups.has(fixtureId)) continue;
    const f = fetched.get(lookupIdOf(fixtureId));
    if (f) groups.set(fixtureId, calendarGroupOf(f));
  }
  return { groups, complete: true };
}

function sportPlacement(group: string | undefined): Placement | null {
  if (!group) return null;
  const id = sportCalendarIds()[group];
  return id ? { calendarId: id, group } : { calendarId: null, group };
}

// FINISHED EVENTS WHOSE RECORD IS GONE (owner ruling 2026-09-24): the
// one deliberate exception to the future-only rule. Every pass, in either
// layout, the store is asked about every finished event's fixture record
// (counted — one read per 30); an event whose record it confirms is gone
// is removed with its ledger entry. A check that could not be made removes
// nothing (rule 4). Capped per pass like the other removals; the queued
// pass takes the rest.
async function removeFinishedWithRecordGone(): Promise<{
  checked: number;
  removed: number;
  heldBack: number;
}> {
  const nowMs = Date.now();
  const ids = pastRecordIds(loadLedger(), nowMs);
  if (ids.length === 0) return { checked: 0, removed: 0, heldBack: 0 };
  const missing = await missingFixtureIds(ids);
  beat();
  if (!missing.ok) return { checked: 0, removed: 0, heldBack: 0 };
  const gone = pastEntriesWithRecordGone(loadLedger(), missing.value, nowMs);
  let removed = 0;
  for (const fixtureId of gone.slice(0, DOWNGRADE_DELETE_CAP)) {
    const entry = loadLedger()[fixtureId];
    if (!entry) continue;
    const del = await deleteFixtureEvent(entry.eventId, entry.calendarId);
    if (!del.ok) continue; // kept, with its protection; the next pass retries
    // A leftover a move still owes goes with it (best effort — the prune
    // finds it in any calendar of ours if this fails).
    if (entry.strayEventId) await deleteFixtureEvent(entry.strayEventId, entry.strayCalendarId);
    removeLedgerEntry(fixtureId);
    removed++;
    beat();
  }
  return {
    checked: ids.length,
    removed,
    heldBack: Math.max(0, gone.length - DOWNGRADE_DELETE_CAP),
  };
}

async function runSyncInner(): Promise<Result<SyncOutcome>> {
  // THE GATE (Round 4 B4 item 5): connected means opted in AND a write
  // path exists. The choice alone used to decide here, and a legacy
  // Android install — choice latched 'enabled' by its ledger, backend
  // still 'provider' after Prompt 28 — sailed through and resumed
  // writing into the user's own Google calendar through the retired
  // provider path, including after a Disconnect. 'needs-google-connect'
  // now runs fixtures-only like 'off': the app's view stays fresh, the
  // calendar is never touched, and every surface shows the Connect path.
  if (calendarConnection() !== 'connected') {
    // Reinstall healing: storage loss wipes ledger AND choice together,
    // but durable evidence of a prior opt-in — an OS grant on the
    // provider route, the stored Google connection under REST — may
    // re-latch enabled so recovery + prune run, otherwise events left in
    // the calendar would silently rot. The probe never prompts. It
    // latches ONLY where enabled would actually connect: a reinstalled
    // legacy Android phone still holds an OS grant, and latching from it
    // would hide the Connect path behind a choice that reaches nothing.
    if (
      grantMayLatch(calendarChoice(), nativeSyncRoute(), activeBackend()) &&
      (await hasCalendarGrant())
    ) {
      setCalendarChoice('enabled');
    } else {
      return runFixturesOnlyInner();
    }
  }
  {
    const perm = await ensureCalendarPermission();
    if (!perm.ok) return perm;
    // THE LAYOUT (owner brief 2026-09-24): one calendar target, or a
    // calendar per sport. The combined layout resolves — and if need be
    // creates — its calendar every pass, as it always has. The per-sport
    // layout must never create it: it only reads where it was, so the
    // events still in it can move out and the emptied calendar can go.
    const layout = layoutOf(loadPrefs());
    let home: string | null;
    if (layout === 'combined') {
      const target = await ensureCalendarTarget();
      if (!target.ok) return target;
      home = target.value.calendarId;
    } else {
      home = currentTargetId();
    }

    // Reminders became OURS to write in Prompt 16. Entries from before
    // that carry no record of what was applied, and unknown is planned
    // as a mismatch — so stamp the assumption ONCE rather than rewrite
    // every event in the calendar on the first sync after upgrading.
    //
    // BEFORE RECOVERY, DELIBERATELY. Entries recovery is about to build
    // are read back from the calendar, and their alarms cannot be read
    // at all on Android (a calendar-scoped listEvents returns none), so
    // what those events carry is genuinely unknown. Stamping them would
    // assert an assumption about somebody else's phone; leaving them
    // unknown makes the next pass re-assert OUR reminder on each one,
    // which is what "we own reminders" has to mean after a reinstall.
    stampMissingReminders((entry) =>
      assumedAppliedReminder(entry.allDay, loadPrefs()),
    );

    const survey = await surveyOurCalendars(layout, home);
    if (!survey.ok) return survey;
    const { present, unrecordedSport } = survey.value;
    // Each sport calendar in the colour it should wear (2026-09-25): the
    // sport's picked colour, else the one it was made in — painted until
    // it sticks. Never fails the pass.
    if (layout === 'per-sport') {
      const sportColours = loadPrefs().sportColours;
      await conformSportCalendarColours(
        Object.entries(sportCalendarIds())
          .filter(([, calendarId]) => present.has(calendarId))
          .map(([group, calendarId]) => ({
            calendarId,
            hex: sportCalendarColourFor(group, sportColours),
          })),
      );
      beat();
    }
    // Every calendar of ours that exists, the target first.
    const ourCalendars = (): string[] => [
      ...new Set([
        ...(home !== null && present.has(home) ? [home] : []),
        ...Object.values(sportCalendarIds()),
        ...unrecordedSport,
      ]),
    ];

    // Reinstall recovery: an empty ledger with tagged events already in
    // the calendar means the app's storage was lost (uninstall) — the
    // events are the durable record. Rebuild before planning so the sync
    // updates instead of duplicating. Only OUR events are adopted: in a
    // user's calendar everything else is invisible to us. EVERY calendar
    // of ours is read (2026-09-24): the events may sit in sport calendars,
    // and a fixture found in two of them is kept once.
    let recovered = 0;
    let surplusDeleted = 0;
    if (Object.keys(loadLedger()).length === 0) {
      const scans: Array<{ calendarId: string; events: RecoveredEvent[] }> = [];
      for (const id of ourCalendars()) {
        const scan = await listTaggedEvents(id);
        beat();
        if (scan.ok && scan.value.length > 0) {
          scans.push({ calendarId: id, events: scan.value });
        }
      }
      const rebuilt = mergeRecoveredCalendars(scans, Date.now());
      for (const [fixtureId, entry] of Object.entries(rebuilt.ledger)) {
        upsertLedgerEntry(fixtureId, entry);
      }
      for (const { eventId, calendarId } of rebuilt.surplus) {
        await deleteFixtureEvent(eventId, calendarId);
        surplusDeleted++;
        beat();
      }
      recovered = Object.keys(rebuilt.ledger).length;
    }
    // One native calendar object per calendar per run: per-event
    // instantiation exhausts bridge handles.
    const handles = new Map<string, CalendarHandle>();
    const handleFor = async (id: string): Promise<Result<CalendarHandle>> => {
      const known = handles.get(id);
      if (known) return ok(known);
      const h = await getCalendarObject(id);
      if (h.ok) handles.set(id, h.value);
      return h;
    };

    const follows = loadFollowKeys();
    const prefs = loadPrefs();
    const settings = loadEventSettings();

    // Self-healing target moves. An interrupted switch leaves strays; a
    // target that changed under us (the chosen calendar was deleted in
    // Google Calendar, say) leaves ledger entries pointing at a calendar
    // we no longer write to. Both are repaired here, before planning, so
    // the plan below only ever deals with events in the current target.
    // The combined layout moves every entry into its target here; the
    // per-sport layout places each event by its fixture's sport, so its
    // move waits for the fixtures below.
    await drainStrays();
    // Before anything moves: an event about to be removed is not moved.
    const recordGone = await removeFinishedWithRecordGone();
    let moved = 0;
    if (layout === 'combined' && home !== null) {
      const homeHandle = await handleFor(home);
      if (!homeHandle.ok) return homeHandle;
      const m = await migrateToTarget(home, homeHandle.value, prefs, settings);
      if (!m.ok) return m;
      moved = m.value;
    }

    const fixtures = await fetchFixturesForFollows(
      [...new Set([...follows, ...pinFollowKeys()])],
    );
    if (!fixtures.ok) return fixtures;

    const ledger = loadLedger();

    // LANGUAGE-SWITCH REWRITE NOTICE (Phase C, owner ruling): the
    // catalog-backed event titles and notes make this very pass
    // rewrite every synced event when the device language changed —
    // deliberate, and it announces itself once. Stamp-first so an
    // interrupted pass never repeats the toast; the rewrite itself is
    // just the ordinary title diff in the planner.
    const lang = currentLanguage();
    const stampedLang = readJson<string>(CALENDAR_LANGUAGE_KEY, '');
    if (stampedLang !== lang) {
      writeJson(CALENDAR_LANGUAGE_KEY, lang);
      if (stampedLang !== '' && Object.keys(ledger).length > 0) {
        showToast({
          message: t('calendar.language.rewrite', {
            language: LANGUAGE_NAMES[lang],
          }),
        });
      }
    }

    // SCAN ANOMALY. A calendar scan that returns zero tagged events while
    // the ledger holds entries is impossible under correct operation — it
    // means the scan cannot see the calendar, not that the calendar is
    // empty. That is exactly the state F13 sat in undetected: EventKit
    // answered an over-long range with an empty list, prune concluded
    // there were no orphans, and recovery concluded there was no ledger to
    // rebuild. Fail the pass and let the next one retry; a scan that
    // cannot read the calendar must never be allowed to conclude the
    // calendar is empty. (Stage 0's standing invariant, applied to the one
    // surface that was still exempt from it.)
    //
    // Asked of EVERY calendar the ledger places events in (2026-09-24):
    // one blind calendar among several must not hide behind the others'
    // counts. A calendar that is gone is not asked — its events went with
    // it, and the move recreates them.
    const entriesIn = new Map<string, number>();
    for (const e of Object.values(ledger)) {
      if (!present.has(e.calendarId)) continue;
      entriesIn.set(e.calendarId, (entriesIn.get(e.calendarId) ?? 0) + 1);
    }
    for (const [id, ledgerEntries] of entriesIn) {
      const guard = await listTaggedEvents(id);
      if (!guard.ok) return guard;
      beat();
      if (isScanAnomaly(guard.value.length, ledgerEntries)) {
        const anomaly: SyncOutcome = {
          created: 0,
          updated: 0,
          deleted: 0,
          scanAnomaly: true,
          scannedTagged: 0,
          ledgerEntries,
          at: new Date().toISOString(),
        };
        writeJson(LAST_SYNC_KEY, anomaly);
        return err({ kind: 'scan-anomaly', scanned: 0, ledgerEntries });
      }
    }

    // Circuit breaker: active follows but zero fixtures against a
    // non-trivial ledger means an upstream/cache anomaly, not a real
    // "everything is cancelled". Never mass-delete on that signal.
    //
    // Counted against LIVE entries only, since the query gained its
    // startUtc lower bound. A user whose follows are all out of season
    // legitimately fetches nothing while holding a ledger full of frozen
    // past events — that is an ordinary July for a hockey fan, not an
    // anomaly, and firing here would fail their every sync.
    const liveLedgerEntries = Object.values(ledger).filter(
      (e) => !isEndPast(e.endUtc, Date.now()),
    ).length;
    if (
      follows.length > 0 &&
      fixtures.value.fixtures.length === 0 &&
      liveLedgerEntries > 0
    ) {
      return err({ kind: 'suspect-empty' });
    }

    const horizonStart = horizonStartFrom(Date.now());
    const excluded = loadExclusions();
    const pins = pinnedIds();
    // One real event, one calendar entry: the same bout (TSDB card +
    // PBC bout doc) or the same joint tennis tournament (ICS + WTA
    // parents) must not become two events — the planner sees only the
    // best-informed doc, and the other's ledgered event drains as an
    // ordinary delete (sameBout.ts; pinned docs are never dropped).
    const planFixtures = dedupeSameEvent(
      fixtures.value.fixtures,
      pins,
      new Set(follows),
    );
    // Tournament tiers (Round 3 B3): the followed block tournaments'
    // children are fetched — from the PRE-dedupe list, so a joint
    // tournament's two parents union their draws — and the tier pass
    // reshapes what the planner sees (block + pointer, or bookends +
    // the tier's matches). A failed children read fails the pass, per
    // the module's own contract.
    const kids = await fetchTournamentChildrenFor(
      fixtures.value.fixtures,
      follows,
    );
    if (!kids.ok) return kids;
    beat();
    // Per-tournament overrides (Round 7) beat the global tier; then the
    // same-event umbrella runs over the TIERED list too — the children
    // join after the first dedupe, and the WTA final slot beside the
    // real final match (same parent, same exact time, both wanted) is
    // exactly the twin dedupeFinalSlots exists to collapse.
    const calendarInKeys = new Set(
      loadFollowables()
        .filter((f) => calendarPrefOf(f) === 'in')
        .flatMap((f) => followQueryKeys(f)),
    );
    const tieredFixtures = dedupeSameEvent(
      applyTournamentTiers(
        planFixtures,
        prefs.tournamentTier,
        follows,
        kids.value,
        tournamentTierOverridesFrom(loadFollowables()),
        (key) => calendarInKeys.has(key),
      ),
      pins,
      new Set(follows),
    );
    // PER-FOLLOW CALENDAR CONTROL (owner brief 2026-09-23): what goes in
    // the calendar is the inclusion rule's answer over the follows that
    // match each fixture — most specific level decides, any `in` among
    // equals wins (follows/domain/calendarInclusion.ts). The fetch, the
    // dedupe and the tier pass above still see EVERY follow: the app
    // shows what you follow whether or not it is in the calendar, and a
    // tier copy is stamped with its own draw's key so an `out` draw's
    // matches are refused here, not silently re-admitted by a tour key.
    const wantedByFollows = fixtureWantedByFollows(loadFollowables());
    // COLOUR LAYERS (owner rulings 2026-09-25): what an event with no
    // colour of its own inherits — its most specific coloured follow's,
    // else, with one calendar, its sport's (domain/colourLayers.ts).
    // Nothing picked anywhere → nothing written, so an upgrade rewrites
    // no one's calendar.
    const colourOf = inheritedColourResolver({
      layout,
      sportColours: prefs.sportColours,
      follows: loadFollowables().map((f) => ({
        ...toInclusionFollow(f),
        ...(f.colour ? { colour: f.colour } : {}),
      })),
      eventColours: calendarCapabilities().perEventColour,
    });

    // THE PER-SPORT MOVE, each event placed by its own fixture's sport:
    // after the tier pass, so a tournament's bookends and matches are in
    // hand, and before the plan, so the plan sees events where the layout
    // wants them. It shares the pass's time budget with the ops below;
    // what it does not reach, the queued pass continues.
    const budgetMs = passBudgetMs(STALE_RUN_MS);
    const passStartedAt = Date.now();
    let layoutSettled = true;
    let relocationRemaining = 0;
    if (layout === 'per-sport') {
      const known = await sportsOfLedger(loadLedger(), [
        ...fixtures.value.fixtures,
        ...tieredFixtures,
      ]);
      if (!known.complete) layoutSettled = false;
      const tieredById = new Map(tieredFixtures.map((f) => [f.id, f] as const));
      const scopes = seriesScopesFrom(loadFollowables());
      // What a moved event is written as, while its fixture is in hand.
      const moveInput = (step: RelocationStep): EventInput => {
        const input = inputFor(step.fixtureId, step.entry, prefs, settings);
        const fixture = tieredById.get(step.fixtureId);
        // An entry written before notes were recorded: its note is read
        // off the fixture.
        if (input.note === undefined && fixture) {
          const note = desiredEventFor(fixture, prefs, scopes, settings, {
            pinned: pins.has(fixture.id),
          })?.note;
          if (note) input.note = note;
        }
        // The colour it wears in THIS layout: a sport's colour is its
        // calendar's here, not the event's — carrying the old layout's
        // colour across would only have the plan rewrite every moved
        // event straight after.
        if (fixture) {
          const colour = settings[fixture.id]?.colour ?? colourOf(fixture);
          if (colour) input.colour = colour;
          else delete input.colour;
        }
        return input;
      };
      const rel = await relocate(
        planLayoutRelocation(loadLedger(), (fixtureId) =>
          sportPlacement(known.groups.get(fixtureId)),
        ),
        {
          ledger: loadLedger,
          upsert: upsertLedgerEntry,
          calendarFor: async (to) =>
            to.calendarId !== null ? ok(to.calendarId) : sportCalendarFor(to.group),
          create: async (calendarId, step) => {
            const h = await handleFor(calendarId);
            if (!h.ok) return h;
            const input = moveInput(step);
            const made = await createFixtureEvent(h.value, input);
            if (!made.ok) return made;
            return ok(writtenFrom(made.value, input));
          },
          deleteEvent: (eventId, calendarId) => deleteFixtureEvent(eventId, calendarId),
          stop: (n) => shouldStopPass(n, Date.now() - passStartedAt, budgetMs),
          beat,
          batch: moveBatch(moveInput, handleFor),
        },
      );
      if (!rel.ok) return rel;
      moved += rel.value.moved;
      relocationRemaining = rel.value.remaining;
      if (relocationRemaining > 0) layoutSettled = false;
    }

    // Removals the per-pass delete cap held back (a follow taken out, a
    // rung lowered) — drained by the rerun this pass queues below.
    let removalsHeldBack = 0;
    const ops = planSync(
      tieredFixtures,
      loadLedger(),
      follows,
      prefs,
      horizonStart,
      excluded,
      pins,
      nowFromHorizon(horizonStart),
      seriesScopesFrom(loadFollowables()),
      settings,
      // Round 5: the planner's entitlement input. Open sync gate →
      // Premium for everyone; entitled gate → the store's cached state
      // with offline grace and the downgrade rules (core/entitlement.ts).
      {
        entitlement: planEntitlement(Date.now()),
        includes: (f) => wantedByFollows(f.followKeys),
        colourOf,
        onRemovalsHeldBack: (n) => {
          removalsHeldBack = n;
        },
      },
    );

    // Bounded pass: corrections first, creates after, stopping when the
    // time budget is spent rather than at a fixed op count.
    const ordered = orderOps(ops);
    let applied = 0;
    const outcome: SyncOutcome = {
      created: 0,
      updated: 0,
      deleted: 0,
      recovered,

      ...(moved > 0 ? { moved } : {}),
      ...(recordGone.checked > 0 ? { pastChecked: recordGone.checked } : {}),
      ...(recordGone.removed > 0 ? { recordGone: recordGone.removed } : {}),
      followKeyCount: fixtures.value.keys,
      queryChunks: fixtures.value.chunks,
      at: new Date().toISOString(),
    };

    // What an op writes, and the ledger entry that records it — one
    // definition for the one-by-one loop and the batched one.
    const inputOf = (f: Fixture, d: DesiredEvent): EventInput => ({
      fixtureId: f.id,
      title: d.title,
      startUtc: d.startUtc,
      endUtc: d.endUtc,
      allDay: d.allDay,
      // The plan decides the reminder — per-event override first,
      // preference behind it, nothing at all on an all-day placeholder.
      // Deciding it HERE was what made a reminder invisible to the
      // planner and lost it on every recreate.
      reminderMinutesBefore: d.reminderMinutes,
      extraRemindersBefore: d.extraReminders,
      allDayReminder: d.allDayReminder,
      ...(d.note ? { note: d.note } : {}),
      // Round 5 ruling 7: the chosen colour reaches the event (REST maps
      // it to Google's nearest swatch; layers without per-event colour
      // never rendered the control, so never see one).
      ...(d.colour ? { colour: d.colour } : {}),
    });
    const record = (
      f: Fixture,
      d: DesiredEvent,
      input: EventInput,
      eventId: string,
      calendarId: string,
    ): void => {
      upsertLedgerEntry(f.id, {
        eventId,
        calendarId,
        startUtc: input.startUtc,
        endUtc: input.endUtc,
        title: input.title,
        allDay: input.allDay,
        // Recorded so the NEXT plan can see a reminder change. A recreate
        // (the all-day↔timed kind flip) lands here too, which is what
        // makes "we own reminders, so we restore them" true rather than
        // aspirational.
        reminderMinutes: input.reminderMinutesBefore,
        extraReminders: input.extraRemindersBefore,
        allDayReminder: d.allDayReminder,
        ...(d.colour ? { colour: d.colour } : {}),
        // The fixture's own calendar group, stamped on the entry so a
        // later move can place the event without the fixture in hand.
        sport: calendarGroupOf(f),
        ...(d.note ? { note: d.note } : {}),
      });
    };
    // A NEW event goes where the layout wants it; an update stays in the
    // calendar the event is in (a move not yet reached carries it across
    // later, rebuilt from this very entry).
    const placeFor = async (f: Fixture): Promise<Result<string>> =>
      layout === 'combined' && home !== null ? ok(home) : sportCalendarFor(calendarGroupOf(f));
    // EventKit half-applies all-day ↔ timed conversions on update (flag
    // flips, dates don't). A kind change is always delete + recreate;
    // same-kind changes update in place.
    const isKindFlip = (op: SyncOp): boolean =>
      op.op === 'update' && (op.entry.allDay ?? false) !== op.desired.allDay;

    const batchSize = writeBatchSize();
    if (batchSize > 1) {
      // FIFTY TO A REQUEST (owner ruling 2026-09-25): on Google the plan's
      // writes go in groups, three requests at most per group — removals
      // (and the old half of a kind flip), then updates in place, then
      // every create (new events, a flip's new half, and an event deleted
      // by hand whose fixture is still wanted). Each write keeps its
      // one-by-one meaning: a delete that failed never drops its ledger
      // entry, a create is recorded the moment its answer is in, and the
      // first refusal ends the pass — after everything that DID land is
      // recorded.
      let refused: Result<never> | null = null;
      for (let i = 0; i < ordered.length && refused === null; i += batchSize) {
        if (shouldStopPass(applied, Date.now() - passStartedAt, budgetMs)) break;
        beat();
        const chunk = ordered.slice(i, i + batchSize);
        const toCreate: Array<Extract<SyncOp, { op: 'create' | 'update' }>> = [];
        const removals = chunk.filter(
          (op): op is Extract<SyncOp, { entry: LedgerEntry }> =>
            op.op === 'delete' || isKindFlip(op),
        );
        const dels = await deleteFixtureEvents(
          removals.map((op) => ({ eventId: op.entry.eventId, calendarId: op.entry.calendarId })),
        );
        if (!dels.ok) return dels;
        removals.forEach((op, k) => {
          const del = dels.value[k];
          if (!del.ok) {
            refused ??= del; // never drop a ledger entry on a failed delete
            return;
          }
          if (op.op === 'delete') {
            removeLedgerEntry(op.fixtureId);
            outcome.deleted++;
            applied++;
          } else if (op.op === 'update') {
            toCreate.push(op);
          }
        });
        const inPlace = chunk.filter(
          (op): op is Extract<SyncOp, { op: 'update' }> => op.op === 'update' && !isKindFlip(op),
        );
        const updateInputs = inPlace.map((op) => inputOf(op.fixture, op.desired));
        const ups = await updateFixtureEvents(
          inPlace.map((op, k) => ({
            eventId: op.entry.eventId,
            calendarId: op.entry.calendarId,
            input: updateInputs[k],
          })),
        );
        if (!ups.ok) return ups;
        inPlace.forEach((op, k) => {
          const u = ups.value[k];
          if (u.ok) {
            record(op.fixture, op.desired, updateInputs[k], u.value, op.entry.calendarId);
            outcome.updated++;
            applied++;
          } else if (u.error.kind === 'not-found') {
            // Deleted by hand, still wanted: recreated below.
            toCreate.push(op);
          } else {
            refused ??= u;
          }
        });
        const creates = [
          ...chunk.filter((op): op is Extract<SyncOp, { op: 'create' }> => op.op === 'create'),
          ...toCreate,
        ];
        const placed: Array<{ calendarId: string; handle: CalendarHandle }> = [];
        for (const op of creates) {
          const cal = await placeFor(op.fixture);
          if (!cal.ok) return cal;
          const h = await handleFor(cal.value);
          if (!h.ok) return h;
          placed.push({ calendarId: cal.value, handle: h.value });
        }
        const createInputs = creates.map((op) => inputOf(op.fixture, op.desired));
        const made = await createFixtureEvents(
          creates.map((_op, k) => ({ handle: placed[k].handle, input: createInputs[k] })),
        );
        if (!made.ok) return made;
        creates.forEach((op, k) => {
          const m = made.value[k];
          if (!m.ok) {
            refused ??= m;
            return;
          }
          record(op.fixture, op.desired, createInputs[k], m.value, placed[k].calendarId);
          if (op.op === 'create') outcome.created++;
          else outcome.updated++;
          applied++;
        });
      }
      if (refused) return refused;
    } else {
      for (const op of ordered) {
        if (shouldStopPass(applied, Date.now() - passStartedAt, budgetMs)) break;
        beat();
        if (op.op === 'create' || op.op === 'update') {
          const f = op.fixture;
          const d = op.desired;
          const input = inputOf(f, d);
          const createPlaced = async (): Promise<
            Result<{ eventId: string; calendarId: string }>
          > => {
            const cal = await placeFor(f);
            if (!cal.ok) return cal;
            const h = await handleFor(cal.value);
            if (!h.ok) return h;
            const made = await createFixtureEvent(h.value, input);
            return made.ok ? ok({ eventId: made.value, calendarId: cal.value }) : made;
          };
          const kindFlip = isKindFlip(op);
          if (kindFlip && op.op === 'update') {
            await deleteFixtureEvent(op.entry.eventId, op.entry.calendarId);
          }
          let r: Result<{ eventId: string; calendarId: string }>;
          if (op.op === 'create' || kindFlip) {
            r = await createPlaced();
          } else {
            const inPlace = op.entry.calendarId;
            const u = await updateFixtureEvent(op.entry.eventId, input, inPlace);
            r = u.ok ? ok({ eventId: u.value, calendarId: inPlace }) : u;
            // A hand-deleted event whose fixture then changed: the update
            // finds nothing, but the fixture is still WANTED — recreate it
            // and let the ledger repoint below. Without this, one missing
            // event aborted every sync from the moment its time moved
            // (the delete-side twin of the same wedge parked a real phone
            // at 174 events for an evening).
            if (!r.ok && r.error.kind === 'not-found') r = await createPlaced();
          }
          if (!r.ok) return r;
          record(f, d, input, r.value.eventId, r.value.calendarId);
          if (op.op === 'create') outcome.created++;
          else outcome.updated++;
          applied++;
        } else {
          const del = await deleteFixtureEvent(op.entry.eventId, op.entry.calendarId);
          if (!del.ok) return del; // never drop a ledger entry on a failed delete
          removeLedgerEntry(op.fixtureId);
          outcome.deleted++;
          applied++;
        }
      }
    }
    const deferred = ordered.length - applied + removalsHeldBack;
    outcome.opsApplied = applied;
    outcome.passMs = Date.now() - passStartedAt;
    if (deferred > 0) outcome.deferred = deferred;

    // Prune pass: delete any tagged event the ledger does not reference
    // (calendar ⊆ ledger invariant). Catches scan-window misses, zombie
    // dev runs, and anything else that slipped an event past the ledger.
    // listTaggedEvents is the ownership gate: in a user's calendar it
    // returns ONLY events carrying our tag, so an appointment of theirs
    // can never become an "orphan".
    //
    // Every calendar of ours, not only the one the layout writes into
    // (2026-09-24): an event a killed move created but never recorded sits
    // in whichever calendar it was created in.
    for (const id of ourCalendars()) {
      const postScan = await listTaggedEvents(id);
      beat();
      if (!postScan.ok) continue;
      for (const eventId of orphanEventIds(postScan.value, loadLedger())) {
        await deleteFixtureEvent(eventId, id);
        outcome.pruned = (outcome.pruned ?? 0) + 1;
      }
    }

    // "Remove it once it's empty" (owner brief 2026-09-24): a sport
    // calendar no event of ours lives in any more goes — but only after
    // the calendar ITSELF is read as holding nothing, not even an event the
    // user added by hand. In the per-sport layout the one combined
    // calendar goes the same way once the move has emptied it; a calendar
    // the user chose as their target is never touched.
    const ledgerNow = loadLedger();
    const recordedNow = new Set(Object.values(sportCalendarIds()));
    for (const id of unreferencedCalendarIds(ledgerNow, [...recordedNow, ...unrecordedSport])) {
      if (await deleteSportCalendarIfEmpty(id, recordedNow.has(id))) forgetSportCalendar(id);
      beat();
    }
    if (
      layout === 'per-sport' &&
      home !== null &&
      present.has(home) &&
      unreferencedCalendarIds(ledgerNow, [home]).length > 0
    ) {
      await vacateTargetIfEmpty();
    }

    // The move the user confirmed announces itself once, when nothing is
    // left to move — on this open or a later one, however many passes and
    // app closes it took.
    const pending = pendingLayoutMove();
    if (pending !== null) {
      const settled =
        layoutSettled &&
        strayEventIds(ledgerNow).length === 0 &&
        (layout === 'per-sport' ||
          Object.values(ledgerNow).every((e) => e.calendarId === home));
      if (pending !== layout) {
        setPendingLayoutMove(null);
      } else if (settled) {
        setPendingLayoutMove(null);
        showToast({
          message: t(
            layout === 'per-sport' ? 'calendar.layout.separated' : 'calendar.layout.combined',
          ),
        });
      }
    }

    // Presentation state written only after every calendar op applied,
    // and gated by the same desiredEventFor the planner uses — the app
    // never shows a fixture the calendar doesn't want (cancelled,
    // race-only excluded), and never runs ahead of a sync that failed.
    // The tier pass's MATCH copies join the parents (Round 7 item 7):
    // the in-app Schedule mirrors the calendar entry for entry, where
    // it used to show the tournament block alone.
    writePresentationState(
      presentationFixtures(
        planFixtures,
        // The match copies the CALENDAR takes, never an `out` follow's:
        // a tournament taken out shows as its one block in the app, not
        // as every match it would have delivered.
        tieredFixtures.filter(
          (f) => !f.parentFixtureId || pins.has(f.id) || wantedByFollows(f.followKeys),
        ),
      ),
      follows,
      prefs,
      horizonStart,
      excluded,
    );
    emitFixturesRefreshed({
      fixtures: planFixtures,
      prefs,
      excluded,
      calendarConnected: true,
    });
    writeJson(LAST_SYNC_KEY, outcome);
    // Drain the remainder on the next pass. Reuses the lock's existing
    // coalescing hop rather than recursing here, so the run finishes and
    // releases before the next one starts.
    if (deferred > 0 || relocationRemaining > 0 || recordGone.heldBack > 0) {
      rerunQueued = true;
    }
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
