// Follow/unfollow orchestration: update the store, ensure the server
// cache has the followable's fixtures, then sync the calendar.

import { err, messageOf, ok, Result } from '../../core/result';
import { functionsBaseUrl } from '../../core/firebase';
import { logFollow } from '../../core/analytics';
import { runSync, SyncOutcome } from '../calendar-sync/syncEngine';
import {
  Followable,
  loadFollowables,
  setFollowed,
  setFollowScope,
} from './data/followStore';
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

// Registry updates are lazy-imported to avoid a require cycle
// (deviceRegistry → followActions).
function updateRegistry(): void {
  void import('../calendar-sync/data/deviceRegistry').then((m) =>
    m.registerDevice(),
  );
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

export async function follow(item: Followable): Promise<Result<SyncOutcome>> {
  nextGeneration(item.key);
  setFollowed(item, true);
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

// Scopes remembered across an unfollow, so the toast's Undo restores
// the follow AS IT WAS. Screens rebuild the Followable from route
// params or search rows, which never carry scope — without this, Undo
// silently widened a final-round golf follow back to every round
// (review round). In-session only: Undo is a 6-second window.
const lastScopes = new Map<string, FollowScope>();

export async function unfollow(item: Followable): Promise<Result<SyncOutcome>> {
  nextGeneration(item.key);
  const stored = loadFollowables().find((f) => f.key === item.key);
  if (stored?.scope) lastScopes.set(item.key, stored.scope);
  else lastScopes.delete(item.key);
  setFollowed(item, false);
  updateRegistry();
  return runSync();
}

// Undo path: the fixture cache is still warm from the original follow,
// so no re-poll — just restore the follow and reconcile.
export async function refollow(item: Followable): Promise<Result<SyncOutcome>> {
  nextGeneration(item.key);
  const remembered = lastScopes.get(item.key);
  setFollowed(
    item.scope === undefined && remembered !== undefined
      ? { ...item, scope: remembered }
      : item,
    true,
  );
  updateRegistry();
  return runSync();
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
