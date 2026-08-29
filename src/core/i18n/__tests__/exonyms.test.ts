// Exonyms: only where genuinely used, never a rename machine.

import { competitionDisplayName } from '../exonyms';
import { __setLanguageForTests } from '../locale';

afterEach(() => __setLanguageForTests(null));

test('a genuinely-used exonym applies in its language only', () => {
  __setLanguageForTests('es');
  expect(competitionDisplayName('Champions League', 'fdorg-comp-CL')).toBe(
    'Liga de Campeones',
  );
  __setLanguageForTests('de');
  // German says Champions League — no entry, name passes through.
  expect(competitionDisplayName('Champions League', 'fdorg-comp-CL')).toBe(
    'Champions League',
  );
  __setLanguageForTests('en');
  expect(competitionDisplayName('Champions League', 'fdorg-comp-CL')).toBe(
    'Champions League',
  );
});

test('clubs, slams and unknown keys pass through untouched', () => {
  __setLanguageForTests('es');
  expect(competitionDisplayName('Premier League', 'fdorg-comp-PL')).toBe(
    'Premier League',
  );
  expect(competitionDisplayName('Wimbledon', 'tennis-t-wimbledon')).toBe(
    'Wimbledon',
  );
  expect(competitionDisplayName('Anything', undefined)).toBe('Anything');
});
