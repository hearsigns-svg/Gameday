// Chunked fixture fetching — pure orchestration, no Firestore import.
//
// `array-contains-any` accepts at most 30 values, so a follow list longer
// than that cannot be one query. It used to be truncated —
// `followedKeys.slice(0, 10)` — which silently returned nothing for the
// 11th follow onward. That is not a display bug: planSync deletes any
// ledgered event it cannot find a fixture for, so the missing keys had
// their real calendar events pruned on the next sync.
//
// THE RULE THIS FILE EXISTS TO ENFORCE: a fetch either returns every
// chunk or it fails. A partial union must never be handed to the planner,
// because "these fixtures did not come back" and "the user unfollowed
// these" are the same input to it, and one of those deletes real events
// from a real calendar.

import { Fixture } from './fixture';

// Firestore's hard cap on array-contains-any values.
export const FOLLOW_KEY_CHUNK = 30;

export const FETCH_ATTEMPTS = 3;
export const BACKOFF_MS: readonly number[] = [800, 2400];

export type ChunkRunner = (keys: readonly string[]) => Promise<Fixture[]>;

export interface ChunkedFetchOptions {
  chunkSize?: number;
  attempts?: number;
  backoffMs?: readonly number[];
  sleep?: (ms: number) => Promise<void>;
}

// The success shape carries the query's own dimensions so a cap cannot
// silently reappear at a new threshold: if `keys` stops tracking the
// user's follow count, or `chunks` stops tracking ceil(keys / 30), the
// sync record shows it.
export type ChunkedFetch =
  | { ok: true; fixtures: Fixture[]; keys: number; chunks: number }
  | { ok: false; error: string; failedChunk: number; chunks: number };

const realSleep = (ms: number): Promise<void> =>
  new Promise((r) => setTimeout(r, ms));

// Deduped, order-preserving. Duplicate keys would waste a slot in a
// 30-wide window, and the caller unions follows with pin keys.
export function chunkFollowKeys(
  keys: readonly string[],
  size: number = FOLLOW_KEY_CHUNK,
): string[][] {
  const unique = [...new Set(keys)];
  const out: string[][] = [];
  for (let i = 0; i < unique.length; i += size) {
    out.push(unique.slice(i, i + size));
  }
  return out;
}

// One fixture can match several chunks at once — it carries a team key and
// a competition key, and those can land in different windows. Keyed by
// fixture id so the union is a set, not a bag.
export function mergeFixtureBatches(
  batches: ReadonlyArray<readonly Fixture[]>,
): Fixture[] {
  const byId = new Map<string, Fixture>();
  for (const batch of batches) {
    for (const f of batch) {
      if (!byId.has(f.id)) byId.set(f.id, f);
    }
  }
  return [...byId.values()];
}

export async function fetchInChunks(
  followedKeys: readonly string[],
  runChunk: ChunkRunner,
  options: ChunkedFetchOptions = {},
): Promise<ChunkedFetch> {
  const {
    chunkSize = FOLLOW_KEY_CHUNK,
    attempts = FETCH_ATTEMPTS,
    backoffMs = BACKOFF_MS,
    sleep = realSleep,
  } = options;
  const chunks = chunkFollowKeys(followedKeys, chunkSize);
  const keys = chunks.reduce((n, c) => n + c.length, 0);
  if (chunks.length === 0) {
    return { ok: true, fixtures: [], keys: 0, chunks: 0 };
  }

  // Accumulated LOCALLY. Nothing here is visible to a caller until the
  // loop has completed every chunk — see the single ok:true return below.
  const batches: Fixture[][] = [];
  for (let i = 0; i < chunks.length; i++) {
    let lastError = '';
    let got: Fixture[] | null = null;
    // Per-chunk retry: a flake on chunk 4 must not re-fetch chunks 1-3,
    // and the whole fetch must not fail for one transient radio drop.
    for (let attempt = 0; attempt < attempts; attempt++) {
      if (attempt > 0) await sleep(backoffMs[attempt - 1] ?? 0);
      try {
        got = await runChunk(chunks[i]);
        break;
      } catch (e) {
        lastError = String(e);
      }
    }
    // THE ENFORCEMENT POINT. A chunk that exhausted its retries aborts the
    // entire fetch here, discarding every batch already collected. There is
    // no code path that returns a partial union.
    if (got === null) {
      return { ok: false, error: lastError, failedChunk: i, chunks: chunks.length };
    }
    batches.push(got);
  }
  // The ONLY success return, reachable only after every chunk succeeded.
  return {
    ok: true,
    fixtures: mergeFixtureBatches(batches),
    keys,
    chunks: chunks.length,
  };
}
