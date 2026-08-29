// football-data season resolution. One global constant said 2026 for
// twelve competitions that do not share a season — verified live
// 2026-07-31, the Champions League was on 2025 and the European
// Championship on 2024, and both 404'd.

import { FieldValue, Firestore } from 'firebase-admin/firestore';
import {
  invalidateFdSeasons,
  loadFdSeasons,
  reresolveAfter404,
  resolvableSeasons,
} from '../fdSeasons';

const NOW = '2026-07-31T12:00:00.000Z';

describe('resolvableSeasons', () => {
  test('a live season resolves to its START year', () => {
    // /matches?season= expects the start year, not the end year.
    const [pl] = resolvableSeasons(
      [{ code: 'PL', currentSeason: { startDate: '2026-08-21', endDate: '2027-05-30' } }],
      NOW,
    );
    expect(pl).toEqual({
      code: 'PL',
      seasonYear: 2026,
      startDate: '2026-08-21',
      endDate: '2027-05-30',
    });
  });

  test('a season that has ALREADY ENDED does not resolve', () => {
    // The real CL and EC rows. They resolve to a season the provider will
    // happily serve — and every match in it has been played.
    expect(
      resolvableSeasons(
        [
          { code: 'CL', currentSeason: { startDate: '2025-09-16', endDate: '2026-05-30' } },
          { code: 'EC', currentSeason: { startDate: '2024-06-14', endDate: '2024-07-14' } },
        ],
        NOW,
      ),
    ).toEqual([]);
  });

  test('a season ending TODAY still resolves — it may still be playing', () => {
    const r = resolvableSeasons(
      [{ code: 'X', currentSeason: { startDate: '2026-01-01', endDate: '2026-07-31' } }],
      NOW,
    );
    expect(r).toHaveLength(1);
  });

  test('a season starting in the future resolves — fixtures are published early', () => {
    // The Premier League's 2026-27 fixtures exist well before August.
    const r = resolvableSeasons(
      [{ code: 'PL', currentSeason: { startDate: '2026-08-21', endDate: '2027-05-30' } }],
      NOW,
    );
    expect(r[0].seasonYear).toBe(2026);
  });

  test('a missing or null currentSeason is skipped, not guessed', () => {
    expect(
      resolvableSeasons(
        [{ code: 'A' }, { code: 'B', currentSeason: null }, { code: 'C', currentSeason: {} }],
        NOW,
      ),
    ).toEqual([]);
  });

  test('a row with no code is skipped', () => {
    expect(
      resolvableSeasons(
        [{ currentSeason: { startDate: '2026-08-21', endDate: '2027-05-30' } }],
        NOW,
      ),
    ).toEqual([]);
  });
});

// ─── Cache invalidation on a season-flip 404 (Round 3 ruling 5) ───────
//
// During the CL draw week the provider moves currentSeason while the
// cached copy still holds the old year, and the 24h TTL serves the stale
// season — so the poller 404s for up to a day. These pin that a 404
// marks the cache stale (forcing the next load to refetch) WITHOUT
// destroying the copy that loadFdSeasons serves through an outage.

const NOW_MS = Date.parse(NOW);

// Just enough Firestore for the one-doc seasons cache: get, and set with
// merge honouring FieldValue.delete() — the only sentinel this cache
// writes.
function fakeSeasonsDb(initial?: Record<string, unknown>) {
  let stored: Record<string, unknown> | undefined = initial;
  const db = {
    collection: () => ({
      doc: () => ({
        get: async () => ({ exists: stored !== undefined, data: () => stored }),
        set: async (
          value: Record<string, unknown>,
          opts?: { merge?: boolean },
        ) => {
          const next = opts?.merge ? { ...(stored ?? {}) } : {};
          for (const [k, v] of Object.entries(value)) {
            if (v instanceof FieldValue) delete next[k];
            else next[k] = v;
          }
          stored = next;
        },
      }),
    }),
  };
  return { db: db as unknown as Firestore, read: () => stored };
}

