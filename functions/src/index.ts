// DEPLOY STAMP 2026-08-30 (second occurrence of the skip-wall: the
// curated-merge deploy skipped as unchanged while prod rebuilt art
// without the merge).
// DEPLOY STAMP 2026-08-28: bump the codebase hash. Two overlapping
// deploys left prod running a pre-fixtureTeams source zip while the
// CLI's skip-unchanged hash matched the NEW source, so a plain
// redeploy skipped all 36 functions. Any edit to this file un-skips
// the fleet; the stamp is inert and can be removed on the next
// substantive change.
import { createHash, timingSafeEqual } from 'node:crypto';
import { initializeApp } from 'firebase-admin/app';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { onRequest } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { sweepAll } from './sweep';
import compressionMiddleware from 'compression';

// Gzip on the client-facing serving routes (Round 2 perf ruling,
// closing the compression decision parked since Prompt 12b). Cloud
// Functions v2 does NOT compress dynamic responses on its own; this
// wraps only the read APIs the app fetches — the tennis-athletes
// payload is ~185KB raw and is the reason this exists. Pollers and ops
// routes stay unwrapped: their responses are small and machine-read.
const gzipMw = compressionMiddleware();
type Handler = (req: Parameters<Parameters<typeof onRequest>[0]>[0], res: Parameters<Parameters<typeof onRequest>[0]>[1]) => void | Promise<void>;
const gz = (handler: Handler): Handler => (req, res) =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  gzipMw(req as any, res as any, () => void handler(req, res));

import { reconcileFixtures } from './reconcile';
import { augmentFollowKeys, loadDirectoryJoins } from './aliases';
import { getStorage } from 'firebase-admin/storage';
import { dominantPair } from './crestColours';
import { DERIVED_TEAM_LEAGUE_IDS } from './fixtureTeams';
import {
  assessMark,
  composeTrimmed,
  gridFromImageBuffer,
  markTilePlan,
  pngBufferOf,
  trimBox,
} from './markTiles';
import {
  carryScopedKeys,
  stampBoxingSexScopes,
  withoutScopedKeys,
} from './boxingSexScopes';
import { boxingStampBases, withMajorCardsKey } from './boxingMerge';
import { deriveMmaBrowse, MMA_SPORT, stampMmaFighterKeys } from './mmaFighters';
import {
  authorised as rcAuthorised,
  isEventForUs,
  mirrorFromEvent,
  RevenueCatEvent,
} from './revenuecat';
import {
  cadenceModeFor,
  KnownCard,
  planBoxingDataRun,
  projectedSpendToReset,
  QUOTA_RESERVE,
} from './providers/boxingDataCadence';
import { stampCrests } from './crestStamp';
import {
  appearanceFor,
  appearanceEndMs,
  appearanceSliceKey,
  deriveBoutAppearances,
  retiredAppearanceIds,
} from './appearances';
import { athleteNames, normaliseName, toSearchName } from './identity';
import { imageryAllowed, withImageryPolicy } from './imagery';
import {
  artIsFresh,
  COMPETITION_ART_ALIASES,
  mergeCuratedMarks,
  narrowToServed,
  TSDB_ART_SPORTS,
  tsdbLeagueIdsFrom,
} from './competitionArt';
import {
  fetchTsdbLeagueBadges,
  leagueBadgeFor,
  TsdbLeagueArt,
} from './providers/tsdb';
import {
  AppearanceDraft,
  applyCreatedIds,
  AthleteProvenance,
  CreationPolicy,
  groupTitleOf,
  NewAthleteSpec,
  providerKey,
  resolveDrafts,
  stampDriverKeys,
  athletesCollection,
  nameKey,
  type AthleteKey,
  type AthleteUpdate, accentHueOf } from './athletes';
import {
  createAthletes,
  loadAthleteIndex,
  loadAthletes,
  updateAthleteNextStart,
} from './rosterStore';
import { enrichBoutParticipants, namesPeople } from './participants';
import { reapCandidates, REAPER_HOLD_SLICES } from './reaper';
import { searchAthletes, searchTeams, shapeAthleteBrowse } from './search';
import { CatalogueEntry, sportWeightsOf, CATALOGUE_SEED } from './catalogue';
import { shapeTournamentRows } from './tennisTournaments';
import {
  activeWindows,
  draftsFrom,
  MAX_EVENT_PAGES,
  observationsFrom,
  parseEventsPage,
  planCoverage,
  publishable,
  quotaAvailable,
  resolveVendorIds,
  rowsFrom,
  statusBody,
  vendorGet,
  type AtpVendorStatus,
  type Observation,
  type SkippedRow,
  type TournamentCacheEntry,
  type VendorGet,
  type VendorQuota,
  type VendorRequestKind,
} from './providers/tennisApiAtpEvents';
import { leaseDecision } from './sourceLease';
import { stageFrom } from './stage';
import { TSDB_TEAM_LEAGUES } from './tsdbTeamLeagues';
import {
  soccerRowDocId,
  staticTeamCounts,
  teamCountsByDoc,
} from './teamCounts';
import { bestSeason, seasonsToTry } from './season';
import { fetchCardParticipants } from './providers/cardParticipants';
import { diffFixtures } from './diff';
import { Fixture, FixtureStatus } from './fixture';
import { loadCoverage } from './coverage';
import { loadFdSeasons, reresolveAfter404 } from './fdSeasons';
import {
  listReviewItems,
  ReviewItem,
  reviewItemToAppearances,
  reviewItemToFixture,
  ReviewStatus,
  submitReviewItem,
  validateSubmission,
} from './reviewQueue';
import {
  countsFrom,
  EMPTY_COUNTS,
  httpStatusFromError,
  isZeroYield,
  recordSourceRun,
  RunContext,
  RunCounts,
  RunReason,
  RunTrigger,
  TRIGGER_HEADER,
  triggerOf,
} from './sourceRuns';
import {
  fetchLeagueSeasonFixtures,
  fetchTeamSeasonFixtures,
} from './providers/apiSports';
import {
  fetchFdCompetitionSeasonFixtures,
  fetchFdCompetitionTeams,
  fetchFdTeamSeasonFixtures,
  FD_FREE_COMPETITIONS,
} from './providers/fdorg';
import { fetchTsdbLeagueSeasonFixtures, fetchTsdbLeagueTeams } from './providers/tsdb';
import { fetchMlbLeagueSeasonFixtures, fetchMlbTeamSeasonFixtures } from './providers/mlb';
import { fetchNhlLeagueSeasonFixtures, fetchNhlTeamSeasonFixtures } from './providers/nhl';
import { fetchF1SeasonFixtures } from './providers/f1';
import {
  fetchBoxingData,
  shouldFetchBouts,
  SLICE as BOXING_SLICE,
  type BoutFetchState,
  BoxingDataHttpError,
} from './providers/boxingData';
import { fetchPbcCards } from './providers/pbc';
import { fetchTennisTournaments } from './providers/tennisIcs';
import { fetchWorldAthletics } from './providers/worldAthletics';
import { fetchWtaTennis } from './providers/wtaTennis';
import { fetchWtaRankings } from './providers/wtaRankings';
import { ATP_ROSTER_ENABLED, fetchAtpRoster } from './providers/wikidataAtp';
import {
  fetchAtpTop500,
  groupingFor,
  planReconcile,
  RankedPlayer,
  removalGuard,
  VENDOR as ATP_VENDOR,
} from './providers/tennisApiAtp';
import { fetchIbfRatings } from './providers/ibfRatings';
import { fetchJolpicaDrivers } from './providers/jolpicaDrivers';
import { applyRoster } from './rosterStore';
import {
  derivedLeagueTeams,
  listFdSoccerTeams,
  listMlbTeams,
  listNhlTeams,
  listSoccerLeagues,
  listTsdbTeams,
} from './directory';

initializeApp();
const db = getFirestore();

// Constant-time compare over equal-length digests — avoids leaking key
// length or prefix through response timing.
function timingSafeEqualStr(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a).digest();
  const hb = createHash('sha256').update(b).digest();
  return timingSafeEqual(ha, hb);
}

// What one ingest did, in the terms the coverage report needs. `fetched`
// is the provider's raw row count and belongs to the caller, which is the
// only layer that has seen the wire.
export type IngestCounts = Omit<RunCounts, 'fetched' | 'futureDated'>;

// The reaper applies only when explicitly enabled; until then every
// successful fetch still RECORDS its would-reap decision (sourceRuns
// carries it), which is the dry run the owner reads before enabling.
const reaperEnabled = (): boolean => process.env.REAPER_ENABLED === 'true';

export interface IngestReap {
  candidates: number;
  // Future appearances of reaped parents, cancelled with them — counted
  // and sampled even in dry runs, so the owner reads the FULL blast
  // radius before enabling, not just the parents.
  cascade: number;
  applied: number;
  liveCount: number;
  guardTripped: boolean;
  sampleIds: string[];
}

// Shared ingest: diff fresh fixtures against the cache slice for one
// followable key, then upsert fixtures + append change records.
//
// `reapSource` arms the reaper for this slice: a successful non-empty
// fetch measures the stored slice against what it returned, and future-
// dated same-source docs the fetch did not return are soft-cancelled
// (guards and rationale in reaper.ts). Callers that cannot vouch for a
// complete slice fetch — decideReview's single-fixture ingests, every
// appearance slice (retirement owns those) — simply do not pass it.
async function ingest(
  rawIncoming: Fixture[],
  followKey: string,
  reapSource?: string,
  reapWindowEndUtc?: string,
): Promise<{
  fixtures: number;
  changes: number;
  counts: IngestCounts;
  reap?: IngestReap;
}> {
  // Combat cards arrive as a title with no participants; parse the
  // fighters out and give them athlete follow keys before anything else
  // looks at the fixture.
  // Round 6 item 5: an MMA card carries its two fighters' folded-name
  // keys — the fighter follow's only path onto a fixture (no appearance
  // docs in MMA) and the same key the derived directory hands out.
  const withPeople = stampMmaFighterKeys(enrichBoutParticipants(rawIncoming));
  // Stamp every provider's key for each club onto the fixture, so a
  // team followed via one provider still matches fixtures supplied by
  // another (league from football-data, cups from TSDB).
  //
  // No longer gated to soccer: the gate was there because only the soccer
  // directories were populated, but the alias table now covers every
  // league with a team directory, and a cross-provider club is a
  // cross-provider club whatever the sport.
  const joins = await loadDirectoryJoins(db);
  const keyed = augmentFollowKeys(withPeople, joins.aliases);
  // Both sides' crests, by exact key join against the directory (Stage
  // 4B) — AFTER augmentFollowKeys, which is what puts every provider's
  // team key on the fixture for the join to check against. The imagery
  // kill-switch gates the stamp itself; a failed catalogue read stamps
  // nothing rather than stamping against an unknown policy.
  const imageryOff = await loadPriorityData()
    .then((d) => new Set(d.imageryOff))
    .catch(() => null);
  const incoming =
    imageryOff === null
      ? keyed
      : stampCrests(keyed, joins.crests, imageryOff, normaliseName);
  const existingSnap = await db
    .collection('fixtures')
    .where('followKeys', 'array-contains', followKey)
    .get();
  const existing = new Map<string, Fixture>(
    existingSnap.docs.map((d) => [d.id, d.data() as Fixture]),
  );
  const changes = diffFixtures(existing, incoming);
  const at = new Date().toISOString();
  const byId = new Map(incoming.map((f) => [f.id, f]));
  // Firestore batches cap at 500 writes — chunk (fixtures + changes can
  // exceed it on a first league-wide poll).
  let batch = db.batch();
  let pending = 0;
  const flush = async () => {
    if (pending > 0) {
      await batch.commit();
      batch = db.batch();
      pending = 0;
    }
  };
  // Write only what actually changed: an unchanged fixture costs a read
  // we already did, not a write. (updatedAt is excluded from the compare
  // — it changes on every poll by construction.)
  // The stamp pass's scoped card keys are invisible to this compare and
  // carried across rewrites (boxingSexScopes.ts) — otherwise every poll
  // of a card slice rewrote every card and re-stamped it (Round 4).
  const sameFixture = (a: Fixture, b: Fixture): boolean => {
    const strip = ({ updatedAt, firstSeenAt, ...rest }: Fixture) => rest;
    return (
      JSON.stringify(strip(withoutScopedKeys(a))) ===
      JSON.stringify(strip(withoutScopedKeys(b)))
    );
  };
  let stored = 0;
  let unchanged = 0;
  const writtenIds = new Set<string>();
  for (const f of incoming) {
    const prev = existing.get(f.id);
    if (prev && sameFixture(prev, f)) {
      unchanged++;
      continue;
    }
    // firstSeenAt decides which id survives a cross-source merge — it
    // must never be reset by a re-poll.
    const record: Fixture = {
      ...carryScopedKeys(f, prev),
      firstSeenAt: prev?.firstSeenAt ?? at,
    };
    batch.set(db.collection('fixtures').doc(f.id), record);
    writtenIds.add(f.id);
    stored++;
    if (++pending >= 450) await flush();
  }
  for (const c of changes) {
    // followKeys ride on the change record so the sweep can fan pushes
    // out to affected devices without re-reading fixtures.
    const followKeys = byId.get(c.fixtureId)?.followKeys ?? [];
    batch.set(db.collection('fixtureChanges').doc(), { ...c, at, followKeys });
    if (++pending >= 450) await flush();
  }
  let reap: IngestReap | undefined;
  if (reapSource && incoming.length > 0) {
    const decision = reapCandidates(
      [...existing.values()],
      incoming,
      reapSource,
      at,
      reapWindowEndUtc,
    );
    // CASCADE: a withdrawn card never yields again, so retirement can
    // never fire for its bouts — a reaped parent's live appearances
    // would sit scheduled forever. The reaper cancels appearances ONLY
    // this way, transitively through their parent; absence-from-yield
    // stays retirement's alone. Enumerated BEFORE the apply decision so
    // dry runs record the full blast radius, children included.
    const cascade: Fixture[] = [];
    for (const e of decision.candidates) {
      const apps = await db
        .collection('fixtures')
        .where('parentFixtureId', '==', e.id)
        .get();
      for (const a of apps.docs) {
        const doc = a.data() as Fixture;
        if (doc.status === 'cancelled' || doc.startUtc < at) continue;
        cascade.push(doc);
      }
    }
    const held = REAPER_HOLD_SLICES.has(followKey);
    if (held && decision.candidates.length > 0) {
      // The owner sees a held slice's would-reap BEFORE anything fans
      // out — nothing is applied, the run record carries the list.
      console.error(
        `[kickoffcal-alert] reap_held: ${followKey} would reap ${decision.candidates.length} (guardTripped=${decision.guardTripped}) — held for owner review`,
      );
    }
    const apply =
      reaperEnabled() && !decision.guardTripped && decision.candidates.length > 0 && !held;
    if (apply) {
      const cancelWithChange = (e: Fixture) => {
        batch.set(db.collection('fixtures').doc(e.id), {
          ...e,
          status: 'cancelled',
          updatedAt: at,
        });
        pending++;
        // The cancellation must fan out like any provider-sent one, or
        // followers' calendars keep the withdrawn event until their
        // next foreground sync.
        batch.set(db.collection('fixtureChanges').doc(), {
          kind: 'status_changed',
          fixtureId: e.id,
          prevStatus: e.status,
          newStatus: 'cancelled',
          at,
          followKeys: e.followKeys ?? [],
        });
        pending++;
      };
      for (const e of [...decision.candidates, ...cascade]) {
        cancelWithChange(e);
        if (pending >= 450) await flush();
      }
    }
    reap = {
      candidates: decision.candidates.length,
      cascade: cascade.length,
      applied: apply ? decision.candidates.length + cascade.length : 0,
      liveCount: decision.liveCount,
      guardTripped: decision.guardTripped,
      sampleIds: [...decision.candidates, ...cascade]
        .slice(0, 20)
        .map((e) => e.id),
    };
  }
  await flush();
  // Sex-scoped card keys (B7 final shape): after the batch commits so
  // cards and bouts see each other whichever poll delivered them.
  // Instrumentation-grade failure handling — a stamping error must
  // never fail the poll it rides.
  try {
    // A PBC ingest stamps the Major fight cards sex scopes too (Round 6
    // item 4), so `tsdb-league-4445-m/-w` followers see PBC's cards.
    for (const base of boxingStampBases(followKey)) {
      // The slice's own base stamps what this run wrote; the MERGED base
      // (Major fight cards on a PBC ingest) stamps every incoming card —
      // idempotent, and a run that changed nothing must still be able to
      // give an existing PBC card its 4445 sex scopes.
      await stampBoxingSexScopes(db, incoming, base, base === followKey ? writtenIds : undefined);
    }
  } catch (e) {
    console.error(`[kickoffcal] boxing sex-scope stamping failed: ${e}`);
  }
  return {
    fixtures: incoming.length,
    changes: changes.length,
    // `rejected` is 0 by construction: there is no validation stage yet
    // (Stage 6 adds one). The counter ships now so the identity
    // parsed === stored + unchanged + rejected is pinned from day one.
    counts: { parsed: incoming.length, rejected: 0, stored, unchanged },
    ...(reap ? { reap } : {}),
  };
}

