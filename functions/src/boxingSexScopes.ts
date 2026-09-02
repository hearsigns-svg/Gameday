// Sex-scoped boxing card follow keys (B7 final shape, owner ruling
// 2026-08-30).
//
// The followable card slices gain two derived follow keys each —
// `<base>-m` / `<base>-w` — stamped from BOUT CLASSIFICATION: a card
// carries a sex's key when at least one of its bouts names a fighter
// the directory classes to that sex (athlete groupingKey boxing-* /
// boxing-w-*). A card with ZERO classed bouts carries BOTH keys — the
// deliver-don't-drop fallback: a calendar app silently missing a major
// card is the worse failure; an occasional removable extra is the
// tolerable cost. The Sept-7 gender backfill shrinks that class.
//
// The BASE key stays on every fixture untouched — catalogue rows,
// coverage attribution, legacy follows and the client migration all
// depend on it. Stamping is additive and idempotent, and runs AFTER
// the ingest batch commits so a poll that delivers cards and bouts
// together classifies against everything it just wrote.

import { Firestore } from 'firebase-admin/firestore';
import { Fixture } from './fixture';
import { mergedBasesFor } from './boxingMerge';

// The two client-followable card slices. boxingdata-cards is server-
// side only (T2 ordering slice) and deliberately absent.
export const SCOPED_CARD_SLICES: ReadonlySet<string> = new Set([
  'tsdb-league-4445',
  'pbc-cards',
]);

export type BoxSex = 'm' | 'w';

// Mirror of the client's boxingBrowse rule: the sex of a class key is
// a fact of its prefix; non-boxing keys answer nothing.
export function sexOfGroupingKey(
  groupingKey: string | undefined,
): BoxSex | null {
  if (!groupingKey || !groupingKey.startsWith('boxing-')) return null;
  return groupingKey.startsWith('boxing-w-') ? 'w' : 'm';
}

// PURE core: which scoped keys a card should carry given the sexes its
// classed bouts proved. Zero proved → both (the fallback rule).
export function scopedKeysFor(
  baseKey: string,
  proved: ReadonlySet<BoxSex>,
): string[] {
  const sexes: BoxSex[] = proved.size === 0 ? ['m', 'w'] : [...proved];
  return sexes.sort().map((s) => `${baseKey}-${s}`);
}

const ATHLETE_KEY = /^athlete_\d{6}$/;

// The slices whose ingest can change a card's classification: the card
// slices themselves, and their appearance slices (bouts often land in
// a separate ingest call from their parents).
export function touchesCardScopes(followKey: string): boolean {
  if (SCOPED_CARD_SLICES.has(followKey)) return true;
  for (const base of SCOPED_CARD_SLICES) {
    if (followKey === `${base}-appearances`) return true;
  }
  return false;
}

// A stamped scoped key on a card of one of the two slices: the pair the
// stamp pass OWNS. Ingest treats these as invisible to its change
// compare and carries them across rewrites — the Round 4 regression
// (2026-08-30 → 09-02): incoming cards never carry them, so every poll
// read all 103 stored cards as changed, rewrote them WITHOUT the pair,
// and the stamp pass re-added it: ~500 wasted ops per run, a 1s poller
// at 45s, past the sweep's 20s fetch timeout, its coverage stamp frozen
// and the in-app banner tripped while every server signal stayed green.
export function isScopedCardKey(key: string, competitionId: string): boolean {
  return (
    SCOPED_CARD_SLICES.has(competitionId) &&
    (key === `${competitionId}-m` || key === `${competitionId}-w`)
  );
}

// The doc as the change compare must see it: scoped pair removed.
export function withoutScopedKeys(f: Fixture): Fixture {
  if (!SCOPED_CARD_SLICES.has(f.competitionId)) return f;
  return {
    ...f,
    followKeys: f.followKeys.filter((k) => !isScopedCardKey(k, f.competitionId)),
  };
}

