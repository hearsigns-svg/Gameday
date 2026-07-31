// Contract tests for the football-data.org adapter, pinned to a REAL
// payload captured with the owner's key (Liverpool 2026-27 season).

import { FdMatch, normaliseFdMatch } from '../providers/fdorg';
import sample from './fixtures/fdorg-sample.json';

const NOW = '2026-07-26T00:00:00.000Z';
const matches = (sample as { matches: FdMatch[] }).matches;

describe('normaliseFdMatch against real payload', () => {
  test('normalises a real 2026-27 PL match with full fidelity', () => {
    const f = normaliseFdMatch(matches[0], NOW);
    expect(f.id).toBe(`fdorg-${matches[0].id}`);
    expect(f.sport).toBe('soccer');
    expect(f.competition).toBe('Premier League');
    expect(f.competitionId).toBe('fdorg-comp-PL');
    expect(f.title).toBe('Liverpool v Ipswich Town');
    expect(f.followKeys).toContain('fdorg-comp-PL');
    expect(f.followKeys).toHaveLength(3);
    expect(f.startUtc).toBe(new Date(matches[0].utcDate).toISOString());
    expect(f.durationHours).toBe(2);
  });

  test('SCHEDULED is a NOMINAL time, not an absent one', () => {
    // SUPERSEDED 2026-07-31. This asserted `status === 'tbd'`, which made
    // the calendar show an all-day banner — 380 of 380 Premier League
    // fixtures and 3,011 across the free tier, none of them with a
    // reminder. SCHEDULED does not mean the time is unknown; it means it
    // is not settled. So the instant is kept and the uncertainty is said
    // out loud instead.
    const f = normaliseFdMatch(matches[0], NOW);
    expect(f.status).toBe('scheduled');
    expect(f.timePrecision).toBe('nominal');
    expect(f.confidence).toBe('provisional');
    // The real instant survives — it is not collapsed to a day sentinel.
    expect(f.startUtc).toBe(new Date(matches[0].utcDate).toISOString());
  });

  test('TIMED is exact and confirmed', () => {
    const f = normaliseFdMatch({ ...matches[0], status: 'TIMED' }, NOW);
    expect(f.timePrecision).toBe('exact');
    expect(f.confidence).toBe('confirmed');
  });

  test('POSTPONED keeps only its day', () => {
    // The old date with no new time: the day is all that is meaningful.
    const f = normaliseFdMatch({ ...matches[0], status: 'POSTPONED' }, NOW);
    expect(f.timePrecision).toBe('date_only');
    expect(f.confidence).toBe('provisional');
  });

  test('football-data publishes no venue zone, so we claim none', () => {
    // It used to be recorded as the literal 'UTC' — a claim, not a default.
    expect(normaliseFdMatch(matches[0], NOW).venueTz).toBeUndefined();
  });

  test('status map covers the confirmed and disrupted states', () => {
    const withStatus = (status: string): FdMatch => ({ ...matches[0], status });
    expect(normaliseFdMatch(withStatus('TIMED'), NOW).status).toBe('scheduled');
    expect(normaliseFdMatch(withStatus('IN_PLAY'), NOW).status).toBe('in_play');
    expect(normaliseFdMatch(withStatus('FINISHED'), NOW).status).toBe('finished');
    expect(normaliseFdMatch(withStatus('POSTPONED'), NOW).status).toBe('postponed');
    expect(normaliseFdMatch(withStatus('CANCELLED'), NOW).status).toBe('cancelled');
    expect(normaliseFdMatch(withStatus('AWARDED'), NOW).status).toBe('finished');
  });
});
