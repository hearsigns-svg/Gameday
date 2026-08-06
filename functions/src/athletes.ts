// Canonical athlete identity — PURE.
//
// Before Prompt 8 an athlete existed only as a side effect of being named
// on a fixture: search offered `athlete-<name-slug>` keys derived from
// whatever string a provider rendered, which meant (a) an athlete with no
// scheduled event did not exist at all — "Usyk" between fights returned
// nothing and could never be followed — and (b) identity WAS the rendered
// name, so two players sharing one romanised name collapsed into one
// appearance (F34) and a compound surname defeated the word-count gate
// (F31).
//
// The fix is one entity, done once: the `athletes` collection. An athlete
// exists whether or not they have a scheduled event, and PROVIDER NUMERIC
// IDS are the disambiguation source — a name is ambiguous; `wta:320760`
// is not. Where an appearance links by id the identity is CERTAIN; where
// it links by unique full name it is CONFIDENT and recorded as such;
// where the name is a surname or matches more than one athlete it is
// AMBIGUOUS and mints nothing. The Prompt 4 conservatism rule is not
// relaxed here — it finally gets the directory it needed.
//
// FOLLOW KEYS are canonical-athlete-scoped: the athlete doc id
// (`athlete_000184`) IS the follow key an appearance carries. Verified
// before the cut: ZERO name-scoped athlete follow keys exist on any
// production device (2026-08-03), so there is no legacy to migrate and
// no dual-key emission — a clean cut.

import { Fixture } from './fixture';
import { normaliseName } from './identity';

// ─── The entity ───────────────────────────────────────────────────────

// One provider's record of this athlete. `externalId: null` means the
// provider publishes only a name (IBF ratings, review submissions) — the
// identity rests on the name alone and `nameKeyed` on the athlete says
// so. That limitation is explicit in the record, never hidden.
export interface AthleteIdentity {
  source: string; // 'wta' | 'f1' | 'ibf' | 'pbc' | 'tsdb' | 'review' | 'wa'
  externalId: string | null;
  name: string; // the name form this source publishes
  lastSeenAt: string;
}

export type AthleteProvenance = 'roster' | 'fixture_derived' | 'review';

export interface Athlete {
  id: string; // athlete_000184 — provider-agnostic, and THE follow key
  // Deterministic accent hue (accentHueOf) — the generated colour
  // identity. Stored on new docs; derived at serve time for docs
  // created before the field existed.
  accentHue?: number;
  displayName: string;
  searchName: string; // normalised displayName
  aliases: string[]; // normalised alternate forms, from identities
  sport: string;
  // Display title. STORED, but no longer authoritative: browse and
  // search both resolve the header through `groupTitleOf(groupingKey)`
  // below, and this field is only the fallback for a key that map does
  // not know. See the comment there for why.
  grouping?: string; // display: 'Heavyweight' | 'WTA Tour — Women'
  groupingKey?: string; // browse slug: 'boxing-heavyweight' | 'wta' | 'f1'
  // source → externalId, only where one exists: { wta: '320760' }.
  providerIds: Record<string, string>;
  identities: AthleteIdentity[];
  provenance: AthleteProvenance;
  // True when NO identity carries a provider id: the athlete is keyed by
  // name alone. A name-keyed athlete and an id-backed one must never
  // look the same to matching, so the flag is first-class.
  nameKeyed: boolean;
  // Inactive athletes are MARKED, never deleted: a followed athlete
  // disappearing from a roster must not delete the user's follow. They
  // leave curated browse lists but stay searchable and followable.
  active: boolean;
  missedRefreshes: number; // consecutive roster refreshes absent from
  rank?: number; // roster rank, 1 = best; absent for unranked
  championOf?: string[]; // sanctioning orgs, boxing: ['IBF', 'WBO']
  countryCode?: string;
  // RECORDED retirement, never inferred (Prompt 12). Present only where
  // a source states it — Wikidata's end-of-work-period or a date of
  // death. ABSENT MEANS UNKNOWN, NOT ACTIVE: the marker covers 7.9% of
  // the ATP roster, so reading absence as "still playing" would be the
  // standing invariant's failure mode applied to a career. Nothing may
  // render "active" off this field; it can only ever say "retired".
  careerStatus?: 'retired';
  careerEndYear?: number; // the year the source records, for display
  nextStartUtc?: string; // soonest future appearance; search/browse hint
  createdAt: string;
  updatedAt: string;
}

