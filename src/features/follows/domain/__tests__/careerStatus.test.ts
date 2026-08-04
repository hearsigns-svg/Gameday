// The retirement copy (Prompt 12). Three surfaces, one source — and
// the invariant that absence is never turned into a claim.

import {
  isRetired,
  retiredCaption,
  retiredEmptyState,
  retiredFollowNote,
} from '../careerStatus';

describe('isRetired', () => {
  test('only a recorded marker is retirement', () => {
    expect(isRetired({ careerStatus: 'retired' })).toBe(true);
    expect(isRetired({})).toBe(false);
    expect(isRetired(undefined)).toBe(false);
    expect(isRetired(null)).toBe(false);
  });

  test('a career-end year WITHOUT the marker is not retirement', () => {
    // The year is display material. The status is the fact. A doc that
    // somehow carried a year alone must not be promoted to retired —
    // that is inference, which is exactly what this field exists to
    // avoid.
    expect(isRetired({ careerEndYear: 2019 })).toBe(false);
    expect(retiredCaption({ careerEndYear: 2019 })).toBeNull();
  });
});

describe('the three surfaces', () => {
  const federer = { careerStatus: 'retired' as const, careerEndYear: 2022 };
  const noYear = { careerStatus: 'retired' as const };

  test('caption', () => {
    expect(retiredCaption(federer)).toBe('Retired 2022');
    expect(retiredCaption(noYear)).toBe('Retired');
  });

  test('empty state replaces a promise nobody can keep', () => {
    expect(retiredEmptyState(federer)).toBe(
      'Retired in 2022 — no upcoming events are expected.',
    );
    expect(retiredEmptyState(noYear)).toBe(
      'Retired — no upcoming events are expected.',
    );
  });

  test('follow note warns without blocking', () => {
    expect(retiredFollowNote('Roger Federer', federer)).toBe(
      'Following Roger Federer — retired in 2022, no new events expected',
    );
    expect(retiredFollowNote('Roger Federer', noYear)).toBe(
      'Following Roger Federer — retired, no new events expected',
    );
  });

  test('every surface returns null for an unmarked athlete, so the caller keeps its own copy', () => {
    // 92% of the ATP directory is unmarked. None of it may be
    // described as retired, and none of it may be described as active
    // either — there is deliberately no "still playing" string here.
    expect(retiredCaption({})).toBeNull();
    expect(retiredEmptyState({})).toBeNull();
    expect(retiredFollowNote('Somebody', {})).toBeNull();
  });

  test('a WTA player, who never carries the field at all, is unaffected', () => {
    // Career status only ever comes from the Wikidata/ATP roster.
    expect(retiredEmptyState({})).toBeNull();
    expect(retiredFollowNote('Aryna Sabalenka', {})).toBeNull();
  });
});
