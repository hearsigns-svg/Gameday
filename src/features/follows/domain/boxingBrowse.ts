// Boxing's sexed fighter views (Round 3 B7, realigned by owner
// 2026-08-30) — PURE.
//
// The sex of a weight-class GROUP is a fact of its key: the IBF-derived
// directory writes boxing-w-<class> for the women's lists and
// boxing-<class> for the men's. Individual CARDS in "Competing soon"
// carry only the display grouping, so their sex rides the recorded
// marked-female/unmarked-male convention ("Women's <Class>" vs bare
// "<Class>" — ibfRatings' own labels, held deliberately in Prompt 12).
//
// A SEXED SCREEN SHOWS ONLY FIGHTERS CLASSED TO THAT SEX — everywhere
// on the screen, Competing soon included (owner realignment: a screen
// titled Women's must never show a man). Unclassed fighters appear on
// NEITHER sexed screen — "never guessed" stands, and unlabeled leakage
// ends; they stay reachable through search and on their cards' heroes,
// and the quota-gated gender backfill shrinks the class at the source.

export type BoxingSex = 'm' | 'w' | null;

export function boxingGroupSex(groupingKey: string | undefined): BoxingSex {
  if (!groupingKey || !groupingKey.startsWith('boxing-')) return null;
  return groupingKey.startsWith('boxing-w-') ? 'w' : 'm';
}

// Display-grouping fallback for cards that carry no key (Competing
// soon). English server labels by construction (groupTitleOf) — this
// is a data convention, not UI copy.
export function boxingCardSex(grouping: string | undefined): BoxingSex {
  if (!grouping) return null;
  return grouping.startsWith('Women’s') || grouping.startsWith("Women's")
    ? 'w'
    : 'm';
}

// Does this card belong in the given sex's view? STRICT: only a card
// classed to exactly that sex qualifies — an unclassed card under a
// sexed title would be a guess by placement.
export function inSexView(sex: 'm' | 'w', cardSex: BoxingSex): boolean {
  return cardSex === sex;
}
