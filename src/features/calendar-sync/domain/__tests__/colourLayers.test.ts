// Colour layers (owner rulings 2026-09-25): sport, follow, event — the
// more specific wins, nothing is painted until someone picks.
import {
  ColourContext,
  ColourFollow,
  colourGroups,
  colourSourceResolver,
  inheritedColourResolver,
  sportCalendarColourFor,
  sportColourNeedsPaint,
  sportDotColour,
} from '../colourLayers';
import { sportCalendarColour } from '../../../follows/domain/sportCalendarGroup';

const RED = '#D50000';
const BLUE = '#3F51B5';
const GREEN = '#0B8043';
const YELLOW = '#F6BF26';
const KICKOFFCAL = '#1463F3';

const follow = (
  key: string,
  type: ColourFollow['type'],
  colour?: string,
  calendar: ColourFollow['calendar'] = 'in',
  queryKeys: string[] = [key],
): ColourFollow => ({ key, type, calendar, queryKeys, ...(colour ? { colour } : {}) });

const ctx = (over: Partial<ColourContext> = {}): ColourContext => ({
  layout: 'combined',
  sportColours: {},
  follows: [],
  eventColours: true,
  ...over,
});

const game = (sport: string, followKeys: string[]) => ({ sport, followKeys });

const arsenalChelsea = game('soccer', ['arsenal', 'chelsea', 'premier-league']);

describe('nothing is painted until someone picks (ruling 9)', () => {
  test('no sport or follow colour: every event inherits nothing, in either layout', () => {
    for (const layout of ['combined', 'per-sport'] as const) {
      const inherited = inheritedColourResolver(
        ctx({
          layout,
          follows: [follow('arsenal', 'team'), follow('premier-league', 'competition')],
        }),
      );
      expect(inherited(arsenalChelsea)).toBeUndefined();
    }
  });
});

describe('the sport layer', () => {
  test('one calendar: the sport colour paints that sport’s events, and only those', () => {
    const inherited = inheritedColourResolver(ctx({ sportColours: { soccer: GREEN } }));
    expect(inherited(arsenalChelsea)).toBe(GREEN);
    expect(inherited(game('boxing', ['tsdb-league-4445']))).toBeUndefined();
  });

  test('a calendar for each sport: the sport colour is the calendar’s, so events carry none', () => {
    const source = colourSourceResolver(ctx({ layout: 'per-sport', sportColours: { soccer: GREEN } }));
    expect(source(arsenalChelsea)).toEqual({ kind: 'calendar', group: 'soccer' });
    expect(
      inheritedColourResolver(ctx({ layout: 'per-sport', sportColours: { soccer: GREEN } }))(
        arsenalChelsea,
      ),
    ).toBeUndefined();
  });

  test('Formula 1 takes Motorsport’s colour — its calendar group', () => {
    const inherited = inheritedColourResolver(ctx({ sportColours: { motorsport: RED } }));
    expect(inherited(game('f1', ['f1-series-1']))).toBe(RED);
  });
});

describe('the follow layer', () => {
  test('a follow’s colour beats its sport’s', () => {
    const inherited = inheritedColourResolver(
      ctx({ sportColours: { soccer: GREEN }, follows: [follow('arsenal', 'team', RED)] }),
    );
    expect(inherited(arsenalChelsea)).toBe(RED);
    // A game Arsenal are not in keeps the sport colour.
    expect(inherited(game('soccer', ['spurs', 'premier-league']))).toBe(GREEN);
  });

  test('a follow’s colour paints its events in either layout', () => {
    for (const layout of ['combined', 'per-sport'] as const) {
      const inherited = inheritedColourResolver(
        ctx({ layout, follows: [follow('arsenal', 'team', RED)] }),
      );
      expect(inherited(arsenalChelsea)).toBe(RED);
    }
  });

  test('the more specific follow wins, whatever order they were followed in', () => {
    const inherited = inheritedColourResolver(
      ctx({
        follows: [follow('premier-league', 'competition', BLUE), follow('arsenal', 'team', RED)],
      }),
    );
    expect(inherited(arsenalChelsea)).toBe(RED);
    // A draw beats its tournament.
    const tennis = inheritedColourResolver(
      ctx({
        follows: [
          follow('tennis-t-us-open', 'competition', BLUE),
          follow('tennis-t-us-open-w', 'competition', YELLOW),
        ],
      }),
    );
    expect(tennis(game('tennis', ['tennis-t-us-open', 'tennis-t-us-open-w']))).toBe(YELLOW);
  });

  test('among equals, the one followed first', () => {
    const inherited = inheritedColourResolver(
      ctx({ follows: [follow('chelsea', 'team', BLUE), follow('arsenal', 'team', RED)] }),
    );
    expect(inherited(arsenalChelsea)).toBe(BLUE);
  });

  test('a follow kept out of the calendar colours nothing', () => {
    const inherited = inheritedColourResolver(
      ctx({
        follows: [follow('arsenal', 'team', RED, 'out'), follow('chelsea', 'team', BLUE)],
      }),
    );
    expect(inherited(arsenalChelsea)).toBe(BLUE);
  });

  test('a follow matches on its scope-expanded query keys', () => {
    const inherited = inheritedColourResolver(
      ctx({
        follows: [follow('pga-tour', 'competition', GREEN, 'in', ['pga-tour-final'])],
      }),
    );
    expect(inherited(game('golf', ['pga-tour-final']))).toBe(GREEN);
    expect(inherited(game('golf', ['pga-tour']))).toBeUndefined();
  });

  test('the source names the follow, for the card’s “inherit” option', () => {
    const source = colourSourceResolver(ctx({ follows: [follow('arsenal', 'team', RED)] }));
    expect(source(arsenalChelsea)).toEqual({ kind: 'follow', key: 'arsenal', colour: RED });
  });
});

