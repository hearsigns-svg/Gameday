// One fold for every SEARCH comparison on the client. PURE.
//
// THE CLASS OF BUG THIS CLOSES (22c): display and matching drawing from
// different strings. A row shows "Brasileirão" and the filter compares
// the raw lower-cased name, so typing "Brasileirao" — the only spelling
// most keyboards produce without effort — finds nothing. The user sees
// the thing on screen, types what they see, and the app says it does not
// exist. That is worse than a wrong result, because there is nothing to
// correct.
//
// EXACTLY MIRRORS the server's `normaliseName` (functions/src/identity.ts),
// character rule for character rule, because the client filters some
// lists locally and asks the server for others — and a search box that
// folds one way for teams and another way for competitions is its own
// bug. The server's rules were learned the hard way and are kept
// verbatim rather than re-derived:
//
//   NFD + mark-stripping handles the accents.
//   The single-letter replacements handle what NFD CANNOT: đ, ø, ł, æ,
//   ß, þ and ð are letters in their own right, not letter-plus-mark, so
//   decomposition leaves them alone and the character class below would
//   turn them into spaces. Without these, "Međedović" was unfindable by
//   any transliteration a person would type.
//   `&` becomes " and " so "Bath & Wells" matches either spelling.
//
// USED FOR DEDUPE TOO, since 22c-follow-up. It was not: `card.ts` and
// `sameBout.ts` each carried a near-copy, and the three had already
// drifted — this one spells `&` as " and " and they dropped it. Measured
// against production before consolidating: of 4,102 distinct participant
// names, 64 fold differently under the two rules, and ZERO entity groups
// are separated by one fold and united by the other. So the drift was
// benign on today's data, and consolidating is behaviour-preserving on
// today's data — but "benign" was luck, not design, and the 11-rule
// version is the strictly better one: it is what makes a provider
// spelling "Brighton & Hove" match another spelling "Brighton and Hove".
//
// The fold that decides whether two documents are the same real event now
// has its own test surface (nameFold.test.ts), which is what made
// consolidating safe rather than brave.

// A NAME THAT HAS BEEN FOLDED — branded, for the same reason `SearchName`
// is on the server. The failure mode here is not "someone forgets to
// fold"; it is "someone writes their own `.normalize('NFD')...` chain and
// it drifts", which is exactly what happened three times. A comparison
// that expects `FoldedName` cannot be handed a hand-rolled string.
declare const foldedNameBrand: unique symbol;
export type FoldedName = string & { readonly [foldedNameBrand]: true };

export function foldName(raw: string): FoldedName {
  return foldRaw(raw) as FoldedName;
}

function foldRaw(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/đ/g, 'dj')
    .replace(/ø/g, 'o')
    .replace(/ł/g, 'l')
    .replace(/æ/g, 'ae')
    .replace(/ß/g, 'ss')
    .replace(/þ/g, 'th')
    .replace(/ð/g, 'd')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// THE KEY EVERY "ARE THESE THE SAME TWO PEOPLE" COMPARISON USES —
// order-independent, and it accepts ONLY folded names.
//
// This is where the brand earns its keep. Forgetting to fold was never
// the real risk; the real risk is the next person writing their own
// `.normalize('NFD')...` chain because it is four lines and right there,
// which is precisely how this project ended up with three of them. A
// hand-rolled chain returns `string`, `string` is not `FoldedName`, and
// the call does not compile. The only way to a dedupe comparison is
// through the one fold.
export function pairKey(a: FoldedName, b: FoldedName): string {
  return [a, b].sort().join('|');
}

// Does `haystack` contain `needle`, both folded? The comparison every
// local filter should make, so no call site can fold one side and not
// the other — which is the mistake in miniature.
//
// An empty needle matches NOTHING rather than everything: these back
// search boxes, where a blank query means "no query yet", not "every row".
export function foldedIncludes(haystack: string, needle: string): boolean {
  const n = foldName(needle);
  if (n === '') return false;
  return foldName(haystack).includes(n);
}

// The same test across several names — a team's display name plus any
// aliases the provider published. Providers ship their own alias lists
// ("Liverpool FC" AND "Liverpool"); matching against those beats guessing
// which words are noise, which is the reasoning the server records for
// refusing to strip suffixes itself.
export function anyFoldedIncludes(
  names: readonly (string | undefined | null)[],
  needle: string,
): boolean {
  const n = foldName(needle);
  if (n === '') return false;
  return names.some((h) => typeof h === 'string' && foldName(h).includes(n));
}
