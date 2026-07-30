// Follow/unfollow orchestration: update the store, ensure the server
// cache has the followable's fixtures, then sync the calendar.

import { err, ok, Result } from '../../core/result';
import { functionsBaseUrl } from '../../core/firebase';
import { runSync, SyncOutcome } from '../calendar-sync/syncEngine';
import {
  ACTIVE_SEASON,
  F1_SEASON,
  MLB_SEASON,
  NHL_SEASON_ID,
  SOCCER_FD_SEASON,
} from './domain/sportsConfig';
import { Followable, loadFollowables, setFollowed } from './data/followStore';
import { pinFollowKeys, pinPollPaths } from '../calendar-sync/data/pinStore';

function pollPathFor(item: Followable): string {
  if (item.pollPath) return item.pollPath;
  const tail = item.key.split('-').pop() ?? '';
  // Provider is encoded in the key prefix; legacy apisports-* follows
  // keep their old (2023-window) routes until re-followed.
  if (item.key.startsWith('fdorg-')) {
    return item.type === 'competition'
      ? `pollFdCompetition?code=${tail}&season=${SOCCER_FD_SEASON}`
      : `pollFdTeam?teamId=${Number(tail)}&season=${SOCCER_FD_SEASON}`;
  }
  switch (item.sportKey) {
    case 'baseball':
      // Whole-league follow polls team-by-team server-side later (M6
      // scheduler); interactively we poll the followed entity itself.
      return `pollMlbTeam?teamId=${Number(tail)}&season=${MLB_SEASON}`;
    case 'ice-hockey':
      return `pollNhlTeam?abbrev=${tail}&season=${NHL_SEASON_ID}`;
    case 'f1':
      return `pollF1?season=${F1_SEASON}`;
    default:
      return item.type === 'competition'
        ? `pollLeague?leagueId=${Number(tail)}&season=${ACTIVE_SEASON}`
        : `pollTeam?teamId=${Number(tail)}&season=${ACTIVE_SEASON}`;
  }
}

// Exported for the team-preview screen: seeing a team's fixtures
// before following requires the same one-shot poll a follow performs.
export async function ensurePolled(item: Followable): Promise<Result<true>> {
  const path = pollPathFor(item);
  try {
    const res = await fetch(`${functionsBaseUrl}/${path}`);
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
      ...new Set([...follows.map((f) => pollPathFor(f)), ...pinPollPaths()]),
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
