// 27C team counts: the server emits squad sizes keyed by CLIENT row
// key (statics) or joined onto served soccer rows.
//
// TWO different pins, deliberately:
// - The rowKey ↔ client-sportsConfig mapping is a REAL cross-side drift
//   pin (same class as searchRoutes.test.ts).
// - The teamDirectory doc-id FORMATS are pinned once, at the writer's
//   own builders (directory.ts) — every reader (search.ts, teamCounts)
//   imports those builders, so the compiler ties readers to the writer
//   and this file only has to pin the builder output itself. Restating
//   the formats as literals in each reader was the reviewed-out defect:
//   a writer-key rename would have orphaned every reader with nothing
//   failing.

import {
  __resetCountCacheForTests,
  NATION_LIST_ROW_KEYS,
  soccerRowDocId,
  staticCountRows,
  teamCountsByDoc,
} from '../src/teamCounts';
import {
  fdTeamsDocId,
  listSoccerLeagues,
  mlbTeamsDocId,
  NHL_TEAMS_DOC_ID,
} from '../src/directory';
import { SPORTS } from '../../src/features/follows/domain/sportsConfig';

describe('teamDirectory doc-id builders (the writer is the single source)', () => {
  it('pin the formats production docs already use', () => {
    // These strings are LIVE Firestore doc ids. Changing a builder
    // orphans every existing cache doc — this failing is the point.
    expect(fdTeamsDocId('PL', 2026)).toBe('soccer-fd-PL-2026');
    expect(mlbTeamsDocId(2026)).toBe('baseball-mlb-2026');
    expect(NHL_TEAMS_DOC_ID).toBe('ice-hockey-nhl');
  });
});

describe('staticCountRows ↔ client sportsConfig', () => {
  // Every static competition the client renders a Teams segment for
  // (team drill-down = not followOnly, on a sport that browses teams)
  // must have a count source; a greyed Teams segment needs none.
  // Soccer's DIRECTORY rows count via listLeagues, but its STATICS are
  // client-merged and can only count through this map — Copa
  // Libertadores became the first drillable one (2026-08-28 sweep), so
  // the old soccer exclusion no longer models reality.
  const clientDrillable = SPORTS.filter((s) =>
    s.browse.includes('team'),
  ).flatMap((s) =>
    (s.staticCompetitions ?? []).filter((c) => !c.followOnly).map((c) => c.key),
  );

  it('covers every drillable client static except the nation lists', () => {
    const rowKeys = staticCountRows().map((r) => r.rowKey);
    expect(rowKeys.sort()).toEqual(
      clientDrillable.filter((k) => !NATION_LIST_ROW_KEYS.has(k)).sort(),
    );
  });

  it('every nation-list exception is a REAL drillable row', () => {
    // A typo'd key here would silently exclude nothing — the same
    // failure mode the sport-key pins exist for.
    for (const k of NATION_LIST_ROW_KEYS) {
      expect(clientDrillable).toContain(k);
    }
  });
});

describe('soccerRowDocId', () => {
  it('maps fd rows to their per-season doc and cups to nothing', () => {
    expect(soccerRowDocId({ id: 'PL', season: 2026 })).toBe(
      fdTeamsDocId('PL', 2026),
    );
    expect(soccerRowDocId({ id: '4482', followOnly: true })).toBeUndefined();
    // Nation lists never emit a count, even when a season resolves and
    // the row is drillable (World Cup, Euros).
    expect(soccerRowDocId({ id: 'WC', season: 2026 })).toBeUndefined();
    // TSDB-seeded leagues go through the shared table, per-season not
    // applicable (the doc id is season-less by design).
    expect(soccerRowDocId({ id: '4396' })).toBe('soccer-4396');
  });

  it('resolves a doc for every drillable served soccer row', () => {
    // Empty season map = TSDB rows only; the fd half is covered by the
    // explicit case above (fd rows only exist when a season resolves,
    // and then always carry it).
    for (const row of listSoccerLeagues(new Map())) {
      const followOnly = 'followOnly' in row && row.followOnly === true;
      if (followOnly) {
        expect(soccerRowDocId(row)).toBeUndefined();
      } else {
        expect(soccerRowDocId(row)).toBeDefined();
      }
    }
  });
});

describe('teamCountsByDoc', () => {
  beforeEach(() => __resetCountCacheForTests());

  interface FakeSnap {
    exists: boolean;
    data: () => { teams?: unknown[] } | undefined;
  }

  const fakeDb = (
    docs: Record<string, unknown[] | undefined>,
    log: string[] = [],
  ) =>
    ({
      collection: () => ({ doc: (id: string) => ({ id }) }),
      getAll: async (...refs: Array<{ id: string }>): Promise<FakeSnap[]> => {
        log.push(...refs.map((r) => r.id));
        return refs.map((r) => ({
          exists: docs[r.id] !== undefined,
          data: () => (docs[r.id] ? { teams: docs[r.id] } : undefined),
        }));
      },
      // Only the two members the helper touches.
    }) as never;

  it('counts existing docs, omits missing and empty ones', async () => {
    const db = fakeDb({
      'soccer-fd-PL-2026': new Array(20).fill({}),
      'basketball-nba': new Array(30).fill({}),
      'soccer-4396': [],
    });
    const counts = await teamCountsByDoc(db, [
      'soccer-fd-PL-2026',
      'basketball-nba',
      'soccer-4396',
      'nowhere',
    ]);
    expect(counts.get('soccer-fd-PL-2026')).toBe(20);
    expect(counts.get('basketball-nba')).toBe(30);
    // A zero-length directory and a missing one both mean "no count":
    // "· 0 teams" in a subtitle would be worse than silence.
    expect(counts.has('soccer-4396')).toBe(false);
    expect(counts.has('nowhere')).toBe(false);
  });

  it('caches per doc — a second call within the window reads nothing', async () => {
    const log: string[] = [];
    const db = fakeDb({ 'basketball-nba': new Array(30).fill({}) }, log);
    await teamCountsByDoc(db, ['basketball-nba', 'nowhere']);
    const counts = await teamCountsByDoc(db, ['basketball-nba', 'nowhere']);
    expect(counts.get('basketball-nba')).toBe(30);
    // Missing docs are remembered as missing, not re-fetched.
    expect(log).toEqual(['basketball-nba', 'nowhere']);
  });

  it('degrades to the surviving cache when the read fails', async () => {
    const db = fakeDb({ 'basketball-nba': new Array(30).fill({}) });
    await teamCountsByDoc(db, ['basketball-nba']);
    const broken = {
      collection: () => ({ doc: (id: string) => ({ id }) }),
      getAll: async () => {
        throw new Error('unavailable');
      },
    } as never;
    // Cached doc still served; the un-cached one is absent, not an error.
    const counts = await teamCountsByDoc(broken, ['basketball-nba']);
    expect(counts.get('basketball-nba')).toBe(30);
    __resetCountCacheForTests();
    const empty = await teamCountsByDoc(broken, ['basketball-nba']);
    expect(empty.size).toBe(0);
  });
});
