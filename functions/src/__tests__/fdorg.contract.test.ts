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

  test('SCHEDULED (unconfirmed kickoff) maps to tbd — placeholder path', () => {
    // Every far-future match in the real payload is SCHEDULED with a
    // placeholder 12:00 kickoff; the calendar must show an all-day
    // entry, not a fake noon event.
    expect(normaliseFdMatch(matches[0], NOW).status).toBe('tbd');
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
