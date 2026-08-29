// Query aliases: the names people TYPE that differ from the names the
// data carries. One mechanism for every search channel — the query
// expands to extra needles, and each channel matches any of them —
// so "Super Bowl" finds the NFL row and "French Open" finds Roland
// Garros without any channel growing its own alias logic.
//
// Curated, deliberately small, and containment-based: a rule fires
// when its trigger appears anywhere in the folded query, so "monaco
// grand prix" reaches Formula 1 through the same rule as "grand prix".
// (Part A audit, 2026-08-14: these three were the measured misses that
// were aliases rather than data gaps.)

import { foldName } from '../../../core/nameFold';

const RULES: ReadonlyArray<{ when: string; add: string }> = [
  { when: 'super bowl', add: 'nfl' },
  { when: 'french open', add: 'roland garros' },
  { when: 'grand prix', add: 'formula 1' },
  // Athletics continental championships (Part B, 2026-08-17): the
  // source labels every continent identically ("Area Senior Outdoor"),
  // the browse group is "Continental Championships", and the names
  // people actually type are these:
  { when: 'european athletics', add: 'continental championships' },
  { when: 'european championships', add: 'continental championships' },
  { when: 'african athletics', add: 'continental championships' },
  { when: 'asian athletics', add: 'continental championships' },
  { when: 'area senior outdoor', add: 'continental championships' },
  // The marathon majors ARE the Platinum label group.
  { when: 'london marathon', add: 'marathon majors' },
  { when: 'berlin marathon', add: 'marathon majors' },
  { when: 'new york marathon', add: 'marathon majors' },
  { when: 'chicago marathon', add: 'marathon majors' },
  { when: 'boston marathon', add: 'marathon majors' },
  // Ruling 7 rows (2026-08-29) are NAMED by the abbreviation people
  // type (URC, MLS, WSL, NWSL — the NBA/KHL precedent), so the aliases
  // run the other way: the written-out names reach the short rows.
  // 'urc' itself can never be a trigger — containment would fire it
  // inside 'church'.
  { when: 'united rugby', add: 'urc' },
  { when: 'major league soccer', add: 'mls' },
  // Both spellings: the fold turns "women's" into "women s".
  { when: 'womens super league', add: 'wsl' },
  { when: 'women s super league', add: 'wsl' },
  // Golf's majors and the Ryder Cup are DELIVERED inside the PGA Tour
  // follow (48 major-named fixtures live under tsdb-league-4425) but
  // nothing searches fixture titles, so typing "Masters" found nothing
  // (Round 3 A1, ruling 4). The alias is the cheap partial; the real
  // fix — a fixture-title search channel — is recorded in DECISIONS as
  // the post-launch item, because this same gap is what hid the
  // European Championships.
  { when: 'masters', add: 'pga tour' },
  { when: 'pga championship', add: 'pga tour' },
  { when: 'the open', add: 'pga tour' },
  { when: 'open championship', add: 'pga tour' },
  { when: 'ryder cup', add: 'pga tour' },
  { when: 'us open golf', add: 'pga tour' },
];

// The query, plus every alias its folded form triggers. Always returns
// the original first; callers match rows against EACH needle.
export function expandQuery(query: string): string[] {
  const folded = foldName(query);
  const extra = RULES.filter((r) => folded.includes(r.when)).map((r) => r.add);
  return [query, ...extra];
}
