// The property these tests exist for: a fetch either returns every chunk
// or it fails. A partial union reaching planSync is indistinguishable from
// an unfollow, and planSync deletes what it cannot find.

import { Fixture } from '../fixture';
import {
  chunkFollowKeys,
  fetchInChunks,
  FOLLOW_KEY_CHUNK,
  mergeFixtureBatches,
} from '../fixtureQuery';

const fixture = (id: string, followKeys: string[]): Fixture => ({
  id,
  sport: 'soccer',
  competition: 'Premier League',
  competitionId: 'fdorg-comp-PL',
  title: 'A v B',
  followKeys,
  startUtc: '2026-12-25T15:00:00.000Z',
  venueTz: 'UTC',
  status: 'scheduled',
  updatedAt: '2026-07-31T00:00:00.000Z',
});

const keys = (n: number, prefix = 'k'): string[] =>
  Array.from({ length: n }, (_, i) => `${prefix}${i}`);

// No real backoff in tests; the sleep seam keeps them instant.
const noSleep = async () => {};
const opts = { sleep: noSleep };

describe('chunking', () => {
  test('the window is 30 — Firestore array-contains-any', () => {
    expect(FOLLOW_KEY_CHUNK).toBe(30);
  });

  test('splits on exactly the window size', () => {
    expect(chunkFollowKeys(keys(30)).length).toBe(1);
    expect(chunkFollowKeys(keys(31)).length).toBe(2);
    expect(chunkFollowKeys(keys(31))[1]).toEqual(['k30']);
    expect(chunkFollowKeys(keys(90)).length).toBe(3);
  });

  test('every key lands in exactly one chunk — nothing is dropped', () => {
    const all = keys(97);
    const flat = chunkFollowKeys(all).flat();
    expect(flat.length).toBe(97);
    expect(new Set(flat)).toEqual(new Set(all));
  });

  test('dedupes: follows and pin keys overlap, and a repeat wastes a slot', () => {
    expect(chunkFollowKeys(['a', 'b', 'a', 'c', 'b'])).toEqual([
      ['a', 'b', 'c'],
    ]);
  });

  test('no keys means no chunks, not one empty chunk', () => {
    // An empty array-contains-any is a Firestore error, so this must not
    // produce a chunk to run.
    expect(chunkFollowKeys([])).toEqual([]);
  });
});

describe('union', () => {
  test('a fixture matching two chunks appears once', () => {
    // Real shape: a fixture carries a team key and a competition key, and
    // a long follow list puts them in different windows.
    const f = fixture('fdorg-1', ['fdorg-team-64', 'fdorg-comp-PL']);
    expect(mergeFixtureBatches([[f], [f]]).length).toBe(1);
  });

  test('distinct fixtures all survive', () => {
    const a = fixture('a', ['k1']);
    const b = fixture('b', ['k2']);
    const c = fixture('c', ['k3']);
    expect(mergeFixtureBatches([[a, b], [c]]).map((f) => f.id)).toEqual([
      'a',
      'b',
      'c',
    ]);
  });
});

