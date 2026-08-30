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

// Post-ingest stamping pass. Reads the store (this batch is already
// committed), so parents and bouts see each other whichever poll
// delivered them. Additive writes only, skipped when nothing changes.
export async function stampBoxingSexScopes(
  db: Firestore,
  incoming: readonly Fixture[],
  followKey: string,
): Promise<number> {
  if (!touchesCardScopes(followKey)) return 0;

  // Candidate parents: cards in this batch, plus the parents of any
  // bouts in this batch.
  const parentIds = new Set<string>();
  for (const f of incoming) {
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
    const want = scopedKeysFor(parent.competitionId, proved);
    // Reclassification can also REMOVE a stale scoped key (a fallback
    // both-key card whose bouts later prove one sex): rebuild the
    // scoped pair from evidence, leave every other key untouched.
    const others = parent.followKeys.filter(
      (k) => k !== `${parent.competitionId}-m` && k !== `${parent.competitionId}-w`,
    );
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
