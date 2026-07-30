// Season rollover — the quiet time bomb.
//
// Every TSDB poll path carried a hardcoded season ("2026", "2025-2026").
// Those strings are correct until the season turns, after which the
// poll silently returns a FINISHED season forever: no error, no empty
// cache, just fixtures that never update again. Worse, follows persist
// their pollPath at follow time, so a client-side fix would never reach
// devices that followed under the old string.
//
// So the SERVER resolves the season. A season hint on the path is only
// a hint: we generate candidates around it, fetch each, and keep the
// one with the most UPCOMING fixtures. That is exactly the product's
// definition of "the right season", it self-heals stale follows, and
// it handles the awkward window where a new season is published before
// the old one finishes.

export type SeasonShape = 'calendar' | 'split';

// 'split' seasons span two years ("2025-2026"); 'calendar' seasons are
// labelled by their starting year ("2026").
export function seasonShapeOf(hint: string): SeasonShape {
  return /^\d{4}-\d{4}$/.test(hint) ? 'split' : 'calendar';
}

function splitLabel(startYear: number): string {
  return `${startYear}-${startYear + 1}`;
}

// Candidates in preference order, newest first. Two is enough: at any
// moment the interesting seasons are the one running and the one about
// to start (or, just after a rollover, the one that just ended).
export function seasonCandidates(
  shape: SeasonShape,
  now: Date = new Date(),
): string[] {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth() + 1; // 1-12
  if (shape === 'split') {
    // Split seasons conventionally start around August-October. Past
    // mid-year, the NEXT season is the one worth having.
    const startYear = m >= 7 ? y : y - 1;
    return [splitLabel(startYear), splitLabel(startYear - 1)];
  }
  // Calendar seasons: after the turn of the year the current year is
  // the live one; late in the year the NEXT year is already published.
  return m >= 11 ? [String(y + 1), String(y)] : [String(y), String(y - 1)];
}

// Full ordered list to try: an explicit hint first (cheap hit for the
// common case), then the computed candidates, deduped.
export function seasonsToTry(
  hint: string | undefined,
  now: Date = new Date(),
  max = 3,
): string[] {
  const shape = hint ? seasonShapeOf(hint) : 'calendar';
  const all = [...(hint ? [hint] : []), ...seasonCandidates(shape, now)];
  return [...new Set(all)].slice(0, max);
}

// Pick the season whose fixtures are actually useful: most UPCOMING
// events wins; a season with none is only kept as a last resort so a
// genuinely off-season league still caches something.
export function bestSeason<T extends { startUtc: string }>(
  attempts: ReadonlyArray<{ season: string; fixtures: T[] }>,
  now: Date = new Date(),
): { season: string; fixtures: T[] } | null {
  if (attempts.length === 0) return null;
  const nowIso = now.toISOString();
  const scored = attempts.map((a) => ({
    ...a,
    upcoming: a.fixtures.filter((f) => f.startUtc >= nowIso).length,
  }));
  scored.sort(
    (a, b) => b.upcoming - a.upcoming || b.fixtures.length - a.fixtures.length,
  );
  return scored[0].upcoming > 0 || scored[0].fixtures.length > 0
    ? scored[0]
    : null;
}
