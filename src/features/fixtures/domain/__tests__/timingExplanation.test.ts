// "Time TBC" explained (Prompt 16 A3). The rule under test: say what is
// unknown, name only the body that actually announces, and never invent
// a freshness or a date by which a time will firm up.

import { Fixture } from '../fixture';
import { sourceOf, sliceFreshnessKey } from '../sources';
import { explainTiming } from '../timingExplanation';

const NOW = Date.parse('2026-08-04T19:00:00.000Z');

function fixture(overrides: Partial<Fixture> = {}): Fixture {
  return {
    id: 'pbc-fight-night-august-22-2026',
    sport: 'boxing',
    competition: 'Premier Boxing Champions',
    competitionId: 'pbc-cards',
    title: 'Rolando Romero vs Teofimo Lopez',
    followKeys: ['pbc-cards'],
    startUtc: '2026-08-22T22:00:00.000Z',
    status: 'scheduled',
    updatedAt: '2026-08-03T04:21:59.146Z',
    ...overrides,
  };
}

describe('sources', () => {
  it('separates who ANNOUNCES from who merely republishes', () => {
    expect(sourceOf('pbc-fight-night')).toEqual({
      key: 'pbc',
      name: 'Premier Boxing Champions',
      kind: 'organiser',
    });
    expect(sourceOf('wta-806-2026')?.kind).toBe('organiser');
    expect(sourceOf('tsdb-2528767')?.kind).toBe('relay');
    // The two that would be easy to misattribute: the tennis ICS is
    // Tennis TV's feed, not the ATP (a standing refusal), and the F1
    // adapter is Jolpica, not Formula 1.
    expect(sourceOf('tennis-4794lkna')?.name).toBe('Tennis TV');
    expect(sourceOf('f1-2026-silverstone-race')?.name).toBe('Jolpica');
  });

  it('describes nothing it does not recognise', () => {
    expect(sourceOf('brandnew-123')).toBeNull();
  });

  it('builds the ingest-slice key the sweep publishes freshness under', () => {
    expect(sliceFreshnessKey('pbc-fight-night', 'pbc-cards')).toBe(
      'pbc|pbc-cards',
    );
    // '.' and '/' are path characters in a Firestore field name.
    expect(sliceFreshnessKey('tsdb-1', 'tsdb-league-4445')).toBe(
      'tsdb|tsdb-league-4445',
    );
  });
});

describe('explainTiming', () => {
  it('says the day is all that is published, and names the promoter', () => {
    const e = explainTiming(
      fixture({ status: 'tbd', timePrecision: 'date_only' }),
      { nowMs: NOW, sliceCheckedAt: '2026-08-04T16:47:51.047Z' },
    );
    expect(e.headline).toContain('Only the day is known');
    expect(e.attribution).toBe(
      'A start time has not been announced by Premier Boxing Champions yet.',
    );
    expect(e.checked).toBe('Checked 2 hours ago');
    expect(e.willUpdate).toBe(true);
  });

  it('never blames a relay for a silence that is not theirs — and never names one', () => {
    // A relay announces nothing, and its name is a PROVIDER NAME, which
    // the brief rules out as user-facing data.
    const e = explainTiming(
      fixture({
        id: 'tsdb-2528767',
        timePrecision: 'date_only',
        status: 'tbd',
      }),
      { nowMs: NOW },
    );
    expect(e.attribution).toBe('A start time has not been published yet.');
    expect(e.attribution).not.toContain('TheSportsDB');
  });

  it('names nobody for a source it does not recognise', () => {
    const e = explainTiming(
      fixture({ id: 'brandnew-9', timePrecision: 'date_only', status: 'tbd' }),
      { nowMs: NOW },
    );
    expect(e.headline).not.toBeNull();
    expect(e.attribution).toBe('A start time has not been published yet.');
  });

  it('does not contradict itself on a nominal time', () => {
    // The time is ON THE SCREEN; the gap is confirmation, not existence.
    const e = explainTiming(
      fixture({ timePrecision: 'nominal', confidence: 'provisional' }),
      { nowMs: NOW },
    );
    expect(e.attribution).toBe(
      'Premier Boxing Champions has not confirmed the final time yet.',
    );
    expect(e.attribution).not.toContain('not been announced');
  });

  it('says a cancelled fixture is off, and promises nothing about it', () => {
    const e = explainTiming(fixture({ status: 'cancelled' }), { nowMs: NOW });
    expect(e.headline).toBe('Cancelled — this is no longer taking place.');
    expect(e.willUpdate).toBe(false);
    expect(e.attribution).toBeNull();
  });

  it('blames nobody for a postponement — the source did announce, then moved it', () => {
    const e = explainTiming(fixture({ status: 'postponed' }), { nowMs: NOW });
    expect(e.attribution).toBeNull();
  });

  it('treats a multi-day span as a shape, not a missing time', () => {
    const e = explainTiming(
      fixture({
        id: 'tennis-4794lkna',
        sport: 'tennis',
        title: 'Cincinnati Open',
        timePrecision: 'date_only',
        confidence: 'confirmed',
        status: 'tbd',
        durationHours: 264,
      }),
      { nowMs: NOW },
    );
    expect(e.headline).toBe(
      'Runs over 11 days, so it sits in your calendar as a 11-day event.',
    );
    expect(e.willUpdate).toBe(false);
  });

  it('explains a provisional appearance as a borrowed window', () => {
    const e = explainTiming(
      fixture({
        id: 'wta-2087-2026-app-martyna-kubka',
        sport: 'tennis',
        competitionId: 'tennis-wta-appearances',
        parentFixtureId: 'wta-2087-2026',
        timePrecision: 'date_only',
        confidence: 'provisional',
        status: 'tbd',
        durationHours: 48,
      }),
      { nowMs: NOW },
    );
    expect(e.headline).toContain("exact time isn't set yet");
    expect(e.attribution).toBe(
      'The order of play has not been announced by the WTA yet.',
    );
  });

  it('calls a nominal time what it is', () => {
    const e = explainTiming(
      fixture({ timePrecision: 'nominal', confidence: 'provisional' }),
      { nowMs: NOW },
    );
    expect(e.headline).toContain('not the settled one yet');
    expect(e.willUpdate).toBe(true);
  });

  it('has nothing to say about a settled time', () => {
    const e = explainTiming(
      fixture({ timePrecision: 'exact', confidence: 'confirmed' }),
      { nowMs: NOW },
    );
    expect(e.headline).toBeNull();
    expect(e.willUpdate).toBe(false);
  });

  it('says nothing about freshness when there is no timestamp', () => {
    // PBC is absent from the freshness doc entirely (its route outruns
    // the sweep's per-path budget), so this is the live case, not a
    // hypothetical. Unknown must print nothing at all.
    const e = explainTiming(fixture({ status: 'tbd' }), { nowMs: NOW });
    expect(e.checked).toBeNull();
    const known = explainTiming(fixture({ status: 'tbd' }), {
      nowMs: NOW,
      sliceCheckedAt: '2026-08-04T18:30:00.000Z',
    });
    expect(known.checked).toBe('Checked 30 minutes ago');
  });

  it('does not claim freshness from a timestamp in the future', () => {
    const e = explainTiming(fixture({ status: 'tbd' }), {
      nowMs: NOW,
      sliceCheckedAt: '2026-08-05T00:00:00.000Z',
    });
    expect(e.checked).toBeNull();
  });

  it('says a postponement has no new date rather than guessing one', () => {
    const e = explainTiming(fixture({ status: 'postponed' }), { nowMs: NOW });
    expect(e.headline).toBe('Postponed — no new date has been published.');
  });
});
