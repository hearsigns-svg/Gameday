// Fixture reads (Firestore cache) and poll triggering (functions).

// getDocsFromServer, never getDocs: an unreachable backend must surface
// as an error, not resolve silently from the (empty) local cache — a
// silent empty read once deleted a whole calendar (see DECISIONS.md).
import {
  collection,
  doc,
  getDocFromServer,
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

// One fixture by id, for surfaces the app's own snapshot cannot cover:
// the snapshot is capped and filtered to live follows, so a bout opened
// from a card, or a pinned event that aged past the cap, is not in it.
//
// `null` means the document genuinely does not exist (cancelled and
// reaped, or a stale link); a read FAILURE is an error, never a null —
// "this event has gone" and "we could not ask" must not look the same.
export async function fetchFixtureById(
  fixtureId: string,
): Promise<Result<Fixture | null>> {
  try {
    const snap = await getDocFromServer(doc(db, 'fixtures', fixtureId));
    return ok(snap.exists() ? (snap.data() as Fixture) : null);
  } catch (e) {
    console.warn(`[kickoffcal] fixture read failed for ${fixtureId}: ${e}`);
    return err({ kind: 'offline' });
  }
}

// The constituent parts of one event — a card's bouts, a draw's
// matches. Queried by parentFixtureId rather than by follow key because
// parent and child deliberately share none: a card's followers are not
// automatically subscribed to every fighter on it.
//
// SINGLE-FIELD EQUALITY ONLY, no orderBy and no startUtc bound. Both
// were probed against production: the equality query is served by the
// automatic single-field index, while adding a startUtc order or range
// fails with FAILED_PRECONDITION for want of a composite index that
// does not exist. Ordering happens in memory (domain/card.ts), where a
// card's bouts need re-sorting anyway.
export async function fetchEventCard(
  parentFixtureId: string,
): Promise<Result<Fixture[]>> {
  try {
    const snap = await getDocsFromServer(
      query(
        collection(db, 'fixtures'),
        where('parentFixtureId', '==', parentFixtureId),
      ),
    );
    return ok(snap.docs.map((d) => d.data() as Fixture));
  } catch (e) {
    // A failed read is a failure, never an empty card — an event with
    // no bouts and an event we could not ask about must not look the
    // same on screen.
    console.warn(`[kickoffcal] card fetch failed for ${parentFixtureId}: ${e}`);
    return err({ kind: 'offline' });
  }
}

// Every PARENT sharing one tournament follow key — the two tours' docs
// for a joint tournament (Round 3: the US Open is an ATP parent and a
// WTA parent sharing `tennis-t-us-open`; the card must union both
// sides' children). Same single-field constraint as above:
// array-contains alone rides the automatic index; children never carry
// the tournament key by design, so the result set IS the parents.
export async function fetchTournamentParents(
  tournamentKey: string,
): Promise<Result<Fixture[]>> {
  try {
    const snap = await getDocsFromServer(
      query(
        collection(db, 'fixtures'),
        where('followKeys', 'array-contains', tournamentKey),
      ),
    );
    return ok(
      snap.docs
        .map((d) => d.data() as Fixture)
        .filter((f) => !f.parentFixtureId && f.status !== 'cancelled'),
    );
  } catch (e) {
    console.warn(
      `[kickoffcal] tournament parents fetch failed for ${tournamentKey}: ${e}`,
    );
    return err({ kind: 'offline' });
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
