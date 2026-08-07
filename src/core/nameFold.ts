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
// NOT USED FOR DEDUPE. `fixtures/domain/card.ts` and
// `fixtures/domain/sameBout.ts` each keep their own near-copy, on purpose:
// they are leaf modules whose fold decides whether two documents are the
// same real event, and their rules differ slightly from this one. Pointing
// them here would change what collapses into what. Consolidating them is a
// real piece of work with a test surface of its own, not a tidy-up to
// smuggle into a search fix.

export function foldForSearch(raw: string): string {
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

// Does `haystack` contain `needle`, both folded? The comparison every
// local filter should make, so no call site can fold one side and not
// the other — which is the mistake in miniature.
//
// An empty needle matches NOTHING rather than everything: these back
// search boxes, where a blank query means "no query yet", not "every row".
export function foldedIncludes(haystack: string, needle: string): boolean {
  const n = foldForSearch(needle);
  if (n === '') return false;
  return foldForSearch(haystack).includes(n);
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
  const n = foldForSearch(needle);
  if (n === '') return false;
  return names.some((h) => typeof h === 'string' && foldForSearch(h).includes(n));
}
