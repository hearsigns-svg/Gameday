// What a follow can actually DELIVER for this athlete. PURE.
//
// An athlete page with nothing scheduled says "We'll add them when
// announced — follow now and they'll reach your calendar." For almost
// everyone that is true and is the whole point of the follow.
//
// For MEN'S TENNIS it is false, and measured false: on 2026-08-05,
// Djokovic, Alcaraz, Sinner and Zverev each had ZERO fixtures, while
// `tennis-atp` held 78 future TOURNAMENT rows and no matches at all.
// Nothing is going to announce them into the calendar, because no source
// we are allowed to use publishes men's draws or order of play — the
// ATP's own site is a standing refusal, and the Tennis TV ICS is
// tournament-level. The women's tour has its own API and does deliver.
//
// So the page says which of those two worlds the athlete is in. This is
// the same rule retirement already follows (domain/careerStatus.ts): the
// app does not make a promise it has no mechanism to keep.
//
// WHEN A MEN'S MATCH SOURCE LANDS, DELETE THIS. The gap is a fact about
// today's sourcing, not about the sport.

// The men's populations, as the SERVER titles them (athletes.ts
// GROUP_TITLES): "ATP Tour — Men" and "More ATP players — A–Z". Both
// carry the tour's name; the women's group is "WTA Tour — Women".
const MENS_TENNIS = /\bATP\b/;

export function deliveryGap(
  sportKey: string,
  grouping: string | undefined,
): string | null {
  if (sportKey !== 'tennis' || !grouping) return null;
  if (!MENS_TENNIS.test(grouping)) return null;
  return "We don't have match times for the men's tour yet — no source we can use publishes the draws. Following still works: his matches appear the day that changes.";
}
