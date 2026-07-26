import { diffFixtures } from '../diff';
import { Fixture } from '../fixture';

function fixture(overrides: Partial<Fixture> = {}): Fixture {
  return {
    id: 'apisports-1',
    sport: 'soccer',
    competition: 'Premier League',
    competitionId: 'apisports-league-39',
    title: 'Liverpool v Everton',
    homeTeam: 'Liverpool',
    awayTeam: 'Everton',
    followKeys: ['apisports-team-40', 'apisports-team-45', 'apisports-league-39'],
    startUtc: '2023-10-21T11:30:00.000Z',
    venueTz: 'UTC',
    status: 'scheduled',
    updatedAt: '2023-10-01T00:00:00.000Z',
    ...overrides,
  };
}

const asMap = (fs: Fixture[]) => new Map(fs.map((f) => [f.id, f]));

describe('diffFixtures', () => {
  test('unknown fixture is created', () => {
    const changes = diffFixtures(new Map(), [fixture()]);
    expect(changes).toEqual([
      {
        kind: 'created',
        fixtureId: 'apisports-1',
        startUtc: '2023-10-21T11:30:00.000Z',
      },
    ]);
  });

  test('identical fixture yields no change', () => {
    expect(diffFixtures(asMap([fixture()]), [fixture()])).toHaveLength(0);
  });

  test('kickoff move is a time_changed', () => {
    const moved = fixture({ startUtc: '2023-10-21T13:30:00.000Z' });
    expect(diffFixtures(asMap([fixture()]), [moved])).toEqual([
      {
        kind: 'time_changed',
        fixtureId: 'apisports-1',
        prevStartUtc: '2023-10-21T11:30:00.000Z',
        newStartUtc: '2023-10-21T13:30:00.000Z',
      },
    ]);
  });

  test('postponement is a status_changed', () => {
    const postponed = fixture({ status: 'postponed' });
    expect(diffFixtures(asMap([fixture()]), [postponed])).toEqual([
      {
        kind: 'status_changed',
        fixtureId: 'apisports-1',
        prevStatus: 'scheduled',
        newStatus: 'postponed',
      },
    ]);
  });

  test('move + postponement reports both changes', () => {
    const both = fixture({
      startUtc: '2023-10-22T15:00:00.000Z',
      status: 'postponed',
    });
    const changes = diffFixtures(asMap([fixture()]), [both]);
    expect(changes.map((c) => c.kind).sort()).toEqual([
      'status_changed',
      'time_changed',
    ]);
  });
});
