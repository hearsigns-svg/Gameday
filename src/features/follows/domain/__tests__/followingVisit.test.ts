// The Following page's visit (owner ruling 2026-09-23, replacing the Undo
// row): rows keep their place for the whole visit; an unfollowed row stays
// with its caption; the next opening drops it.
import { advanceVisit, keysAfter, openVisit, visitRows } from '../followingVisit';

const f = (key: string, calendar: 'in' | 'out' = 'in') => ({ key, calendar });
const shown = (rows: ReturnType<typeof visitRows<{ key: string; calendar: string }>>) =>
  rows.map((r) => `${r.follow.key}${r.followed ? '' : ' (unfollowed)'}`);

test('an unfollowed row stays where it is, marked unfollowed; nothing moves', () => {
  const stored = [f('nba'), f('lakers'), f('f1'), f('pl')];
  let visit = openVisit(stored, { nba: 1208, lakers: 80, f1: 10, pl: 330 });
  const afterUnfollow = [f('nba'), f('f1'), f('pl')];
  visit = advanceVisit(visit, afterUnfollow, { nba: 1208, f1: 10, pl: 330 });
  expect(shown(visitRows(visit, afterUnfollow))).toEqual([
    'nba',
    'lakers (unfollowed)',
    'f1',
    'pl',
  ]);
  // Its caption count survives the sync that dropped it from the live set.
  expect(visit.counts.lakers).toBe(80);
});

test('re-following puts the row back as followed, in the same place', () => {
  const stored = [f('nba'), f('lakers'), f('f1')];
  let visit = openVisit(stored, {});
  visit = advanceVisit(visit, [f('nba'), f('f1')], {});
  visit = advanceVisit(visit, [f('nba'), f('f1'), f('lakers')], {}); // store order differs
  expect(shown(visitRows(visit, [f('nba'), f('f1'), f('lakers')]))).toEqual(['nba', 'lakers', 'f1']);
});

test('a follow made elsewhere during the visit joins at the end; records refresh in place', () => {
  const visit0 = openVisit([f('nba'), f('f1')], {});
  const visit = advanceVisit(visit0, [f('nba', 'out'), f('f1'), f('chiefs')], {});
  const rows = visitRows(visit, [f('nba', 'out'), f('f1'), f('chiefs')]);
  expect(rows.map((r) => r.follow.key)).toEqual(['nba', 'f1', 'chiefs']);
  expect(rows[0].follow.calendar).toBe('out');
});

test('opening the page again drops the rows unfollowed on the last visit', () => {
  let visit = openVisit([f('nba'), f('lakers')], {});
  visit = advanceVisit(visit, [f('nba')], {});
  expect(visitRows(visit, [f('nba')])).toHaveLength(2);
  visit = openVisit([f('nba')], {});
  expect(shown(visitRows(visit, [f('nba')]))).toEqual(['nba']);
});

test('keysAfter names the rows on screen after a row — unfollowed ones included', () => {
  let visit = openVisit([f('x'), f('a'), f('b'), f('c')], {});
  visit = advanceVisit(visit, [f('x'), f('c')], {}); // a and b unfollowed
  expect(keysAfter(visit, 'a')).toEqual(['b', 'c']);
  expect(keysAfter(visit, 'c')).toEqual([]);
  expect(keysAfter(visit, 'nope')).toEqual([]);
});
