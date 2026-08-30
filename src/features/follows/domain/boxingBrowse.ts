// Boxing's mirrored M/W browse (Round 3 B7, original structure
// reinstated by owner 2026-08-30) — PURE.
//
// The sex of a weight-class GROUP is a fact of its key: the IBF-derived
// directory writes boxing-w-<class> for the women's lists and
// boxing-<class> for the men's. Individual CARDS in "Competing soon"
// carry only the display grouping, so their sex rides the recorded
// marked-female/unmarked-male convention ("Women's <Class>" vs bare
// "<Class>" — ibfRatings' own labels, held deliberately in Prompt 12).
// No key and no grouping = unclassed: NEVER guessed — an unclassed
// fighter is listed in BOTH sex views, which claims nothing.

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

// Does this card belong in the given sex's view? Unclassed cards ride
// in both — present regardless of view, claiming nothing.
export function inSexView(sex: 'm' | 'w', cardSex: BoxingSex): boolean {
  return cardSex === null || cardSex === sex;
}