// The legacy name-keyed athleteDirectory write-through is RETIRED
// (Prompt 8): search reads the canonical `athletes` collection, and the
// nextStartUtc hint appearance ingest maintains lives on the athlete
// doc itself (rosterStore.updateAthleteNextStart). The old collection
// is left in place, unwritten, as evidence — nothing reads it.
//
// Resolve appearance DRAFTS against the canonical directory, creating
// fixture-derived athletes where the source's policy allows, and return
// finished appearance fixtures ready to ingest. The two-phase dance —
// resolve, create-with-real-ids, swap placeholders — keeps the pure
// logic in athletes.ts testable while allocation stays transactional.
async function resolveAppearanceDrafts(
  drafts: readonly AppearanceDraft[],
  policy: {
    create: CreationPolicy;
    provenance?: AthleteProvenance;
    grouping?: string;
    groupingKey?: string;
  },
): Promise<{
  fixtures: Fixture[];
  resolution: Record<string, unknown>;
}> {
  const index = await loadAthleteIndex(db);
  const resolved = resolveDrafts(drafts, index, policy);
  let fixtures = resolved.appearances;
  if (resolved.toCreate.length > 0) {
    const createKeyOf = (s: NewAthleteSpec): AthleteKey =>
      s.ref.source && s.ref.externalId
        ? providerKey(s.ref.source, s.ref.externalId)
        : nameKey(s.sport, s.ref.name);
    const idOf = await createAthletes(
      db,
      resolved.toCreate,
      createKeyOf,
      new Date().toISOString(),
    );
    fixtures = applyCreatedIds(fixtures, idOf);
  }
  if (resolved.counts.nameCollisions > 0) {
    // The F34 shape, live. Loud by design — see athletes.ts.
    console.error(
      new Error(
        `[kickoffcal] appearance name collision(s): ${resolved.collisionDetails.join('; ')}`,
      ),
    );
  }
  return {
    fixtures,
    resolution: {
      ...resolved.counts,
      ...(resolved.collisionDetails.length > 0
        ? { collisions: resolved.collisionDetails }
        : {}),
    },
  };
}

// Cancel previously-stored appearances that this yield proves gone
// (opponent replaced, bout scratched) — see retiredAppearanceIds for the
// evidence guard that keeps a provider shape failure from cancelling
// real bouts. Cancellation, not deletion: 'cancelled' is the status the
// pipeline already propagates to followers as event removal, and the
// change records written here are what fan the push out to them.
async function retireAppearances(
  sliceKey: string,
  incoming: Fixture[],
): Promise<number> {
  const snap = await db
    .collection('fixtures')
    .where('followKeys', 'array-contains', sliceKey)
    .get();
  const existing = snap.docs.map((d) => d.data() as Fixture);
  const at = new Date().toISOString();
  const ids = retiredAppearanceIds(existing, incoming, at);
  if (ids.length === 0) return 0;
  const byId = new Map(existing.map((f) => [f.id, f]));
  let batch = db.batch();
  let pending = 0;
  const flush = async () => {
    if (pending > 0) {
      await batch.commit();
      batch = db.batch();
      pending = 0;
    }
  };
  for (const id of ids) {
    const prev = byId.get(id)!;
    batch.update(db.collection('fixtures').doc(id), {
      status: 'cancelled',
      updatedAt: at,
    });
    if (++pending >= 450) await flush();
    batch.set(db.collection('fixtureChanges').doc(), {
      kind: 'status_changed',
      fixtureId: id,
      prevStatus: prev.status,
      newStatus: 'cancelled',
      at,
      followKeys: prev.followKeys ?? [],
    });
    if (++pending >= 450) await flush();
  }
  await flush();
  return ids.length;
}

// One connector invocation, instrumented. Every exit — success, provider
// failure, or an honest empty season — writes exactly one sourceRuns doc,
// so "it ran and found nothing" and "it never ran" stop looking alike.
//
// Returns the HTTP shape rather than writing it, to keep express types out
// of the helper.
interface PollWork {
  rawCount: number;
  fixtures: Fixture[];
  followKey: string;
  seasonResolved: string | null;
  // Set when a run legitimately yielded nothing: no live season, or the
  // sweep never got to it. Distinct from an error, which means a provider
  // failed us.
  reason?: RunReason;
  // Appearance DRAFTS riding the same connector invocation, resolved
  // against the canonical athlete directory and ingested under their own
  // slice key so (a) promoter/series followers are never flooded with
  // per-bout events, and (b) coverage reports the appearance funnel
  // separately from the card funnel. One extra sourceRuns doc per
  // invocation that carries appearances. `create` is the source's
  // creation policy: 'structured' for providers that publish structured
  // participant records (PBC performers, WTA draws), 'never' for
  // title-parsed names — a parsed title must never invent an identity.
  appearances?: {
    followKey: string;
    rawCount: number;
    drafts: AppearanceDraft[];
    create: CreationPolicy;
    provenance?: AthleteProvenance;
    grouping?: string;
    groupingKey?: string;
    // Competition-scoped round-slot fixtures (Prompt 11): pre-resolved
    // — no athlete refs — ingested with the resolved appearances so
    // retirement's evidence guard covers them per parent.
    roundSlots?: Fixture[];
  };
  // TRUE only when `fixtures` is the slice's COMPLETE current truth —
  // a whole-season or whole-feed fetch. This is what arms the reaper:
  // a capped fetch (athletics' page budget, PBC's card cap) proves
  // absence of nothing and must leave it disarmed.
  sliceComplete?: boolean;
  // For window-clipped complete fetches: the request window's end, so
  // the reaper's envelope cannot reach past what was actually asked
  // for (see reaper.ts).
  reapWindowEndUtc?: string;
  body?: Record<string, unknown>; // extra response fields
}

async function servePoll(
  trigger: RunTrigger,
  ctx: Omit<RunContext, 'trigger'>,
  work: (trace: { seasonsTried: string[] }) => Promise<PollWork>,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const startedAt = new Date().toISOString();
  const runCtx: RunContext = { ...ctx, trigger };
  // Captured rather than returned so a throw mid-way through a multi-season
  // resolution still records which seasons were actually tried.
  const trace = { seasonsTried: [] as string[] };
  try {
    const w = await work(trace);
    const ingested = await ingest(
      w.fixtures,
      w.followKey,
      w.sliceComplete ? runCtx.source : undefined,
      w.reapWindowEndUtc,
    );
    const counts = countsFrom(
      { fetched: w.rawCount, ...ingested.counts },
      w.fixtures,
      startedAt,
    );
    await recordSourceRun(
      runCtx,
      {
        httpStatus: 200,
        seasonResolved: w.seasonResolved,
        seasonsTried: trace.seasonsTried,
        counts,
        error: null,
        ...(w.reason ? { reason: w.reason } : {}),
        ...(ingested.reap ? { reap: ingested.reap } : {}),
      },
      startedAt,
    );
    // Appearances are a SECOND slice of the same invocation: their own
    // ingest diff, their own run record, retirement of bouts the fresh
    // yield proves gone, and a write-through to the athlete directory
    // that search reads. The record is written EVEN ON ZERO YIELD —
    // "ran and parsed nothing" going unrecorded is exactly how the PBC
    // performer array could rot away invisibly (fetched N, parsed 0 is
    // the funnel saying so). A failure here is recorded against the
    // APPEARANCE slice — the card slice genuinely succeeded and its
    // record already says so — and fails the invocation loudly so the
    // sweep retries it.
    let appearanceBody: Record<string, unknown> = {};
    if (w.appearances) {
      const a = w.appearances;
      try {
        // Resolution BEFORE ingest: canonical follow keys are decided
        // against the directory (creating fixture-derived athletes
        // where this source's policy allows), and the per-run counts —
        // certain / confident / ambiguous / created / collisions — ride
        // the run record, because identity decisions are exactly the
        // kind of quiet behaviour the funnel exists to make visible.
        const { fixtures: aFixtures, resolution } =
          await resolveAppearanceDrafts(a.drafts, {
            create: a.create,
            ...(a.provenance ? { provenance: a.provenance } : {}),
            ...(a.grouping ? { grouping: a.grouping } : {}),
            ...(a.groupingKey ? { groupingKey: a.groupingKey } : {}),
          });
        const withSlots = [...aFixtures, ...(a.roundSlots ?? [])];
        const aIngested = await ingest(withSlots, a.followKey);
        const aCounts = countsFrom(
          { fetched: a.rawCount, ...aIngested.counts },
          withSlots,
          startedAt,
        );
        await recordSourceRun(
          { ...runCtx, competitionId: a.followKey },
          {
            httpStatus: 200,
            seasonResolved: w.seasonResolved,
            seasonsTried: trace.seasonsTried,
            counts: aCounts,
            error: null,
            resolution,
          },
          startedAt,
        );
        // RETIREMENT EVIDENCE IS THE DRAFT SET, not the resolved set.
        // Resolution decides FOLLOWABILITY; the drafts are the
        // provider's testimony of what exists. A draft dropped because
        // its name went ambiguous (directory-state-dependent since
        // Prompt 8) must still count as evidence its bout is ON the
        // card — retiring against the resolved set cancelled a real
        // stored bout the moment a same-named athlete joined the
        // directory (review round, probe-confirmed).
        const retired = await retireAppearances(a.followKey, [
          ...a.drafts.map((d) => d.fixture),
          ...(a.roundSlots ?? []),
        ]);
        appearanceBody = {
          appearances: aIngested.fixtures,
          appearanceChanges: aIngested.changes,
          appearanceRetired: retired,
          resolution,
        };
        // The nextStartUtc hint is a SEARCH/browse cache, not fixture
        // truth: its failure is logged loudly and surfaced, never
        // allowed to fail a poll whose fixtures are already stored.
        try {
          await updateAthleteNextStart(db, aFixtures, startedAt);
        } catch (e) {
          console.error(`athlete nextStart update failed for ${a.followKey}:`, e);
          appearanceBody = { ...appearanceBody, athleteDirectoryError: String(e) };
        }
      } catch (e) {
        await recordSourceRun(
          { ...runCtx, competitionId: a.followKey },
          {
            httpStatus: httpStatusFromError(e),
            seasonResolved: w.seasonResolved,
            seasonsTried: trace.seasonsTried,
            counts: EMPTY_COUNTS,
            error: String(e),
          },
          startedAt,
        );
        return { status: 502, body: { error: `appearances: ${String(e)}` } };
      }
    }
    return {
      status: 200,
      body: {
        fixtures: ingested.fixtures,
        changes: ingested.changes,
        counts,
        zeroYield: isZeroYield(counts),
        ...appearanceBody,
        ...(w.body ?? {}),
      },
    };
  } catch (e) {
    await recordSourceRun(
      runCtx,
      {
        httpStatus: httpStatusFromError(e),
        seasonResolved: null,
        seasonsTried: trace.seasonsTried,
        counts: EMPTY_COUNTS,
        error: String(e),
      },
      startedAt,
    );
    return { status: 502, body: { error: String(e) } };
  }
}

function requireKey(): string {
  const apiKey = process.env.APISPORTS_KEY;
  if (!apiKey) throw new Error('APISPORTS_KEY not configured');
  return apiKey;
}

// Slice/M2: HTTP-triggered polls. The production shape is a Scheduler-
// driven sweep over all followed followables (M6); the adapter → diff →
// cache pipeline is identical.
export const pollTeam = onRequest(async (req, res) => {
  const teamId = Number(req.query.teamId);
  const season = Number(req.query.season);
  if (!Number.isInteger(teamId) || !Number.isInteger(season)) {
    res.status(400).json({ error: 'teamId and season are required' });
    return;
  }
  const followKey = `apisports-team-${teamId}`;
  const out = await servePoll(
    triggerOf(req.get(TRIGGER_HEADER)),
    {
      source: 'apisports',
      sport: 'soccer',
      competitionId: followKey,
      pollPath: `pollTeam?teamId=${teamId}&season=${season}`,
      seasonRequested: String(season),
    },
    async (trace) => {
      trace.seasonsTried.push(String(season));
      const r = await fetchTeamSeasonFixtures(requireKey(), teamId, season);
      return { ...r, followKey, seasonResolved: String(season) };
    },
  );
  res.status(out.status).json(out.body);
});

export const pollLeague = onRequest(async (req, res) => {
  const leagueId = Number(req.query.leagueId);
  const season = Number(req.query.season);
  if (!Number.isInteger(leagueId) || !Number.isInteger(season)) {
    res.status(400).json({ error: 'leagueId and season are required' });
    return;
  }
  const followKey = `apisports-league-${leagueId}`;
  const out = await servePoll(
    triggerOf(req.get(TRIGGER_HEADER)),
    {
      source: 'apisports',
      sport: 'soccer',
      competitionId: followKey,
      pollPath: `pollLeague?leagueId=${leagueId}&season=${season}`,
      seasonRequested: String(season),
    },
    async (trace) => {
      trace.seasonsTried.push(String(season));
      const r = await fetchLeagueSeasonFixtures(requireKey(), leagueId, season);
      return { ...r, followKey, seasonResolved: String(season) };
    },
  );
  res.status(out.status).json(out.body);
});

// Competition logos, cached per warm instance. ONE TSDB call for the
// whole sport (search_all_leagues.php?s=Soccer returns 670 leagues,
// every one carrying strBadge — measured 2026-08-04); the per-league
// lookup route 404s on the premium v1 path, like lookup_all_teams.
// Best-effort by construction: the league list must never depend on
// artwork resolving.
let soccerBadgeCache: { at: number; art: TsdbLeagueArt } | null = null;
const EMPTY_ART: TsdbLeagueArt = {
  byId: new Map(),
  byCountryName: new Map(),
  namesByCountry: new Map(),
};
async function soccerLeagueBadges(): Promise<TsdbLeagueArt> {
  if (soccerBadgeCache && Date.now() - soccerBadgeCache.at < 6 * 3_600_000) {
    return soccerBadgeCache.art;
  }
  const key = optionalTsdbKey();
  if (!key) return EMPTY_ART;
  const art = await fetchTsdbLeagueBadges(key, 'Soccer', normaliseName);
  soccerBadgeCache = { at: Date.now(), art };
  return art;
}

export const listLeagues = onRequest(gz(async (_req, res) => {
  try {
    const seasons = await loadFdSeasons(db, requireFdKey());
    const leagues = listSoccerLeagues(seasons);
    // Live before dormant, priority within (Prompt 11b) — a cup whose
    // season has not populated yet must not lead the list. Ordering
    // degradation on a failed load is priority-only, never an error.
    const data = await loadPriorityData().catch(() => ({
      map: {} as Record<string, number>,
      sportWeights: {},
      dormant: [] as string[],
      imageryOff: [] as string[],
    }));
    const dormantSet = new Set(data.dormant);
    leagues.sort(
      (a, b) =>
        (dormantSet.has(a.key) ? 1 : 0) - (dormantSet.has(b.key) ? 1 : 0) ||
        (data.map[b.key] ?? 0) - (data.map[a.key] ?? 0),
    );
    // Competition logos (Prompt 13, restored) — best-effort: a badge
    // lookup failure must never cost the league list itself.
    const art = await soccerLeagueBadges().catch(() => EMPTY_ART);
    const off = await loadImageryOff();
    // Squad sizes for the card subtitles (27C) — decorative, so the
    // helper degrades to "no count" rather than failing the list.
    const counts = await teamCountsByDoc(
      db,
      leagues
        .map(soccerRowDocId)
        .filter((id): id is string => id !== undefined),
    );
    res.json({
      leagues: leagues.map((l) => {
        const badge = leagueBadgeFor(
          art,
          { id: String(l.id), name: l.name, country: l.country },
          normaliseName,
        );
        const docId = soccerRowDocId(l);
        const teamCount = docId !== undefined ? counts.get(docId) : undefined;
        const withBadge: typeof l & { crestUrl?: string; teamCount?: number } =
          {
            ...l,
            ...(badge ? { crestUrl: badge } : {}),
            ...(teamCount !== undefined ? { teamCount } : {}),
          };
        return withImageryPolicy(withBadge, l.key, off);
      }),
    });
  } catch (e) {
    // An empty league list would read as "soccer has no competitions".
    // Fail loudly instead so the client shows an error it can retry.
    res.status(502).json({ error: String(e) });
  }
}));

// Federated search across everything followable (cached directories +
// live TSDB filtered to served leagues, plus the athlete directory the
// appearance ingest maintains).
export const searchEntities = onRequest(gz(async (req, res) => {
  try {
    const q = String(req.query.q ?? '').trim();
    if (q.length < 2) {
      res.json({ teams: [], athletes: [] });
      return;
    }
    const store = getFirestore();
    res.json({
      teams: await searchTeams(store, requireTsdbKey(), q),
      athletes: await searchAthletes(store, q),
    });
  } catch (e) {
    res.status(502).json({ error: String(e) });
  }
}));

