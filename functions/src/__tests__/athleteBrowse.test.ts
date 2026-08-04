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

  test('tennis: women, then the men still playing, then the retired', () => {
    // The middle rank is the fix (Prompt 12). Shuffled input, because
    // the ordering must come from the comparator and not from whatever
    // order Firestore happened to return.
    const order = [
      'atp-no1-retired',
      'wta',
      'atp-no1',
      'atp-no1-active',
    ].sort((a, b) => groupOrderKey(a).localeCompare(groupOrderKey(b)));
    // The legacy unsplit key sorts between the two it becomes.
    expect(order).toEqual([
      'wta',
      'atp-no1-active',
      'atp-no1',
      'atp-no1-retired',
    ]);
  });
});

// ─── Prompt 12: titles come from the KEY, not from a stored string ────

describe('group titles', () => {
  const men = (over: Partial<Athlete> & { id: string }): Athlete =>
    athlete({ sport: 'tennis', ...over });

  test('the header is resolved from groupingKey, overriding a stale stored grouping', () => {
    // The draw-mint path writes `grouping` once at creation and never
    // patches it, so a doc CAN carry last release's string forever.
    // The header must not be at its mercy.
    const b = shapeAthleteBrowse(
      [
        men({
          id: 'athlete_000900',
          displayName: 'Stale Doc',
          grouping: 'WTA Tour', // the pre-Prompt-12 string, still stored
          groupingKey: 'wta',
          rank: 1,
        }),
      ],
      'tennis',
      NOW,
    );
    expect(b.groups[0].grouping).toBe('WTA Tour — Women');
    expect(b.groups[0].athletes[0].grouping).toBe('WTA Tour — Women');
  });

  test('an unknown key falls back to the stored string, then to the key', () => {
    // Deploy skew in the other direction: a group this build has never
    // heard of must still render something, and must never render
    // `undefined`.
    const b = shapeAthleteBrowse(
      [
        men({
          id: 'athlete_000901',
          displayName: 'Future Group',
          grouping: 'Some Future Group',
          groupingKey: 'atp-future',
        }),
        men({
          id: 'athlete_000902',
          displayName: 'Naked Key',
          groupingKey: 'atp-nameless',
        }),
      ],
      'tennis',
      NOW,
    );
    const titles = b.groups.map((g) => g.grouping);
    expect(titles).toContain('Some Future Group');
    expect(titles).toContain('atp-nameless');
  });

  test('THE DEPLOY WINDOW: unmigrated docs never render a retirement claim', () => {
    // Exactly production's shape on the day this deploys — 29 docs
    // still on the legacy key, none carrying a marker, because only
    // the weekly roster refresh writes the split. The first cut titled
    // this group "…— retired" and put Alcaraz under it. Nothing in
    // this test may ever say "retired".
    const legacy = [
      'Andre Agassi',
      'Björn Borg',
      'Carlos Alcaraz',
      'Jannik Sinner',
      'Novak Djokovic',
      'Daniil Medvedev',
    ].map((displayName, i) =>
      men({
        id: `athlete_00093${i}`,
        displayName,
        grouping: 'Former world No. 1s', // the string stored today
        groupingKey: 'atp-no1',
      }),
    );
    const b = shapeAthleteBrowse(legacy, 'tennis', NOW);
    expect(b.groups).toHaveLength(1);
    expect(b.groups[0].grouping).toBe("Men's world No. 1s");
    expect(b.groups[0].grouping).not.toMatch(/retired|still playing/);
    // And every CARD caption too — the row is where the lie was
    // actually readable, because these docs carry nothing else.
    for (const a of b.groups[0].athletes) {
      expect(a.grouping).toBe("Men's world No. 1s");
      expect(a.careerStatus).toBeUndefined();
    }
  });

  test('RETIRED ATHLETES ARE NOT BROWSABLE, whatever key their doc still carries', () => {
    // Owner ruling 2026-08-04. The filter is at serve time precisely
    // because a stale groupingKey survives every refresh that stops
    // emitting one — the doc below still says atp-no1-retired and must
    // still produce NO section.
    const b = shapeAthleteBrowse(
      [
        men({ id: 'athlete_000940', groupingKey: 'atp-no1-active' }),
        men({
          id: 'athlete_000942',
          groupingKey: 'atp-no1-retired',
          careerStatus: 'retired',
          careerEndYear: 1993,
        }),
        men({
          id: 'athlete_000943',
          groupingKey: 'wta',
          rank: 4,
          careerStatus: 'retired',
        }),
      ],
      'tennis',
      NOW,
    );
    expect(b.groups.map((g) => g.grouping)).toEqual([
      "Men's world No. 1s — still playing",
    ]);
    expect(
      b.groups.flatMap((g) => g.athletes).some((a) => a.careerStatus),
    ).toBe(false);
  });

  test('tennis browse is TWO groups: women, then the men still playing', () => {
    const b = shapeAthleteBrowse(
      [
        men({ id: 'athlete_000944', groupingKey: 'atp-no1-active' }),
        men({ id: 'athlete_000945', groupingKey: 'wta', rank: 1 }),
        men({
          id: 'athlete_000946',
          groupingKey: 'atp-no1-retired',
          careerStatus: 'retired',
        }),
      ],
      'tennis',
      NOW,
    );
    expect(b.groups.map((g) => g.grouping)).toEqual([
      'WTA Tour — Women',
      "Men's world No. 1s — still playing",
    ]);
  });

  test('every tennis group a user can land on names its population', () => {
    // The complaint this stage answers: "WTA Tour" said nothing about
    // women and "Former world No. 1s" said nothing about men.
    const b = shapeAthleteBrowse(
      [
        men({ id: 'athlete_000910', groupingKey: 'wta', rank: 1 }),
        men({ id: 'athlete_000911', groupingKey: 'atp-no1-active' }),
      ],
      'tennis',
      NOW,
    );
    expect(b.groups.map((g) => g.grouping)).toEqual([
      'WTA Tour — Women',
      "Men's world No. 1s — still playing",
    ]);
  });

  test('no card in browse carries a retirement, because none of them can', () => {
    const b = shapeAthleteBrowse(
      [
        men({
          id: 'athlete_000920',
          displayName: 'Retired Man',
          groupingKey: 'atp-no1-retired',
          careerStatus: 'retired',
          careerEndYear: 2022,
        }),
        men({
          id: 'athlete_000921',
          displayName: 'Unmarked Man',
          groupingKey: 'atp-no1-active',
        }),
      ],
      'tennis',
      NOW,
    );
    expect(b.groups).toHaveLength(1);
    const active = b.groups[0];
    expect(active.athletes.map((a) => a.name)).toEqual(['Unmarked Man']);
    // No `careerStatus: 'active'` is ever emitted — the field can only
    // say "retired", because that is the only thing a source states.
    expect(active.athletes[0].careerStatus).toBeUndefined();
  });
});
