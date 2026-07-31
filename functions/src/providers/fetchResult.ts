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

// A response shape we do not recognise is a READ FAILURE, not an empty
// result. `?? []` on a missing key is the exact confusion the standing
// invariant forbids: it turns "the provider renamed the array" into
// "nothing is scheduled", silently, at 200.
export function requireArray<T>(
  value: T[] | null | undefined,
  provider: string,
  field: string,
): T[] {
  if (value === undefined) {
    throw new Error(`${provider}: response missing "${field}"`);
  }
  // An explicit null IS a documented empty result for several providers
  // (TheSportsDB answers an out-of-range season with {"events": null}).
  return value ?? [];
}
