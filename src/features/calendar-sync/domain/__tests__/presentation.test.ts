// Round 7 item 7: the in-app Schedule mirrors the calendar entry for
// entry; Home's carousel keeps one card per tournament.
import { carouselFixtures, presentationFixtures } from '../presentation';

const parent = { id: 'wta-905-2026' };
const open = { id: 'wta-905-2026', tournamentNote: 'open' as const };
const close = { id: 'wta-905-2026::close', tournamentNote: 'close' as const };
const m1 = { id: 'wta-905-2026-app-a', parentFixtureId: 'wta-905-2026' };
const m2 = { id: 'tennis-x-app-b', parentFixtureId: 'tennis-x' };
const pl = { id: 'fdorg-1' };

test('the snapshot is the plan plus the match copies — never the bookend notes, never a duplicate', () => {
  const out = presentationFixtures([parent, pl], [open, close, m1, m2, m1]);
  expect(out.map((f) => f.id)).toEqual(['wta-905-2026', 'fdorg-1', 'wta-905-2026-app-a', 'tennis-x-app-b']);
});

test('a tier pass with no children leaves the snapshot exactly the plan', () => {
  expect(presentationFixtures([parent, pl], [open, close])).toEqual([parent, pl]);
});

test('the carousel drops a match whose parent card is present, keeps an orphan match (a pinned bout)', () => {
  expect(carouselFixtures([parent, m1, m2, pl]).map((f) => f.id)).toEqual([
    'wta-905-2026',
    'tennis-x-app-b',
    'fdorg-1',
  ]);
});

test('a men’s match whose ATP parent the joint dedupe dropped is still represented by the WTA parent card (found on device)', () => {
  const wta = { id: 'wta-905-2026', followKeys: ['tennis-wta', 'tennis-t-us-open', 'tennis-t-us-open-w'] };
  const mens = {
    id: 'tennis-28pln-app-bellucci',
    parentFixtureId: 'tennis-28pln73q7br6q1565elv65bikk', // not in the set
    followKeys: ['tennis-atp-appearances', 'athlete_001002', 'tennis-t-us-open-m'],
  };
  const pinnedBout = { id: 'pbc-x-app-a', parentFixtureId: 'pbc-x', followKeys: ['pbc-cards-appearances'] };
  expect(carouselFixtures([wta, mens, pinnedBout]).map((f) => f.id)).toEqual(['wta-905-2026', 'pbc-x-app-a']);
  // Without any parent of that tournament in the set, the match stands alone.
  expect(carouselFixtures([mens]).map((f) => f.id)).toEqual(['tennis-28pln-app-bellucci']);
});
