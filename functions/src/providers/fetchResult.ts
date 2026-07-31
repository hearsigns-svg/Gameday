// What a provider fetch actually returned, before and after normalisation.
//
// The two numbers must stay separable: `rawCount` is what the provider
// handed over (funnel stage A) and `fixtures` is what the adapter could
// make sense of (stage B). Collapsing them — as returning a bare
// Fixture[] does — makes selector rot look exactly like an empty season.

import { Fixture } from '../fixture';

export interface ProviderFetch {
  rawCount: number;
  fixtures: Fixture[];
}

// A response SHAPE we do not recognise is a read failure. A documented
// empty CONTENT is not. `?? []` on a missing key is the exact confusion
// the standing invariant forbids — it turns "the provider renamed the
// array" into "nothing is scheduled", silently, at 200 — but the inverse
// error is just as bad: treating a real empty season as an outage would
// make every off-season league look broken.
//
// Verified live 2026-07-31 against all six providers. Only TheSportsDB
// uses the null convention (`{"events": null}` for a season with no
// events, and for a league id that does not exist); football-data, NHL,
// MLB and Jolpica all return an empty ARRAY for a legitimate empty.
export function requireArray<T>(
  value: T[] | null | undefined,
  provider: string,
  field: string,
): T[] {
  // Shape: the key is gone. The provider changed under us.
  if (value === undefined) {
    throw new Error(`${provider}: response missing "${field}"`);
  }
  // Content: an explicit null IS a documented empty result (TheSportsDB).
  if (value === null) return [];
  // Shape: present, but not a list. Without this a string sails through
  // and reports its character count as a row count before failing later
  // with "value.map is not a function"; an object reports rawCount
  // undefined. Both are shape rot and must fail HERE, named.
  if (!Array.isArray(value)) {
    throw new Error(
      `${provider}: "${field}" is not an array (got ${typeof value})`,
    );
  }
  return value;
}
