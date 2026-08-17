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
];

// The query, plus every alias its folded form triggers. Always returns
// the original first; callers match rows against EACH needle.
export function expandQuery(query: string): string[] {
  const folded = foldName(query);
  const extra = RULES.filter((r) => folded.includes(r.when)).map((r) => r.add);
  return [query, ...extra];
}