// The doc as it must be STORED on a real change: the incoming keys plus
// the pair the previous record already earned, so a rewrite never
// strips what the stamp pass would only put back.
export function carryScopedKeys(incoming: Fixture, prev: Fixture | undefined): Fixture {
  if (!prev || !SCOPED_CARD_SLICES.has(incoming.competitionId)) return incoming;
  const carried = prev.followKeys.filter(
    (k) => isScopedCardKey(k, incoming.competitionId) && !incoming.followKeys.includes(k),
  );
  return carried.length === 0
    ? incoming
    : { ...incoming, followKeys: [...incoming.followKeys, ...carried] };
}

// Post-ingest stamping pass. Reads the store (this batch is already
// committed), so parents and bouts see each other whichever poll
// delivered them. Additive writes only, skipped when nothing changes.
// `writtenIds` — the docs ingest actually wrote this run: an unchanged
// card is left alone entirely (no reads), because nothing about its
// classification can have moved.
export async function stampBoxingSexScopes(
  db: Firestore,
  incoming: readonly Fixture[],
  followKey: string,
  writtenIds?: ReadonlySet<string>,
): Promise<number> {
  if (!touchesCardScopes(followKey)) return 0;

  // Candidate parents: WRITTEN cards in this batch, plus the parents of
  // any WRITTEN bouts in this batch.
  const parentIds = new Set<string>();
  for (const f of incoming) {
    if (writtenIds && !writtenIds.has(f.id)) continue;
    if (!f.parentFixtureId && SCOPED_CARD_SLICES.has(f.competitionId)) {
      parentIds.add(f.id);
    }
    if (f.parentFixtureId) parentIds.add(f.parentFixtureId);
  }
  if (parentIds.size === 0) return 0;

  let stamped = 0;
  for (const parentId of parentIds) {
    const parentSnap = await db.collection('fixtures').doc(parentId).get();
    if (!parentSnap.exists) continue;
    const parent = parentSnap.data() as Fixture;
    if (parent.parentFixtureId || !SCOPED_CARD_SLICES.has(parent.competitionId)) {
      continue;
    }
    const kids = await db
      .collection('fixtures')
      .where('parentFixtureId', '==', parentId)
      .get();
    const athleteIds = new Set<string>();
    for (const k of kids.docs) {
      for (const key of (k.data() as Fixture).followKeys) {
        if (ATHLETE_KEY.test(key)) athleteIds.add(key);
      }
    }
    const proved = new Set<BoxSex>();
    if (athleteIds.size > 0) {
      const refs = [...athleteIds].map((id) =>
        db.collection('athletes').doc(id),
      );
      const docs = await db.getAll(...refs);
      for (const d of docs) {
        if (!d.exists) continue;
        const sex = sexOfGroupingKey(
          (d.data() as { groupingKey?: string }).groupingKey,
        );
        if (sex) proved.add(sex);
      }
    }
    // Reclassification can also REMOVE a stale scoped key (a fallback
    // both-key card whose bouts later prove one sex): rebuild the
    // scoped pair from evidence, leave every other key untouched.
    // Round 6 item 4: a PBC card is also a Major fight cards card, so it
    // carries BOTH slices' sex keys — one follow per sex unions both.
    const bases = mergedBasesFor(parent.competitionId);
    const want = bases.flatMap((base) => scopedKeysFor(base, proved));
    const scopedOfBases = new Set(bases.flatMap((base) => [`${base}-m`, `${base}-w`]));
    const others = parent.followKeys.filter((k) => !scopedOfBases.has(k));
    const next = [...others, ...want];
    const same =
      next.length === parent.followKeys.length &&
      next.every((k) => parent.followKeys.includes(k));
    if (same) continue;
    await parentSnap.ref.set(
      { followKeys: next, updatedAt: new Date().toISOString() },
      { merge: true },
    );
    stamped++;
  }
  return stamped;
}
