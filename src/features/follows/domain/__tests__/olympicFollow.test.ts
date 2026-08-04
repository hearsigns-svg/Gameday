// The Olympics is the archetypal dormant follow (Prompt 13): followed
// in 2026, delivered in 2028. The guarantee is the same one an athlete
// with no announced events already has, and this pins the link in the
// chain that makes it true — the stored follow must yield its key to
// the fixture query, unchanged, with no poller and no fixtures.

import { followQueryKeys } from '../followScopes';
import { SPORTS } from '../sportsConfig';

const olympics = SPORTS.find((s) => s.key === 'olympics')!;

test('the Olympics ships as a browsable, followable sport', () => {
  expect(olympics.enabled).toBe(true);
  expect(olympics.followTypes).toContain('competition');
  // 39 summer + 15 winter disciplines + the two Games themselves.
  expect(olympics.staticCompetitions).toHaveLength(56);
});

test('every Olympic row is followOnly and carries NO pollPath', () => {
  // There is no poller and no published schedule to poll — Wikidata
  // carries the discipline list and zero start dates. A pollPath here
  // would be a route that 404s on every follow.
  for (const c of olympics.staticCompetitions ?? []) {
    expect(c.followOnly).toBe(true);
    expect(c.pollPath).toBeUndefined();
  }
});

test('a follow made today yields the exact key a 2028 fixture will carry', () => {
  const athletics = (olympics.staticCompetitions ?? []).find(
    (c) => c.key === 'olympics-2028-athletics',
  )!;
  expect(athletics).toBeDefined();
  const stored = {
    key: athletics.key,
    label: athletics.name,
    sportKey: 'olympics',
    type: 'competition' as const,
  };
  // followQueryKeys is what the fixture query actually reads. No scope
  // means the key passes through untouched — so the moment a fixture
  // carrying `olympics-2028-athletics` in its followKeys is ingested,
  // this follow matches it. Nothing about the follow expires meanwhile.
  expect(followQueryKeys(stored)).toEqual(['olympics-2028-athletics']);
});

test('discipline keys descend from their Games key, which is what blocks the marks', () => {
  // functions/src/imagery.ts refuses artwork by PREFIX, so the naming
  // is load-bearing: a discipline that did not start with its Games key
  // would slip past the Olympic-marks exclusion.
  for (const c of olympics.staticCompetitions ?? []) {
    expect(c.key.startsWith('olympics-')).toBe(true);
  }
});
