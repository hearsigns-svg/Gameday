// Replacing a directory is a destructive act, so these pin the four
// rules that stop a reset from becoming a data loss: ids survive,
// followed people survive, near-misses are neither merged nor created,
// and a reversed name is not a new person.

import {
  groupingFor,
  planReconcile,
  RankedPlayer,
  DirectoryAthlete,
  ReconcilePlan,
  removalGuard,
} from '../providers/tennisApiAtp';

const EMPTY_PLAN: ReconcilePlan = {
  keep: [],
  create: [],
  remove: [],
  keepFollowed: [],
  review: [],
};

const p = (over: Partial<RankedPlayer>): RankedPlayer => ({
  vendorId: '206570',
  name: 'Jannik Sinner',
  rank: 1,
  countryCode: 'ITA',
  ...over,
});

const a = (over: Partial<DirectoryAthlete>): DirectoryAthlete => ({
  id: 'athlete_001801',
  displayName: 'Jannik Sinner',
  countryCode: 'ITA',
  groupingKey: 'atp',
  ...over,
});

const NOBODY = new Set<string>();

it('A MATCHED PLAYER KEEPS THEIR DOCUMENT ID', () => {
  // The whole point. A follow is a stored reference to this id;
  // recreating the doc would break it silently.
  const plan = planReconcile([p({})], [a({})], NOBODY);
  expect(plan.keep).toEqual([
    { athleteId: 'athlete_001801', player: p({}), via: 'name' },
  ]);
  expect(plan.create).toEqual([]);
  expect(plan.remove).toEqual([]);
});

it('A FOLLOWED ATHLETE IS NEVER REMOVED, ranked or not', () => {
  // Somebody asked for them. Dropping out of the 500 is not consent to
  // delete them from that person's calendar.
  const stale = a({ id: 'athlete_000777', displayName: 'Andy Murray' });
  const plan = planReconcile([p({})], [a({}), stale], new Set(['athlete_000777']));
  expect(plan.remove).toEqual([]);
  expect(plan.keepFollowed).toEqual([
    { athleteId: 'athlete_000777', displayName: 'Andy Murray' },
  ]);
});

it('removes an unranked athlete nobody follows', () => {
  const stale = a({ id: 'athlete_000777', displayName: 'Someone Retired' });
  const plan = planReconcile([p({})], [a({}), stale], NOBODY);
  expect(plan.remove).toEqual([
    { athleteId: 'athlete_000777', displayName: 'Someone Retired' },
  ]);
});

it('A REVERSED NAME IS THE SAME PERSON, when the country agrees', () => {
  // Measured: six of the vendor's 500 are in our directory the other
  // way round. Creating them would split one player into two.
  const ours = a({ id: 'athlete_002001', displayName: 'Shang Juncheng', countryCode: 'CHN' });
  const plan = planReconcile(
    [p({ name: 'Juncheng Shang', countryCode: 'CHN', vendorId: '348853' })],
    [ours],
    NOBODY,
  );
  expect(plan.keep[0]).toMatchObject({ athleteId: 'athlete_002001', via: 'reversed' });
  expect(plan.create).toEqual([]);
});

it('refuses a reversed match across DIFFERENT countries', () => {
  // "Thomas Martin" and "Martin Thomas" can be two people. A
  // contradiction in nationality is enough to refuse.
  const ours = a({ id: 'athlete_003', displayName: 'Martin Thomas', countryCode: 'FRA' });
  const plan = planReconcile(
    [p({ name: 'Thomas Martin', countryCode: 'USA', vendorId: '9' })],
    [ours],
    NOBODY,
  );
  expect(plan.keep).toEqual([]);
  // Surname still matches, so it goes to review rather than creating a
  // possible duplicate.
  expect(plan.review).toHaveLength(1);
  expect(plan.remove).toEqual([]);
});

