// The men's match rules. Born with the review sheet (Prompt 18), kept
// when the vendor fetch moved into the function (Round 4 item 7): these
// pin the things that would otherwise put a wrong match in a real
// calendar — guessing an unmapped player, letting a vendor quietly
// overwrite a human correction, inventing a time nobody stated.

import { MatchRow, matchTitle, publishable } from '../providers/atpMatchRules';

const row = (over: Partial<MatchRow> = {}): MatchRow => ({
  tournamentKey: 'tennis-t-national-bank-open',
  round: 'Round of 32',
  homeAthleteId: 'athlete_000101',
  awayAthleteId: 'athlete_000102',
  homeDisplay: 'Luciano Darderi',
  awayDisplay: 'Juncheng Shang',
  homeVendorPlayerId: '308084',
  awayVendorPlayerId: '348853',
  scheduledUtc: '2026-08-06T16:30:00.000Z',
  timePrecision: 'exact',
  status: 'notstarted',
  vendors: 'tennisapi1',
  vendorMatchId: '16661674',
  updatedAt: '2026-08-06T12:00:00.000Z',
  ...over,
});

const KNOWN = new Set(['tennis-t-national-bank-open']);

describe('publishable', () => {
  const of = (over: Partial<MatchRow> = {}) => publishable([row(over)], KNOWN);

  it('publishes a mapped, timed match', () => {
    const { publish, skipped } = of();
    expect(skipped).toEqual([]);
    expect(publish[0]).toMatchObject({
      startUtc: '2026-08-06T16:30:00.000Z',
      dayOnly: false,
      cancelled: false,
      overridden: false,
    });
  });

  it('NEVER PUBLISHES AN UNMAPPED PLAYER, and names which side', () => {
    const { publish, skipped } = of({ awayAthleteId: null });
    expect(publish).toEqual([]);
    expect(skipped[0].reason).toBe('unmapped_player');
    // The point of the detail is that a human knows WHICH player lacks
    // the vendor id in our directory.
    expect(skipped[0].detail).toBe(
      'Juncheng Shang (in Luciano Darderi vs Juncheng Shang)',
    );
  });

  it('names BOTH sides when neither is mapped', () => {
    const { skipped } = of({ homeAthleteId: null, awayAthleteId: null });
    expect(skipped[0].detail).toMatch(/Luciano Darderi \+ Juncheng Shang/);
  });

  it('catches a mapping that points both players at one athlete', () => {
    const { publish, skipped } = of({ awayAthleteId: 'athlete_000101' });
    expect(publish).toEqual([]);
    expect(skipped[0].reason).toBe('same_player');
  });

  it('refuses a tournament we hold no parent for', () => {
    const { publish, skipped } = of({ tournamentKey: 'tennis-t-invented' });
    expect(publish).toEqual([]);
    expect(skipped[0].reason).toBe('unknown_tournament');
  });

  it('A HUMAN OVERRIDE WINS, and says that it did', () => {
    const { publish } = of({ overrideScheduledUtc: '2026-08-06T19:00:00.000Z' });
    expect(publish[0].startUtc).toBe('2026-08-06T19:00:00.000Z');
    expect(publish[0].overridden).toBe(true);
  });

  it('a human can withdraw a match the vendor still lists', () => {
    const { publish } = of({ overrideStatus: 'withdrawn' });
    expect(publish[0].cancelled).toBe(true);
    expect(publish[0].overridden).toBe(true);
  });

  it('rows without the optional override fields are simply not overridden', () => {
    // The vendor rows never carry them; the rules must not need them.
    const bare = row();
    expect('overrideScheduledUtc' in bare).toBe(false);
    expect(publishable([bare], KNOWN).publish[0].overridden).toBe(false);
  });

  it("the vendor's cancelling statuses publish a cancellation", () => {
    for (const status of ['canceled', 'cancelled', 'walkover', 'retired', 'postponed']) {
      const { publish } = of({ status });
      expect({ status, cancelled: publish[0].cancelled }).toEqual({ status, cancelled: true });
    }
    // A live or suspended match is still a match.
    for (const status of ['notstarted', 'inprogress', 'suspended']) {
      expect(of({ status }).publish[0].cancelled).toBe(false);
    }
  });

  it('a cancellation publishes even with no time at all', () => {
    // Removing an event already in someone's calendar is the point; a
    // withdrawal rarely arrives with a fresh timestamp.
    const { publish, skipped } = of({ scheduledUtc: null, timePrecision: null, status: 'walkover' });
    expect(skipped).toEqual([]);
    expect(publish[0].cancelled).toBe(true);
  });

  it('a date with no time is day-precision, never an invented o’clock', () => {
    const { publish } = of({ scheduledUtc: '2026-08-07', timePrecision: null });
    expect(publish[0].startUtc).toBe('2026-08-07T00:00:00.000Z');
    expect(publish[0].dayOnly).toBe(true);
  });

  it('an explicit date_only wins over a full timestamp', () => {
    const { publish } = of({ timePrecision: 'date_only' });
    expect(publish[0].dayOnly).toBe(true);
  });

  it('never coerces an unparseable value into a time', () => {
    const { publish, skipped } = of({ scheduledUtc: 'tomorrow evening' });
    expect(publish).toEqual([]);
    expect(skipped[0].reason).toBe('bad_time');
    expect(skipped[0].detail).toMatch(/tomorrow evening/);
  });

  it('skips a scheduled match with no time rather than inventing one', () => {
    const { publish, skipped } = of({ scheduledUtc: null, timePrecision: null });
    expect(publish).toEqual([]);
    expect(skipped[0].reason).toBe('no_time');
  });
});

it('titles a match with its round', () => {
  const r = row();
  expect(matchTitle(r, 'National Bank Open')).toBe(
    'Luciano Darderi vs Juncheng Shang — National Bank Open, Round of 32',
  );
  expect(matchTitle({ ...r, round: '' }, 'National Bank Open')).toBe(
    'Luciano Darderi vs Juncheng Shang — National Bank Open',
  );
});

describe('one doc per player, not one per match', () => {
  // Measured on the sheet chain's first live run (2026-08-06): a single
  // appearance doc carrying BOTH players as id-bearing refs trips
  // resolution's F34 guard — one provider id per doc id — so the second
  // ref is refused and the match reaches only one of its two players'
  // followers. Nine Montreal matches landed that way. The publish
  // contract has to make the per-side split obvious, which is what this
  // pins (draftsFrom in tennisApiAtpEvents builds on it).
  it('gives each side its own title, naming that player first', () => {
    const r = row();
    const home = matchTitle(r, 'National Bank Open');
    const away = matchTitle(
      { ...r, homeDisplay: r.awayDisplay, awayDisplay: r.homeDisplay },
      'National Bank Open',
    );
    expect(home).toBe(
      'Luciano Darderi vs Juncheng Shang — National Bank Open, Round of 32',
    );
    expect(away).toBe(
      'Juncheng Shang vs Luciano Darderi — National Bank Open, Round of 32',
    );
    // Two different titles means two different appearance doc ids,
    // which is the whole point: neither player can claim the other's.
    expect(home).not.toBe(away);
  });
});
