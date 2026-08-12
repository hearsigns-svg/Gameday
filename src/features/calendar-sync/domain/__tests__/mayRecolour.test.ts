// The recolour ownership proof (Prompt 26 §4, owner hard rule: never
// apply a colour to a calendar we did not create). Each refusal case
// here is one of the holes the OLD guard had — it refused only an
// explicit kind:'user' record and trusted everything else.

import { mayRecolour } from '../calendarTarget';

const OURS = ['KickOffCal', 'Gameday'];

describe('mayRecolour', () => {
  it('allows our record pointing at our calendar under our title', () => {
    expect(
      mayRecolour(
        { kind: 'ours', calendarId: 'c1' },
        { id: 'c1', title: 'KickOffCal' },
        OURS,
      ),
    ).toBe(true);
  });

  it('allows the legacy title — an adopted pre-rename calendar is ours', () => {
    expect(
      mayRecolour(
        { kind: 'ours', calendarId: 'c1' },
        { id: 'c1', title: 'Gameday' },
        OURS,
      ),
    ).toBe(true);
  });

  it("refuses a 'user' target — their calendar, their colours", () => {
    expect(
      mayRecolour(
        { kind: 'user', calendarId: 'c1' },
        { id: 'c1', title: 'KickOffCal' },
        OURS,
      ),
    ).toBe(false);
  });

  // HOLE 1 in the old guard: no stored record fell through to a cached
  // id and recoloured whatever it named.
  it('refuses when there is no stored record at all', () => {
    expect(mayRecolour(null, { id: 'c1', title: 'KickOffCal' }, OURS)).toBe(
      false,
    );
  });

  // HOLE 2: a stale 'ours' record whose platform id was REUSED by a user
  // calendar. The record says ours; the calendar it names is somebody's
  // "Work". The title is what betrays the reuse.
  it('refuses a stale record pointing at a reused id', () => {
    expect(
      mayRecolour(
        { kind: 'ours', calendarId: 'c1' },
        { id: 'c1', title: 'Work' },
        OURS,
      ),
    ).toBe(false);
  });

  it('refuses an id mismatch — the record and the calendar disagree', () => {
    expect(
      mayRecolour(
        { kind: 'ours', calendarId: 'c1' },
        { id: 'c2', title: 'KickOffCal' },
        OURS,
      ),
    ).toBe(false);
  });

  it('refuses a missing calendar', () => {
    expect(mayRecolour({ kind: 'ours', calendarId: 'c1' }, null, OURS)).toBe(
      false,
    );
  });

  // The subtle one: a USER calendar the user themselves named
  // "KickOffCal". The kind check refuses it before the title can pass —
  // title alone must never be proof, which is also the driver's rule for
  // adoption (provablyOurs scans for foreign events).
  it("refuses a user calendar even when it wears our name", () => {
    expect(
      mayRecolour(
        { kind: 'user', calendarId: 'c1' },
        { id: 'c1', title: 'KickOffCal' },
        OURS,
      ),
    ).toBe(false);
  });
});