const clRow = (startYear: number) => ({
  code: 'CL',
  currentSeason: {
    startDate: `${startYear}-09-16`,
    endDate: `${startYear + 1}-05-30`,
  },
});

const competitionsRes = (rows: unknown[]): Response =>
  ({ ok: true, json: async () => ({ competitions: rows }) }) as Response;

// The stale-but-fresh cache the flip week leaves behind: CL still on
// 2025, cachedAt inside the TTL.
const staleClCache = () => ({
  seasons: [
    {
      code: 'CL',
      seasonYear: 2025,
      startDate: '2025-09-16',
      endDate: '2026-05-30',
    },
  ],
  cachedAt: new Date(NOW_MS - 3_600_000).toISOString(),
});

afterEach(() => {
  (global.fetch as jest.Mock | undefined)?.mockRestore?.();
});

describe('invalidateFdSeasons', () => {
  test('a fresh cache serves without a fetch; invalidation forces the refetch', async () => {
    const { db, read } = fakeSeasonsDb(staleClCache());
    global.fetch = jest.fn(async () =>
      competitionsRes([clRow(2026)]),
    ) as unknown as typeof fetch;

    // Inside the TTL the stale year is served and the provider is not
    // consulted — exactly the day-long staleness under repair.
    expect((await loadFdSeasons(db, 'k', NOW_MS)).get('CL')?.seasonYear).toBe(2025);
    expect(global.fetch).not.toHaveBeenCalled();

    await invalidateFdSeasons(db);
    expect((await loadFdSeasons(db, 'k', NOW_MS)).get('CL')?.seasonYear).toBe(2026);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    // The refetch re-arms the TTL — invalidation is one forced refresh,
    // not a permanently disabled cache.
    expect(read()?.cachedAt).toBe(NOW);
  });

  test('invalidation keeps the stale copy for the outage fallback', async () => {
    const { db } = fakeSeasonsDb(staleClCache());
    global.fetch = jest.fn(async () =>
      ({ ok: false, status: 503 }) as Response,
    ) as unknown as typeof fetch;

    await invalidateFdSeasons(db);
    // Refetch forced, refresh down: the kept seasons list still serves —
    // deleting the doc here would have blanked every soccer competition.
    expect((await loadFdSeasons(db, 'k', NOW_MS)).get('CL')?.seasonYear).toBe(2025);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});

describe('reresolveAfter404', () => {
  test('hands back the season only when a fresh resolution changed it', async () => {
    const { db } = fakeSeasonsDb(staleClCache());
    global.fetch = jest.fn(async () =>
      competitionsRes([clRow(2026)]),
    ) as unknown as typeof fetch;
    expect(await reresolveAfter404(db, 'k', 'CL', 2025, NOW_MS)).toBe(2026);
  });

  test('an unexplained 404 yields undefined — the caller must rethrow, not serve empty', async () => {
    const { db } = fakeSeasonsDb(staleClCache());
    global.fetch = jest.fn(async () =>
      competitionsRes([clRow(2025)]),
    ) as unknown as typeof fetch;
    // The provider still says 2025: the 404 was not staleness, so there
    // is no different season to retry with.
    expect(await reresolveAfter404(db, 'k', 'CL', 2025, NOW_MS)).toBeUndefined();
  });

  test('a refresh that can only serve the stale copy yields undefined', async () => {
    const { db } = fakeSeasonsDb(staleClCache());
    global.fetch = jest.fn(async () =>
      ({ ok: false, status: 503 }) as Response,
    ) as unknown as typeof fetch;
    // Same year back from the fallback copy — retrying it would repeat
    // the identical request that just 404'd.
    expect(await reresolveAfter404(db, 'k', 'CL', 2025, NOW_MS)).toBeUndefined();
  });

  test('a competition gone from the fresh answer yields undefined', async () => {
    const { db } = fakeSeasonsDb(staleClCache());
    global.fetch = jest.fn(async () =>
      competitionsRes([]),
    ) as unknown as typeof fetch;
    expect(await reresolveAfter404(db, 'k', 'CL', 2025, NOW_MS)).toBeUndefined();
  });
});
