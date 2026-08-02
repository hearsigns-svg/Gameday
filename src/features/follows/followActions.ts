// Follow/unfollow orchestration: update the store, ensure the server
// cache has the followable's fixtures, then sync the calendar.

import { err, ok, Result } from '../../core/result';
import { functionsBaseUrl } from '../../core/firebase';
import { runSync, SyncOutcome } from '../calendar-sync/syncEngine';
import { Followable, loadFollowables, setFollowed } from './data/followStore';
import { pollPathFor } from './domain/pollPaths';
import { pinFollowKeys, pinPollPaths } from '../calendar-sync/data/pinStore';

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
    followKeys: [...new Set([...follows.map((f) => f.key), ...pinFollowKeys()])],
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
  const gen = nextGeneration(item.key);
  setFollowed(item, true);
  const polled = await ensurePolled(item);
  if (!polled.ok) {
    // Roll back so the UI never shows a follow whose fixtures never
    // came — unless a newer intent for this key has superseded us.
    if (intentGeneration.get(item.key) === gen) setFollowed(item, false);
    return polled;
  }
  updateRegistry();
  return runSync();
}

export async function unfollow(item: Followable): Promise<Result<SyncOutcome>> {
  nextGeneration(item.key);
  setFollowed(item, false);
  updateRegistry();
  return runSync();
}

// Undo path: the fixture cache is still warm from the original follow,
// so no re-poll — just restore the follow and reconcile.
export async function refollow(item: Followable): Promise<Result<SyncOutcome>> {
  nextGeneration(item.key);
  setFollowed(item, true);
  updateRegistry();
  return runSync();
}
