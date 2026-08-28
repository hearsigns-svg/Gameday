import { deriveTeamsFromFixtures } from '../fixtureTeams';
import { Fixture } from '../fixture';

const fx = (over: Partial<Fixture>): Fixture => ({
  id: 'tsdb-1',
  sport: 'rugby',
  competition: 'Rugby Championship',
  competitionId: 'tsdb-league-5479',
  title: 'x',
  startUtc: '2026-09-01T00:00:00.000Z',
  status: 'scheduled',
  updatedAt: '2026-08-28T00:00:00.000Z',
  followKeys: [],
  ...over,
});

describe('deriveTeamsFromFixtures', () => {
  it('pairs each side with its key, one-off sides included, sorted', () => {
    const teams = deriveTeamsFromFixtures([
      fx({
        homeTeam: 'New Zealand Rugby',
        awayTeam: 'Australia Rugby',
        followKeys: ['tsdb-team-137133', 'tsdb-team-137125', 'tsdb-league-5479'],
      }),
      fx({
        id: 'tsdb-2',
        homeTeam: 'South Africa Rugby',
        awayTeam: 'Barbarians', // the invitational one-off STAYS IN
        followKeys: ['tsdb-team-137137', 'tsdb-team-148541', 'tsdb-league-5479'],
      }),
    ]);
    expect(teams.map((t) => t.name)).toEqual([
      'Australia Rugby',
      'Barbarians',
      'New Zealand Rugby',
      'South Africa Rugby',
    ]);
    expect(teams.find((t) => t.name === 'Barbarians')).toEqual({
      key: 'tsdb-team-148541',
      id: '148541',
      name: 'Barbarians',
    });
  });

  it('the majority spelling wins for a key the provider varied', () => {
    const rows = [
      fx({ homeTeam: 'Essex', awayTeam: 'Kent', followKeys: ['tsdb-team-1', 'tsdb-team-2', 'l'] }),
      fx({ id: 'b', homeTeam: 'Essex CCC', awayTeam: 'Kent', followKeys: ['tsdb-team-1', 'tsdb-team-2', 'l'] }),
      fx({ id: 'c', homeTeam: 'Essex', awayTeam: 'Kent', followKeys: ['tsdb-team-1', 'tsdb-team-2', 'l'] }),
    ];
    expect(deriveTeamsFromFixtures(rows).find((t) => t.key === 'tsdb-team-1')?.name).toBe('Essex');
  });

  it('appearances and person-keyed bouts derive NOTHING', () => {
    expect(
      deriveTeamsFromFixtures([
        fx({
          homeTeam: 'Moses Itauma',
          awayTeam: 'Filip Hrgovic',
          parentFixtureId: 'tsdb-9',
          followKeys: ['athlete_000258', 'athlete_000259'],
        }),
        fx({
          id: 'bout',
          homeTeam: 'Mayer',
          awayTeam: 'Cameron',
          followKeys: ['tsdb-league-4445'], // no team-prefixed keys
        }),
      ]),
    ).toEqual([]);
  });
});
