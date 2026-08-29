// Olympics browse structure (Round 3 B6) — PURE.
//
// The Games keys are edition-scoped: `olympics-<year>` is a whole
// edition, `olympics-<year>-<discipline>` one of its sports. The season
// is a fact of the year — Summer Games years divide by four — so no
// row carries a season field and a future edition lands on the right
// card by existing.

export const OLYMPIC_EDITION_KEY = /^olympics-(\d{4})$/;
const OLYMPIC_DISCIPLINE_KEY = /^olympics-(\d{4})-.+$/;

export function olympicSeasonOf(year: number): 'summer' | 'winter' {
  return year % 4 === 0 ? 'summer' : 'winter';
}

// The browse subset for one season view: its SPORTS (the followable
// discipline list — ending the mixed mishmash) or its GAMES (the
// editions). No view = the whole set, which is what in-sport search
// still matches against.
export function olympicsSubset<T extends { key: string }>(
  rows: readonly T[],
  view?: { season: 'summer' | 'winter'; view: 'sports' | 'games' },
): T[] {
  if (!view) return [...rows];
  const wanted = (m: RegExpMatchArray | null): boolean =>
    m !== null && olympicSeasonOf(Number(m[1])) === view.season;
  return rows.filter((r) =>
    view.view === 'games'
      ? wanted(r.key.match(OLYMPIC_EDITION_KEY))
      : wanted(r.key.match(OLYMPIC_DISCIPLINE_KEY)),
  );
}