// ─── Browse group titles ──────────────────────────────────────────────
//
// The section title is a function of `groupingKey`, NOT of whatever
// string happens to sit on the first athlete document. Until Prompt 12
// `shapeAthleteBrowse` read `sorted[0].grouping`, which made every
// rename a data migration that only reached the docs a roster refresh
// touched: the 26 draw-derived `wta` athletes carry a grouping written
// at creation and never patched again, so they would have kept the old
// string forever while the header — sourced from rank 1, always a
// roster doc — flipped. Titles now change with a DEPLOY, and browse and
// search cannot disagree because both resolve through here.
//
// NAMING (Prompt 12). The repo's only prior precedent is boxing:
// `Women's <Class>` for women, bare `<Class>` for men — marked-female,
// unmarked-male (ibfRatings.ts:88). It does not extend to organisation
// names, and unmarked-male is the thing this stage exists to fix. The
// convention adopted: a group states its population after an em dash
// where the label is a governing body's own name. Boxing is NOT
// restyled — its groups are already gender-marked and sorted
// men-block-then-women-block, so no ambiguity exists to fix. Recorded
// in DECISIONS as a deliberate hold.
//
// TENNIS IS TWO SECTIONS, ONE PER TOUR, BOTH FROM A LIVE RANKING
// (owner ruling 2026-08-04). The curated world-No.-1s keys that stood
// in for a men's ranking — `atp-no1`, `atp-no1-active`,
// `atp-no1-retired` — are GONE, along with the `honours` field that
// existed only to build them. They were scaffolding for a missing
// source; the source now exists (providers/atpRankings.ts), so the
// scaffolding is deleted rather than left standing.
export const GROUP_TITLES: Readonly<Record<string, string>> = {
  wta: 'WTA Tour — Women',
  atp: 'ATP Tour — Men',
  // The men below the ranked 20 (Prompt 12b). The label has to promise
  // exactly what we can back: "More ATP players" is a fact about who
  // these men are, "A–Z" states the ordering so nothing reads as a
  // standing, and nothing in it claims current form — because for this
  // group we do not know it. Membership is the SAME signal the
  // sectioning work uses (not recorded retired), which covers 7.9% of
  // the roster, so some of these men have in fact stopped playing and
  // Wikidata has not said so. The label must not imply otherwise.
  'atp-directory': 'More ATP players — A–Z',
};

export function groupTitleOf(
  groupingKey: string | undefined,
  stored?: string,
): string | undefined {
  if (groupingKey === undefined) return stored;
  return GROUP_TITLES[groupingKey] ?? stored ?? groupingKey;
}

// athlete_000184. The counter lives in a Firestore doc; allocation is the
// I/O layer's job — this module only knows the format.
export function athleteIdFrom(n: number): string {
  if (!Number.isInteger(n) || n < 1 || n > 999_999) {
    throw new Error(`athlete id counter out of range: ${n}`);
  }
  return `athlete_${String(n).padStart(6, '0')}`;
}

export const isCanonicalAthleteKey = (key: string): boolean =>
  /^athlete_\d{6}$/.test(key);

// A stable per-athlete accent hue (0–359), assigned at creation from
// the canonical id so every athlete gets a distinct, permanent colour
// treatment with zero provider input (Prompt 9b — athlete rows were
// text-only). Deterministic: the same id always hashes to the same
// hue, so a re-serve or a re-derive for pre-9b docs cannot disagree.
export function accentHueOf(id: string): number {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  // Golden-angle spread: sequential canonical ids hash to NEIGHBOURING
  // values, and neighbouring hues are perceptually one colour — the
  // review round measured 1° steps across a seeded roster. Multiplying
  // by the golden angle puts adjacent ids ~137.5° apart. Safe to change
  // now and never again: zero accentHue values exist in production yet.
  return Math.floor((h * 137.508) % 360);
}

// ─── The index the matcher runs against ───────────────────────────────

export interface AthleteIndex {
  byProvider: Map<string, Athlete>; // `${source}:${externalId}`
  byName: Map<string, Athlete[]>; // `${sport}|${normalised}` incl. aliases
  all: Athlete[];
}

export function providerKey(source: string, externalId: string): string {
  return `${source}:${externalId}`;
}

export function buildAthleteIndex(athletes: readonly Athlete[]): AthleteIndex {
  const byProvider = new Map<string, Athlete>();
  const byName = new Map<string, Athlete[]>();
  for (const a of athletes) {
    for (const [source, externalId] of Object.entries(a.providerIds)) {
      byProvider.set(providerKey(source, externalId), a);
    }
    const names = new Set([a.searchName, ...a.aliases]);
    for (const n of names) {
      if (!n) continue;
      const key = `${a.sport}|${n}`;
      const list = byName.get(key) ?? [];
      // One athlete can reach the same name via alias twice; dedupe.
      if (!list.some((x) => x.id === a.id)) list.push(a);
      byName.set(key, list);
    }
  }
  return { byProvider, byName, all: [...athletes] };
}