// Tennis tournaments as followable competitions (Prompt 9): one row
// per canonical tournament — a joint ATP+WTA event is ONE row carrying
// both draws — dated by its soonest upcoming edition. Read from the
// fixtures the tour polls already maintain; cached per instance
// because browse is a per-open path.
const TOURNAMENT_CACHE_MS = 60_000;
let tournamentCache: { at: number; body: unknown } | null = null;

// Browse/search ordering weights from the catalogue collection —
// priority is ops-tunable data, not code (Prompt 11). Cached briefly;
// a read failure serves an empty map (ordering degrades to the
// existing date/config order, which is a rendering preference, not a
// data truth — the one place ?? {} is honest).
let priorityCache: {
  at: number;
  map: Record<string, number>;
  sportWeights: Record<string, number>;
  dormant: string[];
  imageryOff: string[];
  byRegion: Record<string, Record<string, number>>;
} | null = null;

// FAIL CLOSED. A sentinel set that reports EVERY key as suppressed, so
// a catalogue read failure removes switchable artwork rather than
// restoring artwork somebody may have asked us to take down. The
// standing invariant says a read failure must never look like an empty
// result; for a legal control the safe direction is "everything off",
// not "nothing suppressed".
const SUPPRESS_ALL: ReadonlySet<string> = {
  has: () => true,
  size: Number.POSITIVE_INFINITY,
} as unknown as ReadonlySet<string>;
// In-flight dedup: a cold cache under concurrent callers must fire the
// ~67 dormancy counts once, not once per caller (review round).
let priorityInflight: Promise<{
  map: Record<string, number>;
  sportWeights: Record<string, number>;
  dormant: string[];
  imageryOff: string[];
  byRegion: Record<string, Record<string, number>>;
}> | null = null;

async function loadPriorityData(): Promise<{
  map: Record<string, number>;
  sportWeights: Record<string, number>;
  dormant: string[];
  imageryOff: string[];
  byRegion: Record<string, Record<string, number>>;
}> {
  if (priorityCache && Date.now() - priorityCache.at < 300_000) {
    return priorityCache;
  }
  if (priorityInflight) return priorityInflight;
  priorityInflight = loadPriorityDataUncached().finally(() => {
    priorityInflight = null;
  });
  return priorityInflight;
}

async function loadPriorityDataUncached(): Promise<{
  map: Record<string, number>;
  sportWeights: Record<string, number>;
  dormant: string[];
  imageryOff: string[];
  byRegion: Record<string, Record<string, number>>;
}> {
  const snap = await db.collection('catalogue').get();
  const entries = snap.docs.map((d) => d.data() as CatalogueEntry);
  const map: Record<string, number> = {};
  // The takedown switch (Prompt 13). Rides the catalogue cache that
  // already exists, so suppressing a rights holder's artwork costs one
  // console edit and takes effect within the 5-minute cache window —
  // no deploy. Only an EXPLICIT false suppresses: a missing field is
  // not a takedown.
  const imageryOff = entries
    .filter((e) => e.imagery === false && typeof e.competitionId === 'string')
    .map((e) => e.competitionId);
  // The regional overlay, inverted to region → key → weight so a
  // request applies one lookup rather than scanning every entry.
  const byRegion: Record<string, Record<string, number>> = {};
  for (const e of entries) {
    if (!e.competitionId || !e.priorityByRegion) continue;
    for (const [region, weight] of Object.entries(e.priorityByRegion)) {
      if (typeof weight !== 'number') continue;
      (byRegion[region] ??= {})[e.competitionId] = weight;
    }
  }
  for (const e of entries) {
    if (e.competitionId && typeof e.priority === 'number') {
      map[e.competitionId] = e.priority;
    }
  }
  // DORMANCY (Prompt 11b): a competition with zero future fixtures must
  // not top its sport's list — the World Cup at priority 100 leading
  // soccer into an empty screen is the exact failure the catalogue
  // exists to prevent. Aggregate counts on the same composite index the
  // client fixture query uses, cached WITH the map — the sort itself
  // never reads fixture state per request. A count failure degrades to
  // LIVE, never to dormant: a read failure must not be read as "no
  // fixtures" (the standing invariant, applied to ordering).
  const nowIso = new Date().toISOString();
  const nowMs = Date.parse(nowIso);
  // The client query's own lookback (MAX_FIXTURE_DURATION_HOURS, 3
  // weeks): a live multi-day event's start can be this far behind its
  // end. Kept in sync by hand, like the Fixture model itself.
  const lookbackIso = new Date(nowMs - 21 * 24 * 3_600_000).toISOString();
  const browseKeys = entries
    .map((e) => e.competitionId)
    .filter((k): k is string => typeof k === 'string' && !k.startsWith('sport:'));
  const dormant: string[] = [];
  await Promise.all(
    browseKeys.map(async (k) => {
      try {
        const c = await db
          .collection('fixtures')
          .where('followKeys', 'array-contains', k)
          .where('startUtc', '>', nowIso)
          .count()
          .get();
        if (c.data().count > 0) return; // future starts ⇒ live, cheap path
        // Zero FUTURE STARTS is not zero live events — a slam
        // mid-fortnight and a 4-day County match have past starts and
        // future ENDS, and the horizon rule says upcoming means NOT
        // YET FINISHED. Check the lookback window's ends before
        // calling a key dormant; for genuinely dormant keys this
        // fetch is a handful of finished docs.
        const recent = await db
          .collection('fixtures')
          .where('followKeys', 'array-contains', k)
          .where('startUtc', '>', lookbackIso)
          .get();
        const anyLive = recent.docs.some(
          (d) => appearanceEndMs(d.data() as Fixture) > nowMs,
        );
        if (!anyLive) dormant.push(k);
      } catch (e) {
        // A read failure must not be read as "no fixtures": the key
        // stays live (standing invariant, applied to ordering).
        console.error(`[kickoffcal] dormancy count failed for ${k}: ${String(e)}`);
      }
    }),
  );
  dormant.sort();
  priorityCache = {
    at: Date.now(),
    map,
    sportWeights: sportWeightsOf(entries),
    dormant,
    imageryOff,
    byRegion,
  };
  return priorityCache;
}

async function loadPriorities(): Promise<Record<string, number>> {
  return (await loadPriorityData()).map;
}

// The set the imagery policy tests against. A catalogue read failure
// must NOT silently re-enable artwork somebody asked us to take down —
// it fails CLOSED, suppressing everything switchable, which is the
// conservative direction for a legal control.
async function loadImageryOff(): Promise<ReadonlySet<string>> {
  try {
    return new Set((await loadPriorityData()).imageryOff);
  } catch (e) {
    console.error(
      `[kickoffcal-alert] imagery_policy_unreadable: ${String(e)} — suppressing all switchable imagery`,
    );
    return SUPPRESS_ALL;
  }
}

// Sport weights AFTER the regional overlay. `sportWeightsOf` derives
// them from catalogue entries; once a region has rewritten some
// `sport:<key>` weights we re-read them from the overlaid map, falling
// back to the default for every sport the region did not mention.
function sportWeightsOf2(
  overlaid: Record<string, number>,
  base: Record<string, number>,
): Record<string, number> {
  const out = { ...base };
  for (const [key, weight] of Object.entries(overlaid)) {
    if (key.startsWith('sport:')) out[key.slice('sport:'.length)] = weight;
  }
  return out;
}

// Competition logos for the client's STATIC competitions, cached in
// Firestore for a day. It rides listPriorities because that is already
// the browse-metadata payload the client fetches once a session and
// caches for an hour — a second endpoint and a second cache would buy
// nothing. ARTWORK IS DECORATIVE: every failure path here returns an
// empty map rather than an error, because a missing logo falls back to
// the generated treatment and a broken browse screen does not.
const ART_DOC = 'directoryArt/competitions';

// Mark-tile prep (Round 6): flagged marks get a trimmed copy in the
// marks bucket and/or a per-mark tile fill; UNFLAGGED marks are
// untouched, byte-identical — their entry records only the measured
// source so the next rebuild can skip re-measuring it. Bump the epoch
// to force one full re-prep after a rules change.
// Epoch 3: coverage bar 0.5 → 0.55 (owner's eye beat the knife-edge:
// Wimbledon passed at exactly 0.5 and read muddy on device; six marks
// flip, all onto defensible plates). Epoch 2 was the re-prep after the
// runtime SA gained objectAdmin on the marks bucket (epoch-1 uploads
// 403'd and stored bare passthroughs).
const MARK_TILES_EPOCH = 4;
const MARKS_BUCKET = 'gameday-fixtures-marks';

interface MarkTileEntry {
  src: string; // the source URL this measurement belongs to
  url?: string; // trimmed asset, when the fill-ratio rule fired
  fill?: string; // tileFill, from background adoption or contrast pick
}

interface CompetitionArtDoc {
  art: Record<string, string>;
  // key → the badge's dominant colour pair (Round 3): the follow
  // burst's discrete palette, extracted once per rebuild so the client
  // never decodes an image.
  colours: Record<string, string[]>;
  tiles: Record<string, MarkTileEntry>;
}

// ONE fetch per mark serves colours AND tile prep — the rebuild
// already ran ~88 serial downloads inside a request, and a second
// pass per mark would flirt with the function deadline on the
// epoch-forced rebuild. Colour extraction here is byte-identical to
// extractCrestColours (same PNG-only gate, same 4096-sample stride,
// same dominantPair), so unflagged marks' colours cannot drift.
const COLOUR_SAMPLES = 4096;

function coloursFromGrid(g: Parameters<typeof assessMark>[0]) {
  const total = g.width * g.height;
  const stride = Math.max(1, Math.floor(total / COLOUR_SAMPLES));
  const pixels = [];
  for (let i = 0; i < total; i += stride) {
    const o = i * 4;
    pixels.push({
      r: g.data[o],
      g: g.data[o + 1],
      b: g.data[o + 2],
      a: g.data[o + 3],
    });
  }
  return dominantPair(pixels);
}

// Measure one mark and apply the three rules (trim → adopt → contrast;
// see markTiles.ts). Every failure path returns a measured-passthrough
// entry or throws to the caller's warn — a bad mark costs its prep,
// never the art map.
async function prepareMark(
  key: string,
  url: string,
): Promise<{ entry: MarkTileEntry; pair: string[] | null }> {
  const res = await fetch(url);
  if (!res.ok) return { entry: { src: url }, pair: null };
  const buf = Buffer.from(await res.arrayBuffer());
  const grid = gridFromImageBuffer(buf);
  if (!grid) return { entry: { src: url }, pair: null };
  // PNG-only, exactly as extractCrestColours: a JPEG mark has never
  // had burst colours, and this refactor must not change that.
  const isPng = buf.length > 8 && buf[0] === 0x89 && buf[1] === 0x50;
  const pair = isPng ? coloursFromGrid(grid) : null;
  const a = assessMark(grid);
  const plan = markTilePlan(a);
  const entry: MarkTileEntry = { src: url };
  if (plan.tileFill) entry.fill = plan.tileFill;
  if (plan.trim && a.bounds) {
    // The upload fails ALONE: a storage blip must not also cost the
    // fill this mark was assessed to need (the epoch-1 403s did
    // exactly that — the whole entry collapsed to a passthrough).
    try {
      const png = pngBufferOf(
        composeTrimmed(grid, trimBox(a.bounds), a.bakedBg),
      );
      const path = `tiles/${key}.png`;
      const file = getStorage().bucket(MARKS_BUCKET).file(path);
      await file.save(png, {
        contentType: 'image/png',
        metadata: { cacheControl: 'public,max-age=604800' },
      });
      // Per-object ACL, same as the curated importer — the bucket is
      // not uniformly public.
      await file.makePublic();
      entry.url = `https://storage.googleapis.com/${MARKS_BUCKET}/${path}`;
    } catch (e) {
      console.warn(`[kickoffcal] mark tile upload failed for ${key}: ${e}`);
    }
  }
  return { entry, pair };
}

async function competitionArt(): Promise<CompetitionArtDoc> {
  const ref = db.doc(ART_DOC);
  const snap = await ref.get();
  const data = snap.exists
    ? (snap.data() as Partial<CompetitionArtDoc> & {
        cachedAt?: string;
        tilesEpoch?: number;
      })
    : undefined;
  const cached: CompetitionArtDoc = {
    art: data?.art ?? {},
    colours: data?.colours ?? {},
    tiles: data?.tiles ?? {},
  };
  // A cache from before the current tile-prep rules is stale by
  // definition — the epoch bump is how a deploy forces exactly one
  // re-prep without touching the stored doc.
  if (
    data?.art &&
    artIsFresh(data.cachedAt, Date.now()) &&
    data.tilesEpoch === MARK_TILES_EPOCH
  ) {
    return cached;
  }

  const key = optionalTsdbKey();
  if (!key) return cached;
  const catalogue = await db.collection('catalogue').get();
  const served = tsdbLeagueIdsFrom(
    catalogue.docs.map((d) => (d.data() as CatalogueEntry).competitionId),
  );
  const byId = new Map<string, string>();
  for (const sport of TSDB_ART_SPORTS) {
    try {
      const art = await fetchTsdbLeagueBadges(key, sport, normaliseName);
      for (const [id, url] of art.byId) if (!byId.has(id)) byId.set(id, url);
    } catch (e) {
      // One sport failing must not cost the other nine.
      console.warn(`[kickoffcal] competition art: ${sport} failed: ${e}`);
    }
  }
  const art = narrowToServed(byId, served);
  // Alias marks (Round 2 item 4): competitions served by non-TSDB
  // routes, keyed by FOLLOW KEY so the client's row-key lookup lands.
  for (const [key, id] of Object.entries(COMPETITION_ART_ALIASES)) {
    const url = byId.get(id);
    if (url) art[key] = url;
  }
  // CURATED marks (owner ruling 2026-08-30, broadened): official
  // competition/tournament marks imported where a provider serves
  // none — self-hosted in our storage, written to directoryArt/curated
  // by scripts/import-curated-marks.mjs (owner-run). They FILL GAPS
  // ONLY: a provider badge always wins, and the Olympic statute is
  // enforced here as well as at import (imagery.ts remains the serve-
  // time net). Burst colours ride the shared loop below like any mark.
  let merged = art;
  try {
    const curatedSnap = await db.doc('directoryArt/curated').get();
    merged = mergeCuratedMarks(
      art,
      (curatedSnap.data()?.marks ?? {}) as Record<string, { url?: string }>,
    );
  } catch (e) {
    // Decorative layer: a failed curated read costs marks, never art.
    console.warn(`[kickoffcal] curated marks unavailable: ${e}`);
  }
  // Never overwrite a populated cache with nothing: a bad TSDB day
  // would otherwise strip every logo for the next 24 hours.
  if (Object.keys(merged).length === 0) return cached;
  // Dominant colour pairs per badge (Round 3; curated marks ride the
  // same loop by ruling) + mark-tile prep (Round 6) — ONE fetch per
  // mark serves both, once per rebuild. A mark whose source URL is
  // unchanged reuses its measured tile entry AND its colours verbatim
  // (a provider swapping bytes under a fixed URL would be missed until
  // the URL moves — accepted; TSDB badge URLs are content-stable and
  // the halved rebuild keeps the epoch re-prep inside the deadline).
  const colours: Record<string, string[]> = {};
  const prevTiles =
    data?.tilesEpoch === MARK_TILES_EPOCH ? (data.tiles ?? {}) : {};
  const tiles: Record<string, MarkTileEntry> = {};
  for (const [artKey, url] of Object.entries(merged)) {
    try {
      const prev = prevTiles[artKey];
      if (prev?.src === url) {
        tiles[artKey] = prev;
        const prevPair = data?.colours?.[artKey];
        if (prevPair) colours[artKey] = prevPair;
        continue;
      }
      const { entry, pair } = await prepareMark(artKey, url);
      tiles[artKey] = entry;
      if (pair) colours[artKey] = pair;
    } catch (e) {
      // Decorative: a failed prep serves the original mark.
      console.warn(`[kickoffcal] mark tile prep failed for ${artKey}: ${e}`);
      tiles[artKey] = { src: url };
    }
  }
  await ref.set({
    art: merged,
    colours,
    tiles,
    tilesEpoch: MARK_TILES_EPOCH,
    cachedAt: new Date().toISOString(),
  });
  return { art: merged, colours, tiles };
}

