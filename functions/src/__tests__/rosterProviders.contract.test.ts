// Roster connector contract tests, pinned to REAL captured payloads
// (2026-08-03): a WTA rankings page, three IBF ratings classes — the
// vacant-champion heavyweight with a NOT-RATED hole and a rival-champ
// pair, a male class with an IBF champion, a female class with full
// champion dates — and the Jolpica 2026 driver table. Expectations are
// LITERAL values read off the banked payloads.

import ibfFemale from './fixtures/ibf-female-featherweight-sample.json';
import ibfHeavy from './fixtures/ibf-heavyweight-sample.json';
import ibfWelter from './fixtures/ibf-welterweight-sample.json';
import jolpicaSample from './fixtures/jolpica-drivers-sample.json';
import wtaSample from './fixtures/wta-rankings-sample.json';
import {
  classToEntries,
  IBF_FEMALE_CLASSES,
  IBF_MALE_CLASSES,
  mergeEntries,
} from '../providers/ibfRatings';
import { driversToEntries } from '../providers/jolpicaDrivers';
import { rankedRowsToEntries } from '../providers/wtaRankings';

describe('WTA rankings', () => {
  const entries = rankedRowsToEntries(wtaSample as never);

  test('numeric player ids are the payload — every entry carries one', () => {
    expect(entries).toHaveLength(100);
    expect(entries[0]).toEqual({
      source: 'wta',
      externalId: '320760',
      name: 'Aryna Sabalenka',
      sport: 'tennis',
      grouping: 'WTA Tour',
      groupingKey: 'wta',
      rank: 1,
      countryCode: 'BLR',
    });
    expect(entries.every((e) => e.externalId !== null)).toBe(true);
  });

  test('ranks are contiguous 1..100 in this capture', () => {
    expect(entries.map((e) => e.rank)).toEqual(
      Array.from({ length: 100 }, (_, i) => i + 1),
    );
  });

  test('a row missing its id is shape rot and throws', () => {
    expect(() =>
      rankedRowsToEntries([{ player: { fullName: 'X Y' }, ranking: 1 }]),
    ).toThrow(/missing id/);
  });
});

describe('IBF ratings', () => {
  test('heavyweight: vacant IBF title, rival champions kept, NOT-RATED hole skipped', () => {
    const entries = classToEntries(ibfHeavy[0] as never, 'heavyweight', false);
    // "TITLE VACANT" must never become a fighter.
    expect(entries.some((e) => /vacant/i.test(e.name))).toBe(false);
    // The IBF's own fields carry the OTHER bodies' champions — Usyk
    // holds WBA and WBC at heavyweight in this capture; Wardley WBO.
    const usyk = entries.filter((e) => e.name === 'Oleksandr Usyk');
    expect(usyk.map((e) => e.championOf)).toEqual([['WBA'], ['WBC']]);
    expect(
      entries.find((e) => e.name === 'Fabio Wardley' && e.championOf)!
        .championOf,
    ).toEqual(['WBO']);
    // Position 2 is ";;" — NOT RATED — so Itauma is rank 3, and the
    // hole stays a hole rather than shifting everyone up a place.
    expect(entries.find((e) => e.name === 'Moses Itauma')!.rank).toBe(3);
    expect(entries.find((e) => e.rank === 2)).toBeUndefined();
    // Sanchez is rank 1 with his country code parsed from "(CUB)".
    const sanchez = entries.find((e) => e.rank === 1)!;
    expect(sanchez.name).toBe('Frank Sanchez');
    expect(sanchez.countryCode).toBe('CUB');
    // A US state field ("California (CA)") must not corrupt the country.
    expect(
      entries.find((e) => e.name === 'Richard Torrez Jr.')!.countryCode,
    ).toBe('USA');
    // Everything is name-keyed: the IBF publishes no fighter ids.
    expect(entries.every((e) => e.externalId === null)).toBe(true);
  });

  test('welterweight: the IBF champion leads, champion-first', () => {
    const entries = classToEntries(ibfWelter[0] as never, 'welterweight', false);
    expect(entries[0].name).toBe('Liam Paro');
    expect(entries[0].championOf).toEqual(['IBF']);
    expect(entries[0].grouping).toBe('Welterweight');
    expect(entries[0].groupingKey).toBe('boxing-welterweight');
  });

  test('female classes group separately, labelled honestly', () => {
    const entries = classToEntries(
      ibfFemale[0] as never,
      'featherweight',
      true,
    );
    expect(entries[0].name).toBe('Nina Meinke');
    expect(entries[0].championOf).toEqual(['IBF']);
    expect(entries[0].grouping).toBe("Women's Featherweight");
    expect(entries[0].groupingKey).toBe('boxing-w-featherweight');
  });

  test('mergeEntries unions championships and keeps the best rank, one person once', () => {
    const heavy = classToEntries(ibfHeavy[0] as never, 'heavyweight', false);
    const merged = mergeEntries(heavy);
    const usyk = merged.filter((e) => e.name === 'Oleksandr Usyk');
    expect(usyk).toHaveLength(1);
    expect(usyk[0].championOf!.sort()).toEqual(['WBA', 'WBC']);
  });

  test('the class lists mirror the site\'s own exclusions', () => {
    // ratings-filter.js: IBF male excludes jr-mini-flyweight; female
    // excludes heavyweight and cruiserweight.
    expect(IBF_MALE_CLASSES).not.toContain('jr-mini-flyweight');
    expect(IBF_FEMALE_CLASSES).not.toContain('heavyweight');
    expect(IBF_FEMALE_CLASSES).not.toContain('cruiserweight');
    expect(IBF_MALE_CLASSES).toHaveLength(17);
    expect(IBF_FEMALE_CLASSES).toHaveLength(16);
  });
});

describe('Jolpica drivers', () => {
  const drivers = (jolpicaSample as never as {
    MRData: { DriverTable: { Drivers: unknown[] } };
  }).MRData.DriverTable.Drivers;

  test('stable string ids become f1 provider ids — 31 drivers in the 2026 capture', () => {
    const entries = driversToEntries(drivers as never);
    expect(entries).toHaveLength(31);
    const alonso = entries.find((e) => e.externalId === 'alonso')!;
    expect(alonso.name).toBe('Fernando Alonso');
    expect(alonso.sport).toBe('f1');
    expect(alonso.groupingKey).toBe('f1');
    // A reserve without a permanentNumber still counts — the id and
    // name are what identity needs.
    expect(entries.some((e) => e.externalId === 'paul_aron')).toBe(true);
  });

  test('a driver row without an id is shape rot and throws', () => {
    expect(() => driversToEntries([{ givenName: 'X' }] as never)).toThrow(
      /missing id/,
    );
  });
});
