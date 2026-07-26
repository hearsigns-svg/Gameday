// Contract tests for the TheSportsDB adapter, pinned to REAL payloads
// captured with the premium key (NBA 2025-26, UFC 2026 cards).

import { normaliseTsdbEvent, TsdbEvent } from '../providers/tsdb';
import sample from './fixtures/tsdb-sample.json';

const NOW = '2026-07-26T00:00:00.000Z';
const s = sample as {
  nba: TsdbEvent[];
  ufcTimed: TsdbEvent[];
  ufcFuture: TsdbEvent[];
};

describe('normaliseTsdbEvent against real payloads', () => {
  test('NBA game: teams, keys, and UTC-forced timestamp', () => {
    const f = normaliseTsdbEvent(s.nba[0], 'basketball', 2.5, NOW);
    expect(f.id).toBe(`tsdb-${s.nba[0].idEvent}`);
    expect(f.sport).toBe('basketball');
    expect(f.competitionId).toBe('tsdb-league-4387');
    expect(f.title).toBe('New York Knicks vs Philadelphia 76ers');
    expect(f.followKeys).toEqual([
      `tsdb-team-${s.nba[0].idHomeTeam}`,
      `tsdb-team-${s.nba[0].idAwayTeam}`,
      'tsdb-league-4387',
    ]);
    // strTimestamp has no zone suffix but IS UTC — must not parse local.
    expect(f.startUtc).toBe('2025-10-02T16:00:00.000Z');
    expect(f.status).toBe('finished');
    expect(f.durationHours).toBe(2.5);
  });

  test('UFC card with a confirmed time: teamless, scheduled/finished', () => {
    const f = normaliseTsdbEvent(s.ufcTimed[0], 'ufc', 4, NOW);
    expect(f.title).toBe('UFC 324 Gaethje vs Pimblett');
    expect(f.homeTeam).toBeUndefined();
    expect(f.followKeys).toEqual(['tsdb-league-4443']);
    expect(f.startUtc).toBe('2026-01-24T22:00:00.000Z');
  });

  test('far-future card with midnight placeholder → tbd', () => {
    const future = { ...s.ufcFuture[0], strStatus: null };
    const f = normaliseTsdbEvent(future, 'ufc', 4, NOW);
    expect(f.status).toBe('tbd');
  });

  test('postponed flag wins over everything', () => {
    const postponed = { ...s.nba[0], strPostponed: 'yes' };
    const f = normaliseTsdbEvent(postponed, 'basketball', 2.5, NOW);
    expect(f.status).toBe('postponed');
  });
});