// ─── Matching, and the surname rule ───────────────────────────────────
//
//   full name + provider id            → CERTAIN. Link it.
//   full name, unique in the directory → CONFIDENT. Link it, and record
//                                        that it was name-matched.
//   surname, or name matching >1       → AMBIGUOUS. No link, no key.
//   full name, id unknown, 0 matches   → UNKNOWN. Creatable only where
//                                        the caller's source is allowed
//                                        to create (see resolveDrafts).

export type MatchKind = 'certain' | 'confident' | 'ambiguous' | 'unknown';

export interface AthleteRef {
  name: string;
  source?: string; // provider namespace of externalId
  externalId?: string;
  // Optional, and only used to REFUSE a family-name-first match (see
  // reversedMatch below). Never used to make a match, so a feed that
  // omits it loses nothing.
  countryCode?: string;
}

export interface MatchResult {
  kind: MatchKind;
  athlete?: Athlete;
}

// A full name for matching purposes: at least two words. This is no
// longer what MINTS a follow key (directory membership is — F31's fix);
// it is only the floor below which we refuse to even attempt a match,
// because a surname is not an identity.
export function isFullName(name: string): boolean {
  return name.trim().split(/\s+/).length >= 2;
}

// FAMILY NAME FIRST IS A CONVENTION, NOT A DIFFERENT PERSON.
//
// Chinese, Korean, Hungarian and several other naming conventions put
// the family name first, and two feeds will not agree on the order:
// measured, our search returns ZERO hits for "Juncheng Shang" while the
// directory holds him as "Shang Juncheng". Treating that as two people
// is the F34 mistake pointing the other way — not a collision, a split
// — and it silently costs that player every event they appear in.
//
// FOUR CONDITIONS, so this cannot marry up two different people:
//   1. The straight lookup found NOTHING. An existing match always wins.
//   2. EXACTLY TWO name tokens. "Adolfo Daniel Vallejo" reversed is
//      "Vallejo Daniel Adolfo", which is not a convention, it is noise —
//      and 155 of our athletes carry three or more tokens.
//   3. The reversed lookup is UNIQUE.
//   4. Countries, where BOTH sides carry one, agree. A contradiction
//      refuses; an absence on either side is not a contradiction.
//
// Measured 2026-08-06 against the whole directory (1,291 athletes,
// every sport): ZERO pairs exist that are each other's reversal, so
// nothing today can be wrongly merged by this. The conditions are there
// because the directory grows.
function reversedMatch(
  index: AthleteIndex,
  sport: string,
  ref: AthleteRef,
): Athlete | null {
  const tokens = normaliseName(ref.name).split(/\s+/).filter(Boolean);
  if (tokens.length !== 2) return null;
  const flipped = [tokens[1], tokens[0]].join(' ');
  if (flipped === tokens.join(' ')) return null; // "Ali Ali" — says nothing
  const hits = index.byName.get(`${sport}|${flipped}`) ?? [];
  if (hits.length !== 1) return null;
  const theirs = hits[0].countryCode;
  if (ref.countryCode && theirs && ref.countryCode !== theirs) return null;
  return hits[0];
}

export function matchAthlete(
  index: AthleteIndex,
  sport: string,
  ref: AthleteRef,
): MatchResult {
  if (ref.source && ref.externalId) {
    const hit = index.byProvider.get(providerKey(ref.source, ref.externalId));
    if (hit) return { kind: 'certain', athlete: hit };
    // An id we have never seen. Before creating, one narrow name
    // fallback: a UNIQUE full-name match that has NO id from this
    // source is the same person getting their id for the first time —
    // a WTA player minted name-keyed from a draw whose PlayerID was
    // blank must become ONE athlete when the id arrives, not an
    // id-backed twin that poisons the name forever (review round,
    // probe-confirmed). A match that already carries a DIFFERENT id
    // from this source is genuinely another person: create.
    if (isFullName(ref.name)) {
      const hits =
        index.byName.get(`${sport}|${normaliseName(ref.name)}`) ?? [];
      if (
        hits.length === 1 &&
        hits[0].providerIds[ref.source] === undefined
      ) {
        return { kind: 'confident', athlete: hits[0] };
      }
      if (hits.length === 0) {
        const flipped = reversedMatch(index, sport, ref);
        if (flipped && flipped.providerIds[ref.source] === undefined) {
          return { kind: 'confident', athlete: flipped };
        }
      }
    }
    return { kind: 'unknown' };
  }
  if (!isFullName(ref.name)) return { kind: 'ambiguous' };
  const hits = index.byName.get(`${sport}|${normaliseName(ref.name)}`) ?? [];
  if (hits.length === 1) return { kind: 'confident', athlete: hits[0] };
  if (hits.length > 1) return { kind: 'ambiguous' };
  const flipped = reversedMatch(index, sport, ref);
  if (flipped) return { kind: 'confident', athlete: flipped };
  return { kind: 'unknown' };
}

