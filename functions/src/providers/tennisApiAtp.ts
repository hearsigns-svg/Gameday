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
  keep: {
    athleteId: string;
    player: RankedPlayer;
    // How identity was established, weakest last. `vendorId` is the
    // only one that cannot be disturbed by a spelling change.
    via: 'vendorId' | 'merge' | 'name' | 'reversed';
  }[];
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

// The namespace the vendor's player ids live under, on the athlete doc.
export const VENDOR = 'tennisapi1';

export function planReconcile(
  ranked: readonly RankedPlayer[],
  // The MEN only. Callers must not pass the WTA population: this list
  // is men's singles, and an unmatched woman is not an unranked man.
  existing: readonly DirectoryAthlete[],
  followedIds: ReadonlySet<string>,
  // One-time human decisions: vendorId → our athlete id. Used ONCE, for
  // the spelling variants a person has confirmed. After the first apply
  // the vendor id is stamped on the doc and the id match below finds
  // them without this map — which is the point of merging rather than
  // creating.
  manualMerges: ReadonlyMap<string, string> = new Map(),
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
  // MATCH BY VENDOR ID FIRST, ALWAYS. Once a player carries the id —
  // whether stamped by a previous run or by a human's merge — their
  // identity stops depending on how anyone spells their name. That is
  // the whole value of the merge: "Aleksandr" and "Alexander" resolve
  // to one document for ever after, and a rename by either side changes
  // nothing.
  const byVendorId = new Map<string, DirectoryAthlete>();
  for (const a of existing) {
    const v = a.providerIds?.[VENDOR];
    if (v) byVendorId.set(v, a);
  }
  const byOurId = new Map(existing.map((a) => [a.id, a]));
  const claimed = new Set<string>();
  for (const p of ranked) {
    const known = byVendorId.get(p.vendorId);
    if (known) {
      plan.keep.push({ athleteId: known.id, player: p, via: 'vendorId' });
      claimed.add(known.id);
      continue;
    }
    const merged = manualMerges.get(p.vendorId);
    if (merged !== undefined && byOurId.has(merged)) {
      plan.keep.push({ athleteId: merged, player: p, via: 'merge' });
      claimed.add(merged);
      continue;
    }
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

// ─── The fetch, and the guard that makes a DELETING source safe ───────

// ONE host, ONE key (ATP_VENDOR_KEY). The men's MATCHES provider
// (tennisApiAtpEvents.ts) shares both: the same vendor serves the weekly
// ranking list and the live draws, and the owner's posture is a single
// key with no rotation — quota is bought on the vendor's paid tier on
// this key, never by stacking free ones.
export const HOST = 'tennisapi1.p.rapidapi.com';

export async function fetchAtpTop500(
  key: string,
  limit = 500,
): Promise<{ rawCount: number; entries: RankedPlayer[] }> {
  const r = await fetch(`https://${HOST}/api/tennis/rankings/atp`, {
    headers: { 'x-rapidapi-host': HOST, 'x-rapidapi-key': key },
  });
  if (!r.ok) {
    throw new Error(`atp rankings HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
  }
  const body = (await r.json()) as {
    rankings?: {
      ranking?: number;
      team?: { id?: number; name?: string; country?: { alpha3?: string } };
    }[];
  };
  // No `?? []`. An absent rankings array is a shape change, and this
  // source DELETES — reading it as "nobody is ranked" would empty the
  // men's directory (standing invariant).
  if (!Array.isArray(body.rankings)) {
    throw new Error('atp rankings response carried no rankings array');
  }
  const entries: RankedPlayer[] = [];
  for (const row of body.rankings) {
    const id = row.team?.id;
    const name = row.team?.name;
    const rank = row.ranking;
    if (id === undefined || !name || typeof rank !== 'number') continue;
    if (rank > limit) continue;
    entries.push({
      vendorId: String(id),
      name,
      rank,
      countryCode: row.team?.country?.alpha3 ?? null,
    });
  }
  return { rawCount: body.rankings.length, entries };
}

// A TRUNCATED LIST MUST NOT EMPTY THE DIRECTORY. The zero-entry check
// upstream catches a total failure; this catches the subtler one — a
// vendor that answers 200 with the top 50 because a query parameter
// changed meaning. On the FIRST run this is expected to trip (the
// original reset removed 1,136), so it is applied to steady-state runs
// only, which is what `expectedRemovals` encodes.
export const MAX_STEADY_REMOVALS = 60;

// AND A FLOOR, because the cap above only catches a CLIFF.
//
// 59 removals a week for eight weeks drains 470 athletes and never
// trips a per-run cap of 60. A rolling window would catch that, but it
// needs stored state, it can still be walked under by going slower, and
// the window itself becomes a thing that can be wrong.
//
// A PROPORTIONAL FLOOR needs no state and cannot drift, because it
// restates the invariant directly: THE DIRECTORY IS THE RANKED LIST. If
// applying a run would leave the directory materially smaller than the
// list that defines it, something is wrong with the list, whatever the
// per-run delta was. It also self-calibrates — move to a top-100 or a
// top-1000 roster and the floor moves with it, with no constant to
// remember.
//
// Erosion at 59/week trips this in the SECOND week, where a rolling
// 150-per-8-weeks window would take three.
export const MIN_DIRECTORY_FRACTION = 0.8;

export function removalGuard(
  plan: ReconcilePlan,
  rankedCount: number,
  existingCount: number,
  cap = MAX_STEADY_REMOVALS,
  floorFraction = MIN_DIRECTORY_FRACTION,
): string | null {
  if (plan.remove.length > cap) {
    return `refusing to remove ${plan.remove.length} athletes in one run (cap ${cap}) — the ranking list looks truncated`;
  }
  // What the directory would hold once this run is applied.
  const projected = existingCount - plan.remove.length + plan.create.length;
  const floor = Math.floor(rankedCount * floorFraction);
  if (projected < floor) {
    return `refusing to leave the directory at ${projected} against a ranked list of ${rankedCount} (floor ${floor}) — erosion, not a refresh`;
  }
  return null;
}
