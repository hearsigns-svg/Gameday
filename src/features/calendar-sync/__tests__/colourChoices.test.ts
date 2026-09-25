// The colour controls' handlers (owner rulings 2026-09-25) — PREMIUM like
// every colour control (AGENTS rule 19): free → the offer, no sheet,
// nothing saved, no pass; trial and Premium → saved and the calendar
// updated. And what the sport and follow dots show in each layout.
const mockPrefs = { value: {} as Record<string, unknown> };
const mockFollows: Array<Record<string, unknown>> = [];
jest.mock('../../../core/entitlementStore', () => ({ premiumLocked: jest.fn() }));
jest.mock('../../../core/premiumOffer', () => ({ offerPremium: jest.fn() }));
jest.mock('../../../core/regionStore', () => ({ activeRegion: () => 'uk-ie' }));
jest.mock('../syncEngine', () => ({ runSync: jest.fn(async () => ({ ok: true })) }));
jest.mock('../data/prefsStore', () => ({
  loadPrefs: () => mockPrefs.value,
  savePrefs: jest.fn((p: Record<string, unknown>) => {
    mockPrefs.value = p;
  }),
}));
jest.mock('../data/sportCalendarStore', () => ({
  sportCalendarIds: () => ({ basketball: 'cal-bb' }),
}));
jest.mock('../data/driver', () => ({
  calendarCapabilities: () => ({ perEventColour: true }),
  calendarColour: () => '#1463F3',
  paintSportCalendar: jest.fn(async () => 'applied'),
}));
jest.mock('../../follows/data/followStore', () => ({
  loadFollowables: () => mockFollows,
  setFollowColour: jest.fn(),
  toInclusionFollow: (f: { key: string; type: string }) => ({
    key: f.key,
    type: f.type,
    calendar: 'in',
    queryKeys: [f.key],
  }),
}));

import { premiumLocked } from '../../../core/entitlementStore';
import { offerPremium } from '../../../core/premiumOffer';
import { DEFAULT_PREFS } from '../domain/prefs';
import { sportCalendarColour } from '../../follows/domain/sportCalendarGroup';
import { paintSportCalendar } from '../data/driver';
import { savePrefs } from '../data/prefsStore';
import { setFollowColour } from '../../follows/data/followStore';
import {
  colourTap,
  eventInherit,
  followColourChoice,
  pickFollowColour,
  pickSportColour,
  sportColourChoice,
} from '../colourChoices';
import { runSync } from '../syncEngine';

const GRAPE = '#8E24AA';
const RED = '#D50000';

beforeEach(() => {
  jest.clearAllMocks();
  mockPrefs.value = { ...DEFAULT_PREFS };
  mockFollows.length = 0;
});

describe('free', () => {
  beforeEach(() => (premiumLocked as jest.Mock).mockReturnValue(true));

  test('a tap on any dot is the offer, and no sheet opens', () => {
    const open = jest.fn();
    colourTap(open);
    expect(open).not.toHaveBeenCalled();
    expect(offerPremium).toHaveBeenCalledTimes(1);
  });

  test('a sport or follow colour, set or cleared: the offer, nothing saved, no pass', () => {
    expect(pickSportColour('soccer', GRAPE)).toBe('offered');
    expect(pickSportColour('soccer', undefined)).toBe('offered');
    expect(pickFollowColour('arsenal', RED)).toBe('offered');
    expect(savePrefs).not.toHaveBeenCalled();
    expect(setFollowColour).not.toHaveBeenCalled();
    expect(paintSportCalendar).not.toHaveBeenCalled();
    expect(runSync).not.toHaveBeenCalled();
  });
});

describe('trial or Premium', () => {
  beforeEach(() => (premiumLocked as jest.Mock).mockReturnValue(false));

  test('a tap opens the sheet', () => {
    const open = jest.fn();
    colourTap(open);
    expect(open).toHaveBeenCalledTimes(1);
    expect(offerPremium).not.toHaveBeenCalled();
  });

  test('one calendar: a sport colour is saved for the next pass to paint; clearing it removes it', () => {
    expect(pickSportColour('soccer', GRAPE)).toBe('saved');
    expect((mockPrefs.value.sportColours as Record<string, string>).soccer).toBe(GRAPE);
    expect(paintSportCalendar).not.toHaveBeenCalled();
    expect(runSync).toHaveBeenCalledTimes(1);
    pickSportColour('soccer', undefined);
    expect(mockPrefs.value.sportColours).toEqual({});
  });

  test('a calendar for each sport: the sport’s calendar is painted at once', () => {
    mockPrefs.value = { ...DEFAULT_PREFS, separateSportCalendars: true };
    expect(pickSportColour('basketball', GRAPE)).toBe('saved');
    expect(paintSportCalendar).toHaveBeenCalledWith('cal-bb', GRAPE);
    expect(runSync).toHaveBeenCalledTimes(1);
  });

  test('a follow colour is saved on the follow, and a pass runs', () => {
    expect(pickFollowColour('arsenal', RED)).toBe('saved');
    expect(setFollowColour).toHaveBeenCalledWith('arsenal', RED);
    expect(runSync).toHaveBeenCalledTimes(1);
  });
});

describe('what the dots show', () => {
  test('one calendar: a sport with none of its own shows KickOffCal’s, and offers it first', () => {
    const c = sportColourChoice('soccer');
    expect(c.colour).toBe('#1463F3');
    expect(c.chosen).toBeUndefined();
    expect(c.inherit).toEqual({ label: 'KickOffCal', colour: '#1463F3' });
  });

  test('a calendar for each sport: the calendar’s colour, and no “none” — a calendar has one', () => {
    mockPrefs.value = { ...DEFAULT_PREFS, separateSportCalendars: true };
    const c = sportColourChoice('soccer');
    expect(c.title).toBe('KickOffCal · Football');
    expect(c.colour).toBe(sportCalendarColour('soccer'));
    expect(c.inherit).toBeUndefined();
  });

  test('a follow with none of its own shows its sport’s, named for the sport', () => {
    mockPrefs.value = { ...DEFAULT_PREFS, sportColours: { soccer: GRAPE } };
    const arsenal = { key: 'arsenal', label: 'Arsenal', sportKey: 'soccer', type: 'team' as const };
    expect(followColourChoice(arsenal)).toEqual({
      colour: GRAPE,
      chosen: undefined,
      inherit: { label: 'Football', colour: GRAPE },
    });
    expect(followColourChoice({ ...arsenal, colour: RED }).colour).toBe(RED);
  });

  test('an event’s first choice names where its colour comes from', () => {
    mockFollows.push({ key: 'arsenal', label: 'Arsenal', sportKey: 'soccer', type: 'team', colour: RED });
    expect(eventInherit({ sport: 'soccer', followKeys: ['arsenal'] })).toEqual({ label: 'Arsenal', colour: RED });
    mockFollows.length = 0;
    mockPrefs.value = { ...DEFAULT_PREFS, sportColours: { soccer: GRAPE } };
    expect(eventInherit({ sport: 'soccer', followKeys: ['arsenal'] })).toEqual({ label: 'Football', colour: GRAPE });
    mockPrefs.value = { ...DEFAULT_PREFS };
    expect(eventInherit({ sport: 'soccer', followKeys: ['arsenal'] })).toEqual({ label: 'KickOffCal', colour: '#1463F3' });
  });
});
