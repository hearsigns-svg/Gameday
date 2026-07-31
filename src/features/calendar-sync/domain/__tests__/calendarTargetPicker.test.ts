// The picker's own pure surface: what "create a new one" offers, and the
// sentence describing the current target once it is only a stored record
// rather than a live calendar object.
//
// Acceptance criterion 6 — "every user-facing string about calendars is
// true in all three modes" — has two halves. The live half is pinned in
// calendarTarget.test.ts; this is the stored half, and the point of both
// going through one implementation is that they cannot drift apart.

import {
  ANDROID_LOCAL_HINT,
  CalendarLike,
  consequenceForTarget,
  consequenceOf,
  creatableSources,
  sourceKindOf,
  targetSummary,
} from '../calendarTarget';

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
  source: { id: 's-local', name: 'On My iPhone', type: 'local' },
  ...over,
});

describe('sources we can create a calendar in', () => {
  it('offers each writable source once, cloud first', () => {
    const sources = creatableSources([
      localCal(),
      icloud(),
      icloud({ id: 'ic2', title: 'Work' }), // same source, one entry
      icloud({ id: 'ex1', source: { id: 's-work', name: 'Work', type: 'exchange' } }),
    ]);
    expect(sources.map((s) => s.sourceId)).toEqual([
      's-icloud',
      's-work',
      's-local',
    ]);
    expect(sources[0]).toEqual({
      sourceId: 's-icloud',
      name: 'iCloud',
      kind: 'cloud',
    });
  });

  it('never offers to create inside a subscribed or read-only source', () => {
    // Holiday feeds and birthday calendars are not places to write.
    const sources = creatableSources([
      icloud({ source: { id: 's-sub', name: 'Holidays', type: 'subscribed' } }),
      icloud({
        id: 'b1',
        source: { id: 's-bday', name: 'Birthdays', type: 'birthdays' },
      }),
      icloud({ id: 'ro', allowsModifications: false }),
    ]);
    expect(sources).toEqual([]);
  });

  it('keeps the device-only source as the last resort, never absent', () => {
    // Someone with no cloud account must still be able to ask for a
    // dedicated calendar — it just cannot leave the phone.
    const sources = creatableSources([localCal()]);
    expect(sources).toEqual([
      { sourceId: 's-local', name: 'On My iPhone', kind: 'device' },
    ]);
  });
});

describe('the stored target describes itself truthfully', () => {
  it('promises cross-device sync only for a cloud calendar of ours', () => {
    expect(
      consequenceForTarget({
        sourceKind: 'cloud',
        accountLabel: 'iCloud',
        ours: true,
      }),
    ).toBe('iCloud — syncs to your other devices');
  });

  it('says a user calendar mixes our fixtures in with their events', () => {
    expect(
      consequenceForTarget({
        sourceKind: 'cloud',
        accountLabel: 'you@gmail.com',
        ours: false,
      }),
    ).toBe('you@gmail.com — fixtures appear alongside your own events');
  });

  it('never claims sync for a device-only calendar, ours or not', () => {
    for (const ours of [true, false]) {
      const line = consequenceForTarget({
        sourceKind: 'device',
        accountLabel: 'On this device',
        ours,
      });
      expect(line).toBe(
        "On this device only — won't appear on your other devices",
      );
      expect(line).not.toMatch(/sync/i);
    }
  });

  it('says the same thing as the live-calendar path — one implementation', () => {
    // The Preferences row reads a stored record and the picker reads a
    // live calendar. Two sentences for one fact is how copy goes stale.
    for (const [cal, ours] of [
      [icloud({ title: 'KickOffCal' }), true],
      [icloud(), false],
      [localCal(), true],
    ] as Array<[CalendarLike, boolean]>) {
      expect(consequenceOf(cal, ours)).toBe(
        consequenceForTarget({
          sourceKind: sourceKindOf(cal),
          accountLabel: cal.source?.name ?? '',
          ours,
        }),
      );
    }
  });

  it('summarises as "calendar · consequence"', () => {
    expect(
      targetSummary({
        label: 'KickOffCal',
        accountLabel: 'iCloud',
        sourceKind: 'cloud',
        ours: true,
      }),
    ).toBe('KickOffCal · iCloud — syncs to your other devices');
  });
});

describe('the Android upgrade hint', () => {
  it('describes the benefit and asks for nothing', () => {
    // Shown only under a device-local target. It is an offer, not a nag:
    // the app already works, and this is what a Google account adds.
    expect(ANDROID_LOCAL_HINT).toBe(
      'Using a Google calendar makes your fixtures appear on all your devices.',
    );
    expect(ANDROID_LOCAL_HINT).not.toMatch(/must|need to|required/i);
  });
});
