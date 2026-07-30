// The calendar target decides whether the core promise is kept: do
// fixtures follow you across devices, or sit on one phone? These pin
// the automatic choice for every situation in docs/CALENDAR_TARGET.md,
// because the requirement is that nobody has to choose anything.

import {
  accountLabelOf,
  CalendarLike,
  chooseDefaultTarget,
  consequenceOf,
  groupForPicker,
  isWritable,
  sourceKindOf,
} from '../calendarTarget';

const OURS = ['KickOffCal', 'Gameday'];

const icloud = (over: Partial<CalendarLike> = {}): CalendarLike => ({
  id: 'ic1',
  title: 'Home',
  allowsModifications: true,
  source: { id: 's-icloud', name: 'iCloud', type: 'caldav' },
  ...over,
});
const localCal = (over: Partial<CalendarLike> = {}): CalendarLike => ({
  id: 'l1',
  title: 'Personal',
  allowsModifications: true,
  source: { id: 's-local', name: 'Default', type: 'local' },
  ...over,
});
const google = (over: Partial<CalendarLike> = {}): CalendarLike => ({
  id: 'g1',
  title: 'you@gmail.com',
  allowsModifications: true,
  accountName: 'you@gmail.com',
  accountType: 'com.google',
  isPrimary: true,
  ...over,
});

describe('source classification', () => {
  it('treats iCloud/Exchange/CalDAV as cloud', () => {
    expect(sourceKindOf(icloud())).toBe('cloud');
    expect(sourceKindOf(icloud({ source: { type: 'exchange' } }))).toBe('cloud');
    expect(sourceKindOf(icloud({ source: { type: 'mobileme' } }))).toBe('cloud');
  });

  it('treats a Google account as cloud even with no source type', () => {
    expect(sourceKindOf(google())).toBe('cloud');
  });

  it('treats device-local as device', () => {
    expect(sourceKindOf(localCal())).toBe('device');
  });

  it('never writes to subscribed or birthday calendars', () => {
    expect(isWritable(icloud({ source: { type: 'subscribed' } }))).toBe(false);
    expect(isWritable(icloud({ source: { type: 'birthdays' } }))).toBe(false);
    expect(isWritable(icloud({ allowsModifications: false }))).toBe(false);
  });
});

describe('automatic target — the zero-friction path', () => {
  it('iOS with iCloud creates OUR calendar in the cloud source', () => {
    const pick = chooseDefaultTarget([icloud(), localCal()], OURS, 'ios');
    expect(pick.reason).toBe('create-cloud');
    expect(pick.calendarId).toBeNull();
    expect(pick.createInSourceId).toBe('s-icloud');
  });

  it('iOS with no cloud account falls back to a local calendar', () => {
    const pick = chooseDefaultTarget([localCal()], OURS, 'ios');
    expect(pick.reason).toBe('create-local');
  });

  it('Android writes into the PRIMARY Google calendar', () => {
    const pick = chooseDefaultTarget(
      [localCal(), google({ id: 'g2', isPrimary: false, title: 'Work' }), google()],
      OURS,
      'android',
    );
    expect(pick.reason).toBe('google-primary');
    expect(pick.calendarId).toBe('g1');
  });

  it('Android with no Google account keeps the local calendar', () => {
    const pick = chooseDefaultTarget([localCal()], OURS, 'android');
    expect(pick.reason).toBe('create-local');
    expect(pick.calendarId).toBeNull();
  });

  it('an existing calendar of ours always wins — never strand events', () => {
    const mine = icloud({ id: 'k1', title: 'KickOffCal' });
    expect(chooseDefaultTarget([mine, google()], OURS, 'android').calendarId).toBe('k1');
    expect(chooseDefaultTarget([mine, icloud()], OURS, 'ios').calendarId).toBe('k1');
  });

  it('recognises the pre-rename calendar as ours', () => {
    const legacy = icloud({ id: 'old', title: 'Gameday' });
    expect(chooseDefaultTarget([legacy], OURS, 'ios').reason).toBe('existing-ours');
  });
});

describe('honest consequence copy', () => {
  it('says plainly when events will not leave the device', () => {
    expect(consequenceOf(localCal(), true)).toContain("won't appear on your other devices");
  });

  it('promises sync only when it is true', () => {
    expect(consequenceOf(icloud({ title: 'KickOffCal' }), true)).toContain('syncs to your other devices');
  });

  it('warns that a user calendar mixes fixtures with their own events', () => {
    expect(consequenceOf(google(), false)).toContain('alongside your own events');
  });
});

describe('picker grouping', () => {
  it('groups by account with cloud accounts first', () => {
    const groups = groupForPicker([
      localCal({ title: 'On My iPhone' }),
      icloud({ title: 'Home' }),
      icloud({ id: 'ic2', title: 'Work' }),
    ]);
    expect(groups[0].account).toBe('iCloud');
    expect(groups[0].calendars.map((c) => c.title)).toEqual(['Home', 'Work']);
  });

  it('keeps same-named calendars from different accounts distinguishable', () => {
    const groups = groupForPicker([
      google({ id: 'a', title: 'Personal', accountName: 'a@gmail.com' }),
      google({ id: 'b', title: 'Personal', accountName: 'b@gmail.com' }),
    ]);
    expect(groups.map((g) => g.account).sort()).toEqual(['a@gmail.com', 'b@gmail.com']);
    expect(accountLabelOf(google({ accountName: 'a@gmail.com' }))).toBe('a@gmail.com');
  });

  it('excludes unwritable calendars from the picker entirely', () => {
    const groups = groupForPicker([icloud({ source: { type: 'subscribed' }, title: 'Holidays' })]);
    expect(groups).toHaveLength(0);
  });
});
