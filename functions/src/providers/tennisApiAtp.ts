// The men's directory, from the vendor's ranking list. PURE (the fetch
// lives in index.ts).
//
// OWNER RULING 2026-08-06: the ATP directory becomes the vendor's top
// 500 and nothing else. What we hold today is 1,394 men assembled from
// Wikidata — overwhelmingly inactive, unranked or retired — and the
// reasoning is that a single ranked source is both sufficient and less
// error-prone than a large one nobody maintains. Top 100 browsable,
// top 500 searchable.
//
// THIS FILE DECIDES WHAT HAPPENS TO EXISTING DOCUMENTS, so the rules it
// enforces are the ones that keep a reset from becoming a data loss:
//
// 1. MATCHED PLAYERS KEEP THEIR DOCUMENT ID. A follow is a stored
//    reference to `athlete_001801`; delete-and-recreate would mint a new
//    id and leave every existing follow pointing at nothing, silently.
//    Seven athletes are followed on real devices today. So a player who
//    survives the cut is UPDATED in place, never replaced.
// 2. A FOLLOWED ATHLETE IS NEVER DELETED, even if they fall out of the
//    500. Somebody asked for them; a ranking change is not consent to
//    drop them from that person's calendar. They are kept and marked
//    unranked.
// 3. A SURNAME NEAR-MISS IS NEITHER MERGED NOR CREATED. "Aleksandr
//    Shevchenko" against our "Alexander Shevchenko" is probably one
//    person and possibly two; both answers are destructive if wrong, so
//    it goes to a review list and neither doc moves. F31/F34.
// 4. NAME ORDER IS NOT A NEW PERSON. Six of the vendor's ranked men are
//    in our directory the other way round — "Juncheng Shang" here is
//    "Shang Juncheng" there. Accepted only when the straight match found
//    nothing, the reversed one is unique, and the countries agree.
//
// The WTA population is UNTOUCHED by all of this: the women come from
// the WTA's own API, which works, and this vendor's ranking list is
// men's singles only.

export interface RankedPlayer {
  vendorId: string;
  name: string;
  rank: number;
  countryCode: string | null;
}

export interface DirectoryAthlete {
  id: string;
  displayName: string;
  countryCode?: string;
  groupingKey?: string;
  providerIds?: Record<string, string | undefined>;
}

export interface ReconcilePlan {
  // Existing doc, still ranked: update rank/grouping/vendor id in place.
  keep: { athleteId: string; player: RankedPlayer; via: 'name' | 'reversed' }[];
  // Ranked, and we hold nobody plausible: mint a new athlete.
  create: RankedPlayer[];
  // Ours, no longer in the list: remove.
  remove: { athleteId: string; displayName: string }[];
  // Ours, unranked, but somebody follows them: keep, drop the ranking.
  keepFollowed: { athleteId: string; displayName: string }[];
  // Neither merged nor created. A human decides.
  review: { player: RankedPlayer; candidates: string[] }[];
}

export function normaliseForMatch(s: string): string {
  return String(s)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const reversed = (s: string): string =>
  normaliseForMatch(s).split(' ').reverse().join(' ');

const surname = (s: string): string => {
  const parts = normaliseForMatch(s).split(' ');
  return parts[parts.length - 1] ?? '';
};

export function planReconcile(
  ranked: readonly RankedPlayer[],
  // The MEN only. Callers must not pass the WTA population: this list
  // is men's singles, and an unmatched woman is not an unranked man.
  existing: readonly DirectoryAthlete[],
  followedIds: ReadonlySet<string>,
): ReconcilePlan {
  const byName = new Map<string, DirectoryAthlete[]>();
  const bySurname = new Map<string, DirectoryAthlete[]>();
  for (const a of existing) {
    const n = normaliseForMatch(a.displayName);
    byName.set(n, [...(byName.get(n) ?? []), a]);
    const s = surname(a.displayName);
    bySurname.set(s, [...(bySurname.get(s) ?? []), a]);
  }
  const plan: ReconcilePlan = {
    keep: [],
    create: [],
    remove: [],
    keepFollowed: [],
    review: [],
  };
  const claimed = new Set<string>();
  for (const p of ranked) {
    const straight = byName.get(normaliseForMatch(p.name)) ?? [];
    if (straight.length === 1) {
      plan.keep.push({ athleteId: straight[0].id, player: p, via: 'name' });
      claimed.add(straight[0].id);
      continue;
    }
    if (straight.length > 1) {
      plan.review.push({ player: p, candidates: straight.map((a) => a.displayName) });
      straight.forEach((a) => claimed.add(a.id));
      continue;
    }
    const flipped = byName.get(reversed(p.name)) ?? [];
    if (flipped.length === 1) {
      const theirs = flipped[0].countryCode;
      // Unknown on either side is not a contradiction; a different
      // country is, and refuses the match.
      if (!p.countryCode || !theirs || p.countryCode === theirs) {
        plan.keep.push({ athleteId: flipped[0].id, player: p, via: 'reversed' });
        claimed.add(flipped[0].id);
        continue;
      }
      // A contradiction is NOT a licence to treat them as strangers.
      // We have found someone with the identical name written the other
      // way and disagreed only on nationality — which is as likely to
      // be a wrong country on one side as two different people. Both
      // available answers (create a possible duplicate, remove a
      // possible real player) are destructive, so neither is taken.
      plan.review.push({ player: p, candidates: [flipped[0].displayName] });
      claimed.add(flipped[0].id);
      continue;
    }
    const near = bySurname.get(surname(p.name)) ?? [];
    if (near.length > 0) {
      plan.review.push({ player: p, candidates: near.map((a) => a.displayName) });
      near.forEach((a) => claimed.add(a.id));
      continue;
    }
    plan.create.push(p);
  }
  for (const a of existing) {
    if (claimed.has(a.id)) continue;
    // RULE 2: somebody asked for this person. Falling out of the top 500
    // is not consent to remove them from that user's calendar.
    if (followedIds.has(a.id)) {
      plan.keepFollowed.push({ athleteId: a.id, displayName: a.displayName });
      continue;
    }
    plan.remove.push({ athleteId: a.id, displayName: a.displayName });
  }
  return plan;
}

// Browse shows the top 100; search reaches all 500 (owner ruling).
export const BROWSE_RANK_LIMIT = 100;

export function groupingFor(rank: number): 'atp' | 'atp-directory' {
  return rank <= BROWSE_RANK_LIMIT ? 'atp' : 'atp-directory';
}
