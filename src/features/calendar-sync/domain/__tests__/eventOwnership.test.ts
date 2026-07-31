// Foreign-event safety. Until now the prune rule ("delete any tagged
// event the ledger does not reference") lived inside a calendar we owned
// outright, so a mistake could only cost us our own events. Once the
// target can be the user's real Google calendar — full of their work,
// their doctor's appointments, their kids' birthdays — the ownership tag
// is the ONLY thing between a sync bug and their data.
//
// Acceptance criterion 5 of docs/CALENDAR_TARGET.md: "No event we did
// not create is ever modified or deleted — proven by test, not by
// inspection." This is that proof.

import {
  entriesFromRecoveredEvents,
  fixtureIdFromNotes,
  foreignEventCount,
  NOTES_TAG,
  orphanEventIds,
  ourEventsIn,
  ScannedEvent,
} from '../recovery';

const TARGET = 'cal-google-primary';

const ours = (over: Partial<ScannedEvent> = {}): ScannedEvent => ({
  id: 'evt-ours',
  calendarId: TARGET,
  notes: `${NOTES_TAG}apisports-1`,
  title: 'Liverpool v Everton',
  startDate: '2026-10-21T11:30:00.000Z',
  endDate: '2026-10-21T13:30:00.000Z',
  allDay: false,
  ...over,
});

// What actually sits in somebody's primary calendar.
const theirs = (over: Partial<ScannedEvent> = {}): ScannedEvent => ({
  id: 'evt-theirs',
  calendarId: TARGET,
  notes: null,
  title: 'Dentist',
  startDate: '2026-10-21T09:00:00.000Z',
  endDate: '2026-10-21T09:30:00.000Z',
  allDay: false,
  ...over,
});

describe('the ownership tag', () => {
  it('reads the fixture id back out of an event we wrote', () => {
    expect(fixtureIdFromNotes(`${NOTES_TAG}apisports-42`)).toBe('apisports-42');
  });

  it('claims nothing without the tag', () => {
    expect(fixtureIdFromNotes(null)).toBeNull();
    expect(fixtureIdFromNotes(undefined)).toBeNull();
    expect(fixtureIdFromNotes('')).toBeNull();
    expect(fixtureIdFromNotes('Lunch with Sam')).toBeNull();
    // Mentioning us is not being written by us.
    expect(fixtureIdFromNotes(`see ${NOTES_TAG}apisports-1`)).toBeNull();
  });

  it('treats a tag with no fixture id as no claim at all', () => {
    // Identifies no fixture, so it is not evidence we wrote the event —
    // and must never license deleting it.
    expect(fixtureIdFromNotes(NOTES_TAG)).toBeNull();
    expect(fixtureIdFromNotes(`${NOTES_TAG}   `)).toBeNull();
  });

  it('survives a user typing under our line', () => {
    expect(fixtureIdFromNotes(`${NOTES_TAG}f-9\nmoved to the pub`)).toBe('f-9');
  });
});

describe('scanning a calendar the user owns', () => {
  const mixed = [theirs(), ours(), theirs({ id: 'evt-standup', title: 'Standup' })];

  it('sees only our events among the user’s', () => {
    expect(ourEventsIn(mixed, TARGET).map((e) => e.eventId)).toEqual([
      'evt-ours',
    ]);
  });

  it('counts everything else as foreign — the gate on touching a calendar', () => {
    expect(foreignEventCount(mixed)).toBe(2);
    expect(foreignEventCount([ours()])).toBe(0);
  });

  it('ignores a tagged event living in a different calendar', () => {
    // Defence in depth: a scan is calendar-scoped already, so reaching
    // this means a bug — and a bug must not reach across calendars.
    expect(ourEventsIn([ours({ calendarId: 'some-other-cal' })], TARGET)).toEqual(
      [],
    );
  });

  it('normalises an all-day read back to the UTC day, in any zone', () => {
    // Platforms report all-day boundaries as device-local midnight; the
    // planner writes UTC midnight. Without this every recovered
    // placeholder is rewritten on every sync after a reinstall.
    const localMidnight = new Date(2026, 7, 23, 0, 0, 0); // 23 Aug, local
    const [e] = ourEventsIn(
      [ours({ allDay: true, startDate: localMidnight, endDate: localMidnight })],
      TARGET,
    );
    expect(e.startUtc).toBe('2026-08-23T00:00:00.000Z');
  });
});

describe('prune can never reach a user’s own events', () => {
  it('an untagged event in the target is invisible to the orphan rule', () => {
    // The end-to-end shape of the prune pass: scan → ownership gate →
    // orphans → delete. An empty ledger is the worst case (every one of
    // our events is an orphan) and the user's still must not appear.
    const inTheirCalendar = [
      theirs(),
      theirs({ id: 'evt-flight', title: 'Flight to Berlin' }),
      ours({ id: 'evt-a', notes: `${NOTES_TAG}f-a` }),
      ours({ id: 'evt-b', notes: `${NOTES_TAG}f-b` }),
    ];
    const deletable = orphanEventIds(ourEventsIn(inTheirCalendar, TARGET), {});
    expect(deletable).toEqual(['evt-a', 'evt-b']);
    expect(deletable).not.toContain('evt-theirs');
    expect(deletable).not.toContain('evt-flight');
  });

  it('a user event is never mistaken for one of ours, whatever it is called', () => {
    const impostor = theirs({
      id: 'evt-impostor',
      title: 'Liverpool v Everton', // same title, watching it at the pub
      notes: 'tickets in the drawer',
    });
    expect(ourEventsIn([impostor], TARGET)).toEqual([]);
    expect(orphanEventIds(ourEventsIn([impostor], TARGET), {})).toEqual([]);
  });
});

describe('reinstall recovery can never adopt a user’s events', () => {
  it('rebuilds the ledger from our events only', () => {
    const scan = ourEventsIn(
      [theirs(), ours({ id: 'evt-a', notes: `${NOTES_TAG}f-a` }), theirs({ id: 'x' })],
      TARGET,
    );
    const { ledger, surplusEventIds } = entriesFromRecoveredEvents(scan, TARGET);
    expect(Object.keys(ledger)).toEqual(['f-a']);
    expect(surplusEventIds).toEqual([]);
    // An adopted entry is one we will later update and delete — so the
    // set of adoptable events and the set of deletable ones must be the
    // same set, and neither may contain anything of theirs.
    expect(Object.values(ledger).map((e) => e.eventId)).toEqual(['evt-a']);
  });

  it('a calendar holding nothing of ours recovers nothing', () => {
    const scan = ourEventsIn([theirs(), theirs({ id: 'x' })], TARGET);
    expect(entriesFromRecoveredEvents(scan, TARGET).ledger).toEqual({});
  });
});
