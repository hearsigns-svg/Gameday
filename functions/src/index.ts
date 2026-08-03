import { createHash, timingSafeEqual } from 'node:crypto';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { onRequest } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { sweepAll } from './sweep';
import { reconcileFixtures } from './reconcile';
import { augmentFollowKeys, loadTeamAliases } from './aliases';
import {
  appearanceEndMs,
  appearanceSliceKey,
  deriveBoutAppearances,
  retiredAppearanceIds,
} from './appearances';
import { normaliseName } from './identity';
import {
  AppearanceDraft,
  applyCreatedIds,
  AthleteProvenance,
  CreationPolicy,
  NewAthleteSpec,
  providerKey,
  resolveDrafts,
  stampDriverKeys,
} from './athletes';
import {
  createAthletes,
  loadAthleteIndex,
  loadAthletes,
  updateAthleteNextStart,
} from './rosterStore';
import { enrichBoutParticipants, namesPeople } from './participants';
import { reapCandidates } from './reaper';
import { searchAthletes, searchTeams, shapeAthleteBrowse } from './search';
import { CatalogueEntry, sportWeightsOf } from './catalogue';
import { shapeTournamentRows } from './tennisTournaments';
import { TSDB_TEAM_LEAGUES } from './tsdbTeamLeagues';
import { bestSeason, seasonsToTry } from './season';
import { diffFixtures } from './diff';
import { Fixture, FixtureStatus } from './fixture';
import { loadCoverage } from './coverage';
import { loadFdSeasons } from './fdSeasons';
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
import { fetchMlbTeamSeasonFixtures } from './providers/mlb';
import { fetchNhlTeamSeasonFixtures } from './providers/nhl';
import { fetchF1SeasonFixtures } from './providers/f1';
import { fetchPbcCards } from './providers/pbc';
import { fetchTennisTournaments } from './providers/tennisIcs';
import { fetchWorldAthletics } from './providers/worldAthletics';
import { fetchWtaTennis } from './providers/wtaTennis';
import { fetchWtaRankings } from './providers/wtaRankings';
import { ATP_ROSTER_ENABLED, fetchAtpRoster } from './providers/wikidataAtp';
import { fetchIbfRatings } from './providers/ibfRatings';
import { fetchJolpicaDrivers } from './providers/jolpicaDrivers';
import { applyRoster } from './rosterStore';
import {
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
  const withPeople = enrichBoutParticipants(rawIncoming);
  // Stamp every provider's key for each club onto the fixture, so a
  // team followed via one provider still matches fixtures supplied by
  // another (league from football-data, cups from TSDB).
  //
  // No longer gated to soccer: the gate was there because only the soccer
  // directories were populated, but the alias table now covers every
  // league with a team directory, and a cross-provider club is a
  // cross-provider club whatever the sport.
  const incoming = augmentFollowKeys(withPeople, await loadTeamAliases(db));
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
  const sameFixture = (a: Fixture, b: Fixture): boolean => {
    const strip = ({ updatedAt, firstSeenAt, ...rest }: Fixture) => rest;
    return JSON.stringify(strip(a)) === JSON.stringify(strip(b));
  };
  let stored = 0;
  let unchanged = 0;
  for (const f of incoming) {
    const prev = existing.get(f.id);
    if (prev && sameFixture(prev, f)) {
      unchanged++;
      continue;
    }
    // firstSeenAt decides which id survives a cross-source merge — it
    // must never be reset by a re-poll.
    const record: Fixture = { ...f, firstSeenAt: prev?.firstSeenAt ?? at };
    batch.set(db.collection('fixtures').doc(f.id), record);
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
    const apply =
      reaperEnabled() && !decision.guardTripped && decision.candidates.length > 0;
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
    const createKeyOf = (s: NewAthleteSpec): string =>
      s.ref.source && s.ref.externalId
        ? providerKey(s.ref.source, s.ref.externalId)
        : `${s.sport}|${normaliseName(s.ref.name)}`;
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

export const listLeagues = onRequest(async (_req, res) => {
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
    }));
    const dormantSet = new Set(data.dormant);
    leagues.sort(
      (a, b) =>
        (dormantSet.has(a.key) ? 1 : 0) - (dormantSet.has(b.key) ? 1 : 0) ||
        (data.map[b.key] ?? 0) - (data.map[a.key] ?? 0),
    );
    res.json({ leagues });
  } catch (e) {
    // An empty league list would read as "soccer has no competitions".
    // Fail loudly instead so the client shows an error it can retry.
    res.status(502).json({ error: String(e) });
  }
});

// Federated search across everything followable (cached directories +
// live TSDB filtered to served leagues, plus the athlete directory the
// appearance ingest maintains).
export const searchEntities = onRequest(async (req, res) => {
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
});

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
} | null = null;
// In-flight dedup: a cold cache under concurrent callers must fire the
// ~67 dormancy counts once, not once per caller (review round).
let priorityInflight: Promise<{
  map: Record<string, number>;
  sportWeights: Record<string, number>;
  dormant: string[];
}> | null = null;

async function loadPriorityData(): Promise<{
  map: Record<string, number>;
  sportWeights: Record<string, number>;
  dormant: string[];
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
}> {
  const snap = await db.collection('catalogue').get();
  const entries = snap.docs.map((d) => d.data() as CatalogueEntry);
  const map: Record<string, number> = {};
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
  };
  return priorityCache;
}

async function loadPriorities(): Promise<Record<string, number>> {
  return (await loadPriorityData()).map;
}

export const listPriorities = onRequest(async (_req, res) => {
  try {
    const { map, sportWeights, dormant } = await loadPriorityData();
    res.json({ priorities: map, sportWeights, dormant });
  } catch (e) {
    res.status(502).json({ error: String(e) });
  }
});

