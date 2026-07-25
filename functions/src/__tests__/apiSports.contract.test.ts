// Contract tests for the API-Sports adapter, pinned to a REAL payload
// captured from the live API (fixtures/apisports-soccer-sample.json).
// If the provider changes shape, these fail before production does.

import { ApiFixtureRow, normaliseRow } from '../providers/apiSports';
import sample from './fixtures/apisports-soccer-sample.json';

const NOW = '2026-07-25T00:00:00.000Z';
const rows = (sample as { response: ApiFixtureRow[] }).response;
const byId = (id: number) => {
  const row = rows.find((r) => r.fixture.id === id);
  if (!row) throw new Error(`sample row ${id} missing`);
  return row;
};

describe('normaliseRow against real payload', () => {
  test('ids, teams, competition and followKeys', () => {
    const f = normaliseRow(byId(1030318), NOW);
    expect(f.id).toBe('apisports-1030318');
    expect(f.homeTeam).toBe('Liverpool');
    expect(f.awayTeam).toBe('Leicester');
    expect(f.competition).toBe('Friendlies Clubs');
    expect(f.competitionId).toBe('apisports-league-667');
    expect(f.followKeys).toContain('apisports-team-40');
    expect(f.followKeys).toContain('apisports-league-667');
    expect(f.followKeys).toHaveLength(3);
  });

  test('kickoff instants survive UK DST boundaries exactly', () => {
    // 2023-10-21 is BST (UTC+1); 2023-10-29 is the autumn changeover day;
    // 2024-03-31 is the spring changeover day; 2024-04-04 is BST again.
    expect(normaliseRow(byId(1035121), NOW).startUtc).toBe(
      '2023-10-21T11:30:00.000Z',
    );
    expect(normaliseRow(byId(1035133), NOW).startUtc).toBe(
      '2023-10-29T14:00:00.000Z',
    );
    expect(normaliseRow(byId(1035468), NOW).startUtc).toBe(
      '2024-03-31T13:00:00.000Z',
    );
    expect(normaliseRow(byId(1035482), NOW).startUtc).toBe(
      '2024-04-04T18:30:00.000Z',
    );
  });

  test('finished statuses map from real rows (FT, AET)', () => {
    expect(normaliseRow(byId(1030318), NOW).status).toBe('finished');
    expect(normaliseRow(byId(1180025), NOW).status).toBe('finished');
  });
});

describe('status map on synthetic variants of the real shape', () => {
  const withStatus = (short: string): ApiFixtureRow => {
    const base = byId(1030318);
    return {
      ...base,
      fixture: { ...base.fixture, status: { short } },
    };
  };

  const cases: Array<[string, string]> = [
    ['NS', 'scheduled'],
    ['TBD', 'tbd'],
    ['PST', 'postponed'],
    ['CANC', 'cancelled'],
    ['ABD', 'cancelled'],
    ['AWD', 'finished'],
    ['WO', 'finished'],
    ['PEN', 'finished'],
    ['1H', 'in_play'],
    ['HT', 'in_play'],
    ['SUSP', 'in_play'],
    ['LIVE', 'in_play'],
    ['XYZ_UNKNOWN', 'scheduled'],
  ];

  test.each(cases)('%s → %s', (short, expected) => {
    expect(normaliseRow(withStatus(short), NOW).status).toBe(expected);
  });
});