describe('a calendar layer that cannot colour one event (EventKit)', () => {
  test('paints no event — sport and follow colours alike', () => {
    const inherited = inheritedColourResolver(
      ctx({
        eventColours: false,
        sportColours: { soccer: GREEN },
        follows: [follow('arsenal', 'team', RED)],
      }),
    );
    expect(inherited(arsenalChelsea)).toBeUndefined();
  });

  test('each event wears its calendar’s colour — the sport calendar’s, with one per sport', () => {
    const source = colourSourceResolver(ctx({ eventColours: false, layout: 'per-sport' }));
    expect(source(arsenalChelsea)).toEqual({ kind: 'calendar', group: 'soccer' });
    const combined = colourSourceResolver(ctx({ eventColours: false }));
    expect(combined(arsenalChelsea)).toEqual({ kind: 'calendar', group: null });
  });
});

describe('what the dots show', () => {
  test('one calendar: a sport with no colour of its own shows KickOffCal’s', () => {
    expect(sportDotColour('soccer', 'combined', {}, KICKOFFCAL)).toBe(KICKOFFCAL);
    expect(sportDotColour('soccer', 'combined', { soccer: GREEN }, KICKOFFCAL)).toBe(GREEN);
  });

  test('a calendar for each sport: the calendar’s colour — picked, else the one it was made in', () => {
    expect(sportDotColour('soccer', 'per-sport', {}, KICKOFFCAL)).toBe(sportCalendarColour('soccer'));
    expect(sportDotColour('soccer', 'per-sport', { soccer: GREEN }, KICKOFFCAL)).toBe(GREEN);
    expect(sportCalendarColourFor('boxing', { soccer: GREEN })).toBe(sportCalendarColour('boxing'));
  });
});

describe('the sports Settings lists', () => {
  const label = (g: string) =>
    ({ soccer: 'Football', boxing: 'Boxing', motorsport: 'Motorsport', tennis: 'Tennis' })[g] ?? g;

  test('sports, not teams: one row per sport followed, F1 under Motorsport, sorted by name', () => {
    const follows = [
      { key: 'arsenal', sportKey: 'soccer' },
      { key: 'chelsea', sportKey: 'soccer' },
      { key: 'f1-series-1', sportKey: 'f1' },
      { key: 'tsdb-league-4445', sportKey: 'boxing' },
    ];
    expect(colourGroups(follows, 'combined', [], label)).toEqual(['boxing', 'soccer', 'motorsport']);
  });

  test('with a calendar for each sport, a calendar still there after its last follow is listed too', () => {
    const follows = [{ key: 'arsenal', sportKey: 'soccer' }];
    expect(colourGroups(follows, 'per-sport', ['tennis', 'soccer'], label)).toEqual([
      'soccer',
      'tennis',
    ]);
    // …but not with one calendar: there is no such calendar to colour.
    expect(colourGroups(follows, 'combined', ['tennis'], label)).toEqual(['soccer']);
  });
});

describe('when a sport calendar is painted', () => {
  test('no record: once — a calendar made before this, or whose first paint died', () => {
    expect(sportColourNeedsPaint(undefined, GREEN)).toBe(true);
  });

  test('the colour it already wears: never again, however the hex is written', () => {
    expect(sportColourNeedsPaint({ hex: GREEN.toLowerCase(), status: 'applied' }, GREEN)).toBe(false);
  });

  test('a paint that did not land: again, every pass until it does', () => {
    expect(sportColourNeedsPaint({ hex: GREEN, status: 'pending' }, GREEN)).toBe(true);
  });

  test('refused: not asked again — until another colour is wanted', () => {
    expect(sportColourNeedsPaint({ hex: GREEN, status: 'refused' }, GREEN)).toBe(false);
    expect(sportColourNeedsPaint({ hex: GREEN, status: 'refused' }, RED)).toBe(true);
    expect(sportColourNeedsPaint({ hex: GREEN, status: 'applied' }, RED)).toBe(true);
  });
});
