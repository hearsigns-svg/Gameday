import { lookupByMarkKeys, markLookupKeys } from '../markKeys';

test('a sexed tennis follow reads its event’s mark; a bare key reads itself', () => {
  expect(markLookupKeys('tennis-t-us-open-m')).toEqual(['tennis-t-us-open-m', 'tennis-t-us-open']);
  expect(markLookupKeys('tennis-t-us-open-w')).toEqual(['tennis-t-us-open-w', 'tennis-t-us-open']);
  expect(markLookupKeys('tennis-t-us-open')).toEqual(['tennis-t-us-open']);
});

test('a sexed boxing follow reads the league key and then the numeric id the art map uses', () => {
  expect(markLookupKeys('tsdb-league-4445-m')).toEqual(['tsdb-league-4445-m', 'tsdb-league-4445', '4445']);
  expect(markLookupKeys('tsdb-league-4328')).toEqual(['tsdb-league-4328', '4328']);
});

test('other keys are themselves only — no guessing', () => {
  expect(markLookupKeys('f1-series-1')).toEqual(['f1-series-1']);
  expect(markLookupKeys('athlete_000900')).toEqual(['athlete_000900']);
  expect(markLookupKeys('olympics-2028-archery')).toEqual(['olympics-2028-archery']);
});

test('lookupByMarkKeys returns the first key the map holds', () => {
  const art = { 'tennis-t-us-open': 'https://marks/usopen.png', '4445': 'https://tsdb/boxing.png' };
  expect(lookupByMarkKeys(art, 'tennis-t-us-open-w')).toBe('https://marks/usopen.png');
  expect(lookupByMarkKeys(art, 'tsdb-league-4445-m')).toBe('https://tsdb/boxing.png');
  expect(lookupByMarkKeys(art, 'tennis-t-wimbledon-m')).toBeUndefined();
});
