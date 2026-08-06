// The sheet is a source, and a source that a human edits mid-tournament.
// These pin the three things that would otherwise put a wrong match in a
// real calendar: guessing an unmapped player, reading columns by
// position after somebody inserts one, and letting a vendor quietly
// overwrite a correction.

import {
  mappingIntents,
  matchTitle,
  parseSheet,
  publishable,
  SheetRow,
} from '../providers/sheetAtp';

const HEADER = [
  'tournament_key',
  'round',
  'home_athlete_id',
  'away_athlete_id',
  'home_display',
  'away_display',
  'home_vendor_player_id',
  'away_vendor_player_id',
  'scheduled_utc',
  'time_precision',
  'status',
  'override_scheduled_utc',
  'override_status',
  'vendors',
  'vendor_match_id',
];

const row = (over: Partial<Record<string, string>> = {}): string[] =>
  HEADER.map((h) =>
    ({
      tournament_key: 'tennis-t-national-bank-open',
      round: 'Round of 32',
      home_athlete_id: 'athlete_000101',
      away_athlete_id: 'athlete_000102',
      home_display: 'Luciano Darderi',
      away_display: 'Juncheng Shang',
      home_vendor_player_id: '308084',
      away_vendor_player_id: '348853',
      scheduled_utc: '2026-08-06T16:30:00.000Z',
      time_precision: 'exact',
      status: 'scheduled',
      override_scheduled_utc: '',
      override_status: '',
      vendors: 'tennisapi1',
      vendor_match_id: '16661674',
      ...over,
    })[h] ?? '',
  );

const KNOWN = new Set(['tennis-t-national-bank-open']);

describe('parseSheet', () => {
  it('reads a normal sheet', () => {
    const { rows, error } = parseSheet([HEADER, row()]);
    expect(error).toBeNull();
    expect(rows).toHaveLength(1);
    expect(rows[0].homeDisplay).toBe('Luciano Darderi');
    expect(rows[0].scheduledUtc).toBe('2026-08-06T16:30:00.000Z');
  });

  it('SURVIVES A HUMAN INSERTING A COLUMN', () => {
    // The failure this design most needs to not have: positional parsing
    // would shift every field by one and publish plausible, wrong data.
    const h = ['notes', ...HEADER];
    const r = ['someone typed here', ...row()];
    const { rows, error } = parseSheet([h, r]);
    expect(error).toBeNull();
    expect(rows[0].homeDisplay).toBe('Luciano Darderi');
    expect(rows[0].tournamentKey).toBe('tennis-t-national-bank-open');
  });

  it('treats a missing header as a FAILURE, not an empty sheet', () => {
    // A renamed tab, a permission change and a broken read all look
    // like this. None of them is "no matches today".
    expect(parseSheet([]).error).toMatch(/no rows/);
    expect(parseSheet([['tournament_key', 'round']]).error).toMatch(/missing/);
  });

  it('ignores blank padding rows', () => {
    const { rows } = parseSheet([HEADER, row(), HEADER.map(() => '')]);
    expect(rows).toHaveLength(1);
  });
});