// ─── Appearance drafts → resolved appearances ─────────────────────────
//
// Providers now emit DRAFTS: the appearance fixture (carrying only its
// slice key) plus one AthleteRef per participant. Resolution is the one
// place identity decisions happen:
//   - resolved refs put the athlete's CANONICAL id into followKeys;
//   - unknown refs may CREATE a fixture_derived athlete, but only for
//     sources that publish structured participant records ('structured');
//     title-parsed names ('never') resolve against the directory or not
//     at all — a parsed title must never invent an identity (F31);
//   - a draft none of whose refs resolve is DROPPED, exactly as
//     appearanceFor returned null before: a doc nobody can follow has no
//     consumer. Ambiguous participants stay display-only on the doc that
//     does survive (their name is still in `athletes`).

export type CreationPolicy = 'structured' | 'never';

export interface AppearanceDraft {
  fixture: Fixture; // followKeys: [sliceKey] only
  refs: AthleteRef[];
}

export interface ResolutionCounts {
  certain: number;
  confident: number;
  ambiguous: number;
  unknown: number; // unresolved and not created (policy 'never')
  created: number;
  droppedNoKeys: number; // drafts with no resolvable participant
  nameCollisions: number; // F34 shape: distinct ids, one rendered name
}

export interface NewAthleteSpec {
  ref: AthleteRef;
  sport: string;
  grouping?: string;
  groupingKey?: string;
  provenance: AthleteProvenance;
}

export interface ResolvedAppearances {
  appearances: Fixture[];
  toCreate: NewAthleteSpec[]; // distinct; ids allocated by the I/O layer
  counts: ResolutionCounts;
  collisionDetails: string[]; // for the run record / logs, capped
}

