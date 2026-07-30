// Cross-source fixture identity — pure.
//
// The same real-world fixture arrives from different providers with
// different ids ("Moses Itauma vs Filip Hrgovic" from one, "Moses Itauma
// vs Filip Hrgović" from another). Without resolution the app shows the
// user two calendar events for one fight; with naive resolution it
// deletes and recreates events, destroying reminders they set. So:
// match on WHO and roughly WHEN, then keep the id that is already in
// people's calendars and correct its data in place.

import { Fixture } from './fixture';

// Dates drift between sources (timezone rounding, provisional listings),
// so identity ignores the exact instant and compares within a window.
export const MATCH_WINDOW_DAYS = 3;

// Deliberately CONSERVATIVE: case, diacritics, punctuation only.
//
// It is tempting to also strip club words ("FC", "AFC") so that
// "Liverpool FC" matches "Liverpool" — do not. "AFC Liverpool" is a
// different, non-league club, and stripping the prefix put its fixtures
// into Liverpool FC followers' calendars. Providers publish their own
// alias lists ("Liverpool FC" AND "Liverpool"); we match against those
// instead of guessing which words are noise.
export function normaliseName(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // diacritics: Hrgović → Hrgovic
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Participants, order-independent: "A vs B" and "B at A" are one fixture.
export function participantsKey(f: Fixture): string {
  const named = [f.homeTeam, f.awayTeam].filter(
    (x): x is string => typeof x === 'string' && x.length > 0,
  );
  const parts =
    named.length > 0
      ? named
      : // Cards and tournaments have no teams — fall back to the title,
        // split on the common "X vs Y" shape so ordering still collapses.
        f.title.split(/\s+vs\.?\s+|\s+v\s+/i);
  return parts
    .map(normaliseName)
    .filter(Boolean)
    .sort()
    .join('|');
}

// Sport + participants. Deliberately excludes the date: two sources
// disagreeing by a day must still resolve to one fixture.
export function identityKey(f: Fixture): string {
  return `${f.sport}|${participantsKey(f)}`;
}

// Competition names normalised for comparison. Cross-provider copies of
// ONE fixture name the same competition; the same two clubs meeting in a
// different competition is a DIFFERENT match and must never merge.
export function competitionKey(f: Fixture): string {
  return normaliseName(f.competition);
}

export function daysApart(aUtc: string, bUtc: string): number {
  return Math.abs(Date.parse(aUtc) - Date.parse(bUtc)) / 86_400_000;
}

// Provider prefix of a fixture id ('tsdb-2541770' → 'tsdb').
export function providerOf(f: Fixture): string {
  return f.id.split('-')[0];
}

export function isSameFixture(
  a: Fixture,
  b: Fixture,
  windowDays: number = MATCH_WINDOW_DAYS,
): boolean {
  if (a.id === b.id) return true;
  if (identityKey(a) !== identityKey(b)) return false;
  // An empty participants key means we could not identify anyone —
  // never merge on that basis.
  if (participantsKey(a).length === 0) return false;
  // THE RULE THAT PREVENTS DELETING REAL FIXTURES: duplicates only ever
  // arise ACROSS providers. Two fixtures from the same provider are
  // distinct by construction — an ODI series has the same two nations
  // playing 2 days apart, and a Grand Prix weekend repeats its name all
  // week. Merging within a provider would delete real events.
  if (providerOf(a) === providerOf(b)) return false;
  // Chelsea v Arsenal in the league and Chelsea v Arsenal in the cup are
  // two matches, often days apart and — in our topology — supplied by
  // different providers, so the provider guard does not catch them.
  // Merging them deleted the cup tie AND rewrote the league fixture with
  // the cup's date. Same clubs is not enough; it must be the same
  // competition. Conservative by design: a missed merge shows a
  // duplicate, a wrong merge destroys a real fixture.
  if (competitionKey(a) !== competitionKey(b)) return false;
  return daysApart(a.startUtc, b.startUtc) <= windowDays;
}

const CONFIDENCE_RANK: Record<string, number> = {
  confirmed: 2,
  provisional: 1,
};

export function confidenceOf(f: Fixture): number {
  return CONFIDENCE_RANK[f.confidence ?? 'confirmed'] ?? 1;
}

export interface MergeDecision {
  keepId: string; // the id that stays in calendars
  data: Fixture; // the record whose values win
  dropIds: string[];
}

// Which id survives, and whose data wins.
//   id  ← the fixture users already have (earliest first seen)
//   data ← the most trustworthy record (confidence, then freshness)
// so a better source CORRECTS the existing event instead of replacing it.
export function mergeCluster(cluster: readonly Fixture[]): MergeDecision {
  if (cluster.length === 0) throw new Error('empty cluster');
  const byAge = [...cluster].sort((a, b) => {
    const fa = a.firstSeenAt ?? a.updatedAt;
    const fb = b.firstSeenAt ?? b.updatedAt;
    return fa === fb ? a.id.localeCompare(b.id) : fa.localeCompare(fb);
  });
  const keep = byAge[0];
  // A record that KNOWS the kickoff beats one that does not, always.
  // Freshness is the last resort — it is a poll-ordering artifact, and
  // letting it decide let an fd.org noon placeholder overwrite a real
  // kickoff, downgrading a timed event to an all-day 'time TBC' (a
  // kindFlip delete+recreate that also destroys the user's reminder).
  const precisionOf = (f: Fixture): number => (f.status === 'tbd' ? 0 : 1);
  const byTrust = [...cluster].sort((a, b) => {
    const p = precisionOf(b) - precisionOf(a);
    if (p !== 0) return p;
    const c = confidenceOf(b) - confidenceOf(a);
    return c !== 0 ? c : b.updatedAt.localeCompare(a.updatedAt);
  });
  const winner = byTrust[0];
  return {
    keepId: keep.id,
    // The surviving document keeps its id and the union of follow keys,
    // so nobody's follow silently stops matching it.
    data: {
      ...winner,
      id: keep.id,
      firstSeenAt: keep.firstSeenAt ?? keep.updatedAt,
      followKeys: [...new Set(cluster.flatMap((f) => f.followKeys))],
    },
    dropIds: cluster.filter((f) => f.id !== keep.id).map((f) => f.id),
  };
}

// Group fixtures into same-real-world-fixture clusters.
export function clusterFixtures(
  fixtures: readonly Fixture[],
  windowDays: number = MATCH_WINDOW_DAYS,
): Fixture[][] {
  const byIdentity = new Map<string, Fixture[]>();
  for (const f of fixtures) {
    const key = identityKey(f);
    if (participantsKey(f).length === 0) continue; // unidentifiable
    byIdentity.set(key, [...(byIdentity.get(key) ?? []), f]);
  }
  const clusters: Fixture[][] = [];
  for (const group of byIdentity.values()) {
    const sorted = [...group].sort((a, b) =>
      a.startUtc.localeCompare(b.startUtc),
    );
    const open: Fixture[][] = [];
    for (const f of sorted) {
      // A fixture joins only if it matches EVERY existing member.
      // Comparing against just the newest member let clusters chain:
      // A~B and B~C admitted A and C even when they are outside the
      // window of each other, merging two genuinely different matches.
      // Routing through isSameFixture also guarantees the pairwise rule
      // and the clustering rule can never drift apart.
      const target = open.find((c) =>
        c.every((x) => isSameFixture(x, f, windowDays)),
      );
      if (target) target.push(f);
      else open.push([f]);
    }
    clusters.push(...open);
  }
  return clusters.filter((c) => c.length > 1); // only real duplicates
}
