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
import { queryHorizonUtc } from '../domain/horizon';

// One `array-contains-any` window. Retries, chunking and the
// all-or-nothing rule live in domain/fixtureQuery.ts, which is pure and
// tested; this closure is the only part that knows about Firestore.
//
// The startUtc lower bound is the horizon rule at the query: 52% of the
// store is fixtures that have already finished, and the app is never
// allowed to touch their events again, so fetching them was pure cost —
// 3,100 documents per sync for a 40-team follow set, of which 548 could
// possibly matter. Anything the bound excludes is provably finished (see
// queryHorizonUtc), and the ledger — not the query — is what keeps a
// crossing fixture's event safe from the prune invariant.
//
// REQUIRES the composite index in firestore.indexes.json
// (fixtures: followKeys CONTAINS + startUtc ASC). Without it every fetch
// fails FAILED_PRECONDITION — safely, since a failed fetch plans nothing,
// but totally.
async function queryChunk(keys: readonly string[]): Promise<Fixture[]> {
  const snap = await getDocsFromServer(
    query(
      collection(db, 'fixtures'),
      where('followKeys', 'array-contains-any', [...keys]),
      where('startUtc', '>=', queryHorizonUtc(Date.now())),
    ),
  );
  return snap.docs.map((d) => d.data() as Fixture);
}

// Fixtures plus the shape of the query that produced them. The dimensions
// ride along so the sync record can show them: a truncating cap is exactly
// the kind of bug that hides until someone measures.
export interface FixturePage {
  fixtures: Fixture[];
  keys: number; // follow keys queried, deduped
  chunks: number; // array-contains-any windows issued
}

export async function fetchFixturesForFollows(
  followedKeys: readonly string[],
): Promise<Result<FixturePage>> {
  if (followedKeys.length === 0) {
    return ok({ fixtures: [], keys: 0, chunks: 0 });
  }
  const result = await fetchInChunks(followedKeys, queryChunk);
  if (result.ok) {
    return ok({
      fixtures: result.fixtures,
      keys: result.keys,
      chunks: result.chunks,
    });
  }
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
