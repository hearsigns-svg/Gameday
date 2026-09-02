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

  it('collapses Olympic sports into one node per season, in the first member’s place', () => {
    const out = groupOlympicItems([pl, ath, swim, ufc, curl], { summer: false, winter: false }, labels, 'Nothing scheduled');
    expect(out.map((o) => o.key)).toEqual(['tsdb-league-4328', 'olympics:summer', 'tsdb-league-4443', 'olympics:winter']);
    const summer = out[1] as { kind: string; glyph: string; caption: string; members: unknown[] };
    expect(summer.kind).toBe('group');
    expect(summer.glyph).toBe('🏅'); // the medal, never the rings
    expect(summer.members).toHaveLength(2);
    // the node speaks for its soonest member
    expect(summer.caption).toBe('on 2028-07-22');
    const winter = out[3] as { caption: string };
    expect(winter.caption).toBe('Nothing scheduled');
  });

  it('an expanded node is followed by its members, as sport icons', () => {
    const out = groupOlympicItems([pl, ath, swim], { summer: true, winter: false }, labels, 'Nothing scheduled');
    expect(out.map((o) => o.key)).toEqual(['tsdb-league-4328', 'olympics:summer', 'olympics-2028-athletics', 'olympics-2028-swimming']);
    expect((out[2] as { glyph: string }).glyph).toBe('🏃');
  });

  it('no Olympic follows → the list passes through unchanged', () => {
    const out = groupOlympicItems([pl, ufc], { summer: true, winter: true }, labels, 'Nothing scheduled');
    expect(out).toEqual([pl, ufc]);
  });

  it('group keys are recognisable and carry their season', () => {
    expect(isGroupKey('olympics:summer')).toBe(true);
    expect(groupSeasonOf('olympics:winter')).toBe('winter');
    expect(groupSeasonOf('olympics-2028-athletics')).toBeNull();
    expect(groupSeasonOf('olympics:autumn')).toBeNull();
  });
});