it('A SURNAME NEAR-MISS IS NEITHER MERGED NOR CREATED', () => {
  const ours = a({ id: 'athlete_004', displayName: 'Alexander Shevchenko', countryCode: 'KAZ' });
  const plan = planReconcile(
    [p({ name: 'Aleksandr Shevchenko', countryCode: 'KAZ', vendorId: '77' })],
    [ours],
    NOBODY,
  );
  expect(plan.keep).toEqual([]);
  expect(plan.create).toEqual([]);
  expect(plan.remove).toEqual([]); // the doc is untouched, not deleted
  expect(plan.review[0].candidates).toEqual(['Alexander Shevchenko']);
});

it('creates a ranked player we genuinely do not hold', () => {
  const plan = planReconcile(
    [p({ name: 'Hamad Medjedovic', rank: 73, vendorId: '55', countryCode: 'SRB' })],
    [],
    NOBODY,
  );
  expect(plan.create).toHaveLength(1);
  expect(plan.create[0].rank).toBe(73);
});

it('an ambiguous name in OUR data never auto-resolves', () => {
  const twin1 = a({ id: 'athlete_005', displayName: 'Jannik Sinner' });
  const twin2 = a({ id: 'athlete_006', displayName: 'Jannik Sinner' });
  const plan = planReconcile([p({})], [twin1, twin2], NOBODY);
  expect(plan.keep).toEqual([]);
  expect(plan.review).toHaveLength(1);
  // Neither twin is deleted while the question is open.
  expect(plan.remove).toEqual([]);
});

it('top 100 browses, the rest are searchable', () => {
  expect(groupingFor(1)).toBe('atp');
  expect(groupingFor(100)).toBe('atp');
  expect(groupingFor(101)).toBe('atp-directory');
  expect(groupingFor(500)).toBe('atp-directory');
});

describe('the merge is permanent, not a one-off', () => {
  const shevchenko = a({
    id: 'athlete_000900',
    displayName: 'Alexander Shevchenko',
    countryCode: 'KAZ',
  });
  const vendorRow = p({ name: 'Aleksandr Shevchenko', vendorId: '89', rank: 89, countryCode: 'KAZ' });

  it('a human merge keeps the existing id', () => {
    const plan = planReconcile(
      [vendorRow],
      [shevchenko],
      NOBODY,
      new Map([['89', 'athlete_000900']]),
    );
    expect(plan.keep).toEqual([
      { athleteId: 'athlete_000900', player: vendorRow, via: 'merge' },
    ]);
    expect(plan.create).toEqual([]);
    expect(plan.review).toEqual([]);
  });

  it('AFTERWARDS they resolve BY ID, with no merge map and no name match', () => {
    // The doc now carries the vendor id. The spelling still disagrees —
    // and it no longer matters, which is the entire point.
    const stamped = { ...shevchenko, providerIds: { tennisapi1: '89' } };
    const plan = planReconcile([vendorRow], [stamped], NOBODY);
    expect(plan.keep).toEqual([
      { athleteId: 'athlete_000900', player: vendorRow, via: 'vendorId' },
    ]);
    expect(plan.review).toEqual([]);
  });

  it('an id match beats a name match, so a rename cannot split them', () => {
    const renamed = {
      ...shevchenko,
      displayName: 'Something Else Entirely',
      providerIds: { tennisapi1: '89' },
    };
    const plan = planReconcile([vendorRow], [renamed], NOBODY);
    expect(plan.keep[0]).toMatchObject({ athleteId: 'athlete_000900', via: 'vendorId' });
    expect(plan.remove).toEqual([]);
  });
});

describe('a deleting source needs a floor as well as a ceiling', () => {
  const many = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      athleteId: `athlete_${i}`,
      displayName: `Player ${i}`,
    }));

  it('lets an ordinary week through', () => {
    expect(removalGuard({ ...EMPTY_PLAN, remove: many(12) })).toBeNull();
  });

  it('REFUSES a run that would gut the directory', () => {
    // The zero-entry check upstream catches a total failure. This
    // catches the subtler one: a 200 response carrying the top 50
    // because a parameter changed meaning.
    const e = removalGuard({ ...EMPTY_PLAN, remove: many(400) });
    expect(e).toMatch(/refusing to remove 400/);
  });
});
