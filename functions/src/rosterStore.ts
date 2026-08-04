// The athletes collection — I/O around the pure identity core.
//
// Loading, id allocation (a transactional counter — canonical ids are
// dense and permanent), roster application, and the denormalised
// nextStartUtc hint appearance ingest maintains. Pure logic stays in
// athletes.ts; everything here talks to Firestore.

import { FieldValue, Firestore } from 'firebase-admin/firestore';
import {
  Athlete,
  AthleteIndex,
  athleteIdFrom,
  buildAthleteIndex,
  isCanonicalAthleteKey,
  NewAthleteSpec,
  newAthlete,
  reconcileRoster,
  RosterEntry,
  rosterAthlete,
} from './athletes';
import { Fixture } from './fixture';
import { normaliseName } from './identity';

const COUNTER_DOC = 'counters/athletes';

// The directory is bounded (rosters + fixture-derived — hundreds, not
// tens of thousands). The cap is a tripwire, not a truncation: hitting
// it throws, because a silently truncated identity index would resolve
// some athletes and quietly fail others — the standing invariant's
// exact failure mode, one layer up.
export const ATHLETE_SCAN_CAP = 5_000;

const CACHE_MS = 60_000;
let cache: { at: number; athletes: Athlete[] } | null = null;

export function invalidateAthleteCache(): void {
  cache = null;
}

export async function loadAthletes(db: Firestore): Promise<Athlete[]> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.athletes;
  const snap = await db.collection('athletes').limit(ATHLETE_SCAN_CAP).get();
  if (snap.size >= ATHLETE_SCAN_CAP) {
    throw new Error(
      `athletes collection hit the ${ATHLETE_SCAN_CAP}-doc scan cap — refusing a truncated identity index`,
    );
  }
  const athletes = snap.docs.map((d) => d.data() as Athlete);
  cache = { at: Date.now(), athletes };
  return athletes;
}

export async function loadAthleteIndex(db: Firestore): Promise<AthleteIndex> {
  return buildAthleteIndex(await loadAthletes(db));
}

// Reserve n consecutive canonical ids. A transaction on one counter doc:
// roster refreshes and appearance ingests are low-frequency writers, so
// contention is theoretical — and losing the transaction retries safely.
//
// A MISSING counter beside a NON-EMPTY athletes collection is drift
// (deleted/restored counter doc) and throws: silently restarting at 1
// would hand out ids that already belong to real athletes, and the
// subsequent write would put one athlete's follows on another athlete's
// events — the failure users never forgive, via ops accident.
export async function allocateAthleteIds(
  db: Firestore,
  n: number,
): Promise<string[]> {
  if (n === 0) return [];
  const ref = db.doc(COUNTER_DOC);
  const first = await db.runTransaction(async (tx) => {
    const doc = await tx.get(ref);
    const stored = doc.data()?.next as number | undefined;
    if (stored === undefined) {
      const any = await db.collection('athletes').limit(1).get();
      if (!any.empty) {
        throw new Error(
          'athletes counter missing but the collection is not empty — refusing to re-issue ids from 1',
        );
      }
    }
    const next = stored ?? 1;
    tx.set(ref, { next: next + n }, { merge: true });
    return next;
  });
  return Array.from({ length: n }, (_, i) => athleteIdFrom(first + i));
}

// Create fixture-derived / review athletes discovered at appearance
// resolution. Returns createKey → athlete id for applyCreatedIds.
//
// Two guards against duplicates the pure layer cannot see:
//   - a FRESH per-spec duplicate check (the 60s in-instance cache can
//     be stale across concurrent invocations — sweep and follow-warm
//     resolving the same unknown player must converge on one doc, not
//     mint twins that poison the name);
//   - `batch.create`, which FAILS on an existing doc id instead of
//     overwriting a real athlete with an impostor if the id counter
//     ever drifts. Loud beats silent doc loss.
// The residual race window is the seconds between check and commit —
// accepted and stated, not engineered around with a lock this
// low-frequency path does not warrant.
export async function createAthletes(
  db: Firestore,
  specs: readonly NewAthleteSpec[],
  createKeyOf: (s: NewAthleteSpec) => string,
  nowIso: string,
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const toWrite: NewAthleteSpec[] = [];
  for (const spec of specs) {
    let existing: Athlete | undefined;
    if (spec.ref.source && spec.ref.externalId) {
      const snap = await db
        .collection('athletes')
        .where(`providerIds.${spec.ref.source}`, '==', spec.ref.externalId)
        .limit(1)
        .get();
      existing = snap.docs[0]?.data() as Athlete | undefined;
    } else {
      const snap = await db
        .collection('athletes')
        .where('sport', '==', spec.sport)
        .where('searchName', '==', normaliseName(spec.ref.name))
        .limit(2)
        .get();
      // Exactly one fresh match = the athlete already exists (another
      // instance won the race); two or more = the name is ambiguous
      // and creating a third helps nobody — the draft's key is dropped
      // by applyCreatedIds' filter.
      if (snap.size === 1) existing = snap.docs[0].data() as Athlete;
      if (snap.size > 1) continue;
    }
    if (existing) {
      out.set(createKeyOf(spec), existing.id);
      continue;
    }
    toWrite.push(spec);
  }
  const ids = await allocateAthleteIds(db, toWrite.length);
  let batch = db.batch();
  let pending = 0;
  for (let i = 0; i < toWrite.length; i++) {
    const athlete = newAthlete(ids[i], toWrite[i], nowIso);
    batch.create(db.collection('athletes').doc(athlete.id), athlete);
    out.set(createKeyOf(toWrite[i]), athlete.id);
    if (++pending >= 450) {
      await batch.commit();
      batch = db.batch();
      pending = 0;
    }
  }
  if (pending > 0) await batch.commit();
  invalidateAthleteCache();
  return out;
}

