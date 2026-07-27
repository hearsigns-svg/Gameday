// Cross-provider aliasing is what makes "follow your team, get every
// competition" true when league and cup data come from different
// providers.

import { augmentFollowKeys, AliasMap } from '../aliases';
import { Fixture } from '../fixture';
import { normaliseName } from '../identity';

function fx(o: Partial<Fixture> = {}): Fixture {
  return {
    id: 'tsdb-1',
    sport: 'soccer',
    competition: 'FA Cup',
    competitionId: 'tsdb-league-4482',
    title: 'Liverpool vs Everton',
    homeTeam: 'Liverpool',
    awayTeam: 'Everton',
    followKeys: ['tsdb-team-1', 'tsdb-team-2', 'tsdb-league-4482'],
    startUtc: '2027-01-10T15:00:00.000Z',
    venueTz: 'UTC',
    status: 'scheduled',
    updatedAt: '2026-07-27T00:00:00.000Z',
    ...o,
  };
}

const aliases: AliasMap = new Map([
  [normaliseName('Liverpool'), ['fdorg-team-64']],
  [normaliseName('Liverpool FC'), ['fdorg-team-64']],
  [normaliseName('Everton'), ['fdorg-team-62']],
  [normaliseName('Wolverhampton Wanderers FC'), ['fdorg-team-76']],
  [normaliseName('Wolverhampton'), ['fdorg-team-76']],
]);

describe('augmentFollowKeys', () => {
  test('a cup tie becomes reachable from a league-provider follow', () => {
    const [f] = augmentFollowKeys([fx()], aliases);
    expect(f.followKeys).toContain('fdorg-team-64'); // Liverpool follow hits
    expect(f.followKeys).toContain('fdorg-team-62');
    expect(f.followKeys).toContain('tsdb-league-4482'); // original preserved
  });

  test('long and short club names both resolve', () => {
    const [f] = augmentFollowKeys(
      [fx({ homeTeam: 'Wolverhampton Wanderers FC', awayTeam: 'Wolverhampton' })],
      aliases,
    );
    expect(f.followKeys.filter((k) => k === 'fdorg-team-76')).toHaveLength(1);
  });

  test('unknown clubs are left untouched', () => {
    const original = fx({ homeTeam: 'Tranmere Rovers', awayTeam: 'Rochdale' });
    const [f] = augmentFollowKeys([original], aliases);
    expect(f.followKeys).toEqual(original.followKeys);
  });

  test('no alias map ⇒ no change (safe before directories are cached)', () => {
    const original = fx();
    const [f] = augmentFollowKeys([original], new Map());
    expect(f.followKeys).toEqual(original.followKeys);
  });

  test('keys are never duplicated on repeat ingest', () => {
    const once = augmentFollowKeys([fx()], aliases);
    const twice = augmentFollowKeys(once, aliases);
    expect(twice[0].followKeys).toEqual(once[0].followKeys);
  });
});

describe('distinct clubs with similar names never cross-match', () => {
  // Found in production: "AFC Liverpool" (non-league) was matching
  // Liverpool FC and putting its ties in the wrong calendars.
  test('AFC Liverpool does not resolve to Liverpool FC', () => {
    const [f] = augmentFollowKeys(
      [fx({ homeTeam: 'AFC Liverpool', awayTeam: 'Abbey Hey' })],
      aliases,
    );
    expect(f.followKeys).not.toContain('fdorg-team-64');
  });

  test('the real club still resolves', () => {
    const [f] = augmentFollowKeys([fx({ homeTeam: 'Liverpool' })], aliases);
    expect(f.followKeys).toContain('fdorg-team-64');
  });
});
