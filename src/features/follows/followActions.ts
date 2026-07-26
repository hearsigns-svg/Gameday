// Follow/unfollow orchestration: update the store, ensure the server
// cache has the followable's fixtures, then sync the calendar.

import { err, ok, Result } from '../../core/result';
import { functionsBaseUrl } from '../../core/firebase';
import { runSync, SyncOutcome } from '../calendar-sync/syncEngine';
import { ACTIVE_SEASON } from './domain/sportsConfig';
import { Followable, setFollowed } from './data/followStore';

async function ensurePolled(item: Followable): Promise<Result<true>> {
  const id = Number(item.key.split('-').pop());
  const path =
    item.type === 'competition'
      ? `pollLeague?leagueId=${id}&season=${ACTIVE_SEASON}`
      : `pollTeam?teamId=${id}&season=${ACTIVE_SEASON}`;
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

export async function follow(item: Followable): Promise<Result<SyncOutcome>> {
  setFollowed(item, true);
  const polled = await ensurePolled(item);
  if (!polled.ok) {
    // Roll back so the UI never shows a follow whose fixtures never came.
    setFollowed(item, false);
    return polled;
  }
  return runSync();
}

export async function unfollow(item: Followable): Promise<Result<SyncOutcome>> {
  setFollowed(item, false);
  return runSync();
}
