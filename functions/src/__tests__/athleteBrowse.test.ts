// Individual-sport browse shaping and the canonical athlete search —
// the server side of §4: search-first, curated entry points so the
// screen is never empty, competing-soon, and the honest treatment of
// inactive athletes (hidden from curated lists, still findable).

import { Athlete } from '../athletes';
import { normaliseName } from '../identity';
import {
  COMPETING_SOON_DAYS,
  GROUP_CAP,
  groupOrderKey,
  shapeAthleteBrowse,
} from '../search';

const NOW = '2026-08-03T00:00:00.000Z';

const athlete = (over: Partial<Athlete> & { id: string }): Athlete => ({
  displayName: 'Nobody',
  searchName: normaliseName(over.displayName ?? 'Nobody'),
  aliases: [],
  sport: 'boxing',
  providerIds: {},
  identities: [],
  provenance: 'roster',
  nameKeyed: true,
  active: true,
  missedRefreshes: 0,
  createdAt: NOW,
  updatedAt: NOW,
  ...over,
});

describe('shapeAthleteBrowse', () => {
  const usyk = athlete({
    id: 'athlete_000001',
    displayName: 'Oleksandr Usyk',
    grouping: 'Heavyweight',
    groupingKey: 'boxing-heavyweight',
    championOf: ['WBA', 'WBC'],
  });
  const itauma = athlete({
    id: 'athlete_000002',
    displayName: 'Moses Itauma',
    grouping: 'Heavyweight',
    groupingKey: 'boxing-heavyweight',
    rank: 3,
    nextStartUtc: '2026-08-16T00:00:00.000Z',
  });
  const sanchez = athlete({
    id: 'athlete_000003',
    displayName: 'Frank Sanchez',
    grouping: 'Heavyweight',
    groupingKey: 'boxing-heavyweight',
    rank: 1,
  });
  const paro = athlete({
    id: 'athlete_000004',
    displayName: 'Liam Paro',
    grouping: 'Welterweight',
    groupingKey: 'boxing-welterweight',
    championOf: ['IBF'],
  });
  const meinke = athlete({
    id: 'athlete_000005',
    displayName: 'Nina Meinke',
    grouping: "Women's Featherweight",
    groupingKey: 'boxing-w-featherweight',
    championOf: ['IBF'],
  });
  const retired = athlete({
    id: 'athlete_000006',
    displayName: 'Retired Fighter',
    grouping: 'Heavyweight',
    groupingKey: 'boxing-heavyweight',
    active: false,
  });

  test('groups follow the weight-class order, champions lead inside each', () => {
    const b = shapeAthleteBrowse(
      [meinke, paro, usyk, itauma, sanchez, retired],
      'boxing',
      NOW,
    );
    expect(b.groups.map((g) => g.groupingKey)).toEqual([
      'boxing-heavyweight',
      'boxing-welterweight',
      'boxing-w-featherweight', // women's classes after men's
    ]);
    // Usyk (champion) before Sanchez (#1) before Itauma (#3).
    expect(b.groups[0].athletes.map((a) => a.name)).toEqual([
      'Oleksandr Usyk',
      'Frank Sanchez',
      'Moses Itauma',
    ]);
    // Inactive athletes never appear in curated lists.
    expect(
      b.groups[0].athletes.some((a) => a.name === 'Retired Fighter'),
    ).toBe(false);
  });

  test('competing soon: inside the window, soonest first; nothing-scheduled athletes absent', () => {
    const b = shapeAthleteBrowse([usyk, itauma, sanchez], 'boxing', NOW);
    expect(b.competingSoon.map((a) => a.name)).toEqual(['Moses Itauma']);
    const beyond = athlete({
      id: 'athlete_000007',
      displayName: 'Far Future',
      groupingKey: 'boxing-heavyweight',
      grouping: 'Heavyweight',
      nextStartUtc: new Date(
        Date.parse(NOW) + (COMPETING_SOON_DAYS + 10) * 86_400_000,
      ).toISOString(),
    });
    expect(
      shapeAthleteBrowse([beyond], 'boxing', NOW).competingSoon,
    ).toHaveLength(0);
  });

  test('a past nextStartUtc reads as nothing upcoming', () => {
    const stale = athlete({
      id: 'athlete_000008',
      displayName: 'Between Fights',
      grouping: 'Heavyweight',
      groupingKey: 'boxing-heavyweight',
      nextStartUtc: '2026-07-01T00:00:00.000Z',
    });
    expect(shapeAthleteBrowse([stale], 'boxing', NOW).competingSoon).toEqual(
      [],
    );
  });

  test('groups cap at GROUP_CAP — tennis top 50 from a 200-deep roster', () => {
    const many = Array.from({ length: 120 }, (_, i) =>
      athlete({
        id: `athlete_${String(i + 100).padStart(6, '0')}`,
        displayName: `Player Number${i}`,
        sport: 'tennis',
        grouping: 'WTA Tour',
        groupingKey: 'wta',
        rank: i + 1,
      }),
    );
    const b = shapeAthleteBrowse(many, 'tennis', NOW);
    expect(b.groups[0].athletes).toHaveLength(GROUP_CAP);
    expect(b.groups[0].athletes[0].rank).toBe(1);
  });

  test('sports never mix', () => {
    const b = shapeAthleteBrowse([usyk], 'tennis', NOW);
    expect(b.groups).toHaveLength(0);
  });
});

describe('groupOrderKey', () => {
  test('heavier before lighter, men before women, unknown groups last', () => {
    const order = [
      'boxing-heavyweight',
      'boxing-mini-flyweight',
      'boxing-w-featherweight',
      'wta',
    ].sort((a, b) => groupOrderKey(a).localeCompare(groupOrderKey(b)));
    expect(order).toEqual([
      'boxing-heavyweight',
      'boxing-mini-flyweight',
      'boxing-w-featherweight',
      'wta',
    ]);
  });
});