export interface RosterApplyResult {
  created: number;
  updated: number;
  deactivated: number;
  skippedAmbiguous: number;
}

// Apply one source's roster refresh. The reconciliation is pure
// (athletes.ts); this writes it. Patches translate `undefined` values
// to field deletes — a dropped-off athlete's stale rank must GO, not
// linger because merge semantics ignored it.
export async function applyRoster(
  db: Firestore,
  entries: readonly RosterEntry[],
  nowIso: string,
  opts: {
    nameMatchExcludesSources?: string[];
    ownsCareerStatus?: boolean;
  } = {},
): Promise<RosterApplyResult> {
  const existing = await loadAthletes(db);
  const rec = reconcileRoster(existing, entries, nowIso, opts);
  const ids = await allocateAthleteIds(db, rec.toCreate.length);
  let batch = db.batch();
  let pending = 0;
  const flush = async () => {
    if (pending > 0) {
      await batch.commit();
      batch = db.batch();
      pending = 0;
    }
  };
  for (let i = 0; i < rec.toCreate.length; i++) {
    const a = rosterAthlete(ids[i], rec.toCreate[i], nowIso);
    batch.set(db.collection('athletes').doc(a.id), a);
    if (++pending >= 450) await flush();
  }
  let deactivated = 0;
  for (const u of rec.toUpdate) {
    const patch: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(u.patch)) {
      patch[k] = v === undefined ? FieldValue.delete() : v;
    }
    if (u.patch.active === false) deactivated++;
    batch.set(db.collection('athletes').doc(u.id), patch, { merge: true });
    if (++pending >= 450) await flush();
  }
  await flush();
  invalidateAthleteCache();
  return {
    created: rec.toCreate.length,
    updated: rec.toUpdate.length,
    deactivated,
    skippedAmbiguous: rec.skippedAmbiguous.length,
  };
}

// The denormalised search/browse hint: soonest FUTURE appearance per
// canonical athlete in this yield. Successor to the retired
// athleteDirectory write-through — same job, canonical keys, on the
// athlete doc itself. Never clears: consumers compare against now, so
// a passed date reads as "nothing upcoming" without a write.
//
// Writes only IMPROVEMENTS: a stored future date is kept unless this
// yield knows a SOONER one — a single-card decideReview must not drag
// an athlete's "competing soon" date past the nearer event a full poll
// already recorded — and an identical re-poll writes nothing at all
// (the unconditional version rewrote every upcoming athlete every
// poll, steady-state churn with zero information). The stored values
// come from the 60s instance cache; a stale skip costs at most one
// poll cycle of hint lag, never a wrong calendar.
export async function updateAthleteNextStart(
  db: Firestore,
  appearances: readonly Fixture[],
  nowIso: string,
): Promise<void> {
  const soonest = new Map<string, string>();
  for (const f of appearances) {
    if (f.startUtc < nowIso) continue;
    if (f.status === 'cancelled' || f.status === 'postponed') continue;
    for (const key of f.followKeys) {
      if (!isCanonicalAthleteKey(key)) continue;
      const prev = soonest.get(key);
      if (!prev || f.startUtc < prev) soonest.set(key, f.startUtc);
    }
  }
  if (soonest.size === 0) return;
  const current = new Map(
    (await loadAthletes(db)).map((a) => [a.id, a.nextStartUtc]),
  );
  let batch = db.batch();
  let pending = 0;
  let wrote = 0;
  for (const [id, nextStartUtc] of soonest) {
    const stored = current.get(id);
    const storedIsLive = stored !== undefined && stored >= nowIso;
    if (storedIsLive && stored <= nextStartUtc) continue; // no improvement
    batch.set(
      db.collection('athletes').doc(id),
      { nextStartUtc, updatedAt: nowIso },
      { merge: true },
    );
    wrote++;
    if (++pending >= 450) {
      await batch.commit();
      batch = db.batch();
      pending = 0;
    }
  }
  if (pending > 0) await batch.commit();
  if (wrote > 0) invalidateAthleteCache();
}