export const listPriorities = onRequest(gz(async (req, res) => {
  try {
    const { map, sportWeights, dormant, byRegion } = await loadPriorityData();
    // REGIONAL OVERLAY (Prompt 15). A sparse per-region layer over the
    // default weights: a region names only what it reorders, everything
    // else keeps its default. An unknown region is not an error and not
    // an empty ranking — it is simply the default, which is the whole
    // reason most of the world needs no region entry at all.
    const region = String(req.query.region ?? '').trim();
    const overlay = region ? (byRegion[region] ?? {}) : {};
    const regionalMap = Object.keys(overlay).length
      ? { ...map, ...overlay }
      : map;
    // Artwork is best-effort and policy-filtered: the takedown switch
    // and the Olympic exclusion both apply here exactly as they do to
    // the served league rows.
    const off = await loadImageryOff();
    const raw = await competitionArt().catch(
      () => ({ art: {}, colours: {}, tiles: {} }) as CompetitionArtDoc,
    );
    const competitionArtOut: Record<string, string> = {};
    const competitionArtColours: Record<string, string[]> = {};
    const competitionArtTileFills: Record<string, string> = {};
    for (const [id, url] of Object.entries(raw.art)) {
      // Numeric keys are TSDB league ids; alias keys ARE the
      // competition key, and the kill-switch must see the real one.
      const compKey = /^\d+$/.test(id) ? `tsdb-league-${id}` : id;
      if (!imageryAllowed(compKey, off)) continue;
      // The trimmed copy IS the served mark where one exists (Round 6
      // tile prep); unflagged marks serve their original URL untouched.
      const tile = raw.tiles[id];
      competitionArtOut[id] = tile?.url ?? url;
      // Derived from the badge, so the same policy governs it.
      const pair = raw.colours[id];
      if (pair) competitionArtColours[id] = pair;
      if (tile?.fill) competitionArtTileFills[id] = tile.fill;
    }
    // Sport-generic photo pools (owner ruling 2026-08-30): curated
    // Commons shots for the rung between venue resolution and the
    // treatment floor. Decorative — a missing doc serves no pools and
    // the client's rung simply never fires.
    let photoPools: Record<string, unknown> = {};
    try {
      const poolsSnap = await db.doc('directoryArt/photoPools').get();
      const pools = poolsSnap.data()?.pools;
      if (pools && typeof pools === 'object') photoPools = pools;
    } catch (e) {
      console.warn(`[kickoffcal] photo pools unavailable: ${e}`);
    }
    res.json({
      priorities: regionalMap,
      // Sport-row weights ride the same overlay: the `sport:<key>` rows
      // are ordinary catalogue entries, so a region reorders SPORTS by
      // giving those rows a regional weight — which is what "cricket
      // leads in South Asia" actually is.
      sportWeights: sportWeightsOf2(regionalMap, sportWeights),
      dormant,
      photoPools,
      competitionArt: competitionArtOut,
      competitionArtColours,
      // Per-mark tile fill (Round 6): background adoption or the
      // contrast-picked neutral. The client paints, never computes.
      competitionArtTileFills,
      // Squad sizes for the STATIC competition rows' card subtitles
      // (27C), keyed by row key — those rows never touch listLeagues,
      // and this is already the browse-metadata payload (see
      // competitionArt above). Decorative: failure degrades to {}.
      teamCounts: await staticTeamCounts(db).catch(
        () => ({}) as Record<string, number>,
      ),
      // Echoed so the client can prove which overlay it got rather
      // than assume: an unrecognised region silently serving defaults
      // is exactly the shape that hides a typo for weeks.
      region: region || 'default',
      regionApplied: Object.keys(overlay).length > 0,
    });
  } catch (e) {
    res.status(502).json({ error: String(e) });
  }
}));

export const listTournaments = onRequest(gz(async (_req, res) => {
  try {
    if (tournamentCache && Date.now() - tournamentCache.at < TOURNAMENT_CACHE_MS) {
      res.json(tournamentCache.body);
      return;
    }
    const nowIso = new Date().toISOString();
    const [atp, wta] = await Promise.all([
      db.collection('fixtures').where('competitionId', '==', 'tennis-atp').get(),
      db.collection('fixtures').where('competitionId', '==', 'tennis-wta').get(),
    ]);
    const parents = [...atp.docs, ...wta.docs].map((d) => {
      const f = d.data() as Fixture;
      return {
        competitionId: f.competitionId,
        title: f.title,
        startUtc: f.startUtc,
        ...(f.durationHours !== undefined
          ? { durationHours: f.durationHours }
          : {}),
        status: f.status,
      };
    });
    const rows = shapeTournamentRows(parents, nowIso);
    // Priority first (slams above 250s), soonest-start as the tiebreak
    // the shaper already provides.
    const pr = await loadPriorities().catch(() => ({} as Record<string, number>));
    rows.sort((a, b) => (pr[b.key] ?? 0) - (pr[a.key] ?? 0) || a.startUtc.localeCompare(b.startUtc));
    const body = { tournaments: rows };
    tournamentCache = { at: Date.now(), body };
    res.json(body);
  } catch (e) {
    // An empty tournament list would read as "tennis has no events".
    res.status(502).json({ error: String(e) });
  }
}));

// Individual-sport browse: curated entry points from the canonical
// directory — champions and rated fighters by weight class, tennis by
// ranking, the F1 grid — plus the "competing soon" row. Search-first is
// the client's job; this is what keeps the screen from ever being empty.
export const listAthletes = onRequest(gz(async (req, res) => {
  try {
    const sport = String(req.query.sport ?? '');
    if (!sport) {
      res.status(400).json({ error: 'sport is required' });
      return;
    }
    // Round 6 item 5: the MMA fighter directory is DERIVED from the cards
    // we hold (no body publishes a roster) — see mmaFighters.ts.
    if (sport === MMA_SPORT) {
      const snap = await db.collection('fixtures').where('sport', '==', MMA_SPORT).get();
      const cards = snap.docs.map((d) => d.data() as Fixture);
      const pollPathOf = (f: { competitionId: string }) =>
        CATALOGUE_SEED.find((e) => e.competitionId === f.competitionId)?.pollPath;
      res.json(deriveMmaBrowse(cards, new Date().toISOString(), pollPathOf, accentHueOf));
      return;
    }
    // Round 6 item 7: the Motorsport tile's Drivers row is Formula 1's
    // directory — one directory, two doors.
    const directorySport = sport === 'motorsport' ? 'f1' : sport;
    const athletes = await loadAthletes(db);
    res.json(shapeAthleteBrowse(athletes, directorySport, new Date().toISOString()));
  } catch (e) {
    // An empty athlete list would read as "this sport has nobody".
    // Fail loudly instead so the client shows an error it can retry.
    res.status(502).json({ error: String(e) });
  }
}));

export const listTeams = onRequest(gz(async (req, res) => {
  try {
    const sport = String(req.query.sport ?? 'soccer');
    // Generic TSDB team-league branch: any league in the shared table
    // serves a team directory — rugby, WNBA, KHL, NPB, internationals —
    // the same way NBA/NFL/IPL always did (verified live: every entry
    // returns a full badge-complete team list).
    const off = await loadImageryOff();
    const leagueKey = String(req.query.leagueId ?? '');
    const policed = <T extends { crestUrl?: string }>(teams: T[]): T[] =>
      teams.map((t) => withImageryPolicy(t, leagueKey, off));
    const tsdbLeague = TSDB_TEAM_LEAGUES[leagueKey];
    if (tsdbLeague) {
      const provided = await listTsdbTeams(
        requireTsdbKey(),
        tsdbLeague.tsdbName,
        tsdbLeague.cacheKey,
      );
      // Directory emptiness is MEASURED, not hardcoded (owner ruling
      // 2026-08-28): a provider list that comes back empty falls
      // through to what the fixtures prove.
      const teams =
        provided.length > 0
          ? provided
          : await derivedLeagueTeams(`tsdb-league-${leagueKey}`, optionalTsdbKey());
      res.json({ teams: policed(teams) });
      return;
    }
    // Fixture-derived leagues (owner ruling 2026-08-28) — checked
    // BEFORE the legacy per-sport branches, which would otherwise
    // swallow these ids and serve the wrong league entirely (cricket's
    // fallback is the IPL list, basketball's the NBA).
    if (DERIVED_TEAM_LEAGUE_IDS.has(leagueKey)) {
      res.json({
        teams: policed(
          await derivedLeagueTeams(`tsdb-league-${leagueKey}`, optionalTsdbKey()),
        ),
      });
      return;
    }
    if (sport === 'baseball') {
      const season = Number(req.query.season ?? new Date().getFullYear());
      res.json({
        teams: policed(await listMlbTeams(season, optionalTsdbKey())),
      });
      return;
    }
    if (sport === 'ice-hockey') {
      res.json({ teams: policed(await listNhlTeams(optionalTsdbKey())) });
      return;
    }
    if (sport === 'basketball') {
      res.json({
        teams: await listTsdbTeams(requireTsdbKey(), 'NBA', 'basketball-nba'),
      });
      return;
    }
    if (sport === 'nfl') {
      res.json({
        teams: await listTsdbTeams(requireTsdbKey(), 'NFL', 'nfl-nfl'),
      });
      return;
    }
    if (sport === 'cricket') {
      res.json({
        teams: await listTsdbTeams(
          requireTsdbKey(),
          'Indian Premier League',
          'cricket-ipl',
        ),
      });
      return;
    }
    // Soccer has two directory sources. A NUMERIC leagueId is a
    // TheSportsDB league (League One, League Two, the Scottish
    // Premiership — the ones football-data's free tier cannot reach);
    // anything else is a football-data competition code (PL, CL, …).
    const rawId = String(req.query.leagueId ?? '');
    if (/^\d{3,6}$/.test(rawId)) {
      const league = TSDB_TEAM_LEAGUES[rawId];
      if (!league) {
        res.status(404).json({ error: `no team directory for ${rawId}` });
        return;
      }
      res.json({
        teams: await listTsdbTeams(
          requireTsdbKey(),
          league.tsdbName,
          league.cacheKey,
        ),
      });
      return;
    }
    const code = rawId;
    if (!/^[A-Z0-9]{2,4}$/.test(code)) {
      res.status(400).json({ error: 'leagueId (competition code) is required' });
      return;
    }
    const seasons = await loadFdSeasons(db, requireFdKey());
    const season = seasons.get(code)?.seasonYear;
    if (season === undefined) {
      res.status(404).json({ error: `no current season for ${code}` });
      return;
    }
    res.json({ teams: await listFdSoccerTeams(requireFdKey(), code, season) });
  } catch (e) {
    res.status(502).json({ error: String(e) });
  }
}));

// Badge enrichment is best-effort — a missing TSDB key must not take
// the official-team directory down with it.
function optionalTsdbKey(): string | undefined {
  return process.env.TSDB_KEY || undefined;
}

function requireFdKey(): string {
  const apiKey = process.env.FOOTBALLDATA_KEY;
  if (!apiKey) throw new Error('FOOTBALLDATA_KEY not configured');
  return apiKey;
}

export const pollFdTeam = onRequest(async (req, res) => {
  const teamId = Number(req.query.teamId);
  const season = Number(req.query.season);
  if (!Number.isInteger(teamId) || !Number.isInteger(season)) {
    res.status(400).json({ error: 'teamId and season are required' });
    return;
  }
  const followKey = `fdorg-team-${teamId}`;
  const out = await servePoll(
    triggerOf(req.get(TRIGGER_HEADER)),
    {
      source: 'fdorg',
      sport: 'soccer',
      competitionId: followKey,
      pollPath: `pollFdTeam?teamId=${teamId}&season=${season}`,
      seasonRequested: String(season),
    },
    async (trace) => {
      // Verified live: /teams/{id}/matches with NO season returns the
      // team's current season across every competition the plan can see.
      // A team spans competitions with different seasons, so there is no
      // single correct value to pass — omitting it is the correct call.
      trace.seasonsTried.push('current');
      const r = await fetchFdTeamSeasonFixtures(requireFdKey(), teamId);
      return { ...r, followKey, seasonResolved: 'current', sliceComplete: true };
    },
  );
  res.status(out.status).json(out.body);
});

export const pollFdCompetition = onRequest(async (req, res) => {
  const code = String(req.query.code ?? '');
  const season = Number(req.query.season);
  if (!/^[A-Z0-9]{2,4}$/.test(code) || !Number.isInteger(season)) {
    res.status(400).json({ error: 'code and season are required' });
    return;
  }
  const followKey = `fdorg-comp-${code}`;
  const out = await servePoll(
    triggerOf(req.get(TRIGGER_HEADER)),
    {
      source: 'fdorg',
      sport: 'soccer',
      competitionId: followKey,
      pollPath: `pollFdCompetition?code=${code}&season=${season}`,
      seasonRequested: String(season),
    },
    async (trace) => {
      // The season on the path is a HINT. Follows persist their pollPath
      // at follow time, and one global constant was wrong for CL (2025)
      // and EC (2024) from the day it was written — so the provider's own
      // currentSeason wins, which also self-heals every stored follow.
      const seasons = await loadFdSeasons(db, requireFdKey());
      const resolved = seasons.get(code)?.seasonYear;
      if (resolved === undefined) {
        // Resolvable means "has a current season that has not ended".
        // Nothing to poll, nothing wrong — say so rather than 404-ing.
        trace.seasonsTried.push(String(season));
        return {
          rawCount: 0,
          fixtures: [],
          followKey,
          seasonResolved: null,
          reason: 'no_future_events' as const,
          body: { season: null, reason: 'no_future_events' },
        };
      }
      const attempt = async (season: number) => {
        trace.seasonsTried.push(String(season));
        const r = await fetchFdCompetitionSeasonFixtures(
          requireFdKey(),
          code,
          season,
        );
        return {
          ...r,
          followKey,
          seasonResolved: String(season),
          sliceComplete: true,
          body: { season },
        };
      };
      try {
        return await attempt(resolved);
      } catch (e) {
        // A 404 on the resolved season is the season-flip window (the
        // CL draw week): the cached season doc is a day stale. Mark it
        // stale and retry once, ONLY with a season a fresh resolution
        // actually changed to. Any other failure — and a 404 that a
        // refetch does not explain — stays a loud error: a read failure
        // must never look like an empty fixture list.
        if (httpStatusFromError(e) !== 404) throw e;
        const refreshed = await reresolveAfter404(
          db,
          requireFdKey(),
          code,
          resolved,
        );
        if (refreshed === undefined) throw e;
        return await attempt(refreshed);
      }
    },
  );
  res.status(out.status).json(out.body);
});

function requireTsdbKey(): string {
  const apiKey = process.env.TSDB_KEY;
  if (!apiKey) throw new Error('TSDB_KEY not configured');
  return apiKey;
}

export const pollTsdbLeague = onRequest(async (req, res) => {
  const leagueId = String(req.query.leagueId ?? '');
  const hint = String(req.query.season ?? '') || undefined;
  const sport = String(req.query.sport ?? '');
  const durationHours = Number(req.query.durationHours ?? 2);
  if (!/^\d{3,6}$/.test(leagueId) || !sport) {
    res.status(400).json({ error: 'leagueId and sport are required' });
    return;
  }
  const followKey = `tsdb-league-${leagueId}`;
  const out = await servePoll(
    triggerOf(req.get(TRIGGER_HEADER)),
    {
      source: 'tsdb',
      sport,
      competitionId: followKey,
      pollPath: `pollTsdbLeague?leagueId=${leagueId}&season=${hint ?? ''}&sport=${sport}&durationHours=${durationHours}`,
      seasonRequested: hint ?? null,
    },
    async (trace) => {
      // The season on the path is only a HINT. Follows persist their
      // pollPath at follow time, so a season baked in last year would
      // otherwise poll a finished season forever. We try the hint plus
      // the seasons the calendar says are live, and keep whichever
      // actually has upcoming fixtures — self-healing across a rollover.
      const attempts: Array<{
        season: string;
        fixtures: Fixture[];
        rawCount: number;
      }> = [];
      for (const season of seasonsToTry(hint)) {
        trace.seasonsTried.push(season);
        const r = await fetchTsdbLeagueSeasonFixtures(
          requireTsdbKey(),
          leagueId,
          season,
          sport,
          durationHours,
        );
        attempts.push({ season, fixtures: r.fixtures, rawCount: r.rawCount });
        // Stop early when the hint already has a live season's worth.
        if (r.fixtures.some((f) => f.startUtc >= new Date().toISOString())) {
          break;
        }
      }
      const best = bestSeason(attempts);
      const chosen = best
        ? attempts.find((a) => a.season === best.season)
        : undefined;
      // bestSeason never selects a season with zero upcoming events, so a
      // null here means every candidate is finished. Ingest NOTHING — a
      // dead season fills the cache with events the horizon rule will
      // never write, and gives Stage 4's reaper a stale truth to
      // reconcile a live slice against. Recorded as a real run with a
      // reason rather than an error: the provider answered honestly.
      const chosenFixtures = chosen?.fixtures ?? [];
      // Combat leagues: the headline bout parsed from each card title
      // becomes an appearance (deriveBoutAppearances is a no-op for
      // sports whose titles do not name people). TheSportsDB publishes
      // no bout structure, so the headline is all a card here can give.
      // Only cards from the last week forward — a season poll carries
      // its finished cards too, and a finished bout needs no appearance
      // doc (the same 7-day lookback the PBC window uses).
      const nowIso = new Date().toISOString();
      const appearanceFrom = new Date(Date.now() - 7 * 86_400_000)
        .toISOString();
      const derived = deriveBoutAppearances(
        chosenFixtures.filter((f) => f.startUtc >= appearanceFrom),
        nowIso,
      );
      return {
        rawCount: chosen?.rawCount ?? 0,
        fixtures: chosenFixtures,
        followKey,
        seasonResolved: best?.season ?? null,
        ...(best ? {} : { reason: 'no_future_events' as const }),
        // Combat sports ALWAYS carry the appearance slice, zero yield
        // included — a run that parsed nothing must be recorded as such,
        // or the funnel goes dark exactly when the parse dies.
        ...(namesPeople(sport)
          ? {
              appearances: {
                followKey: appearanceSliceKey(followKey),
                // Funnel stage A for this slice: cards inside the
                // derivation window, before the parse and name gates.
                rawCount: chosenFixtures.filter(
                  (f) => f.startUtc >= appearanceFrom,
                ).length,
                drafts: derived,
                // TITLE-PARSED names never create directory athletes
                // (F31's fix): they resolve against the directory —
                // certain never (no ids), confident when the full name
                // is unique — or stay display-only.
                create: 'never' as const,
              },
            }
          : {}),
        body: {
          season: best?.season ?? null,
          triedSeasons: attempts.map((a) => a.season),
          ...(best ? {} : { reason: 'no_future_events' }),
        },
      };
    },
  );
  res.status(out.status).json(out.body);
});

