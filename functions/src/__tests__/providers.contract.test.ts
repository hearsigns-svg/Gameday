// Contract tests for the free-provider adapters, pinned to REAL payloads
// captured live from each API (2026 seasons — current data the API-Sports
// free tier cannot serve). Provider shape drift fails here first.

import { normaliseMlbGame, MlbGame } from '../providers/mlb';
import { normaliseNhlGame, NhlGame } from '../providers/nhl';
import { racesToFixtures, F1Race } from '../providers/f1';
import mlbSample from './fixtures/mlb-sample.json';
import nhlSample from './fixtures/nhl-sample.json';
import f1Sample from './fixtures/f1-sample.json';

const NOW = '2026-07-26T00:00:00.000Z';

describe('MLB adapter against real payload', () => {
  const games = (mlbSample as { games: MlbGame[] }).games;

  test('normalises a real 2026 game with full fidelity', () => {
    const f = normaliseMlbGame(games[0], NOW);
    expect(f.id).toBe(`mlb-${games[0].gamePk}`);
    expect(f.sport).toBe('baseball');
    expect(f.competitionId).toBe('mlb-league-1');
    expect(f.title).toBe(`${f.awayTeam} at ${f.homeTeam}`);
    expect(f.followKeys).toHaveLength(3);
    expect(f.followKeys).toContain('mlb-league-1');
    // LITERAL instant from the banked payload (gameDate 2026-08-01T19:07:00Z).
    // Deriving the expectation from the input via the same conversion the
    // adapter performs is a tautology — it passes even when both are wrong.
    expect(f.startUtc).toBe('2026-08-01T19:07:00.000Z');
    expect(f.durationHours).toBe(3);
  });

  test('status machinery: TBD flag and detailed states', () => {
    const base = games[0];
    const withState = (
      abstractGameState: string,
      detailedState: string,
      startTimeTBD = false,
    ): MlbGame => ({
      ...base,
      status: { abstractGameState, detailedState, startTimeTBD },
    });
    expect(normaliseMlbGame(withState('Preview', 'Scheduled'), NOW).status).toBe('scheduled');
    expect(normaliseMlbGame(withState('Preview', 'Scheduled', true), NOW).status).toBe('tbd');
    expect(normaliseMlbGame(withState('Live', 'In Progress'), NOW).status).toBe('in_play');
    expect(normaliseMlbGame(withState('Final', 'Final'), NOW).status).toBe('finished');
    expect(normaliseMlbGame(withState('Preview', 'Postponed: Rain'), NOW).status).toBe('postponed');
    expect(normaliseMlbGame(withState('Final', 'Cancelled'), NOW).status).toBe('cancelled');
  });
});

describe('NHL adapter against real payload', () => {
  const games = (nhlSample as { games: NhlGame[] }).games;

  test('normalises a real 2026-27 game with assembled team names', () => {
    const f = normaliseNhlGame(games[0], NOW);
    expect(f.id).toBe(`nhl-${games[0].id}`);
    expect(f.sport).toBe('ice-hockey');
    expect(f.homeTeam).toBe('Boston Bruins');
    expect(f.awayTeam).toBe('Philadelphia Flyers');
    expect(f.title).toBe('Philadelphia Flyers at Boston Bruins');
    expect(f.followKeys).toEqual([
      'nhl-team-BOS',
      'nhl-team-PHI',
      'nhl-league-1',
    ]);
    expect(f.startUtc).toBe('2026-10-10T17:00:00.000Z');
    expect(f.status).toBe('scheduled'); // FUT
  });

  test('game states map to canonical statuses', () => {
    const withState = (gameState: string): NhlGame => ({
      ...games[0],
      gameState,
    });
    expect(normaliseNhlGame(withState('LIVE'), NOW).status).toBe('in_play');
    expect(normaliseNhlGame(withState('OFF'), NOW).status).toBe('finished');
  });

  test('disruptions arrive via gameScheduleState, NOT gameState', () => {
    // The old test put PPD/CNCL in gameState — a field api-web never
    // carries them in — so it passed while real cancellations were
    // invisible and a called-off game never left users' calendars.
    const withSchedule = (gameScheduleState: string): NhlGame => ({
      ...games[0],
      gameState: 'FUT',
      gameScheduleState,
    });
    expect(normaliseNhlGame(withSchedule('PPD'), NOW).status).toBe('postponed');
    expect(normaliseNhlGame(withSchedule('CNCL'), NOW).status).toBe('cancelled');
    expect(normaliseNhlGame(withSchedule('TBD'), NOW).status).toBe('tbd');
    expect(normaliseNhlGame(withSchedule('OK'), NOW).status).toBe('scheduled');
    // A disruption outranks the live lifecycle field — pinned with
    // lifecycle values that map DIFFERENTLY on their own, so reordering
    // the two switches in nhlStatus fails here.
    expect(
      normaliseNhlGame(
        { ...games[0], gameState: 'OFF', gameScheduleState: 'PPD' },
        NOW,
      ).status,
    ).toBe('postponed');
    expect(
      normaliseNhlGame(
        { ...games[0], gameState: 'LIVE', gameScheduleState: 'CNCL' },
        NOW,
      ).status,
    ).toBe('cancelled');
  });

  test('venue timezone is captured when api-web provides it', () => {
    const f = normaliseNhlGame(
      { ...games[0], venueTimezone: 'US/Eastern' },
      NOW,
    );
    expect(f.venueTz).toBe('US/Eastern');
  });
});

describe('F1 adapter against real payload', () => {
  const races = (f1Sample as { races: F1Race[] }).races;

  test('a race weekend fans out into per-session fixtures', () => {
    const fixtures = racesToFixtures('2026', [races[0]], NOW);
    // Real 2026 opener carries FP1-3 + Qualifying + Race = 5 sessions.
    expect(fixtures).toHaveLength(5);
    const race = fixtures.find((f) => f.sessionKind === 'race');
    expect(race?.id).toBe('f1-2026-r1-race');
    expect(race?.title).toMatch(/— Race$/);
    expect(race?.durationHours).toBe(2);
    expect(race?.followKeys).toEqual(['f1-series-1']);
    const supports = fixtures.filter((f) => f.sessionKind === 'support');
    expect(supports).toHaveLength(4);
    expect(supports.every((f) => f.durationHours === 1)).toBe(true);
  });

  test('session instants parse to exact UTC', () => {
    const fixtures = racesToFixtures('2026', [races[0]], NOW);
    const race = fixtures.find((f) => f.sessionKind === 'race');
    // LITERAL instant from the banked payload (date 2026-03-08, time
    // 04:00:00Z) — never derived from the input through the same code
    // path under test, which cannot fail.
    expect(race?.startUtc).toBe('2026-03-08T04:00:00.000Z');
  });

  test('missing session time becomes a tbd placeholder', () => {
    const noTime: F1Race = { ...races[0], time: undefined };
    const fixtures = racesToFixtures('2026', [noTime], NOW);
    const race = fixtures.find((f) => f.sessionKind === 'race');
    expect(race?.status).toBe('tbd');
  });
});