describe('all-or-nothing', () => {
  test('every chunk is queried and the union is complete', async () => {
    const asked: string[][] = [];
    const r = await fetchInChunks(
      keys(75),
      async (k) => {
        asked.push([...k]);
        return k.map((key) => fixture(`fx-${key}`, [key]));
      },
      opts,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.chunks).toBe(3);
    expect(asked.map((a) => a.length)).toEqual([30, 30, 15]);
    expect(r.fixtures.length).toBe(75);
  });

  test('ONE failing chunk fails the whole fetch — no partial union', async () => {
    // The load-bearing test. Chunks 1 and 3 return real fixtures; chunk 2
    // never recovers. If this ever returns ok with 60 of 90 fixtures, the
    // next sync deletes a third of the user's calendar.
    const r = await fetchInChunks(
      keys(90),
      async (k) => {
        if (k[0] === 'k30') throw new Error('unavailable: backend unreachable');
        return k.map((key) => fixture(`fx-${key}`, [key]));
      },
      opts,
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.failedChunk).toBe(1);
    expect(r.chunks).toBe(3);
    expect(r.error).toContain('unavailable');
    // There is no fixtures field on the failure shape at all — a partial
    // union is not merely unreturned, it is unrepresentable.
    expect('fixtures' in r).toBe(false);
  });

  test('a failure on the LAST chunk discards every earlier success', async () => {
    let delivered = 0;
    const r = await fetchInChunks(
      keys(90),
      async (k) => {
        if (k[0] === 'k60') throw new Error('timeout');
        delivered += k.length;
        return k.map((key) => fixture(`fx-${key}`, [key]));
      },
      opts,
    );
    expect(delivered).toBe(60); // 60 fixtures really were fetched…
    expect(r.ok).toBe(false); // …and none of them are returned
  });

  test('a chunk that recovers within its retries does not fail the fetch', async () => {
    let calls = 0;
    const r = await fetchInChunks(
      keys(60),
      async (k) => {
        calls++;
        if (k[0] === 'k30' && calls < 4) throw new Error('transient');
        return k.map((key) => fixture(`fx-${key}`, [key]));
      },
      opts,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.fixtures.length).toBe(60);
  });

  test('retries are bounded and per-chunk, not per-fetch', async () => {
    const perChunk = new Map<string, number>();
    await fetchInChunks(
      keys(90),
      async (k) => {
        perChunk.set(k[0], (perChunk.get(k[0]) ?? 0) + 1);
        if (k[0] === 'k30') throw new Error('down');
        return [];
      },
      opts,
    );
    // Chunk 1 succeeded once; chunk 2 burned its three attempts and
    // aborted; chunk 3 was never reached.
    expect(perChunk.get('k0')).toBe(1);
    expect(perChunk.get('k30')).toBe(3);
    expect(perChunk.get('k60')).toBeUndefined();
  });

  test('backoff is applied between attempts, not before the first', async () => {
    const slept: number[] = [];
    await fetchInChunks(
      keys(5),
      async () => {
        throw new Error('down');
      },
      { sleep: async (ms) => void slept.push(ms) },
    );
    expect(slept).toEqual([800, 2400]);
  });

  test('an empty key list is a success with nothing in it, never a failure', async () => {
    const r = await fetchInChunks([], async () => {
      throw new Error('must not be called');
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.fixtures).toEqual([]);
    expect(r.chunks).toBe(0);
  });

  test('a genuinely empty result is still a success — emptiness is not failure', async () => {
    // The inverse of the standing invariant: a real server answer of "no
    // fixtures" must not be dressed up as an error either.
    const r = await fetchInChunks(keys(40), async () => [], opts);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.fixtures).toEqual([]);
    expect(r.chunks).toBe(2);
  });
});

describe('the cap that was removed', () => {
  test('the 11th follow onward is now queried', async () => {
    // Under `followedKeys.slice(0, 10)` only k0..k9 were ever sent.
    const asked: string[] = [];
    await fetchInChunks(
      keys(25),
      async (k) => {
        asked.push(...k);
        return [];
      },
      opts,
    );
    expect(asked).toContain('k10');
    expect(asked).toContain('k24');
    expect(asked.length).toBe(25);
  });

  test('pin keys appended after follows survive — they were dropped first', async () => {
    // syncEngine passes [...follows, ...pinFollowKeys()]. With 40 follows
    // the pin keys sat at positions 41+ and slice(0,10) never saw them.
    const followKeys = keys(40, 'follow');
    const pinKeys = ['pin-comp-A', 'pin-comp-B'];
    const asked: string[] = [];
    await fetchInChunks(
      [...followKeys, ...pinKeys],
      async (k) => {
        asked.push(...k);
        return [];
      },
      opts,
    );
    expect(asked).toContain('pin-comp-A');
    expect(asked).toContain('pin-comp-B');
  });
});
