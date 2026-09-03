// Individual-sport browse shaping and the canonical athlete search —
// the server side of §4: search-first, curated entry points so the
// screen is never empty, competing-soon, and the honest treatment of
// inactive athletes (hidden from curated lists, still findable).

import { Athlete } from '../athletes';
import { athleteNames } from '../identity';
import {
  COMPETING_SOON_DAYS,
  GROUP_CAP,
  groupOrderKey,
  shapeAthleteBrowse,
} from '../search';

const NOW = '2026-08-03T00:00:00.000Z';

const athlete = (over: Partial<Athlete> & { id: string }): Athlete => ({
  ...athleteNames(over.displayName ?? 'Nobody'),
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

  test('tennis: women, the ranked men, then the alphabetical rest', () => {
    // Shuffled input, because the ordering must come from the
    // comparator and not from whatever order Firestore returned.
    const order = ['atp-directory', 'atp', 'wta'].sort((a, b) =>
      groupOrderKey(a).localeCompare(groupOrderKey(b)),
    );
    expect(order).toEqual(['wta', 'atp', 'atp-directory']);
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
    // The key is retired from GROUP_TITLES, so the header falls back to
    // the string the documents themselves carry — never to a claim this
    // build invented about them.
    expect(b.groups[0].grouping).toBe('Former world No. 1s');
    expect(b.groups[0].grouping).not.toMatch(/retired|still playing/);
    for (const a of b.groups[0].athletes) {
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
        men({ id: 'athlete_000940', groupingKey: 'atp', rank: 1 }),
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
    expect(b.groups.map((g) => g.grouping)).toEqual(['ATP Tour — Men']);
    expect(
      b.groups.flatMap((g) => g.athletes).some((a) => a.careerStatus),
    ).toBe(false);
  });

  test('tennis browse is TWO groups: women, then men', () => {
    const b = shapeAthleteBrowse(
      [
        men({ id: 'athlete_000944', groupingKey: 'atp', rank: 2 }),
        men({ id: 'athlete_000945', groupingKey: 'wta', rank: 1 }),
        men({
          id: 'athlete_000946',
          groupingKey: 'atp',
          rank: 3,
          careerStatus: 'retired',
        }),
      ],
      'tennis',
      NOW,
    );
    expect(b.groups.map((g) => g.grouping)).toEqual([
      'WTA Tour — Women',
      'ATP Tour — Men',
    ]);
    // The retired man is filtered even though his key is a live one.
    expect(b.groups[1].athletes).toHaveLength(1);
  });

  test('every tennis group a user can land on names its population', () => {
    // The complaint this stage answers: "WTA Tour" said nothing about
    // women and "Former world No. 1s" said nothing about men.
    const b = shapeAthleteBrowse(
      [
        men({ id: 'athlete_000910', groupingKey: 'wta', rank: 1 }),
        men({ id: 'athlete_000911', groupingKey: 'atp', rank: 1 }),
      ],
      'tennis',
      NOW,
    );
    expect(b.groups.map((g) => g.grouping)).toEqual([
      'WTA Tour — Women',
      'ATP Tour — Men',
    ]);
  });

  test('the alphabetical directory group is served WHOLE, not capped', () => {
    // A ranked list truncates honestly; an alphabetical one does not —
    // 50 of 1,400 A–Z is everyone called Aaron, dressed as a selection.
    const many = Array.from({ length: 120 }, (_, i) =>
      men({
        id: `athlete_${String(i + 300).padStart(6, '0')}`,
        displayName: `Player Number${String(i).padStart(3, '0')}`,
        groupingKey: 'atp-directory',
      }),
    );
    const b = shapeAthleteBrowse(many, 'tennis', NOW);
    expect(b.groups[0].athletes).toHaveLength(120);
    expect(b.groups[0].grouping).toBe('More ATP players — A–Z');
    // …and alphabetically, since none of them carries a rank.
    expect(b.groups[0].athletes[0].name).toBe('Player Number000');
  });

  test('the ranked men are still capped — a ranking truncates honestly', () => {
    const many = Array.from({ length: 120 }, (_, i) =>
      men({
        id: `athlete_${String(i + 500).padStart(6, '0')}`,
        displayName: `Ranked ${i}`,
        groupingKey: 'atp',
        rank: i + 1,
      }),
    );
    const b = shapeAthleteBrowse(many, 'tennis', NOW);
    expect(b.groups[0].athletes).toHaveLength(GROUP_CAP);
  });

  test('a retired man never reaches the alphabetical group either', () => {
    const b = shapeAthleteBrowse(
      [
        men({ id: 'athlete_000960', groupingKey: 'atp-directory' }),
        men({
          id: 'athlete_000961',
          groupingKey: 'atp-directory',
          careerStatus: 'retired',
          careerEndYear: 2019,
        }),
      ],
      'tennis',
      NOW,
    );
    expect(b.groups).toHaveLength(1);
    expect(b.groups[0].athletes).toHaveLength(1);
  });

  test('no card in browse carries a retirement, because none of them can', () => {
    const b = shapeAthleteBrowse(
      [
        men({
          id: 'athlete_000920',
          displayName: 'Retired Man',
          groupingKey: 'atp',
          rank: 1,
          careerStatus: 'retired',
          careerEndYear: 2022,
        }),
        men({
          id: 'athlete_000921',
          displayName: 'Unmarked Man',
          groupingKey: 'atp',
          rank: 2,
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

test('a UFC division (Round 7 item 1) is alphabetical and therefore served WHOLE — never cut to the ranked-list cap', () => {
  const fighters = Array.from({ length: 60 }, (_, i) =>
    athlete({
      id: `athlete_00${String(7000 + i)}`,
      displayName: `Fighter ${String(i).padStart(2, '0')}`,
      sport: 'ufc',
      grouping: 'Lightweight',
      groupingKey: 'mma-lightweight',
      ...(i === 59 ? { championOf: ['UFC'] } : {}),
    }),
  );
  const b = shapeAthleteBrowse(fighters, 'ufc', NOW);
  expect(b.groups).toHaveLength(1);
  expect(b.groups[0].athletes).toHaveLength(60);
  // The champion leads the division; the rest run A–Z.
  expect(b.groups[0].athletes[0].name).toBe('Fighter 59');
  expect(b.groups[0].athletes[1].name).toBe('Fighter 00');
  // Divisions read heavy → light, men then women.
  expect(['mma-lightweight', 'mma-heavyweight', 'mma-w-strawweight', 'wta'].sort((a, c) => groupOrderKey(a).localeCompare(groupOrderKey(c)))).toEqual([
    'wta', 'mma-heavyweight', 'mma-lightweight', 'mma-w-strawweight',
  ]);
});
