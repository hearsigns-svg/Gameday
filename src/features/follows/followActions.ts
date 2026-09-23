// Follow/unfollow orchestration: update the store, ensure the server
// cache has the followable's fixtures, then sync the calendar.

import { err, messageOf, ok, Result } from '../../core/result';
import { functionsBaseUrl } from '../../core/firebase';
import { logFollow } from '../../core/analytics';
import {
  runSync,
  runSyncAwaited,
  SyncOutcome,
  upcomingFixtures,
} from '../calendar-sync/syncEngine';
import { loadPrefs } from '../calendar-sync/data/prefsStore';
import { resetRungForFreshSeries } from '../calendar-sync/data/sessionRungs';
import { premiumLocked } from '../../core/entitlementStore';
import {
  calendarPrefOf,
  Followable,
  inclusionFollows,
  loadFollowables,
  restoreFollowed,
  setFollowCalendar,
  setFollowed,
  setFollowScope,
} from './data/followStore';
import {
  CalendarPref,
  settingDefaultFor,
  startingCalendarPref,
} from './domain/calendarInclusion';
import { followQueryKeys, FollowScope } from './domain/followScopes';
import { pollPathFor } from './domain/pollPaths';
import { shouldPoll } from './domain/pollGate';
import { pinFollowKeys, pinPollPaths } from '../calendar-sync/data/pinStore';

// Last fetch attempt per poll ROUTE, not per follow: two teams in one
// league share a route. Attempt, not success — a failure that is
// retried immediately is the amplification this gate exists to stop.
const lastPollAt = new Map<string, number>();

// Exported for the team-preview screen: seeing a team's fixtures
// before following requires the same one-shot poll a follow performs.
export async function ensurePolled(item: Followable): Promise<Result<true>> {
  // Athlete follows never fire the one-shot poll. Their appearance docs
  // already exist by construction — search only offers athletes with a
  // future appearance in the cache — and the pollPath they carry can be
  // a whole-source crawl (pollPbc walks card pages at a 10s crawl
  // delay), which must not run because somebody opened a fighter's
  // page. The path still registers with the device so the sweep keeps
  // the slice fresh.
  if (item.type === 'athlete') return ok(true);
  const path = pollPathFor(item);
  // Nothing to poll is not a failure. The follow still stands, and it
  // still matches whatever is already in the cache.
  if (path === null) return ok(true);
  // Recently fetched by this device — the cache is central and shared,
  // so asking again inside the window cannot change the answer, and
  // asking anyway is what got us rate-limited (domain/pollGate.ts).
  if (!shouldPoll(lastPollAt.get(path), Date.now())) return ok(true);
  lastPollAt.set(path, Date.now());
  try {
    // Labels the server-side run record: a follow warming the cache is a
    // different event from the scheduled sweep, and coverage reporting
    // needs to tell them apart.
    const res = await fetch(`${functionsBaseUrl}/${path}`, {
      headers: { 'x-kickoffcal-trigger': 'follow' },
    });
    if (!res.ok) {
      return err({ kind: 'provider', status: res.status, message: await res.text() });
    }
    return ok(true);
  } catch {
    return err({ kind: 'offline' });
  }
}

// What the backend needs to serve this device: every followed key and
// the distinct poll routes that keep their fixtures fresh.
export function collectFollowState(): {
  followKeys: string[];
  pollPaths: string[];
} {
  const follows = loadFollowables();
  // Pinned single fixtures ride along: the server sweep must keep them
  // correct even though nothing they belong to is followed.
  return {
    // Scope-expanded (Prompt 11): the sweep's push fan-out matches
    // change records against these, and a finals-scoped follow must
    // hear about its slot doc, whose changes carry only scoped keys.
    followKeys: [
      ...new Set([...follows.flatMap((f) => followQueryKeys(f)), ...pinFollowKeys()]),
    ],
    pollPaths: [
      ...new Set([
        ...follows
          .map((f) => pollPathFor(f))
          .filter((p): p is string => p !== null),
        ...pinPollPaths(),
      ]),
    ],
  };
}