export function resolveDrafts(
  drafts: readonly AppearanceDraft[],
  index: AthleteIndex,
  opts: {
    create: CreationPolicy;
    provenance?: AthleteProvenance; // for created athletes
    grouping?: string;
    groupingKey?: string;
  },
): ResolvedAppearances {
  const counts: ResolutionCounts = {
    certain: 0,
    confident: 0,
    ambiguous: 0,
    unknown: 0,
    created: 0,
    droppedNoKeys: 0,
    nameCollisions: 0,
  };
  const collisionDetails: string[] = [];
  const toCreate = new Map<string, NewAthleteSpec>();
  // F34 detection: within one batch, one appearance DOC id can only carry
  // one identity per rendered name. Two DISTINCT provider ids sharing a
  // rendered name inside the same parent would collide on the name-built
  // doc id — the first (lowest external id, deterministic) wins and the
  // collision is counted and reported instead of silently absorbed.
  // Changing the id scheme to represent both is gated on an owner ruling
  // (see the Prompt 8 report); until then the loss is LOUD.
  const docIdOwner = new Map<string, string>(); // doc id → provider key
  const appearances: Fixture[] = [];

  // Deterministic processing order INDEPENDENT of caller input order:
  // doc id first, then the lowest provider key among refs — so when two
  // drafts collide on one doc id, which one owns it never flips
  // poll-to-poll with provider enumeration order (review round: the
  // old tiebreak was input order, which only LOOKED stable because the
  // WTA provider happened to pre-sort).
  const refOrder = (d: AppearanceDraft): string =>
    d.refs
      .map((r) =>
        r.source && r.externalId ? providerKey(r.source, r.externalId) : r.name,
      )
      .sort()[0] ?? '';
  const sorted = [...drafts].sort(
    (a, b) =>
      a.fixture.id.localeCompare(b.fixture.id) ||
      refOrder(a).localeCompare(refOrder(b)),
  );
  for (const draft of sorted) {
    const keys: string[] = [];
    for (const ref of draft.refs) {
      const m = matchAthlete(index, draft.fixture.sport, ref);
      if (m.kind === 'certain' || m.kind === 'confident') {
        if (ref.source && ref.externalId) {
          const pk = providerKey(ref.source, ref.externalId);
          const owner = docIdOwner.get(draft.fixture.id);
          if (owner !== undefined && owner !== pk) {
            // A second, DIFFERENT provider id arriving at the same
            // name-built doc id: the F34 shape. The first owner keeps
            // the doc; this ref is refused — loudly counted, never
            // silently absorbed — so one player's slot can no longer
            // masquerade as the other's.
            counts.nameCollisions++;
            if (collisionDetails.length < 10) {
              collisionDetails.push(
                `${draft.fixture.id}: ${owner} vs ${pk} (${ref.name})`,
              );
            }
            continue;
          }
          docIdOwner.set(draft.fixture.id, pk);
        }
        counts[m.kind]++;
        if (!keys.includes(m.athlete!.id)) keys.push(m.athlete!.id);
        continue;
      }
      if (m.kind === 'ambiguous') {
        counts.ambiguous++;
        continue;
      }
      // unknown
      if (opts.create === 'structured' && isFullName(ref.name)) {
        const createKey =
          ref.source && ref.externalId
            ? providerKey(ref.source, ref.externalId)
            : `${draft.fixture.sport}|${normaliseName(ref.name)}`;
        if (!toCreate.has(createKey)) {
          toCreate.set(createKey, {
            ref,
            sport: draft.fixture.sport,
            ...(opts.grouping ? { grouping: opts.grouping } : {}),
            ...(opts.groupingKey ? { groupingKey: opts.groupingKey } : {}),
            provenance: opts.provenance ?? 'fixture_derived',
          });
          counts.created++;
        }
        // The caller re-resolves after creating; this pass just records
        // the intent. The draft still counts as followable — mark it so
        // it is not dropped. Deduped like resolved keys: a bout whose
        // two refs are one unknown person must not carry the key twice.
        const pending = `__pending__:${createKey}`;
        if (!keys.includes(pending)) keys.push(pending);
      } else {
        counts.unknown++;
      }
    }
    if (keys.length === 0) {
      counts.droppedNoKeys++;
      continue;
    }
    // Belt over braces: one doc id, one doc. Whatever produced a second
    // draft at an id already emitted, silently writing it twice would
    // hand one athlete's slot to another.
    if (appearances.some((f) => f.id === draft.fixture.id)) {
      counts.nameCollisions++;
      if (collisionDetails.length < 10) {
        collisionDetails.push(`${draft.fixture.id}: duplicate draft dropped`);
      }
      continue;
    }
    appearances.push({
      ...draft.fixture,
      followKeys: [...draft.fixture.followKeys, ...keys],
    });
  }
  return {
    appearances,
    toCreate: [...toCreate.values()],
    counts,
    collisionDetails,
  };
}

// After the I/O layer has created the pending athletes (allocating real
// ids), swap the placeholders for them. Pure, so the two-phase dance is
// testable end to end.
export function applyCreatedIds(
  appearances: readonly Fixture[],
  idOf: ReadonlyMap<string, string>, // createKey → athlete id
): Fixture[] {
  return appearances.map((f) => ({
    ...f,
    followKeys: f.followKeys
      .map((k) =>
        k.startsWith('__pending__:')
          ? (idOf.get(k.slice('__pending__:'.length)) ?? '')
          : k,
      )
      .filter((k) => k.length > 0),
  }));
}

// Build the Athlete doc for a NewAthleteSpec once an id is allocated.
export function newAthlete(
  id: string,
  spec: NewAthleteSpec,
  nowIso: string,
): Athlete {
  const hasId = Boolean(spec.ref.source && spec.ref.externalId);
  return {
    id,
    accentHue: accentHueOf(id),
    displayName: spec.ref.name,
    searchName: normaliseName(spec.ref.name),
    aliases: [],
    sport: spec.sport,
    ...(spec.grouping ? { grouping: spec.grouping } : {}),
    ...(spec.groupingKey ? { groupingKey: spec.groupingKey } : {}),
    providerIds: hasId ? { [spec.ref.source!]: spec.ref.externalId! } : {},
    identities: [
      {
        source: spec.ref.source ?? 'derived',
        externalId: spec.ref.externalId ?? null,
        name: spec.ref.name,
        lastSeenAt: nowIso,
      },
    ],
    provenance: spec.provenance,
    nameKeyed: !hasId,
    active: true,
    missedRefreshes: 0,
    createdAt: nowIso,
    updatedAt: nowIso,
  };
}

