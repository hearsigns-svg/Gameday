import {
  groupOlympicItems,
  groupSeasonOf,
  isGroupKey,
  olympicSeasonOf,
} from '../railGroups';

const item = (key: string, label: string, startUtc: string | null, glyph = '🏟️') => ({
  key,
  label,
  caption: startUtc ? `on ${startUtc.slice(0, 10)}` : 'Nothing scheduled',
  glyph,
  startUtc,
});
const labels = { summer: 'Summer Olympics', winter: 'Winter Olympics' } as const;

describe('olympicSeasonOf', () => {
  it('Summer in leap years, Winter two years off; non-Olympic keys are null', () => {
    expect(olympicSeasonOf('olympics-2028-athletics')).toBe('summer');
    expect(olympicSeasonOf('olympics-2032-surfing')).toBe('summer');
    expect(olympicSeasonOf('olympics-2030-curling')).toBe('winter');
    expect(olympicSeasonOf('olympics-2026-biathlon')).toBe('winter');
    expect(olympicSeasonOf('olympics-2028')).toBeNull(); // the Games follow itself, not a sport
    expect(olympicSeasonOf('tsdb-league-4445')).toBeNull();
  });
});

describe('groupOlympicItems', () => {
  const pl = item('tsdb-league-4328', 'Premier League', '2026-09-05T14:00:00.000Z');
  const ath = item('olympics-2028-athletics', 'Athletics', '2028-07-30T00:00:00.000Z', '🏃');
  const swim = item('olympics-2028-swimming', 'Swimming', '2028-07-22T00:00:00.000Z', '🏊');
  const curl = item('olympics-2030-curling', 'Curling', null, '🥌');
  const ufc = item('tsdb-league-4443', 'UFC', '2026-09-06T02:00:00.000Z');

  it('collapses Olympic sports into one node per season, in the first member’s place, members kept — never inlined', () => {
    const out = groupOlympicItems([pl, ath, swim, ufc, curl], labels, 'Nothing scheduled');
    expect(out.map((o) => o.key)).toEqual(['tsdb-league-4328', 'olympics:summer', 'tsdb-league-4443', 'olympics:winter']);
    const summer = out[1] as { kind: string; season: string; glyph: string; caption: string; members: Array<{ key: string }> };
    expect(summer.kind).toBe('group');
    expect(summer.season).toBe('summer');
    expect(summer.glyph).toBe('🏅'); // the medal, never the rings
    // The count the node wears, and the page it opens, are these members.
    expect(summer.members.map((m) => m.key)).toEqual(['olympics-2028-athletics', 'olympics-2028-swimming']);
    // the node speaks for its soonest member
    expect(summer.caption).toBe('on 2028-07-22');
    const winter = out[3] as { caption: string; members: unknown[] };
    expect(winter.caption).toBe('Nothing scheduled');
    expect(winter.members).toHaveLength(1);
  });

  it('no Olympic follows → the list passes through unchanged', () => {
    const out = groupOlympicItems([pl, ufc], labels, 'Nothing scheduled');
    expect(out).toEqual([pl, ufc]);
  });

  it('group keys are recognisable and carry their season', () => {
    expect(isGroupKey('olympics:summer')).toBe(true);
    expect(groupSeasonOf('olympics:winter')).toBe('winter');
    expect(groupSeasonOf('olympics-2028-athletics')).toBeNull();
    expect(groupSeasonOf('olympics:autumn')).toBeNull();
  });
});
