// P0 2026-09-02 — "US Open shows no matches at all". The store held 70
// men's and 145 women's children under the 2026 parents; the card's
// union produced 74 rows from them. What emptied the screen was
// SELECTION: every surface filtered "upcoming" by START, so once the
// fifteen-day block began (Aug 30) it vanished, and the only "US Open"
// left to open was the 2027 edition — a parent with no draw and no
// children. This test fails if a surface's current-edition choice ever
// lands on an edition whose card would render empty while children exist.
import { Fixture } from '../fixture';
import { currentFixtures, isCurrent, isLive } from '../horizon';
import { jointCardEntries } from '../card';

const D = 86_400_000;
// Wednesday 2 September 2026, mid-tournament (the report's instant).
const now = Date.parse('2026-09-02T16:00:00.000Z');

function parent(id: string, startUtc: string, competitionId: string): Fixture {
  return {
    id,
    sport: 'tennis',
    competition: competitionId === 'tennis-wta' ? 'WTA Tour' : 'ATP Tour',
    competitionId,
    title: 'US Open',
    followKeys: [competitionId, 'tennis-t-us-open'],
    startUtc,
    venueTz: 'America/New_York',
    status: 'scheduled',
    timePrecision: 'date_only',
    durationHours: 360, // fifteen days
    updatedAt: '2026-08-03T00:00:00.000Z',
  } as Fixture;
}

function child(parentId: string, slice: string, name: string, startUtc: string): Fixture {
  return {
    id: `${parentId}-app-${name.toLowerCase().replace(/\s+/g, '-')}`,
    sport: 'tennis',
    competition: slice === 'tennis-wta-appearances' ? 'WTA Tour' : 'ATP Tour',
    competitionId: slice,
    title: `${name} vs Someone Else — US Open`,
    followKeys: [slice, 'athlete_x'],
    startUtc,
    venueTz: 'America/New_York',
    status: 'scheduled',
    timePrecision: 'exact',
    durationHours: 3,
    parentFixtureId: parentId,
    athletes: [name],
    updatedAt: '2026-09-02T11:51:50.000Z',
  } as Fixture;
}

const atp2026 = parent('tennis-atp-2026', '2026-08-30T00:00:00.000Z', 'tennis-atp');
const wta2026 = parent('wta-905-2026', '2026-08-30T00:00:00.000Z', 'tennis-wta');
const atp2027 = parent('tennis-atp-2027', '2027-08-29T00:00:00.000Z', 'tennis-atp');
const children = {
  [atp2026.id]: [
    child(atp2026.id, 'tennis-atp-appearances', 'Alex de Minaur', '2026-09-02T16:40:00.000Z'),
    child(atp2026.id, 'tennis-atp-appearances', 'Carlos Alcaraz', '2026-09-03T00:00:00.000Z'),
  ],
  [wta2026.id]: [
    child(wta2026.id, 'tennis-wta-appearances', 'Caty McNally', '2026-09-02T16:40:00.000Z'),
    child(wta2026.id, 'tennis-wta-appearances', 'Iga Swiatek', '2026-09-03T00:00:00.000Z'),
  ],
  [atp2027.id]: [] as Fixture[],
};

const startBasedUpcoming = (fixtures: Fixture[]) =>
  fixtures.filter((f) => Date.parse(f.startUtc) > now - 3_600_000);

describe('the current edition of a tournament (P0 2026-09-02)', () => {
  const snapshot = [atp2027, atp2026, wta2026].sort((a, b) => a.startUtc.localeCompare(b.startUtc));

  it('an in-progress fifteen-day block is CURRENT and LIVE; next year is current but not live', () => {
    expect(isCurrent(atp2026, now)).toBe(true);
    expect(isLive(atp2026, now)).toBe(true);
    expect(isCurrent(atp2027, now)).toBe(true);
    expect(isLive(atp2027, now)).toBe(false);
    // and a block that ENDED is neither
    const ended = parent('old', '2026-07-01T00:00:00.000Z', 'tennis-atp');
    expect(isCurrent(ended, now)).toBe(false);
  });

  it('the surfaces select the edition WITH children: current-first ordering lands on 2026, not 2027', () => {
    const current = currentFixtures(snapshot, now);
    expect(current.map((f) => f.id)).toEqual([atp2026.id, wta2026.id, atp2027.id]);
    const first = current[0];
    const sides = [atp2026, wta2026].map((p) => ({ parent: p, children: children[p.id] }));
    expect(first.id).toBe(atp2026.id);
    expect(jointCardEntries(sides, now).length).toBeGreaterThan(0);
  });

  it('REGRESSION PIN: the card of the selected edition is never empty while its children exist', () => {
    const selected = currentFixtures(snapshot, now)[0];
    const editionSides = [atp2026, wta2026]
      .filter((p) => Math.abs(Date.parse(p.startUtc) - Date.parse(selected.startUtc)) < 21 * D)
      .map((p) => ({ parent: p, children: children[p.id] }));
    const totalChildren = editionSides.reduce((n, s) => n + s.children.length, 0);
    expect(totalChildren).toBeGreaterThan(0);
    const entries = jointCardEntries(editionSides, now);
    expect(entries.length).toBeGreaterThan(0);
    // both tours present on the one card
    expect(new Set(entries.map((e) => e.competitionId))).toEqual(
      new Set(['tennis-atp-appearances', 'tennis-wta-appearances']),
    );
  });

  it('documents the defect: the retired start-based rule chose the childless 2027 edition', () => {
    const chosen = startBasedUpcoming(snapshot)[0];
    expect(chosen.id).toBe(atp2027.id);
    expect(children[chosen.id]).toHaveLength(0);
    // …which is exactly the state the new rule must never reproduce
    expect(currentFixtures(snapshot, now)[0].id).not.toBe(atp2027.id);
  });
});