// Registry updates are resolved lazily to avoid a require cycle
// (deviceRegistry → followActions): the house cycle-breaker (a require
// at call time, as core/components.tsx does), still off the tap's
// critical path. It was a dynamic import(), which the test runner
// cannot load — no test could reach follow() at all.
function updateRegistry(): void {
  void Promise.resolve().then(() => {
    const registry = require('../calendar-sync/data/deviceRegistry') as typeof import('../calendar-sync/data/deviceRegistry');
    return registry.registerDevice();
  });
}

// Per-key intent generation: a follow's failure rollback must never
// reverse a NEWER follow/unfollow for the same key (rapid taps on a
// slow network would otherwise leave the store opposite to the user's
// last action).
const intentGeneration = new Map<string, number>();

function nextGeneration(key: string): number {
  const gen = (intentGeneration.get(key) ?? 0) + 1;
  intentGeneration.set(key, gen);
  return gen;
}

// Where a NEW follow starts (owner brief 2026-09-23, Stage 4): in if a
// broader followed thing that is in already covers it — by key grammar
// (a draw in its tournament, a Games sport in its edition) or by a
// fixture the app already holds for it — whatever the Settings default;
// otherwise the Settings default (off in the free state). A follow that
// already exists keeps its own preference: following twice never flips
// it.
export function startingCalendarFor(item: Followable): CalendarPref {
  const existing = loadFollowables();
  const same = existing.find((f) => f.key === item.key);
  if (same) return calendarPrefOf(same);
  return startingCalendarPref(
    { key: item.key, type: item.type, queryKeys: followQueryKeys(item) },
    inclusionFollows(existing),
    upcomingFixtures(),
    settingDefaultFor(loadPrefs().newFollowsInCalendar, premiumLocked()),
  );
}

export async function follow(item: Followable): Promise<Result<SyncOutcome>> {
  nextGeneration(item.key);
  // A laddered series brought in afresh starts at the default session
  // rung (Stage 5 — "new follows get the default").
  resetRungForFreshSeries(item, loadFollowables());
  setFollowed({ ...item, calendar: startingCalendarFor(item) }, true);
  // Funnel event 1 of the Round 5 set — sport and follow type only.
  void logFollow(item.sportKey, item.type);
  // THE FOLLOW STANDS EVEN IF THE REFRESH FAILS.
  //
  // This used to roll back on any poll failure, so that nobody was left
  // with a follow whose fixtures never came. Against a WARM CENTRAL
  // CACHE that reasoning is inverted: the ATP tour has 340 fixtures
  // stored, and the owner's three attempts to follow it were each
  // refused because Google rate-limited the Tennis TV ICS behind it
  // (429 → "service error", follow undone). The refresh is a
  // nice-to-have; the sweep runs it again within hours, and the sync
  // below shows whatever is already there.
  //
  // The honest reporting moves to the OUTCOME: if the sync that follows
  // finds nothing for this follow, the user hears that — from the
  // fixtures, not from a provider's HTTP status.
  //
  // AND IT NO LONGER BLOCKS THE TAP. Awaiting the refresh put a live
  // third-party fetch on the critical path of a button press: the user
  // waited out the provider's latency, and in the 429 case waited to be
  // told no. The cache is central and warm, so the sync below has
  // something to write for anything anyone has ever followed. The
  // refresh runs alongside it and, if it brings anything new, a second
  // sync lands it — no tap, no spinner, which is the same silent
  // correction the sweep performs.
  const refresh = ensurePolled(item);
  updateRegistry();
  const outcome = await runSync();
  void refresh.then((polled) => {
    if (polled.ok) {
      void runSync();
      return;
    }
    console.warn(
      `[kickoffcal] follow ${item.key}: refresh failed (${messageOf(polled.error)}) — keeping the follow and using the cache`,
    );
  });
  return outcome;
}

