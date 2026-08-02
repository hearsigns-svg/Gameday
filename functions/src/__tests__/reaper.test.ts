// The reaper's decision logic. Every guard here exists because ingest
// never deletes, so the only thing standing between "the provider
// withdrew this fixture" and "a broken fetch just cancelled a slice" is
// this function's conservatism.

import { Fixture } from '../fixture';
import { reapCandidates, REAP_CEILING } from '../reaper';

const NOW = '2026-08-10T00:00:00.000Z';

const fx = (over: Partial<Fixture> = {}): Fixture => ({
  id: 'tsdb-1000',
  sport: 'basketball',
  competition: 'NBA',
  competitionId: 'tsdb-league-4387',
  title: 'A at B',
  followKeys: ['tsdb-league-4387'],
  startUtc: '2026-09-01T00:00:00.000Z',
  status: 'scheduled',
  updatedAt: NOW,
  ...over,
});

test('a future same-source doc absent from a non-empty fetch is a candidate', () => {
  const kept = Array.from({ length: 9 }, (_, i) =>
    fx({
      id: `tsdb-${i}`,
      startUtc: `2026-09-${String(i + 1).padStart(2, '0')}T00:00:00.000Z`,
    }),
  );
  const gone = fx({ id: 'tsdb-1001', startUtc: '2026-09-02T12:00:00.000Z' });
  const d = reapCandidates([gone, ...kept], kept, 'tsdb', NOW);
  expect(d.candidates.map((c) => c.id)).toEqual(['tsdb-1001']);
  expect(d.guardTripped).toBe(false);
});

test('a season-EDGE withdrawal just beyond the remaining fixtures is still provable-absent (the pad)', () => {
  const kept = Array.from({ length: 9 }, (_, i) =>
    fx({
      id: `tsdb-${i}`,
      startUtc: `2026-09-${String(i + 1).padStart(2, '0')}T00:00:00.000Z`,
    }),
  );
  // A finale three days after the last remaining fixture.
  const finale = fx({ id: 'tsdb-1001', startUtc: '2026-09-12T00:00:00.000Z' });
  const d = reapCandidates([finale, ...kept], kept, 'tsdb', NOW);
  expect(d.candidates.map((c) => c.id)).toEqual(['tsdb-1001']);
});

test('an empty fetch proves nothing — no candidates, ever', () => {
  const d = reapCandidates([fx()], [], 'tsdb', NOW);
  expect(d.candidates).toEqual([]);
});

test('SOURCE guard: a cross-provider doc carrying this slice key is never a candidate', () => {
  // A merged fixture keeps the earliest id (fdorg) but carries the tsdb
  // followKey — a TSDB fetch proves nothing about it.
  const merged = fx({
    id: 'fdorg-500',
    startUtc: '2026-09-02T00:00:00.000Z',
    followKeys: ['fdorg-comp-FAC', 'tsdb-league-4482'],
  });
  const d = reapCandidates([merged, fx()], [fx()], 'tsdb', NOW);
  expect(d.candidates).toEqual([]);
  expect(d.liveCount).toBe(1); // the merged doc is not even measured
});

test('SEASON guard: a doc outside the fetched date envelope is spared', () => {
  // The fetch returned the 2026 season (Sep–Dec). A pre-announced
  // 2027 fixture is absent from it — and outside its envelope, so the
  // fetch may not testify about it.
  const nextSeason = fx({
    id: 'tsdb-2001',
    startUtc: '2027-02-01T00:00:00.000Z',
  });
  const inSeason = [
    fx({ id: 'tsdb-1000', startUtc: '2026-09-01T00:00:00.000Z' }),
    fx({ id: 'tsdb-1002', startUtc: '2026-12-01T00:00:00.000Z' }),
  ];
  const d = reapCandidates([nextSeason, ...inSeason], inSeason, 'tsdb', NOW);
  expect(d.candidates).toEqual([]);
});

test('APPEARANCES are never reaped — retirement owns them', () => {
  const appearance = fx({
    id: 'tsdb-1000-app-alpha-adams-bravo-brown',
    parentFixtureId: 'tsdb-1000',
    startUtc: '2026-09-02T00:00:00.000Z',
    followKeys: ['tsdb-league-4387-appearances', 'athlete-alpha-adams'],
  });
  const d = reapCandidates([appearance, fx()], [fx()], 'tsdb', NOW);
  expect(d.candidates).toEqual([]);
});

test('the past is frozen and the cancelled stay put', () => {
  const past = fx({ id: 'tsdb-1003', startUtc: '2026-07-01T00:00:00.000Z' });
  const cancelled = fx({
    id: 'tsdb-1004',
    startUtc: '2026-09-02T00:00:00.000Z',
    status: 'cancelled',
  });
  const d = reapCandidates([past, cancelled, fx()], [fx()], 'tsdb', NOW);
  expect(d.candidates).toEqual([]);
});

test('the 20% ceiling trips as a broken-fetch detector — candidates listed, nothing applied', () => {
  // Ten live docs, a fetch that returns only seven of them (with the
  // envelope still spanning the three missing) — 30% missing is a
  // broken fetch, not a mass withdrawal.
  const live = Array.from({ length: 10 }, (_, i) =>
    fx({ id: `tsdb-${i}`, startUtc: `2026-09-${String(i + 1).padStart(2, '0')}T00:00:00.000Z` }),
  );
  const returned = [live[0], live[3], live[4], live[5], live[6], live[7], live[9]];
  const d = reapCandidates(live, returned, 'tsdb', NOW);
  expect(d.guardTripped).toBe(true);
  expect(d.candidates.map((c) => c.id).sort()).toEqual([
    'tsdb-1',
    'tsdb-2',
    'tsdb-8',
  ]);
  expect(3 / d.liveCount).toBeGreaterThan(REAP_CEILING);
});

test('exactly 20% does not trip — the ceiling is strict', () => {
  const live = Array.from({ length: 10 }, (_, i) =>
    fx({ id: `tsdb-${i}`, startUtc: `2026-09-${String(i + 1).padStart(2, '0')}T00:00:00.000Z` }),
  );
  const returned = live.filter((_, i) => i !== 2 && i !== 5);
  const d = reapCandidates(live, returned, 'tsdb', NOW);
  expect(d.guardTripped).toBe(false);
  expect(d.candidates).toHaveLength(2);
});
