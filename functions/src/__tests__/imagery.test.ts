// The imagery policy (Prompt 13). Two controls with deliberately
// different strengths, and the difference is the whole point:
// an ops switch for trademark, a code exclusion for statute.

import {
  imageryAllowed,
  imageryPermanentlyExcluded,
  IMAGERY_NEVER_PREFIXES,
  withImageryPolicy,
} from '../imagery';

const none: ReadonlySet<string> = new Set();

describe('the takedown switch', () => {
  test('artwork flows unless a key is explicitly switched off', () => {
    expect(imageryAllowed('fdorg-comp-PL', none)).toBe(true);
    expect(imageryAllowed('fdorg-comp-PL', new Set(['fdorg-comp-PL']))).toBe(
      false,
    );
    // A key nobody has an opinion about is allowed — absence of a
    // catalogue row is not a takedown.
    expect(imageryAllowed(undefined, none)).toBe(true);
  });

  test('a suppressed row loses its crest and keeps everything else', () => {
    const row = {
      id: '1',
      name: 'Some Club',
      key: 'tsdb-team-1',
      crestUrl: 'https://example.test/badge.png',
      colours: 'Red / White',
    };
    const out = withImageryPolicy(row, 'tsdb-league-4328', new Set(['tsdb-league-4328']));
    expect(out.crestUrl).toBeUndefined();
    expect(out).toMatchObject({ name: 'Some Club', colours: 'Red / White' });
  });

  test('an allowed row is returned UNCHANGED, not rebuilt', () => {
    // These rows come out of a shared 60s cache; copying on the happy
    // path would be wasted work, and mutating would poison the cache.
    const row = { key: 'k', crestUrl: 'https://example.test/b.png' };
    expect(withImageryPolicy(row, 'live-key', none)).toBe(row);
  });

  test('suppression never invents a field on a row that had none', () => {
    const row: { key: string; crestUrl?: string } = { key: 'k' };
    expect(withImageryPolicy(row, 'olympics-2028', none)).toBe(row);
  });
});

describe('Olympic marks are excluded in CODE, not by the switch', () => {
  test('the Games, its disciplines and the Paralympics are all covered', () => {
    for (const k of [
      'olympics',
      'olympics-2028',
      'olympics-2028-athletics',
      'paralympics-2028',
    ]) {
      expect(imageryPermanentlyExcluded(k)).toBe(true);
      expect(imageryAllowed(k, none)).toBe(false);
    }
  });

  test('NO catalogue edit can turn Olympic imagery back on', () => {
    // The switch is `imagery: false` — there is no `imagery: true` path
    // that reaches these keys. An operator flipping the field on an
    // Olympic row must not be able to pull a Games emblem into the app.
    const anythingGoes: ReadonlySet<string> = new Set();
    expect(imageryAllowed('olympics-2028-swimming', anythingGoes)).toBe(false);
    const row = {
      key: 'olympics-2028-swimming',
      crestUrl: 'https://example.test/rings.png',
    };
    expect(
      withImageryPolicy(row, 'olympics-2028-swimming', anythingGoes).crestUrl,
    ).toBeUndefined();
  });

  test('provider artwork arriving for an Olympic key is dropped, not passed through', () => {
    // The realistic leak: TSDB (or any provider) starts returning a
    // badge for an Olympic competition and it rides Part A's
    // restoration straight onto the screen.
    const fromProvider = {
      id: '9999',
      name: 'Olympics',
      crestUrl: 'https://r2.thesportsdb.com/images/media/league/badge/x.png',
    };
    expect(
      withImageryPolicy(fromProvider, 'olympics-2028', new Set()).crestUrl,
    ).toBeUndefined();
  });

  test('the prefix rule does not over-reach onto unrelated keys', () => {
    // "olympiacos" starts with neither prefix plus a separator, and a
    // Greek club must keep its crest.
    expect(imageryPermanentlyExcluded('tsdb-team-olympiacos')).toBe(false);
    expect(imageryPermanentlyExcluded('olympiacos')).toBe(false);
    expect(imageryPermanentlyExcluded(undefined)).toBe(false);
    expect(IMAGERY_NEVER_PREFIXES).toContain('olympics');
  });
});
