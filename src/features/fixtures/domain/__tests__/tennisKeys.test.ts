import {
  followedTennisSexes,
  isBareTennisKey,
  isTennisTournamentKey,
  sexedTennisKey,
  sexOfTour,
  tennisBaseKey,
  tennisEntrySex,
  tennisSexGlyph,
  tennisSexOfKey,
  tourOfSex,
} from '../tennisKeys';

describe('tennis key grammar (Round 7 item 8)', () => {
  test('bare, sexed and retired-slot keys are told apart', () => {
    expect(isTennisTournamentKey('tennis-t-us-open')).toBe(true);
    expect(isTennisTournamentKey('tennis-t-us-open-m')).toBe(true);
    expect(isTennisTournamentKey('tennis-t-us-open-finals')).toBe(false);
    expect(isTennisTournamentKey('tennis-atp')).toBe(false);
    expect(isBareTennisKey('tennis-t-us-open')).toBe(true);
    expect(isBareTennisKey('tennis-t-us-open-w')).toBe(false);
  });

  test('sex and base of a key', () => {
    expect(tennisSexOfKey('tennis-t-us-open')).toBeNull();
    expect(tennisSexOfKey('tennis-t-us-open-m')).toBe('m');
    expect(tennisSexOfKey('tennis-t-us-open-w')).toBe('w');
    expect(tennisSexOfKey('tsdb-league-4445-m')).toBeNull(); // boxing's scope, not tennis
    expect(tennisBaseKey('tennis-t-roland-garros-w')).toBe('tennis-t-roland-garros');
    expect(tennisBaseKey('tennis-t-roland-garros')).toBe('tennis-t-roland-garros');
    expect(sexedTennisKey('tennis-t-wimbledon', 'm')).toBe('tennis-t-wimbledon-m');
  });

  test('tour ↔ sex, appearance slices', () => {
    expect(sexOfTour('atp')).toBe('m');
    expect(sexOfTour('wta')).toBe('w');
    expect(tourOfSex('w')).toBe('wta');
    expect(tennisEntrySex('tennis-atp-appearances')).toBe('m');
    expect(tennisEntrySex('tennis-wta-appearances')).toBe('w');
    expect(tennisEntrySex('pbc-cards-appearances')).toBeNull();
    expect(tennisEntrySex(undefined)).toBeNull();
  });

  test('followed draws: bare wants both, sexed wants its own, nothing wants nothing', () => {
    const both = followedTennisSexes('tennis-t-us-open', new Set(['tennis-t-us-open']));
    expect([...both].sort()).toEqual(['m', 'w']);
    expect([...followedTennisSexes('tennis-t-us-open', new Set(['tennis-t-us-open-m']))]).toEqual(['m']);
    expect([...followedTennisSexes('tennis-t-us-open', new Set(['tennis-t-us-open-m', 'tennis-t-us-open-w']))].sort()).toEqual(['m', 'w']);
    expect(followedTennisSexes('tennis-t-us-open', new Set(['tennis-wta'])).size).toBe(0);
  });

  test('the strip mark', () => {
    expect(tennisSexGlyph('tennis-t-us-open-m')).toBe('♂');
    expect(tennisSexGlyph('tennis-t-us-open-w')).toBe('♀');
    expect(tennisSexGlyph('tennis-t-us-open')).toBeNull();
  });
});