export const listTournaments = onRequest(async (_req, res) => {
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
});

// Individual-sport browse: curated entry points from the canonical
// directory — champions and rated fighters by weight class, tennis by
// ranking, the F1 grid — plus the "competing soon" row. Search-first is
// the client's job; this is what keeps the screen from ever being empty.
export const listAthletes = onRequest(async (req, res) => {
  try {
    const sport = String(req.query.sport ?? '');
    if (!sport) {
      res.status(400).json({ error: 'sport is required' });
      return;
    }
    const athletes = await loadAthletes(db);
    res.json(shapeAthleteBrowse(athletes, sport, new Date().toISOString()));
  } catch (e) {
    // An empty athlete list would read as "this sport has nobody".
    // Fail loudly instead so the client shows an error it can retry.
    res.status(502).json({ error: String(e) });
  }
});

export const listTeams = onRequest(async (req, res) => {
  try {
    const sport = String(req.query.sport ?? 'soccer');
    // Generic TSDB team-league branch: any league in the shared table
    // serves a team directory — rugby, WNBA, KHL, NPB, internationals —
    // the same way NBA/NFL/IPL always did (verified live: every entry
    // returns a full badge-complete team list).
    const tsdbLeague = TSDB_TEAM_LEAGUES[String(req.query.leagueId ?? '')];
    if (tsdbLeague) {
      res.json({
        teams: await listTsdbTeams(
          requireTsdbKey(),
          tsdbLeague.tsdbName,
          tsdbLeague.cacheKey,
        ),
      });
      return;
    }
    if (sport === 'baseball') {
      const season = Number(req.query.season ?? new Date().getFullYear());
      res.json({ teams: await listMlbTeams(season, optionalTsdbKey()) });
      return;
    }
    if (sport === 'ice-hockey') {
      res.json({ teams: await listNhlTeams(optionalTsdbKey()) });
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
});

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
      trace.seasonsTried.push(String(resolved));
      const r = await fetchFdCompetitionSeasonFixtures(
        requireFdKey(),
        code,
        resolved,
      );
      return {
        ...r,
        followKey,
        seasonResolved: String(resolved),
        sliceComplete: true,
        body: { season: resolved },
      };
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

interface RosterSource {
  slice: string;
  source: string;
  sport: string;
  run: () => Promise<{ rawCount: number; entries: import('./athletes').RosterEntry[] }>;
  applyOpts?: { nameMatchExcludesSources?: string[] };
}

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
          applyOpts: { nameMatchExcludesSources: ['wta'] },
        },
      ]
    : []),
];

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
      const { rawCount, entries } = await s.run();
      // ZERO entries is never applied: a roster source answering with
      // nothing (a January F1 season page before the grid exists, a
      // filter regression) would mark every athlete absent, deactivate
      // them within two refreshes, and — for F1 — strip driver keys
      // from every session, deleting followers' events. Better a loud
      // error and last week's roster than a silent decimation.
      if (entries.length === 0) {
        throw new Error(`${s.source} roster returned zero entries`);
      }
      const applied = await applyRoster(db, entries, startedAt, s.applyOpts ?? {});
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
          fixtures: r.fixtures,
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

// The Tennis TV ICS is fetched ONCE DAILY by owner ruling (2026-07-31)
// — subscribing, not crawling. The catalogue briefly polled it every
// sweep and calendar.google.com answered 429 (F41), so the cadence
// commitment is enforced HERE, where every trigger converges, not left
// to whoever invokes the route. 22h, not 24: the daily tier-2 window
// drifts inside 00–06 UTC, and yesterday's 05:20 success must not
// block tomorrow's early attempts.
const ICS_MIN_INTERVAL_MS = 22 * 3_600_000;
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
  try {
    const marker = await db.doc(ICS_MARKER_DOC).get();
    lastSuccessAt = marker.exists
      ? ((marker.data() as { lastSuccessAt?: string }).lastSuccessAt ?? null)
      : null;
  } catch (e) {
    // A marker READ failure fails CLOSED: fetching anyway could break
    // the once-daily commitment, and the run record keeps the failure
    // from reading as a quiet skip (standing invariant).
    await recordSourceRun(
      { ...ctx, trigger },
      {
        httpStatus: null,
        seasonResolved: null,
        seasonsTried: [],
        counts: EMPTY_COUNTS,
        error: `ics daily-cap marker read failed: ${String(e)}`,
      },
      startedAt,
    );
    res.status(502).json({ error: 'ics daily-cap marker read failed' });
    return;
  }
  if (
    lastSuccessAt !== null &&
    Date.parse(startedAt) - Date.parse(lastSuccessAt) < ICS_MIN_INTERVAL_MS
  ) {
    await recordSourceRun(
      { ...ctx, trigger },
      {
        httpStatus: null,
        seasonResolved: null,
        seasonsTried: [],
        counts: EMPTY_COUNTS,
        error: null,
        reason: 'skipped_ics_daily_cap',
      },
      startedAt,
    );
    res.status(200).json({ skipped: 'ics_daily_cap', lastSuccessAt });
    return;
  }
  const out = await servePoll(trigger, ctx, async (trace) => {
    trace.seasonsTried.push('current');
    const r = await fetchTennisTournaments();
    return { ...r, followKey: 'tennis-atp', seasonResolved: 'current', sliceComplete: true };
  });
  if (out.status === 200) {
    try {
      await db.doc(ICS_MARKER_DOC).set({ lastSuccessAt: new Date().toISOString() });
    } catch (e) {
      // Never fail a successful poll over the marker; the cost of a
      // lost write is one extra fetch tomorrow, not data loss.
      console.error(`[kickoffcal] tennis ics marker write failed: ${String(e)}`);
    }
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
            grouping: 'WTA Tour',
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