// ─── F1 driver stamping ───────────────────────────────────────────────
//
// F1 has no sub-event to hang an appearance on: every entrant runs
// every session, so the session IS the driver's appearance and the
// parent/child distinction collapses. Instead of minting thousands of
// per-driver-per-session docs that would all say the same thing, the
// season's driver keys are stamped onto the session fixtures at ingest.
// A driver follow therefore yields the race weekends through the
// ordinary query path — and the existing race-only preference applies
// unchanged, because the fixtures carry their sessionKind as always.
// Sorted for a stable followKeys order: ingest diffs docs by equality,
// and a shuffled array would rewrite every session every poll.
export function stampDriverKeys(
  fixtures: readonly Fixture[],
  athletes: readonly Athlete[],
): Fixture[] {
  const driverKeys = athletes
    .filter((a) => a.active && a.providerIds.f1 !== undefined)
    .map((a) => a.id)
    .sort();
  if (driverKeys.length === 0) return [...fixtures];
  return fixtures.map((f) =>
    f.sport === 'f1'
      ? {
          ...f,
          followKeys: [
            ...f.followKeys.filter((k) => !isCanonicalAthleteKey(k)),
            ...driverKeys,
          ],
        }
      : f,
  );
}

// ─── Roster reconciliation ────────────────────────────────────────────
//
// A roster refresh (WTA top 200, IBF ratings, the Jolpica driver list)
// carries the CURRENT truth of who that source rates. Reconciliation:
//   - entry matches an existing athlete by provider id → update in place
//     (rank, name drift becomes an alias, lastSeenAt);
//   - no id: unique full-name match in the sport → attach this identity
//     to that athlete (an IBF-rated boxer who already exists as a PBC
//     fixture_derived athlete becomes ONE athlete with two identities);
//   - no match → create;
//   - name matching more than one existing athlete, no id → SKIPPED and
//     counted. Guessing which one the roster means is exactly the
//     failure the surname rule exists to prevent.
//   - roster athletes ABSENT from this refresh accrue missedRefreshes;
//     at MISSES_BEFORE_INACTIVE they are marked inactive — never
//     deleted, and any re-appearance reactivates them.

export interface RosterEntry {
  source: string;
  externalId: string | null;
  name: string;
  sport: string;
  grouping?: string;
  groupingKey?: string;
  rank?: number;
  championOf?: string[];
  countryCode?: string;
  // Recorded retirement, where the source states one. Absent = the
  // source says nothing, which is NOT a claim that the athlete competes.
  careerStatus?: 'retired';
  careerEndYear?: number;
  // Additional provider identities the SAME source vouches for in one
  // record (Prompt 10b: a Wikidata row carries the ATP id and the ITF
  // id beside the Q-id). They join the identity map exactly like the
  // primary — per-identity source and lastSeenAt — so any of the three
  // namespaces certifies this athlete in matching.
  extraIdentities?: Array<{ source: string; externalId: string }>;
}

export const MISSES_BEFORE_INACTIVE = 2;

export interface RosterReconciliation {
  toCreate: RosterEntry[]; // ids allocated by the I/O layer
  toUpdate: Array<{ id: string; patch: Partial<Athlete> }>;
  skippedAmbiguous: string[]; // names that matched >1 athlete, no id
  seenAthleteIds: string[];
}

