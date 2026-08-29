// A sport's coverage note, out of the string catalog. PURE.
//
// The note TEXT moved into the i18n catalog (Round 3 Phase C) so it can
// be translated with every other user-facing string; sportsConfig keeps
// its `coverageNote` field as the English source of record, but the
// follows screens read the catalog through this helper instead. A sport
// is listed here in the SAME change that gives its config a note —
// missing from this map means no note is rendered, exactly like a
// missing config field.

import { t, type CatalogKey } from '../../../core/i18n';

const COVERAGE_KEYS: Readonly<Partial<Record<string, CatalogKey>>> = {
  cricket: 'follows.coverage.cricket',
  tennis: 'follows.coverage.tennis',
  athletics: 'follows.coverage.athletics',
  golf: 'follows.coverage.golf',
  boxing: 'follows.coverage.boxing',
  ufc: 'follows.coverage.ufc',
  olympics: 'follows.coverage.olympics',
};

export function coverageNoteFor(sportKey: string): string | undefined {
  const key = COVERAGE_KEYS[sportKey];
  return key === undefined ? undefined : t(key);
}