export const pollMlbTeam = onRequest(async (req, res) => {
  const teamId = Number(req.query.teamId);
  const season = Number(req.query.season);
  if (!Number.isInteger(teamId) || !Number.isInteger(season)) {
    res.status(400).json({ error: 'teamId and season are required' });
    return;
  }
  const followKey = `mlb-team-${teamId}`;
  const out = await servePoll(
    triggerOf(req.get(TRIGGER_HEADER)),
    {
      source: 'mlb',
      sport: 'baseball',
      competitionId: followKey,
      pollPath: `pollMlbTeam?teamId=${teamId}&season=${season}`,
      seasonRequested: String(season),
    },
    async (trace) => {
      trace.seasonsTried.push(String(season));
      const r = await fetchMlbTeamSeasonFixtures(teamId, season);
      return { ...r, followKey, seasonResolved: String(season), sliceComplete: true };
    },
  );
  res.status(out.status).json(out.body);
});

export const pollNhlTeam = onRequest(async (req, res) => {
  const abbrev = String(req.query.abbrev ?? '');
  const season = String(req.query.season ?? '');
  if (!/^[A-Z]{2,3}$/.test(abbrev) || !/^\d{8}$/.test(season)) {
    res.status(400).json({ error: 'abbrev and season (YYYYYYYY) required' });
    return;
  }
  const followKey = `nhl-team-${abbrev}`;
  const out = await servePoll(
    triggerOf(req.get(TRIGGER_HEADER)),
    {
      source: 'nhl',
      sport: 'ice-hockey',
      competitionId: followKey,
      pollPath: `pollNhlTeam?abbrev=${abbrev}&season=${season}`,
      seasonRequested: season,
    },
    async (trace) => {
      trace.seasonsTried.push(season);
      const r = await fetchNhlTeamSeasonFixtures(abbrev, season);
      return { ...r, followKey, seasonResolved: season, sliceComplete: true };
    },
  );
  res.status(out.status).json(out.body);
});

// League-wide freshness routes (Stage 6 addendum ruling): NHL/MLB
// league follows are real, and a league-only follower must not depend
// on some team follower's poll paths for fresh data. Same slice key as
// the league followKey every fixture already carries.
export const pollMlbLeague = onRequest(async (req, res) => {
  const season = Number(req.query.season);
  if (!Number.isInteger(season)) {
    res.status(400).json({ error: 'season is required' });
    return;
  }
  const followKey = 'mlb-league-1';
  const out = await servePoll(
    triggerOf(req.get(TRIGGER_HEADER)),
    {
      source: 'mlb',
      sport: 'baseball',
      competitionId: followKey,
      pollPath: `pollMlbLeague?season=${season}`,
      seasonRequested: String(season),
    },
    async (trace) => {
      trace.seasonsTried.push(String(season));
      const r = await fetchMlbLeagueSeasonFixtures(season);
      return { ...r, followKey, seasonResolved: String(season), sliceComplete: true };
    },
  );
  res.status(out.status).json(out.body);
});

export const pollNhlLeague = onRequest(async (req, res) => {
  const season = String(req.query.season ?? '');
  if (!/^\d{8}$/.test(season)) {
    res.status(400).json({ error: 'season (YYYYYYYY) required' });
    return;
  }
  const followKey = 'nhl-league-1';
  const out = await servePoll(
    triggerOf(req.get(TRIGGER_HEADER)),
    {
      source: 'nhl',
      sport: 'ice-hockey',
      competitionId: followKey,
      pollPath: `pollNhlLeague?season=${season}`,
      seasonRequested: season,
    },
    async (trace) => {
      trace.seasonsTried.push(season);
      const r = await fetchNhlLeagueSeasonFixtures(season);
      return { ...r, followKey, seasonResolved: season, sliceComplete: true };
    },
  );
  res.status(out.status).json(out.body);
});

export const pollF1 = onRequest(async (req, res) => {
  const season = Number(req.query.season);
  if (!Number.isInteger(season)) {
    res.status(400).json({ error: 'season is required' });
    return;
  }
  const out = await servePoll(
    triggerOf(req.get(TRIGGER_HEADER)),
    {
      source: 'f1',
      sport: 'f1',
      competitionId: 'f1-series-1',
      pollPath: `pollF1?season=${season}`,
      seasonRequested: String(season),
    },
    async (trace) => {
      trace.seasonsTried.push(String(season));
      const r = await fetchF1SeasonFixtures(season);
      // Driver follow keys are STAMPED onto the session fixtures: F1 has
      // no sub-event to hang an appearance on (every entrant runs every
      // session), so the session is the driver's appearance and a driver
      // follow rides the ordinary query path — race-only preference
      // included, since sessionKind is untouched. The driver set comes
      // from the roster (Jolpica per-season driver list, weekly refresh);
      // an empty roster stamps nothing and the sessions ingest as before.
      const athletes = await loadAthletes(db);
      return {
        ...r,
        fixtures: stampDriverKeys(r.fixtures, athletes),
        followKey: 'f1-series-1',
        seasonResolved: String(season),
        sliceComplete: true,
      };
    },
  );
  res.status(out.status).json(out.body);
});

const MUTABLE_STATUSES: FixtureStatus[] = [
  'scheduled',
  'tbd',
  'postponed',
  'cancelled',
  'in_play',
  'finished',
];

// TEST HOOK — emulator only, refuses to run in production. Simulates
// upstream schedule changes: shift kickoff and/or change status.
export const mutateFixture = onRequest(async (req, res) => {
  if (process.env.FUNCTIONS_EMULATOR !== 'true') {
    res.status(403).json({ error: 'emulator only' });
    return;
  }
  try {
    const fixtureId = String(req.query.fixtureId ?? '');
    const shiftHours = Number(req.query.shiftHours ?? 0);
    const status = req.query.status as FixtureStatus | undefined;
    if (status && !MUTABLE_STATUSES.includes(status)) {
      res.status(400).json({ error: `invalid status ${status}` });
      return;
    }
    const ref = db.collection('fixtures').doc(fixtureId);
    const snap = await ref.get();
    if (!snap.exists) {
      res.status(404).json({ error: `fixture ${fixtureId} not found` });
      return;
    }
    const f = snap.data() as Fixture;
    // Instant arithmetic, not local-clock arithmetic — a test hook that
    // shifts by the wrong amount across a DST boundary would make the
    // engine look broken when it is not.
    const newStartUtc = new Date(
      new Date(f.startUtc).getTime() + shiftHours * 3_600_000,
    ).toISOString();
    const newStatus = status ?? f.status;
    const at = new Date().toISOString();
    await ref.update({ startUtc: newStartUtc, status: newStatus, updatedAt: at });
    const record: Record<string, unknown> = { fixtureId, at };
    if (newStartUtc !== f.startUtc) {
      Object.assign(record, {
        kind: 'time_changed',
        prevStartUtc: f.startUtc,
        newStartUtc,
      });
    }
    if (newStatus !== f.status) {
      Object.assign(record, {
        kind: 'status_changed',
        prevStatus: f.status,
        newStatus,
      });
    }
    // followKeys must ride along or the sweep cannot fan out pushes for
    // simulated changes — which is exactly what push verification needs.
    await db
      .collection('fixtureChanges')
      .add({ ...record, followKeys: f.followKeys ?? [] });
    res.json({
      fixtureId,
      prevStartUtc: f.startUtc,
      newStartUtc,
      prevStatus: f.status,
      newStatus,
    });
  } catch (e) {
    res.status(502).json({ error: String(e) });
  }
});

// The propagation heartbeat: re-poll everything followed, push to
// affected devices. Every 6 hours balances freshness against provider
// politeness; layer 2 (background fetch) and layer 3 (foreground sync)
// cover the gaps.
export const scheduledSweep = onSchedule(
  { schedule: 'every 6 hours', timeoutSeconds: 540, memory: '256MiB' },
  async () => {
    await sweepAll();
  },
);