// What an unfollow took away, remembered so a re-follow restores the
// follow EXACTLY as it was (owner ruling 2026-09-23: the Following page's
// Follow button, and a toast's Undo): the whole stored record — scope,
// calendar preference, artwork, poll path — and its place in the list
// (the keys stored after it). Screens rebuild a Followable from route
// params or search rows, which never carry scope or a calendar
// preference: restoring from those silently widened a final-round golf
// follow back to every round (review round), and would put an `out`
// follow back in. In-session only.
const lastRecords = new Map<string, Followable>();
const lastPlaces = new Map<string, readonly string[]>();

export async function unfollow(item: Followable): Promise<Result<SyncOutcome>> {
  nextGeneration(item.key);
  const all = loadFollowables();
  const i = all.findIndex((f) => f.key === item.key);
  if (i >= 0) {
    lastRecords.set(item.key, all[i]);
    lastPlaces.set(item.key, all.slice(i + 1).map((f) => f.key));
  }
  setFollowed(item, false);
  updateRegistry();
  return runSync();
}

// Re-follow what an unfollow took away: the remembered record, put back
// in its place. `before` — the keys it should sit in front of — lets the
// Following page put a row back where it is on screen (its own order
// also holds rows unfollowed after this one, which the store no longer
// has). The fixture cache is still warm, so no re-poll.
export async function refollow(
  item: Followable,
  before?: readonly string[],
): Promise<Result<SyncOutcome>> {
  nextGeneration(item.key);
  const record = lastRecords.get(item.key) ?? item;
  restoreFollowed(
    { ...record, calendar: record.calendar ?? startingCalendarFor(record) },
    before ?? lastPlaces.get(item.key) ?? [],
  );
  updateRegistry();
  return runSync();
}

// ─── Per-follow calendar control (owner brief 2026-09-23) ──────────────
//
// Put follows in or take them out of the calendar. The preference
// changes at once (the glyph flips on the tap), then one sync writes the
// difference: turning a follow OUT recomputes the effective set and the
// planner removes only the future events no longer claimed by any `in`
// follow, through the ledger-scoped delete path and the per-pass removal
// cap; turning one IN (or raising a rung) is an ordinary pass. If the
// calendar write fails, the preference reverts — but only for keys whose
// latest intent is still this one (a later tap on the same follow must
// never be undone by an earlier tap's failure).
//
// Entitlement is the CALLER's gate for `in` (the + opens the offer);
// `out` is never gated.
export type CalendarChange = 'applied' | 'failed';

const calendarGeneration = new Map<string, number>();

export async function setCalendar(
  keys: readonly string[],
  next: CalendarPref,
): Promise<CalendarChange> {
  const stored = loadFollowables().filter((f) => keys.includes(f.key));
  if (stored.length === 0) return 'applied';
  const before = new Map(stored.map((f) => [f.key, calendarPrefOf(f)] as const));
  const generations = stored.map((f) => {
    const g = (calendarGeneration.get(f.key) ?? 0) + 1;
    calendarGeneration.set(f.key, g);
    return [f.key, g] as const;
  });
  setFollowCalendar([...before.keys()], next);
  // A sync already running hands back the result of the rerun queued
  // behind it — the pass that actually carries this change.
  const r = await runSyncAwaited();
  if (r.ok) return 'applied';
  for (const [key, g] of generations) {
    if (calendarGeneration.get(key) !== g) continue; // a newer tap owns it
    const prev = before.get(key);
    if (prev) setFollowCalendar([key], prev);
  }
  return 'failed';
}

// Change what a follow delivers (Prompt 11). A scope change is an
// ordinary follow-set change to the planner: a narrower scope's
// no-longer-fetched events drain by the same rule an unfollow uses, a
// wider one creates. The registry re-registers so the sweep's push
// fan-out matches the scoped keys the query now uses.
export async function setScope(
  key: string,
  scope: FollowScope | null,
): Promise<Result<SyncOutcome>> {
  setFollowScope(key, scope);
  updateRegistry();
  return runSync();
}