describe('publishable', () => {
  const of = (over: Partial<Record<string, string>> = {}) =>
    publishable(parseSheet([HEADER, row(over)]).rows, KNOWN);

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

  it('NEVER PUBLISHES AN UNMAPPED PLAYER', () => {
    const { publish, skipped } = of({ away_athlete_id: '' });
    expect(publish).toEqual([]);
    expect(skipped[0].reason).toBe('unmapped_player');
  });

  it('catches a mapping that points both players at one athlete', () => {
    const { publish, skipped } = of({ away_athlete_id: 'athlete_000101' });
    expect(publish).toEqual([]);
    expect(skipped[0].reason).toBe('same_player');
  });

  it('refuses a tournament we hold no parent for', () => {
    const { publish, skipped } = of({ tournament_key: 'tennis-t-invented' });
    expect(publish).toEqual([]);
    expect(skipped[0].reason).toBe('unknown_tournament');
  });

  it('THE OVERRIDE COLUMN WINS, and says that it did', () => {
    const { publish } = of({
      override_scheduled_utc: '2026-08-06T19:00:00.000Z',
    });
    expect(publish[0].startUtc).toBe('2026-08-06T19:00:00.000Z');
    expect(publish[0].overridden).toBe(true);
  });

  it('a human can withdraw a match the vendor still lists', () => {
    const { publish } = of({ override_status: 'withdrawn' });
    expect(publish[0].cancelled).toBe(true);
    expect(publish[0].overridden).toBe(true);
  });

  it('a cancellation publishes even with no time at all', () => {
    // Removing an event already in someone's calendar is the point; a
    // withdrawal rarely arrives with a fresh timestamp.
    const { publish, skipped } = of({ scheduled_utc: '', status: 'walkover' });
    expect(skipped).toEqual([]);
    expect(publish[0].cancelled).toBe(true);
  });

  it('a date with no time is day-precision, never an invented o’clock', () => {
    const { publish } = of({ scheduled_utc: '2026-08-07', time_precision: '' });
    expect(publish[0].startUtc).toBe('2026-08-07T00:00:00.000Z');
    expect(publish[0].dayOnly).toBe(true);
  });

  it('an explicit date_only wins over a full timestamp', () => {
    // The vendor gives 16:30 but the order of play says "after
    // previous" — a human marks the row day-only and is believed.
    const { publish } = of({ time_precision: 'date_only' });
    expect(publish[0].dayOnly).toBe(true);
  });

  it('never coerces a fat-fingered cell into a time', () => {
    const { publish, skipped } = of({ scheduled_utc: 'tomorrow evening' });
    expect(publish).toEqual([]);
    expect(skipped[0].reason).toBe('bad_time');
    expect(skipped[0].detail).toMatch(/tomorrow evening/);
  });

  it('skips a scheduled match with no time rather than inventing one', () => {
    const { publish, skipped } = of({ scheduled_utc: '' });
    expect(publish).toEqual([]);
    expect(skipped[0].reason).toBe('no_time');
  });
});

describe('mappingIntents — the sheet teaches the directory', () => {
  it('turns a curated row into one id stamp per player', () => {
    const rows = parseSheet([HEADER, row()]).rows;
    expect(mappingIntents(rows)).toEqual([
      {
        athleteId: 'athlete_000101',
        vendorPlayerId: '308084',
        displayName: 'Luciano Darderi',
      },
      {
        athleteId: 'athlete_000102',
        vendorPlayerId: '348853',
        displayName: 'Juncheng Shang',
      },
    ]);
  });

  it('does not repeat the same mapping across twenty matches', () => {
    const rows = parseSheet([HEADER, row(), row({ round: 'Round of 16' })]).rows;
    expect(mappingIntents(rows)).toHaveLength(2);
  });

  it('emits nothing for an unmapped or id-less player', () => {
    const rows = parseSheet([
      HEADER,
      row({ home_athlete_id: '', away_vendor_player_id: '' }),
    ]).rows;
    expect(mappingIntents(rows)).toEqual([]);
  });

  it('keeps two athletes claiming ONE vendor id visible', () => {
    // Never silently deduped to whichever came first: that is the F34
    // shape, and it belongs in the run record where a human sees it.
    const rows = parseSheet([
      HEADER,
      row(),
      row({ home_athlete_id: 'athlete_000999' }),
    ]).rows;
    expect(
      mappingIntents(rows).filter((m) => m.vendorPlayerId === '308084'),
    ).toHaveLength(2);
  });
});

it('titles a match with its round', () => {
  const r = parseSheet([HEADER, row()]).rows[0];
  expect(matchTitle(r, 'National Bank Open')).toBe(
    'Luciano Darderi vs Juncheng Shang — National Bank Open, Round of 32',
  );
  const noRound: SheetRow = { ...r, round: '' };
  expect(matchTitle(noRound, 'National Bank Open')).toBe(
    'Luciano Darderi vs Juncheng Shang — National Bank Open',
  );
});

describe('one doc per player, not one per match', () => {
  // Measured on the first live run (2026-08-06): a single appearance
  // doc carrying BOTH players as id-bearing refs trips resolution's F34
  // guard — one provider id per doc id — so the second ref is refused
  // and the match reaches only one of its two players' followers. Nine
  // Montreal matches landed that way. The publish contract has to make
  // the per-side split obvious, which is what this pins.
  it('gives each side its own title, naming that player first', () => {
    const r = parseSheet([HEADER, row()]).rows[0];
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