// Manual trigger for verification and ops — guarded by a shared key.
// FAILS CLOSED: a deploy without SWEEP_KEY refuses every request rather
// than exposing a 540s provider-polling endpoint to the internet.
export const runSweep = onRequest(
  { timeoutSeconds: 540, memory: '256MiB', maxInstances: 2 },
  async (req, res) => {
    const expected = process.env.SWEEP_KEY;
    const provided = req.get('x-sweep-key');
    if (!expected || !provided || !timingSafeEqualStr(provided, expected)) {
      res.status(403).json({ error: 'forbidden' });
      return;
    }
    try {
      res.json(await sweepAll());
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  },
);

// Weekly hygiene: collapse cross-provider duplicates so one real fixture
// is one calendar entry. Runs after the sweep's usual cadence.
export const scheduledReconcile = onSchedule(
  { schedule: 'every sunday 04:00', timeoutSeconds: 540, memory: '256MiB' },
  async () => {
    await reconcileFixtures(false);
  },
);

// ─── Prompt 8: roster refresh — the directory's freshness ────────────
//
// Rosters get their OWN scheduler, not a catalogue entry, for load-
// bearing arithmetic: IBF's Crawl-delay:10 across 33 weight-class
// requests is ~6 minutes of wall time, which would eat the fixture
// sweep's 8-minute deadline alive; and rankings change weekly at most
// (WTA publishes Mondays, IBF monthly, the F1 grid rarely), so weekly
// is the honest cadence — Tuesday 03:00 UTC catches Monday's rankings
// within a day. Each source runs independently: one failing must not
// starve the others, and each writes its own sourceRuns record under a
// roster-* slice, so the funnel covers the directory the same way it
// covers fixtures. Staleness is watched by the SWEEP's alert pass
// (roster_stale in alerts.ts) — the watcher must not share the fate of
// the thing it watches.

// A source that OWNS ITS APPLY. The vendor ATP directory replaces a
// population rather than topping one up, so it removes documents —
// something applyRoster deliberately cannot do. It still runs inside the
// same loop and therefore keeps the zero-entry refusal, the staleness
// marker and the run record.
interface CustomRosterSource<T> {
  slice: string;
  source: string;
  sport: string;
  run: () => Promise<{ rawCount: number; entries: T[] }>;
  apply: (entries: T[], startedAt: string) => Promise<Record<string, number>>;
}

interface StandardRosterSource {
  slice: string;
  source: string;
  sport: string;
  run: () => Promise<{ rawCount: number; entries: import('./athletes').RosterEntry[] }>;
  // Runs BETWEEN the fetch and the write, with the directory in hand.
  // Throwing here means the update is not applied and whatever is
  // already stored stands — a stale correct list beats a fresh
  // corrupted one. The throw is recorded in this slice's own run record
  // exactly like a fetch failure.
  gate?: (
    entries: readonly import('./athletes').RosterEntry[],
    existing: readonly import('./athletes').Athlete[],
  ) => void;
  applyOpts?: {
    nameMatchExcludesSources?: string[];
    ownsCareerStatus?: boolean;
    sliceRoster?: boolean;
  };
}

type RosterSource = StandardRosterSource | CustomRosterSource<RankedPlayer>;

const rosterSources = (): RosterSource[] => [
  {
    slice: 'roster-wta',
    source: 'wta',
    sport: 'tennis',
    run: () => fetchWtaRankings(),
  },
  {
    slice: 'roster-f1',
    source: 'f1',
    sport: 'f1',
    run: () => fetchJolpicaDrivers(new Date().getUTCFullYear()),
  },
  {
    slice: 'roster-ibf',
    source: 'ibf',
    sport: 'boxing',
    run: () => fetchIbfRatings(),
  },
  // Card participants (Part B ruling, 2026-08-17): the boxing
  // directory's backstop — everyone who actually fights on an ingested
  // card, minted through the roster lane the appearance funnel's
  // id_backed policy correctly refuses. Catches every WBC/WBA/WBO name
  // the moment they book.
  {
    slice: 'roster-boxing-cards',
    source: 'cards',
    sport: 'boxing',
    run: () => fetchCardParticipants(db),
  },
  // ATP players via Wikidata (Prompt 10b) — behind the mint gate until
  // the owner approves the validated counts. The reconcile guard:
  // every existing tennis athlete is a WTA-id-backed woman, and a
  // cross-gender name collision must mint a second athlete, never
  // attach a man's identity to a woman's follow.
  ...(ATP_ROSTER_ENABLED
    ? [
        {
          slice: 'roster-atp',
          source: 'wikidata',
          sport: 'tennis',
          run: () => fetchAtpRoster(),
          applyOpts: {
            nameMatchExcludesSources: ['wta'],
            // Wikidata evaluates career status for every selected
            // player every run, so what it omits is cleared, not kept.
            // It also owns the GROUPING, and now grants none — which is
            // what sweeps the retired world-No.-1s keys off the docs.
            ownsCareerStatus: true,
          },
        },
      ]
    : []),
  // THE MEN'S DIRECTORY, whole (owner ruling 2026-08-06). One ranked
  // source of 500 replaces BOTH the Wikidata directory of 1,394 mostly
  // inactive men and the Wikipedia top-20 ranking that used to grant
  // the browse group. Top 100 browsable, 500 searchable.
  //
  // The old ordering hazard is gone with them: nothing clears the ATP
  // grouping any more, because one source now owns the whole
  // population. This spec REMOVES documents, which is why it carries
  // its own apply and its own truncation guard.
  {
    slice: 'roster-atp-vendor',
    source: 'tennisapi1',
    sport: 'tennis',
    run: () => fetchAtpTop500(requireAtpVendorKey()),
    apply: (entries: RankedPlayer[], startedAt: string) =>
      applyAtpDirectory(entries, startedAt),
  },
];

function requireAtpVendorKey(): string {
  const k = process.env.ATP_VENDOR_KEY;
  if (!k) throw new Error('ATP_VENDOR_KEY is not configured');
  return k;
}

// Replace the men's directory with the ranked list. Keeps document ids,
// never removes a followed athlete, refuses a suspiciously large cull,
// and leaves the WTA population entirely alone
// (providers/tennisApiAtp.ts explains each rule and why it exists).
async function applyAtpDirectory(
  ranked: RankedPlayer[],
  startedAt: string,
): Promise<Record<string, number>> {
  const all = await db.collection('athletes').where('sport', '==', 'tennis').get();
  const tennis: Record<string, unknown>[] = all.docs.map((d) => ({
    ...(d.data() as Record<string, unknown>),
    id: d.id,
  }));
  // MEN ONLY. This list is men's singles; an unmatched woman is not an
  // unranked man, and treating her as one would delete the half of
  // tennis that actually serves appearances.
  const men = tennis.filter(
    (a) => (a.providerIds as Record<string, string> | undefined)?.wta === undefined,
  );
  const devices = await db.collection('devices').get();
  const followed = new Set(
    devices.docs
      .flatMap((d) => (d.data().followKeys as string[] | undefined) ?? [])
      .filter((k) => k.startsWith('athlete_')),
  );
  const plan = planReconcile(
    ranked,
    men.map((a) => ({
      id: String(a.id),
      displayName: String(a.displayName ?? ''),
      countryCode: a.countryCode as string | undefined,
      groupingKey: a.groupingKey as string | undefined,
      providerIds: a.providerIds as Record<string, string> | undefined,
    })),
    followed,
  );
  const guard = removalGuard(plan, ranked.length, men.length);
  if (guard !== null) throw new Error(guard);

  const byId = new Map(men.map((a) => [String(a.id), a]));
  let batch = db.batch();
  let n = 0;
  const flush = async () => {
    if (n > 0) {
      await batch.commit();
      batch = db.batch();
      n = 0;
    }
  };
  const queue = async (fn: () => void) => {
    fn();
    if (++n >= 400) await flush();
  };
  const athletes = athletesCollection(db);
  for (const k of plan.keep) {
    const ref = athletes.doc(k.athleteId);
    const held = (byId.get(k.athleteId)?.providerIds ?? {}) as Record<string, string>;
    // ANNOTATED, not inferred: the annotation is what makes the brand
    // reach a merge write at all (see AthleteUpdate).
    const update: AthleteUpdate = {
      rank: k.player.rank,
      groupingKey: groupingFor(k.player.rank),
      ...(k.player.countryCode ? { countryCode: k.player.countryCode } : {}),
      providerIds: { ...held, [ATP_VENDOR]: k.player.vendorId },
      // SELF-HEALING, so this needs no migration. The keep path never
      // wrote `searchName`, which meant fixing the create path alone
      // would have left the twelve already-stored names broken for good
      // — a scheduled job that repairs nothing is how a one-line bug
      // becomes permanent. Derived from the doc's OWN `displayName`
      // rather than the vendor's spelling, because display is the string
      // this has to agree with; four of these docs were manually merged
      // and keep our canonical name.
      searchName: toSearchName(
        String(byId.get(k.athleteId)?.displayName ?? k.player.name),
      ),
      // The vendor's spelling becomes an alias when it differs, so a
      // merged player is findable by both. `search.ts` already searches
      // aliases alongside searchName.
      ...(toSearchName(k.player.name) !==
      toSearchName(String(byId.get(k.athleteId)?.displayName ?? k.player.name))
        ? { aliases: FieldValue.arrayUnion(toSearchName(k.player.name)) }
        : {}),
      active: true,
      updatedAt: startedAt,
    };
    await queue(() => batch.set(ref, update, { merge: true }));
  }
  for (const f of plan.keepFollowed) {
    // Followed but unranked: they stay, and stop claiming a ranking
    // they no longer hold.
    await queue(() =>
      batch.set(
        athletes.doc(f.athleteId),
        { rank: FieldValue.delete(), groupingKey: 'atp-directory', updatedAt: startedAt },
        { merge: true },
      ),
    );
  }
  for (const r of plan.remove) {
    await queue(() => batch.delete(athletes.doc(r.athleteId)));
  }
  await flush();

  // Ids come from the counter AFTER the deletes, so a newly minted id
  // can never collide with a doc still being removed.
  const start = await db.runTransaction(async (tx) => {
    const ref = db.doc('counters/athletes');
    const snap = await tx.get(ref);
    const cur = (snap.exists ? (snap.data()?.next as number) : 1) || 1;
    tx.set(ref, { next: cur + plan.create.length }, { merge: true });
    return cur;
  });
  batch = db.batch();
  n = 0;
  plan.create.forEach((p, i) => {
    const id = `athlete_${String(start + i).padStart(6, '0')}`;
    batch.set(athletes.doc(id), {
      id,
      // All three name fields from one call. This adapter used to set
      // `searchName: p.name.toLowerCase()` — the one writer in the store
      // that did not normalise — which left 12 men unreachable by any
      // ASCII spelling. It cannot do that now: `searchName` is branded
      // and this collection is typed, so a raw string does not compile.
      ...athleteNames(p.name),
      sport: 'tennis',
      providerIds: { [ATP_VENDOR]: p.vendorId },
      provenance: 'roster',
      nameKeyed: false,
      active: true,
      missedRefreshes: 0,
      rank: p.rank,
      groupingKey: groupingFor(p.rank),
      ...(p.countryCode ? { countryCode: p.countryCode } : {}),
      identities: [
        { source: ATP_VENDOR, externalId: p.vendorId, name: p.name, lastSeenAt: startedAt },
      ],
      createdAt: startedAt,
      updatedAt: startedAt,
    });
    n++;
  });
  if (n > 0) await batch.commit();
  return {
    created: plan.create.length,
    updated: plan.keep.length,
    deactivated: plan.remove.length,
    skippedAmbiguous: plan.review.length,
    keptFollowed: plan.keepFollowed.length,
  };
}

async function refreshRosters(
  trigger: RunTrigger,
): Promise<Record<string, unknown>> {
  const summary: Record<string, unknown> = {};
  for (const s of rosterSources()) {
    const startedAt = new Date().toISOString();
    const ctx: RunContext = {
      trigger,
      source: s.source,
      sport: s.sport,
      competitionId: s.slice,
      pollPath: `roster:${s.source}`,
      seasonRequested: null,
    };
    try {
      const { rawCount, entries } = await (s.run as () => Promise<{
        rawCount: number;
        entries: unknown[];
      }>)();
      // Gate BEFORE the zero check and before any write: a source that
      // fails its own sanity rules must leave production exactly as it
      // was.
      if ('gate' in s && s.gate) {
        s.gate(entries as import('./athletes').RosterEntry[], await loadAthletes(db));
      }
      // ZERO entries is never applied: a roster source answering with
      // nothing (a January F1 season page before the grid exists, a
      // filter regression) would mark every athlete absent, deactivate
      // them within two refreshes, and — for F1 — strip driver keys
      // from every session, deleting followers' events. Better a loud
      // error and last week's roster than a silent decimation.
      if (entries.length === 0) {
        throw new Error(`${s.source} roster returned zero entries`);
      }
      // A source may own its own apply. The vendor ATP directory does,
      // because it REMOVES documents — replacing a directory rather
      // than topping one up — and applyRoster deliberately has no such
      // power. It still gets the gate, the zero-entry refusal, the
      // staleness marker and the run record from this loop.
      const applied =
        'apply' in s
          ? await s.apply(entries as RankedPlayer[], startedAt)
          : await applyRoster(
              db,
              entries as import('./athletes').RosterEntry[],
              startedAt,
              s.applyOpts ?? {},
            );
      // The staleness marker the sweep's roster_stale rule reads —
      // written ONLY on a successful, non-empty, fully-applied refresh.
      await db
        .collection('status')
        .doc('rosters')
        .set(
          { slices: { [`${s.source}|${s.slice}`]: startedAt } },
          { merge: true },
        );
      await recordSourceRun(
        ctx,
        {
          httpStatus: 200,
          seasonResolved: null,
          seasonsTried: [],
          // Roster counts: fetched = provider rows/classes, parsed =
          // entries, stored = docs written. futureDated is a fixture
          // concept and stays 0 — the roster_stale alert keys on
          // lastSuccessAt, never on zeroYield.
          counts: {
            fetched: rawCount,
            parsed: entries.length,
            rejected: 0,
            stored: applied.created + applied.updated,
            unchanged: 0,
            futureDated: 0,
          },
          error: null,
          roster: { ...applied },
        },
        startedAt,
      );
      summary[s.slice] = { entries: entries.length, ...applied };
    } catch (e) {
      await recordSourceRun(
        ctx,
        {
          httpStatus: httpStatusFromError(e),
          seasonResolved: null,
          seasonsTried: [],
          counts: EMPTY_COUNTS,
          error: String(e),
        },
        startedAt,
      );
      summary[s.slice] = { error: String(e) };
    }
  }
  return summary;
}

export const scheduledRoster = onSchedule(
  {
    schedule: 'every tuesday 03:00',
    timeZone: 'Etc/UTC',
    timeoutSeconds: 540,
    // 512MiB since Prompt 10b: the Wikidata enumeration answer is a
    // ~6.5MB JSON body that fans out to ~6,600 row objects before
    // folding — 256MiB left no honest headroom beside the IBF crawl.
    memory: '512MiB',
  },
  async () => {
    await refreshRosters('roster');
  },
);

// Manual trigger, same guard-shape as runSweep: fails closed.
export const runRoster = onRequest(
  { timeoutSeconds: 540, memory: '512MiB', maxInstances: 1 },
  async (req, res) => {
    const expected = process.env.SWEEP_KEY;
    const provided = req.get('x-sweep-key');
    if (!expected || !provided || !timingSafeEqualStr(provided, expected)) {
      res.status(403).json({ error: 'forbidden' });
      return;
    }
    try {
      res.json(await refreshRosters('roster'));
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  },
);

// ─── Prompt 4: boxing (PBC), tennis, athletics ────────────────────────

export const pollPbc = onRequest(
  { timeoutSeconds: 300 },
  async (req, res) => {
    // The sitemap holds 319 cards and nearly all have happened; only
    // those on or after this date are fetched, at the crawl delay PBC's
    // robots.txt asks for.
    const from = new Date(Date.now() - 7 * 86_400_000)
      .toISOString()
      .slice(0, 10);
    const out = await servePoll(
      triggerOf(req.get(TRIGGER_HEADER)),
      {
        source: 'pbc',
        sport: 'boxing',
        competitionId: 'pbc-cards',
        pollPath: 'pollPbc',
        seasonRequested: null,
      },
      async (trace) => {
        trace.seasonsTried.push('current');
        const r = await fetchPbcCards(from);
        return {
          rawCount: r.rawCount,
          // Round 6 item 4: PBC merges into Major fight cards — every card
          // also carries the 4445 key, so one follow unions both sources.
          fixtures: withMajorCardsKey(r.fixtures),
          followKey: 'pbc-cards',
          seasonResolved: 'current',
          // Always attached, zero yield included: fetched-N-parsed-0 is
          // the funnel's way of saying the performer array rotted.
          appearances: {
            followKey: appearanceSliceKey('pbc-cards'),
            rawCount: r.appearanceRawCount,
            drafts: r.appearances,
            // Performer nodes are the promoter stating who fights —
            // structured enough to create name-keyed directory athletes
            // (PBC publishes no fighter ids; the record says so).
            create: 'structured' as const,
          },
        };
      },
    );
    res.status(out.status).json(out.body);
  },
);

// boxing-data.com — DEPTH over the coming seven days, where TheSportsDB
// gives BREADTH over seventy-seven. They are not competing: a card enters
// this vendor's window, gets its real start time, its per-bout ring-walk
// times and its main-event billing, and nothing regresses when it leaves.
//
// 100 requests a CYCLE on the free tier, kept (owner ruling 2026-09-02):
// the cadence is SPARSE by default and dense only near a card, and the
// persisted remaining-quota figure gates every call — see
// providers/boxingDataCadence.ts for the plan, the expected spend and
// the worst-case staleness, recorded there as the trade.
const BOXINGDATA_MARKER = 'status/boxingData';

function requireBoxingKey(): string {
  const k = process.env.BOXING_VENDOR_KEY;
  if (!k) throw new Error('BOXING_VENDOR_KEY is not configured');
  return k;
}

export const pollBoxingData = onRequest(async (req, res) => {
  const trigger = triggerOf(req.get(TRIGGER_HEADER));
  const ctx = {
    source: 'boxingdata',
    sport: 'boxing',
    competitionId: BOXING_SLICE,
    pollPath: 'pollBoxingData',
    seasonRequested: null,
  };
  const startedAt = new Date().toISOString();
  const nowMs = Date.parse(startedAt);
  const marker = db.doc(BOXINGDATA_MARKER);
  const prior = (await marker.get().catch(() => null))?.data() as
    | {
        lastSuccessAt?: string;
        boutsFetchedAt?: BoutFetchState;
        cards?: KnownCard[];
        quota?: { remaining: number | null; resetAt?: string | null; limit?: number | null; at?: string | null };
      }
    | undefined;
  const lastSuccessAt = prior?.lastSuccessAt ?? null;

  // THE CADENCE IS ENFORCED HERE, where every trigger converges. A
  // sweep, a follow tap and a manual curl all land on this route, and a
  // hundred-a-cycle quota does not survive being polled per-invocation.
  // The planner is pure: sparse baseline, dense near a card, and the
  // reserve gate on the persisted quota (never a call that would breach it).
  const plan = planBoxingDataRun({
    nowMs,
    lastSuccessAt,
    cards: prior?.cards ?? [],
    quota: prior?.quota ?? null,
  });
  if (plan.action === 'skip') {
    const reason =
      plan.reason === 'quota_reserve'
        ? ('skipped_boxingdata_quota_reserve' as const)
        : ('skipped_boxingdata_daily_cap' as const);
    await recordSourceRun(
      { ...ctx, trigger },
      {
        httpStatus: null,
        seasonResolved: null,
        seasonsTried: [],
        counts: EMPTY_COUNTS,
        error: null,
        reason,
      },
      startedAt,
    );
    // 200: nothing is wrong. The slice is as fresh as the cadence and
    // the quota allow; the body says which and when.
    res.status(200).json({
      skipped: reason,
      lastSuccessAt,
      cadence: plan.mode,
      nextEligibleAt: plan.nextEligibleAt,
    });
    return;
  }

  const boutsFetchedAt: BoutFetchState = { ...(prior?.boutsFetchedAt ?? {}) };
  // Boxed, not reassigned: the value is set inside servePoll's callback
  // and TypeScript's control flow would otherwise narrow a `let` to its
  // initial null at the marker write below.
  const spendBox: {
    value: {
      calls: number;
      remaining: number | null;
      limit: number | null;
      resetAt: string | null;
      bouts: number;
      capped: number;
    } | null;
  } = { value: null };
  const knownCardsBox: { value: KnownCard[] | null } = { value: null };
  const out = await servePoll(trigger, ctx, async (trace) => {
    trace.seasonsTried.push('current');
    let r: Awaited<ReturnType<typeof fetchBoxingData>>;
    try {
      r = await fetchBoxingData(requireBoxingKey(), startedAt, {
        // The bouts budget is what the reserve leaves after the schedule
        // call — a busy week is reported as capped, never silently eaten.
        maxCards: plan.boutBudget,
        due: (eventId, startUtc) =>
          shouldFetchBouts(eventId, startUtc, boutsFetchedAt, nowMs),
      });
    } catch (e) {
      // A 429 (or any HTTP rejection) still tells us where the quota
      // stands; persist it so the reserve gate holds from the next run
      // instead of re-learning the wall by knocking on it.
      if (e instanceof BoxingDataHttpError) {
        spendBox.value = {
          calls: 0,
          remaining: e.quota.remaining,
          limit: e.quota.limit,
          resetAt:
            e.quota.resetSeconds === null
              ? null
              : new Date(nowMs + e.quota.resetSeconds * 1000).toISOString(),
          bouts: 0,
          capped: 0,
        };
      }
      throw e;
    }
    for (const id of r.boutsFetchedFor) boutsFetchedAt[id] = startedAt;
    // Forget cards that have left the window, so the marker cannot grow
    // without bound.
    const live = new Set(r.fixtures.map((f) => f.id.replace(/^boxingdata-/, '')));
    for (const k of Object.keys(boutsFetchedAt)) if (!live.has(k)) delete boutsFetchedAt[k];
    spendBox.value = {
      calls: r.callsSpent,
      remaining: r.quotaRemaining,
      limit: r.quotaLimit,
      resetAt: r.quotaResetAt,
      bouts: r.boutsFetchedFor.length,
      capped: r.skippedForCap,
    };
    knownCardsBox.value = r.fixtures.map((f) => ({
      id: f.id.replace(/^boxingdata-/, ''),
      startUtc: f.startUtc,
    }));
    return {
      rawCount: r.rawCount,
      fixtures: r.fixtures,
      followKey: BOXING_SLICE,
      seasonResolved: 'current',
      sliceComplete: true,
      appearances: {
        followKey: appearanceSliceKey(BOXING_SLICE),
        rawCount: r.rawBouts,
        drafts: r.appearances,
        // ID-BACKED ONLY (22d ruling). "Never mint from this vendor" was
        // written when every candidate shipped abbreviated names, to stop
        // F34 duplicates from name-only matching; a stable provider id is
        // exactly what removes that risk. A vendor row without one still
        // does not publish and does not mint.
        create: 'id_backed' as const,
        provenance: 'vendor' as const,
      },
    };
  });
  try {
    await marker.set(
      {
        ...(out.status === 200 ? { lastSuccessAt: startedAt } : {}),
        boutsFetchedAt,
        // The vendor's own metering, persisted (Round 4 item 6): the
        // sweep's quota_low rule predicts exhaustion from this instead
        // of the app discovering it as a week of 429s.
        ...(knownCardsBox.value ? { cards: knownCardsBox.value } : {}),
        ...(spendBox.value
          ? {
              quota: {
                remaining: spendBox.value.remaining,
                limit: spendBox.value.limit,
                resetAt: spendBox.value.resetAt,
                callsThisRun: spendBox.value.calls,
                at: startedAt,
                // The projection the quota_low rule reads: what the rest
                // of the cycle costs at the mode the cards imply.
                reserve: QUOTA_RESERVE,
                projectedSpendToReset: projectedSpendToReset({
                  nowMs,
                  resetAt: spendBox.value.resetAt,
                  mode: cadenceModeFor(knownCardsBox.value ?? [], nowMs),
                  cardsPerRun: Math.max(1, spendBox.value.bouts),
                }),
              },
              cadence: {
                mode: cadenceModeFor(knownCardsBox.value ?? [], nowMs),
                at: startedAt,
              },
            }
          : {}),
      },
      { merge: true },
    );
  } catch {
    // Never fail a poll over the marker. A lost write costs one extra
    // run tomorrow, not correctness.
  }
  res.status(out.status).json({
    ...out.body,
    ...(spendBox.value ? { quota: spendBox.value } : {}),
  });
});

// The Tennis TV ICS is fetched ONCE DAILY by owner ruling (2026-07-31)
// — subscribing, not crawling. The catalogue briefly polled it every
// sweep and calendar.google.com answered 429 (F41), so the cadence
// commitment is enforced HERE, where every trigger converges, not left
// to whoever invokes the route. 22h, not 24: the daily tier-2 window
// drifts inside 00–06 UTC, and yesterday's 05:20 success must not
// block tomorrow's early attempts.
const ICS_MIN_INTERVAL_MS = 22 * 3_600_000;
// AND A COOL-DOWN AFTER A FAILURE. The daily cap is keyed on the last
// SUCCESS, so a rate-limited source stays permanently "due": three
// follow taps in ten minutes each fetched, each got 429 from Google
// (the ICS is hosted on calendar.google.com), and each reported a
// service error to the app. A failure now buys quiet for long enough
// that a user tapping again is served the cache instead of another
// refusal.
const ICS_FAILURE_BACKOFF_MS = 15 * 60_000;
// How long one invocation's claim on the fetch is honoured. Longer than
// the fetch takes, short enough that an invocation killed mid-flight
// costs one window rather than a day (src/sourceLease.ts).
const ICS_LEASE_MS = 90_000;
const ICS_MARKER_DOC = 'status/tennisIcs';

export const pollTennis = onRequest(async (req, res) => {
  const trigger = triggerOf(req.get(TRIGGER_HEADER));
  const ctx = {
    source: 'tennis',
    sport: 'tennis',
    competitionId: 'tennis-atp',
    pollPath: 'pollTennis',
    seasonRequested: null,
  };
  const startedAt = new Date().toISOString();
  let lastSuccessAt: string | null = null;
  // THE CLAIM AND THE DECISION ARE ONE WRITE. Deciding from a read and
  // recording it after the fetch left a gap every concurrent invocation
  // walked through: three follow taps, three fetches, three 429s. The
  // transaction below either hands this invocation the lease or tells it
  // to skip, and no two callers can win it (src/sourceLease.ts).
  type SkipReason = 'daily_cap' | 'failure_backoff' | 'leased';
  let claim: { fetch: true } | { fetch: false; reason: SkipReason };
  try {
    claim = await db.runTransaction(async (tx) => {
      const snap = await tx.get(db.doc(ICS_MARKER_DOC));
      const data = snap.exists
        ? (snap.data() as {
            lastSuccessAt?: string;
            lastFailureAt?: string;
            leaseUntil?: string;
          })
        : {};
      lastSuccessAt = data.lastSuccessAt ?? null;
      const d = leaseDecision(data, Date.parse(startedAt), {
        minIntervalMs: ICS_MIN_INTERVAL_MS,
        failureBackoffMs: ICS_FAILURE_BACKOFF_MS,
        leaseMs: ICS_LEASE_MS,
      });
      if (!d.fetch) return { fetch: false as const, reason: d.reason };
      tx.set(
        db.doc(ICS_MARKER_DOC),
        { leaseUntil: d.leaseUntil },
        { merge: true },
      );
      return { fetch: true as const };
    });
  } catch (e) {
    // A marker read/claim failure fails CLOSED: fetching anyway could
    // break the once-daily commitment, and the run record keeps the
    // failure from reading as a quiet skip (standing invariant).
    await recordSourceRun(
      { ...ctx, trigger },
      {
        httpStatus: null,
        seasonResolved: null,
        seasonsTried: [],
        counts: EMPTY_COUNTS,
        error: `ics fetch lease failed: ${String(e)}`,
      },
      startedAt,
    );
    res.status(502).json({ error: 'ics fetch lease failed' });
    return;
  }
  if (!claim.fetch) {
    const reason = `skipped_ics_${claim.reason}` as const;
    await recordSourceRun(
      { ...ctx, trigger },
      {
        httpStatus: null,
        seasonResolved: null,
        seasonsTried: [],
        counts: EMPTY_COUNTS,
        error: null,
        reason,
      },
      startedAt,
    );
    // 200, deliberately: nothing is wrong. The caller wanted this
    // slice refreshed and it is as fresh as our commitment to the
    // source allows.
    res.status(200).json({ skipped: reason, lastSuccessAt });
    return;
  }
  const out = await servePoll(trigger, ctx, async (trace) => {
    trace.seasonsTried.push('current');
    const r = await fetchTennisTournaments();
    return { ...r, followKey: 'tennis-atp', seasonResolved: 'current', sliceComplete: true };
  });
  try {
    await db
      .doc(ICS_MARKER_DOC)
      .set(
        {
          ...(out.status === 200
            ? { lastSuccessAt: new Date().toISOString() }
            : { lastFailureAt: new Date().toISOString() }),
          // Done — the next caller decides on the cap and the backoff,
          // not on a lease this invocation no longer needs.
          leaseUntil: null,
        },
        { merge: true },
      );
  } catch (e) {
    // Never fail a poll over the marker; the cost of a lost write is one
    // extra fetch, not data loss. (merge: true — a failure must not
    // erase the last success, which is what the daily cap reads.)
    console.error(`[kickoffcal] tennis ics marker write failed: ${String(e)}`);
  }
  res.status(out.status).json(out.body);
});

// WTA tournaments + draws + order of play (owner ruling 2026-08-02:
// api.wtatennis.com approved; conditions live in the provider header).
// Women's tennis coverage exists because of this route — the ICS is
// ATP-only.
export const pollWtaTennis = onRequest(
  { timeoutSeconds: 120 },
  async (req, res) => {
    const from = new Date(Date.now() - 7 * 86_400_000)
      .toISOString()
      .slice(0, 10);
    const to = new Date(Date.now() + 180 * 86_400_000)
      .toISOString()
      .slice(0, 10);
    const out = await servePoll(
      triggerOf(req.get(TRIGGER_HEADER)),
      {
        source: 'wta',
        sport: 'tennis',
        competitionId: 'tennis-wta',
        pollPath: 'pollWtaTennis',
        seasonRequested: null,
      },
      async (trace) => {
        trace.seasonsTried.push(`${from}..${to}`);
        const r = await fetchWtaTennis(from, to);
        return {
          rawCount: r.rawCount,
          fixtures: r.fixtures,
          followKey: 'tennis-wta',
          seasonResolved: 'current',
          reapWindowEndUtc: `${to}T00:00:00.000Z`,
          // Always attached, zero yield included — same rule as every
          // appearance slice: a run that parsed nothing is recorded.
          appearances: {
            followKey: appearanceSliceKey('tennis-wta'),
            rawCount: r.appearanceRawCount,
            drafts: r.appearances,
            roundSlots: r.roundSlots,
            // Draw records carry NUMERIC PLAYER IDS, so a player
            // outside the top-200 roster still becomes an id-backed
            // athlete the moment she enters a draw — certain identity,
            // not a guess.
            create: 'structured' as const,
            grouping: groupTitleOf('wta')!,
            groupingKey: 'wta',
          },
          body: {
            activeTournaments: r.activeTournaments,
            activeSkipped: r.activeSkipped,
          },
        };
      },
    );
    res.status(out.status).json(out.body);
  },
);

export const pollAthletics = onRequest(
  { timeoutSeconds: 300 },
  async (req, res) => {
    // A rolling window: a week back to 120 DAYS out (Prompt 7 — was a
    // year). The narrower window plus the 14-page budget makes the
    // fetch COMPLETE in ordinary months (~850–1,300 meetings), which is
    // what lets this slice arm the reaper at all; meetings beyond 120
    // days enter as the window reaches them. Peak weeks can still
    // outgrow the budget — then `complete` is false and the run is
    // honestly unreapable.
    const from = new Date(Date.now() - 7 * 86_400_000)
      .toISOString()
      .slice(0, 10);
    const to = new Date(Date.now() + 120 * 86_400_000)
      .toISOString()
      .slice(0, 10);
    const out = await servePoll(
      triggerOf(req.get(TRIGGER_HEADER)),
      {
        source: 'wa',
        sport: 'athletics',
        competitionId: 'wa-calendar',
        pollPath: 'pollAthletics',
        seasonRequested: null,
      },
      async (trace) => {
        trace.seasonsTried.push(`${from}..${to}`);
        const r = await fetchWorldAthletics(from, to);
        return {
          rawCount: r.rawCount,
          fixtures: r.fixtures,
          followKey: 'wa-calendar',
          seasonResolved: 'current',
          // MEASURED completeness arms the reaper per run — the arming
          // rule ("only a complete fetch testifies to absence") is
          // unchanged; whether THIS fetch was complete is now a fact it
          // reports about itself. PBC cannot make the same claim: its
          // undated-slug allowance (the guard against URL-shape
          // changes) means an upcoming card can always be hiding in an
          // unfetched slug, so pbc-cards stays permanently unreapable.
          sliceComplete: r.complete,
          reapWindowEndUtc: `${to}T00:00:00.000Z`,
          body: { windowComplete: r.complete },
        };
      },
    );
    res.status(out.status).json(out.body);
  },
);

// ─── Review queue ─────────────────────────────────────────────────────
//
// Everything here is key-guarded: it writes to what users' calendars
// eventually show, so it is an operator surface, not a public one.

function reviewAuthed(req: { get(h: string): string | undefined }): boolean {
  const expected = process.env.SWEEP_KEY;
  const provided = req.get('x-sweep-key');
  return Boolean(
    expected && provided && timingSafeEqualStr(provided, expected),
  );
}

export const submitReview = onRequest(async (req, res) => {
  if (!reviewAuthed(req)) {
    res.status(403).json({ error: 'forbidden' });
    return;
  }
  const parsed = validateSubmission(req.body);
  if (!parsed.ok) {
    // Rejected, never repaired: a repaired record is one nobody verified.
    res.status(400).json({ error: 'invalid submission', errors: parsed.errors });
    return;
  }
  const item = await submitReviewItem(db, parsed.value, new Date().toISOString());
  res.json({ id: item.id, status: item.status });
});

export const listReview = onRequest(async (req, res) => {
  if (!reviewAuthed(req)) {
    res.status(403).json({ error: 'forbidden' });
    return;
  }
  const status = req.query.status as ReviewStatus | undefined;
  res.json({ items: await listReviewItems(db, status) });
});

// Approve, correct or reject. Approving is the ONLY path from the queue
// into the fixture cache.
export const decideReview = onRequest(async (req, res) => {
  if (!reviewAuthed(req)) {
    res.status(403).json({ error: 'forbidden' });
    return;
  }
  const id = String(req.query.id ?? (req.body as { id?: string })?.id ?? '');
  const decision = String(
    req.query.decision ?? (req.body as { decision?: string })?.decision ?? '',
  );
  if (!id || !['confirmed', 'cancelled', 'provisional'].includes(decision)) {
    res.status(400).json({ error: 'id and decision (confirmed|cancelled|provisional) required' });
    return;
  }
  const ref = db.collection('reviewQueue').doc(id);
  const snap = await ref.get();
  if (!snap.exists) {
    res.status(404).json({ error: 'no such review item' });
    return;
  }
  const now = new Date().toISOString();
  // A correction may accompany the decision; it is re-validated, never
  // trusted, and a failed correction leaves the item exactly as it was.
  const corrections = (req.body as { corrections?: unknown })?.corrections;
  let base = snap.data() as ReviewItem;
  if (corrections) {
    const parsed = validateSubmission({ ...base, ...(corrections as object) });
    if (!parsed.ok) {
      res.status(400).json({ error: 'invalid correction', errors: parsed.errors });
      return;
    }
    base = { ...base, ...parsed.value };
  }
  const item: ReviewItem = {
    ...base,
    status: decision as ReviewStatus,
    decidedAt: now,
    decidedBy: String(req.query.by ?? 'operator'),
  };
  await ref.set(item);

  const fixture = reviewItemToFixture(item, now);
  if (fixture) {
    await ingest([fixture], fixture.followKeys[0]);
    // Every approved bout — undercard included — becomes an appearance
    // under its own slice, which is what makes a prelim fighter
    // followable at all. A re-decide with corrected names retires the
    // appearances the fresh set no longer contains (same evidence guard
    // as the polls). No poll route refreshes review slices, so the
    // directory entries carry no pollPath.
    const drafts = reviewItemToAppearances(item, now);
    let retired = 0;
    let published: Fixture[] = [];
    if (drafts.length > 0) {
      const sliceKey = appearanceSliceKey(fixture.competitionId);
      // Operator-approved bouts are verified against the promoter's own
      // page — structured enough to create name-keyed directory
      // athletes, provenance 'review' so the record says who vouched.
      const { fixtures: resolvedFixtures } = await resolveAppearanceDrafts(
        drafts,
        { create: 'structured', provenance: 'review' },
      );
      published = resolvedFixtures;
      if (resolvedFixtures.length > 0) {
        await ingest(resolvedFixtures, sliceKey);
        // Draft set as retirement evidence — same reasoning as the
        // poll path: a bout the operator listed exists, whether or not
        // its fighters resolved to followable athletes.
        retired = await retireAppearances(
          sliceKey,
          drafts.map((d) => d.fixture),
        );
        try {
          await updateAthleteNextStart(db, resolvedFixtures, now);
        } catch (e) {
          console.error('athlete nextStart update failed for review slice:', e);
        }
      }
    }
    res.json({
      id,
      status: item.status,
      published: fixture.id,
      appearances: published.map((a) => a.id),
      appearancesRetired: retired,
    });
    return;
  }
  res.json({ id, status: item.status, published: null });
});

// The admin view. Served WITHOUT the key, deliberately: a browser cannot
// put a custom header on a top-level navigation, so guarding this page the
// way the data endpoints are guarded made it unreachable — 403 for
// everyone, including whoever holds the key.
//
// So the page carries NO DATA. It is markup and script: it asks for the
// operator key, keeps it in sessionStorage for the tab, and calls
// listReview/decideReview with the header. Every byte of queue content
// still comes from a guarded endpoint. Serving an empty shell reveals
// only that a review queue exists.
export const reviewAdmin = onRequest(async (_req, res) => {
  res.set('Content-Type', 'text/html; charset=utf-8').send(
    `<!doctype html><meta charset="utf-8"><title>KickOffCal review queue</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
 body{font:14px/1.55 system-ui,-apple-system,sans-serif;margin:2rem auto;max-width:1100px;padding:0 1rem;color:#111}
 table{border-collapse:collapse;width:100%;margin-top:1rem}
 td,th{border-bottom:1px solid #e5e5e5;padding:.55rem;vertical-align:top;text-align:left}
 tr.provisional{background:#fffbea} tr.cancelled{opacity:.45} tr.confirmed{background:#f0fdf4}
 button{margin-right:.4rem;padding:.3rem .7rem;cursor:pointer;border:1px solid #bbb;background:#fff;border-radius:4px}
 button.approve{border-color:#15803d;color:#15803d} button.reject{border-color:#b91c1c;color:#b91c1c}
 small{color:#666} .bar{display:flex;gap:.5rem;align-items:center;flex-wrap:wrap}
 .err{color:#b91c1c;margin:1rem 0} code{background:#f4f4f4;padding:.1rem .3rem;border-radius:3px}
 @media(prefers-color-scheme:dark){
   body{background:#111;color:#eee} td,th{border-color:#333}
   tr.provisional{background:#2a2410} tr.confirmed{background:#0f2417}
   button{background:#1c1c1c;color:#eee;border-color:#444} code{background:#222}
 }
</style>
<h1>Review queue</h1>
<p><small>Nothing here reaches a calendar until it is approved, and every row
carries the source it was extracted from — check the claim against it.</small></p>
<div class="bar">
  <label>show
    <select id="filter">
      <option value="">everything</option>
      <option value="provisional" selected>provisional</option>
      <option value="confirmed">confirmed</option>
      <option value="cancelled">cancelled</option>
    </select>
  </label>
  <button onclick="forgetKey()">forget key</button>
  <span id="count"></span>
</div>
<div id="out"><p><small>loading…</small></p></div>
<script>
const esc = s => String(s ?? '').replace(/[&<>"]/g, c =>
  ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
// Resolve sibling endpoints from THIS page's path, so the page works
// whether it was opened as /reviewAdmin or /reviewAdmin/ — a bare
// relative URL resolves differently in those two cases.
const BASE = location.pathname.replace(/\\/reviewAdmin\\/?$/, '');
const api = p => BASE + '/' + p;
function key(){
  let k = sessionStorage.getItem('kocKey');
  if (!k) { k = prompt('Operator key (SWEEP_KEY)'); if (k) sessionStorage.setItem('kocKey', k); }
  return k;
}
function forgetKey(){ sessionStorage.removeItem('kocKey'); location.reload(); }
async function load(){
  const k = key();
  if (!k) { document.getElementById('out').innerHTML =
    '<p class="err">No key entered. Reload to try again.</p>'; return; }
  const status = document.getElementById('filter').value;
  const r = await fetch(api('listReview') + (status ? '?status=' + status : ''),
    { headers: { 'x-sweep-key': k } });
  if (r.status === 403) {
    sessionStorage.removeItem('kocKey');
    document.getElementById('out').innerHTML =
      '<p class="err">That key was rejected. Reload to try again.</p>';
    return;
  }
  if (!r.ok) {
    document.getElementById('out').innerHTML =
      '<p class="err">Could not load the queue (HTTP ' + r.status + ').</p>';
    return;
  }
  const { items } = await r.json();
  document.getElementById('count').textContent = items.length + ' item(s)';
  if (!items.length) {
    document.getElementById('out').innerHTML =
      '<p><small>Nothing here yet. Submit a card with ' +
      '<code>POST /submitReview</code> — see docs/PLAN.md for the schema.</small></p>';
    return;
  }
  document.getElementById('out').innerHTML =
    '<table><tr><th>status</th><th>starts</th><th>card</th><th>bouts</th>' +
    '<th>source</th><th></th></tr>' + items.map(i => \`
      <tr class="\${esc(i.status)}">
        <td>\${esc(i.status)}</td>
        <td>\${esc(i.startUtc)}</td>
        <td><strong>\${esc(i.title)}</strong><br><small>\${esc(i.promoter)}\${
          i.venue ? ' — ' + esc(i.venue) : ''}\${
          i.broadcaster ? ' · ' + esc(i.broadcaster) : ''}</small></td>
        <td>\${(i.bouts || []).map(b => esc(b.first) + ' v ' + esc(b.second) +
          ' <small>(' + esc(b.cardPosition) +
          (b.titleOnTheLine ? ', ' + esc(b.titleOnTheLine) : '') + ')</small>').join('<br>')}</td>
        <td><a href="\${esc(i.sourceUrl)}" rel="noreferrer noopener" target="_blank">source</a></td>
        <td>
          <button class="approve" onclick="decide('\${esc(i.id)}','confirmed')">approve</button>
          <button class="reject" onclick="decide('\${esc(i.id)}','cancelled')">reject</button>
        </td>
      </tr>\`).join('') + '</table>';
}
async function decide(id, decision){
  const k = key();
  if (!k) return;
  const r = await fetch(api('decideReview') + '?id=' + encodeURIComponent(id) + '&decision=' + decision,
    { method: 'POST', headers: { 'x-sweep-key': k, 'Content-Type': 'application/json' }, body: '{}' });
  if (r.ok) load(); else alert('Failed (HTTP ' + r.status + '): ' + await r.text());
}
document.getElementById('filter').addEventListener('change', load);
load();
</script>`,
  );
});

// What every connector has actually delivered lately, per ingest slice.
// Read-only, but it scans the run history and every future-dated fixture,
// so it is guarded with the same shared key as the other ops endpoints and
// FAILS CLOSED — an unauthenticated unbounded scan is a cost surface, not
// a convenience.
export const coverageReport = onRequest(
  { timeoutSeconds: 120, memory: '256MiB', maxInstances: 2 },
  async (req, res) => {
    const expected = process.env.SWEEP_KEY;
    const provided = req.get('x-sweep-key');
    if (!expected || !provided || !timingSafeEqualStr(provided, expected)) {
      res.status(403).json({ error: 'forbidden' });
      return;
    }
    try {
      res.json(await loadCoverage(db, Date.now()));
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  },
);

// Manual trigger; dry-run by default so it can be inspected safely.
export const runReconcile = onRequest(
  { timeoutSeconds: 540, memory: '256MiB', maxInstances: 2 },
  async (req, res) => {
    const expected = process.env.SWEEP_KEY;
    const provided = req.get('x-sweep-key');
    if (!expected || !provided || !timingSafeEqualStr(provided, expected)) {
      res.status(403).json({ error: 'forbidden' });
      return;
    }
    try {
      res.json(await reconcileFixtures(req.query.apply !== 'true'));
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  },
);

// ─── Men's ATP matches: the vendor chain, inside the function ─────────
//
// Round 4 item 7 (owner ruling 2026-09-02): repair the existing
// tennisapi1 chain, no new vendor. The review sheet and its Apps Script
// are retired; the fetch the script did now runs here —
// vendor → Function → Firestore — and its status lives in the run record
// and status/atpVendor instead of a sheet tab nobody watched. The rules,
// the quota model, the static tournament map and the pagination
// measurement are in providers/tennisApiAtpEvents.ts.

const ATP_VENDOR_STATUS_DOC = 'status/atpVendor';
const ATP_VENDOR_TOURNAMENTS_DOC = 'status/atpVendorTournaments';
const ATP_VENDOR_SLICE = 'tennis-atp-vendor';

async function loadAtpParents(): Promise<Fixture[]> {
  const snap = await db
    .collection('fixtures')
    .where('competitionId', '==', 'tennis-atp')
    .get();
  return snap.docs.map((d) => d.data() as Fixture);
}

// Which ATP tournaments are actually on. Public, tiny, and no personal
// data — our own tournament windows, which the app already serves
// through listTournaments. The poller decides from the SAME pure
// function, so this endpoint is also the cheapest way to see what the
// next sweep will spend on: a week with no ATP tennis costs the vendor
// nothing at all.
export const activeTennisWindows = onRequest(async (_req, res) => {
  try {
    const windows = activeWindows(await loadAtpParents(), Date.now()).map((w) => ({
      tournamentKey: w.tournamentKey,
      name: w.name,
      venueCity: w.venueCity,
      startUtc: w.startUtc,
      endUtc: w.endUtc,
    }));
    res.json({ windows, checkedAt: new Date().toISOString() });
  } catch (e) {
    // An empty list means "no ATP tennis this week". A failed read must
    // NOT be able to say that.
    res.status(502).json({ error: String(e) });
  }
});

export const pollAtpVendor = onRequest(
  { timeoutSeconds: 120 },
  async (req, res) => {
    const out = await servePoll(
      triggerOf(req.get(TRIGGER_HEADER)),
      {
        source: ATP_VENDOR,
        sport: 'tennis',
        competitionId: ATP_VENDOR_SLICE,
        pollPath: 'pollAtpVendor',
        seasonRequested: null,
      },
      async (trace) => {
        trace.seasonsTried.push('current');
        // ONE key, no rotation (owner posture). Unconfigured is an error
        // and is recorded as one — never as "no matches".
        const key = requireAtpVendorKey();
        const nowMs = Date.now();
        const nowIso = new Date(nowMs).toISOString();
        // OUR store first, and free: which tournaments are live or start
        // inside 48h. Nothing on ⇒ zero vendor requests.
        const active = activeWindows(await loadAtpParents(), nowMs);
        const [statusSnap, cacheSnap] = await Promise.all([
          db.doc(ATP_VENDOR_STATUS_DOC).get(),
          db.doc(ATP_VENDOR_TOURNAMENTS_DOC).get(),
        ]);
        let quota = (statusSnap.data()?.quota as VendorQuota | undefined) ?? null;
        const cache =
          (cacheSnap.data()?.tournaments as
            | Record<string, TournamentCacheEntry>
            | undefined) ?? {};
        const appearances = appearanceSliceKey('tennis-atp');
        const requests: Record<VendorRequestKind, number> = {
          search: 0,
          seasons: 0,
          events: 0,
        };
        const discovery = { static: 0, cached: 0, discovered: 0, misses: [] as string[] };
        const failures: string[] = [];
        const warnings: string[] = [];
        const entries: Record<string, TournamentCacheEntry> = {};
        let pages = 0;
        let malformed = 0;
        const observations: Observation[] = [];
        const buildBody = (
          cover: readonly { tournamentKey: string }[],
          deferred: readonly { tournamentKey: string }[],
          singles: number,
          published: number,
          skipped: readonly SkippedRow[],
        ): AtpVendorStatus =>
          statusBody({
            nowMs,
            windows: {
              seen: active.length,
              covered: cover.map((w) => w.tournamentKey),
              deferred: deferred.map((w) => w.tournamentKey),
            },
            discovery,
            requests,
            pages,
            quota,
            rows: {
              fetched: observations.length,
              malformed,
              notSingles: observations.length - singles,
              published,
            },
            skipped,
            errors: [...failures, ...warnings],
          });
        // STATUS IS PERSISTED, so exhaustion is predicted rather than
        // discovered: the vendor's own quota headers (limit / remaining /
        // reset) land in status/atpVendor every run, 429s included, and
        // the next run plans its coverage from them. Instrumentation-
        // grade: a write that fails is logged and never fails the poll
        // it describes.
        const persist = async (body: AtpVendorStatus) => {
          try {
            // The named skips stay in the run record (sourceRuns); the
            // status doc keeps the counts.
            const { skippedDetail: _named, ...rowCounts } = body.rows;
            await db.doc(ATP_VENDOR_STATUS_DOC).set(
              {
                ...(body.quota ? { quota: body.quota } : {}),
                forecast: body.forecast,
                lastRun: {
                  at: nowIso,
                  status: body.status,
                  requests: body.requests,
                  windows: body.windows,
                  discovery: body.discovery,
                  rows: rowCounts,
                  errors: body.errors,
                },
                updatedAt: nowIso,
              },
              { merge: true },
            );
            if (Object.keys(entries).length > 0) {
              // Discovery is paid once: the ids (and each year's season
              // id) are cached here and read back before any search.
              await db
                .doc(ATP_VENDOR_TOURNAMENTS_DOC)
                .set({ tournaments: entries, updatedAt: nowIso }, { merge: true });
            }
          } catch (e) {
            console.error(`[kickoffcal] atp vendor status write failed: ${String(e)}`);
          }
        };

        if (active.length === 0) {
          const body = buildBody([], [], 0, 0, []);
          await persist(body);
          return {
            rawCount: 0,
            fixtures: [],
            followKey: ATP_VENDOR_SLICE,
            seasonResolved: 'current',
            // Honest empty: no ATP tournament is on. Alerts read this as
            // an off-season, not a dead source
            // (alerts.ts::APPEARANCE_ONLY_SLICES).
            reason: 'no_future_events' as const,
            appearances: {
              followKey: appearances,
              rawCount: 0,
              drafts: [],
              create: 'never' as const,
            },
            body: { ...body },
          };
        }

        // ADAPTIVE COVERAGE from the last-known quota: when the day is
        // thin, the soonest tournaments are covered and the rest are
        // NAMED as deferred (providers/tennisApiAtpEvents.ts::planCoverage).
        const { cover, deferred } = planCoverage(active, quotaAvailable(quota, nowMs));
        const get: VendorGet = (kind, path) => {
          requests[kind]++;
          return vendorGet(path, key, (q) => {
            quota = q;
          });
        };
        for (const w of cover) {
          try {
            const ids = await resolveVendorIds(w, cache, get, nowIso);
            discovery[ids.via]++;
            entries[w.tournamentKey] = ids.entry;
            // Every page until the vendor says there is no next one —
            // the script read page 0 only, and a 128-draw's first round
            // is three pages (measured 2026-09-02).
            for (let page = 0; ; page++) {
              if (page >= MAX_EVENT_PAGES) {
                warnings.push(
                  `${w.tournamentKey}: more than ${MAX_EVENT_PAGES} event pages — stopped reading`,
                );
                break;
              }
              const parsed = parseEventsPage(
                await get(
                  'events',
                  `/api/tennis/tournament/${ids.tournamentId}/season/${ids.seasonId}/events/next/${page}`,
                ),
              );
              pages++;
              const got = observationsFrom(parsed.events, w.tournamentKey, ids.tournamentId, nowIso);
              observations.push(...got.observations);
              malformed += got.malformed;
              if (!parsed.hasNextPage) break;
            }
          } catch (e) {
            // ONE TOURNAMENT FAILING MUST NOT STOP THE OTHERS, and it must
            // not look like that tournament has no matches: with no
            // drafts for its parent, retirement's evidence guard leaves
            // its stored appearances alone.
            const msg = String(e);
            failures.push(`${w.tournamentKey}: ${msg}`);
            if (/no ATP singles entity/.test(msg)) discovery.misses.push(w.tournamentKey);
          }
        }
        if (failures.length === cover.length) {
          // EVERY live tournament failed: that is a failed read, and a
          // failed read must never publish as "no matches" (standing
          // invariant). The status doc still records what was spent and
          // what the vendor said about the quota.
          await persist(buildBody(cover, deferred, 0, 0, []));
          throw new Error(`every live tournament failed: ${failures.join(' ; ')}`);
        }

        // PLAYERS BY VENDOR ID, against our own directory. No vendor
        // request, no name matching: a player without
        // providerIds.tennisapi1 is skipped and named.
        const index = await loadAthleteIndex(db);
        const athleteIdOf = (vendorPlayerId: string): string | null =>
          index.byProvider.get(providerKey(ATP_VENDOR, vendorPlayerId))?.id ?? null;
        const singles = observations.filter((o) => o.singles);
        const rows = rowsFrom(singles, athleteIdOf);
        const parents = new Map(cover.map((w) => [w.tournamentKey, w.parent]));
        const { publish, skipped } = publishable(rows, new Set(parents.keys()));
        const drafts = draftsFrom(publish, parents, nowIso);
        const body = buildBody(cover, deferred, singles.length, drafts.length, skipped);
        await persist(body);
        return {
          rawCount: observations.length,
          // Matches only, never the tournament parents — those stay the
          // ICS's job, and two sources writing one slice is how a reaper
          // eats a live fixture.
          fixtures: [],
          followKey: ATP_VENDOR_SLICE,
          seasonResolved: 'current',
          appearances: {
            followKey: appearances,
            rawCount: observations.length,
            drafts,
            // NOTHING IS MINTED FROM THE VENDOR. Every player here
            // resolved by id to an athlete we already hold; an unmapped
            // one was skipped upstream and is named in
            // rows.skippedDetail.
            create: 'never' as const,
          },
          body: { ...body },
        };
      },
    );
    res.status(out.status).json(out.body);
  },
);

// ─── Account data deletion (Stage 7B) ─────────────────────────────────
//
// Removes everything the caller's uid owns server-side: the device
// registration and the entitlements doc. The caller proves the uid with
// a Firebase ID token — this is the canonical wipe path (the client's
// direct devices/{uid} delete is only its cold-function fallback), and
// it is deliberately shaped to become the core of the hosted web
// deletion endpoint that real account linking will require. Idempotent:
// deleting absent docs succeeds, so a retry after a half-applied run
// converges.
// RevenueCat webhook (Round 5 Stage 3): writes the server-side MIRROR
// entitlements/{app_user_id}. NOT a gate — the client planner enforces
// from the SDK's cached state; this document serves support, the
// deletion tombstone (deleteAccountData removes it) and any later web
// surface. FAILS CLOSED: no RC_WEBHOOK_SECRET in the environment, or a
// header that does not match it, and every request is refused. The
// Authorization header value is set verbatim in the RevenueCat webhook
// configuration by the owner.
export const revenuecatWebhook = onRequest(async (req, res) => {
  if (!rcAuthorised(req.get('authorization'), process.env.RC_WEBHOOK_SECRET)) {
    res.status(403).json({ error: 'forbidden' });
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method not allowed' });
    return;
  }
  const event = (req.body as { event?: RevenueCatEvent } | undefined)?.event;
  if (!event || typeof event.type !== 'string') {
    res.status(400).json({ error: 'no event' });
    return;
  }
  if (!isEventForUs(event, RC_ENTITLEMENT_ID)) {
    res.status(200).json({ ignored: true, type: event.type });
    return;
  }
  const mapped = mirrorFromEvent(event, Date.now());
  if (!mapped) {
    res.status(200).json({ ignored: true, reason: 'no app_user_id' });
    return;
  }
  try {
    await db.collection('entitlements').doc(mapped.uid).set(mapped.mirror, { merge: true });
    res.status(200).json({ ok: true, uid: mapped.uid, tier: mapped.mirror.tier, type: event.type });
  } catch (e) {
    console.error(`[kickoffcal] revenuecat webhook write failed: ${e}`);
    res.status(500).json({ error: String(e) });
  }
});
const RC_ENTITLEMENT_ID = 'premium';

export const deleteAccountData = onRequest(async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }
  const m = /^Bearer (.+)$/.exec(String(req.headers.authorization ?? ''));
  if (!m) {
    res.status(401).json({ error: 'unauthenticated' });
    return;
  }
  let uid: string;
  try {
    uid = (await getAdminAuth().verifyIdToken(m[1])).uid;
  } catch {
    res.status(401).json({ error: 'invalid_token' });
    return;
  }
  try {
    await db.collection('devices').doc(uid).delete();
    await db.collection('entitlements').doc(uid).delete();
    res.json({ ok: true, deleted: ['devices', 'entitlements'] });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});
