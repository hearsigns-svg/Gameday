// Precision is not status, and neither is confidence.
//
// `tbd` conflated "there is no time" with "the time is not settled", and
// startUtc carried a midnight sentinel meaning either. The cost was 3,011
// real kick-offs rendered as all-day banners with no reminder — 380 of 380
// in the Premier League.

import { Fixture } from '../../../fixtures/domain/fixture';
import {
  fixtureEndUtc,
  isPast,
  timePrecisionOf,
} from '../../../fixtures/domain/horizon';
import { DEFAULT_PREFS } from '../prefs';
import { desiredEventFor, NOMINAL_TIME_NOTE } from '../syncPlan';

const fx = (over: Partial<Fixture> = {}): Fixture => ({
  id: 'f1',
  sport: 'soccer',
  competition: 'Premier League',
  competitionId: 'fdorg-comp-PL',
  title: 'Arsenal v Liverpool',
  followKeys: ['fdorg-comp-PL'],
  startUtc: '2026-08-21T19:00:00.000Z',
  status: 'scheduled',
  durationHours: 2,
  updatedAt: '2026-07-31T00:00:00.000Z',
  ...over,
});

describe('rendering by precision', () => {
  test('exact → a plain timed event, no note', () => {
    const d = desiredEventFor(fx({ timePrecision: 'exact' }), DEFAULT_PREFS)!;
    expect(d.allDay).toBe(false);
    expect(d.startUtc).toBe('2026-08-21T19:00:00.000Z');
    expect(d.note).toBeUndefined();
    expect(d.title).toBe('Arsenal v Liverpool');
  });

  test('nominal → a TIMED event at the nominal time, uncertainty in the note', () => {
    // The headline change. The instant survives, the reminder survives,
    // and the caveat goes where it does not shout.
    const d = desiredEventFor(fx({ timePrecision: 'nominal' }), DEFAULT_PREFS)!;
    expect(d.allDay).toBe(false);
    expect(d.startUtc).toBe('2026-08-21T19:00:00.000Z');
    expect(d.note).toBe(NOMINAL_TIME_NOTE);
    // NOT in the title — that is read at a glance, fifty times.
    expect(d.title).toBe('Arsenal v Liverpool');
  });

  test('date_only → an all-day banner, as before', () => {
    const d = desiredEventFor(
      fx({ timePrecision: 'date_only', startUtc: '2026-08-21T00:00:00.000Z' }),
      DEFAULT_PREFS,
    )!;
    expect(d.allDay).toBe(true);
    expect(d.title).toBe('Arsenal v Liverpool — time TBC');
  });

  test('postponed keeps its banner whatever the precision says', () => {
    const d = desiredEventFor(
      fx({ status: 'postponed', timePrecision: 'exact' }),
      DEFAULT_PREFS,
    )!;
    expect(d.allDay).toBe(true);
    expect(d.title).toContain('postponed');
  });

  test('provisional alone does NOT make an all-day banner any more', () => {
    // The branch this replaces: `confidence === 'provisional'` used to
    // force an all-day "date TBC". Now that every football-data SCHEDULED
    // fixture is provisional, that rule would have undone the whole change.
    const d = desiredEventFor(
      fx({ timePrecision: 'nominal', confidence: 'provisional' }),
      DEFAULT_PREFS,
    )!;
    expect(d.allDay).toBe(false);
  });

  test('the all-day PREFERENCE still wins over an exact time', () => {
    const d = desiredEventFor(
      fx({ timePrecision: 'exact' }),
      { ...DEFAULT_PREFS, eventStyle: 'all-day' },
    )!;
    expect(d.allDay).toBe(true);
  });
});

describe('records written before the field existed', () => {
  test('status stands in for precision', () => {
    expect(timePrecisionOf(fx({ status: 'tbd' }))).toBe('date_only');
    expect(timePrecisionOf(fx({ status: 'postponed' }))).toBe('date_only');
    expect(timePrecisionOf(fx({ status: 'scheduled' }))).toBe('exact');
  });

  test('an explicit precision always wins over the status fallback', () => {
    expect(timePrecisionOf(fx({ status: 'tbd', timePrecision: 'exact' }))).toBe(
      'exact',
    );
  });

  test('a legacy tbd record renders exactly as it did before', () => {
    const d = desiredEventFor(
      fx({ status: 'tbd', startUtc: '2026-08-21T00:00:00.000Z' }),
      DEFAULT_PREFS,
    )!;
    expect(d.allDay).toBe(true);
    expect(d.title).toContain('time TBC');
  });
});

describe('precision and the horizon agree', () => {
  test('a nominal fixture ends by its duration, not by its day', () => {
    // If nominal were treated as a day sentinel it would stay "live" until
    // midnight and freeze late — and every fd fixture is nominal.
    const f = fx({ timePrecision: 'nominal' });
    expect(fixtureEndUtc(f)).toBe('2026-08-21T21:00:00.000Z');
    expect(isPast(f, Date.parse('2026-08-22T02:59:00.000Z'))).toBe(false);
    expect(isPast(f, Date.parse('2026-08-22T03:00:00.000Z'))).toBe(true);
  });

  test('a date_only fixture still runs to the end of its day', () => {
    const f = fx({ timePrecision: 'date_only', startUtc: '2026-08-21T00:00:00.000Z' });
    expect(fixtureEndUtc(f)).toBe('2026-08-22T00:00:00.000Z');
  });
});