export function reconcileRoster(
  existing: readonly Athlete[],
  entries: readonly RosterEntry[],
  nowIso: string,
  opts: {
    // Population-exclusion guard (Prompt 10b): a CONFIDENT name match
    // to an athlete carrying a provider id from one of these sources is
    // treated as UNKNOWN — two different people sharing a rendered
    // name. The ATP roster passes ['wta']: every existing tennis
    // athlete is a WTA-id-backed woman, and a cross-gender name
    // collision must mint a second athlete (whose name twin then makes
    // draw-name matching honestly ambiguous), never attach a man's
    // identity and honours to a woman's follow.
    nameMatchExcludesSources?: string[];
    // This source is AUTHORITATIVE on career status: its entries carry
    // the complete current truth, so a field it omits is cleared rather
    // than left to rot. Only the Wikidata ATP roster sets it — it
    // evaluates every selected player on every run.
    ownsCareerStatus?: boolean;
    // This source publishes a TOP-N SLICE (the ATP top 20, a ranking
    // cut) rather than a membership roster. Absence clears the rank and
    // the browse group it granted, and never deactivates — see the
    // absence loop for why.
    sliceRoster?: boolean;
  } = {},
): RosterReconciliation {
  const index = buildAthleteIndex(existing);
  const toCreate: RosterEntry[] = [];
  const createKeys = new Set<string>();
  const toUpdate = new Map<string, Partial<Athlete>>();
  const skippedAmbiguous: string[] = [];
  const seen = new Set<string>();

  for (const e of entries) {
    let m = matchAthlete(index, e.sport, {
      name: e.name,
      ...(e.externalId ? { source: e.source, externalId: e.externalId } : {}),
    });
    if (
      m.kind === 'confident' &&
      opts.nameMatchExcludesSources !== undefined &&
      (opts.nameMatchExcludesSources.some(
        (s) => m.athlete!.providerIds[s] !== undefined,
      ) ||
        // A name-keyed athlete carries NO provider id to check — and in
        // tennis the only name-keyed mint path is a WTA draw row with a
        // blank PlayerID, i.e. exactly the population the exclusion
        // names (review round: the id-marker check alone left this hole
        // open). When the guard is active, an id-less name match is as
        // untrustworthy as an excluded-source one.
        m.athlete!.nameKeyed)
    ) {
      m = { kind: 'unknown' };
    }
    if (m.kind === 'ambiguous') {
      if (e.externalId === null && isFullName(e.name)) {
        skippedAmbiguous.push(`${e.source}: ${e.name}`);
      }
      continue;
    }
    if (m.kind === 'unknown') {
      // Deduped within the run: the same provider id (or same name)
      // arriving twice — a page overlap during a mid-fetch rank shift
      // still passes the contiguity proof — must create ONE athlete.
      const createKey = e.externalId
        ? providerKey(e.source, e.externalId)
        : `${e.sport}|${normaliseName(e.name)}`;
      if (!createKeys.has(createKey)) {
        createKeys.add(createKey);
        toCreate.push(e);
      }
      continue;
    }
    const a = m.athlete!;
    seen.add(a.id);
    const prev = toUpdate.get(a.id) ?? {};
    const extras = e.extraIdentities ?? [];
    const replaced = new Set([e.source, ...extras.map((x) => x.source)]);
    const identities = [
      ...(prev.identities ?? a.identities).filter(
        (i) => !replaced.has(i.source),
      ),
      {
        source: e.source,
        externalId: e.externalId,
        name: e.name,
        lastSeenAt: nowIso,
      },
      ...extras.map((x) => ({
        source: x.source,
        externalId: x.externalId,
        name: e.name,
        lastSeenAt: nowIso,
      })),
    ];
    const aliasSet = new Set([...(prev.aliases ?? a.aliases)]);
    const n = normaliseName(e.name);
    if (n && n !== a.searchName) aliasSet.add(n);
    const providerIdAdds: Record<string, string> = {
      ...(e.externalId ? { [e.source]: e.externalId } : {}),
      ...Object.fromEntries(extras.map((x) => [x.source, x.externalId])),
    };
    toUpdate.set(a.id, {
      ...prev,
      identities,
      aliases: [...aliasSet],
      ...(Object.keys(providerIdAdds).length > 0
        ? { providerIds: { ...a.providerIds, ...providerIdAdds } }
        : {}),
      ...(e.rank !== undefined ? { rank: e.rank } : {}),
      ...(e.championOf !== undefined ? { championOf: e.championOf } : {}),
      ...(e.countryCode ? { countryCode: e.countryCode } : {}),
      // The owning source also owns the GROUPING: a retired player's
      // entry stops carrying one, and merge semantics would otherwise
      // leave last week's key on the document forever. (Browse filters
      // retired athletes anyway, so this is data hygiene rather than
      // the load-bearing rule — but a key nothing can render is a trap
      // for the next reader.)
      ...(opts.ownsCareerStatus
        ? { grouping: e.grouping, groupingKey: e.groupingKey }
        : {
            ...(e.grouping ? { grouping: e.grouping } : {}),
            ...(e.groupingKey ? { groupingKey: e.groupingKey } : {}),
          }),
      // CAREER STATUS IS ALL-OR-NOTHING PER REFRESH, for the source
      // that owns it (review round). wikidata evaluates every selected
      // player each week, so an entry arriving WITHOUT a marker is a
      // positive statement that the source no longer records a
      // retirement — and merge semantics would otherwise leave the old
      // one behind, putting a "Retired 2024" caption on a man the very
      // same refresh moved into the still-playing group. `undefined`
      // here becomes a real field delete in applyRoster. Sources that
      // never report career status at all (WTA, IBF, F1) leave the
      // flag off and touch nothing.
      ...(opts.ownsCareerStatus
        ? {
            careerStatus: e.careerStatus,
            careerEndYear: e.careerEndYear,
          }
        : e.careerStatus !== undefined
          ? { careerStatus: e.careerStatus, careerEndYear: e.careerEndYear }
          : {}),
      active: true,
      missedRefreshes: 0,
      nameKeyed:
        a.nameKeyed && !e.externalId
          ? true
          : false,
      updatedAt: nowIso,
    });
  }

  // Absence accounting — scoped to athletes this source actually
  // PLACED: roster-created, or roster-attached (they carry a rank or a
  // championship from a refresh). A WTA player is never marked inactive
  // by an IBF refresh — and a rank-250 player minted from a DRAW is
  // absent from the top 200 BY CONSTRUCTION, so her fixture-derived,
  // never-ranked doc is not this roster's to deactivate (review round:
  // the unscoped pass deactivated active draw players weekly, and its
  // F1 twin stripped a wrongly-inactive driver's keys from every
  // session). Already-inactive athletes are left alone — no unbounded
  // miss counters, no deactivated-recount every week.
  const source = entries[0]?.source;
  if (source) {
    for (const a of existing) {
      if (seen.has(a.id)) continue;
      if (!a.active) continue;
      if (!a.identities.some((i) => i.source === source)) continue;
      const rosterPlaced =
        a.provenance === 'roster' ||
        a.rank !== undefined ||
        (a.championOf?.length ?? 0) > 0;
      if (!rosterPlaced) continue;
      const misses = a.missedRefreshes + 1;
      // A TOP-N SLICE IS NOT A MEMBERSHIP ROSTER. Falling out of the
      // ATP top 20 is a bad month, not a retirement — deactivating for
      // it would hide a working professional from browse AND sink him
      // in search, off a list he was never guaranteed a place on. So a
      // slice source clears what it granted (the rank and the browse
      // group) and stops there; the athlete stays active and findable.
      // A membership roster (IBF's rated fighters, the F1 grid) keeps
      // the old behaviour, where absence really does mean gone.
      const patch: Partial<Athlete> = opts.sliceRoster
        ? {
            missedRefreshes: misses,
            updatedAt: nowIso,
            // Rank only. The GROUPING is deliberately untouched: the
            // Wikidata directory pass runs earlier in the same refresh
            // and has already put this man back in the alphabetical
            // group, so clearing it here would delete the placement
            // that was just made and leave him in no group at all —
            // every week, permanently.
            ...(a.rank !== undefined ? { rank: undefined } : {}),
          }
        : {
            missedRefreshes: misses,
            updatedAt: nowIso,
            // A dropped-off athlete keeps grouping (browse hides
            // inactive) but loses the claim to a current rank — a stale
            // #3 is a lie.
            ...(a.rank !== undefined ? { rank: undefined } : {}),
            ...(misses >= MISSES_BEFORE_INACTIVE ? { active: false } : {}),
          };
      toUpdate.set(a.id, { ...(toUpdate.get(a.id) ?? {}), ...patch });
    }
  }

  return {
    toCreate,
    toUpdate: [...toUpdate.entries()].map(([id, patch]) => ({ id, patch })),
    skippedAmbiguous,
    seenAthleteIds: [...seen],
  };
}

