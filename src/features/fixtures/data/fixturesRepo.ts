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
import { fetchInChunks } from '../domain/fixtureQuery';

// One `array-contains-any` window. Retries, chunking and the
// all-or-nothing rule live in domain/fixtureQuery.ts, which is pure and
// tested; this closure is the only part that knows about Firestore.
async function queryChunk(keys: readonly string[]): Promise<Fixture[]> {
  const snap = await getDocsFromServer(
    query(
      collection(db, 'fixtures'),
      where('followKeys', 'array-contains-any', [...keys]),
    ),
  );
  return snap.docs.map((d) => d.data() as Fixture);
}

export async function fetchFixturesForFollows(
  followedKeys: readonly string[],
): Promise<Result<Fixture[]>> {
  if (followedKeys.length === 0) return ok([]);
  const result = await fetchInChunks(followedKeys, queryChunk);
  if (result.ok) return ok(result.fixtures);
  // Firestore reports an unreachable backend as 'unavailable' with a
  // long SDK message that includes developer advice — never show that
  // to a user. Classify it as what it is: we could not reach the
  // service. The detail stays in the log for us.
  console.warn(
    `[kickoffcal] fixture fetch failed on chunk ${result.failedChunk + 1}/${result.chunks}: ${result.error}`,
  );
  if (/unavailable|network|failed to get documents|timeout/i.test(result.error)) {
    return err({ kind: 'offline' });
  }
  return err({ kind: 'unknown', message: 'Could not load fixtures.' });
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
