// Fixture reads (Firestore cache) and poll triggering (functions).

// getDocsFromServer, never getDocs: an unreachable backend must surface
// as an error, not resolve silently from the (empty) local cache — a
// silent empty read once deleted a whole calendar (see DECISIONS.md).
import {
  collection,
  getDocsFromServer,
  query,
  where,
} from 'firebase/firestore';
import { db, functionsBaseUrl } from '../../../core/firebase';
import { err, ok, Result } from '../../../core/result';
import { Fixture } from '../domain/fixture';

export async function fetchFixturesForFollows(
  followedKeys: readonly string[],
): Promise<Result<Fixture[]>> {
  if (followedKeys.length === 0) return ok([]);
  try {
    // array-contains-any caps at 10 keys; fine for the slice, M3 batches.
    const snap = await getDocsFromServer(
      query(
        collection(db, 'fixtures'),
        where('followKeys', 'array-contains-any', followedKeys.slice(0, 10)),
      ),
    );
    return ok(snap.docs.map((d) => d.data() as Fixture));
  } catch (e) {
    return err({ kind: 'unknown', message: `fixture fetch failed: ${e}` });
  }
}

export async function requestPoll(
  teamId: number,
  season: number,
): Promise<Result<{ fixtures: number; changes: number }>> {
  try {
    const res = await fetch(
      `${functionsBaseUrl}/pollTeam?teamId=${teamId}&season=${season}`,
    );
    if (!res.ok) {
      return err({ kind: 'provider', status: res.status, message: await res.text() });
    }
    return ok((await res.json()) as { fixtures: number; changes: number });
  } catch (e) {
    return err({ kind: 'offline' });
  }
}