// Athlete doc from a roster entry, once an id is allocated.
export function rosterAthlete(
  id: string,
  e: RosterEntry,
  nowIso: string,
): Athlete {
  return {
    id,
    accentHue: accentHueOf(id),
    displayName: e.name,
    searchName: normaliseName(e.name),
    aliases: [],
    sport: e.sport,
    ...(e.grouping ? { grouping: e.grouping } : {}),
    ...(e.groupingKey ? { groupingKey: e.groupingKey } : {}),
    providerIds: {
      ...(e.externalId ? { [e.source]: e.externalId } : {}),
      ...Object.fromEntries(
        (e.extraIdentities ?? []).map((x) => [x.source, x.externalId]),
      ),
    },
    identities: [
      {
        source: e.source,
        externalId: e.externalId,
        name: e.name,
        lastSeenAt: nowIso,
      },
      ...(e.extraIdentities ?? []).map((x) => ({
        source: x.source,
        externalId: x.externalId,
        name: e.name,
        lastSeenAt: nowIso,
      })),
    ],
    provenance: 'roster',
    nameKeyed: !e.externalId,
    active: true,
    missedRefreshes: 0,
    ...(e.rank !== undefined ? { rank: e.rank } : {}),
    ...(e.championOf !== undefined ? { championOf: e.championOf } : {}),
    ...(e.countryCode ? { countryCode: e.countryCode } : {}),
    ...(e.careerStatus !== undefined ? { careerStatus: e.careerStatus } : {}),
    ...(e.careerEndYear !== undefined
      ? { careerEndYear: e.careerEndYear }
      : {}),
    createdAt: nowIso,
    updatedAt: nowIso,
  };
}
