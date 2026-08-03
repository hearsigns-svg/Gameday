// One real fight, one calendar entry. PURE.
//
// The same bout reaches the store from more than one place: TheSportsDB
// publishes the fight NIGHT as a card whose title is the headline bout,
// PBC publishes the same night as a card PLUS per-bout appearance docs,
// and the cross-source reconciler can never merge any of them — the
// merge-safety rule demands an identical competition string ("Boxing"
// vs "Premier Boxing Champions", recorded as F28), and a parent must
// never merge with an appearance anyway. So a user following "Major
// fight cards" AND one of the headline fighters fetched TWO docs for
// one fight — two carousel cards, two calendar events (observed
// on-device 2026-08-03: Romero–Lopez, "Time TBC" beside "23:00").
//
// In COMBAT sports the participant pair IS the event's identity: the
// same two people do not fight twice within a day under different
// banners. So among the fetched fixtures, docs in a person-sport whose
// normalised participant pair matches within a 36-hour window are ONE
// fight, and the best-informed doc represents it:
//   exact > nominal > date_only, then an appearance over a parent card
//   (it carries the bout's own slot and the athletes' identity), then
//   the lexicographically smaller id — deterministic run over run.
// An UNDERCARD bout never collides with its card (different pair), so
// a cards-follower who also follows a prelim fighter keeps both
// entries — those are genuinely two things.
//
// Pinned fixtures are never dropped: an explicit pin is the user's
// word, and dedupe must not overrule it. Cancelled docs pass through
// untouched so their deletion propagates normally.

import { Fixture } from './fixture';
import { timePrecisionOf } from './horizon';

// Sports whose fixtures name PEOPLE — mirrors the server's
// participants.ts PERSON_SPORTS (kept in sync by hand, like the
// Fixture model itself). Team sports never enter this path: Chelsea v
// Arsenal in league and cup within a week is two real fixtures.
const PERSON_SPORTS = new Set(['boxing', 'ufc']);

// Mirrors functions/src/identity.ts normaliseName: case and diacritics
// fold, every non-alphanumeric becomes a space — so "Teófimo López"
// and "Teofimo Lopez" are one participant.
function normalise(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const SAME_BOUT_WINDOW_MS = 36 * 3_600_000;

const PRECISION_RANK: Record<string, number> = {
  exact: 3,
  nominal: 2,
  date_only: 1,
};

function score(f: Fixture): number {
  const precision = PRECISION_RANK[timePrecisionOf(f)] ?? 1;
  // Appearances outrank parents at equal precision: the bout doc is
  // the fight itself, with the athletes' identity on it.
  return precision * 2 + (f.parentFixtureId ? 1 : 0);
}

function pairKey(f: Fixture): string | null {
  if (!PERSON_SPORTS.has(f.sport)) return null;
  if (!f.homeTeam || !f.awayTeam) return null;
  const pair = [normalise(f.homeTeam), normalise(f.awayTeam)].sort();
  if (pair[0].length === 0 || pair[1].length === 0) return null;
  return `${f.sport}|${pair.join('|')}`;
}

// ─── Tennis: one tournament, two feeds ────────────────────────────────
//
// A joint ATP+WTA event is one tournament in two parent docs (the ICS
// and the WTA API), unmergeable server-side for the same F28 reasons.
// Since Prompt 9 both parents carry the canonical year-agnostic
// tournament key (`tennis-t-<slug>`), so the pair is identifiable here:
// same key, overlapping spans ⇒ one real event. The WTA doc wins — it
// is the richer side (draws and order of play hang off it) — with the
// id as the deterministic tiebreak. Editions a year apart never
// overlap, so a "Wimbledon" follow still yields every year's event.
function tournamentPairKey(f: Fixture): string | null {
  if (f.sport !== 'tennis') return null;
  if (f.parentFixtureId) return null; // appearances are never parents
  return f.followKeys.find((k) => k.startsWith('tennis-t-')) ?? null;
}

function spansOverlap(a: Fixture, b: Fixture): boolean {
  const endOf = (f: Fixture) =>
    Date.parse(f.startUtc) + (f.durationHours ?? 24) * 3_600_000;
  return (
    Date.parse(a.startUtc) < endOf(b) && Date.parse(b.startUtc) < endOf(a)
  );
}

function dedupeJointTournaments(
  fixtures: readonly Fixture[],
  pinnedIds: ReadonlySet<string>,
): Fixture[] {
  const byKey = new Map<string, Fixture[]>();
  for (const f of fixtures) {
    if (f.status === 'cancelled') continue;
    const key = tournamentPairKey(f);
    if (!key) continue;
    byKey.set(key, [...(byKey.get(key) ?? []), f]);
  }
  const drop = new Set<string>();
  for (const group of byKey.values()) {
    if (group.length < 2) continue;
    const sorted = [...group].sort((a, b) =>
      a.startUtc.localeCompare(b.startUtc),
    );
    let cluster: Fixture[] = [];
    const flush = () => {
      // SAME-PROVIDER GUARD, the rule that prevents data loss
      // (identity.ts): two docs from ONE feed are distinct by
      // construction — a feed quirk (a duplicate VEVENT, a split
      // "Davis Cup Final 8"/"Davis Cup Final") must never silently
      // delete a real event. Only a genuine cross-feed pair collapses.
      const providers = new Set(cluster.map((f) => f.id.split('-')[0]));
      if (cluster.length >= 2 && providers.size >= 2) {
        const winner = [...cluster].sort((a, b) => {
          const aw = a.id.startsWith('wta-') ? 0 : 1;
          const bw = b.id.startsWith('wta-') ? 0 : 1;
          return aw - bw || a.id.localeCompare(b.id);
        })[0];
        for (const f of cluster) {
          if (f.id !== winner.id && !pinnedIds.has(f.id)) drop.add(f.id);
        }
      }
      cluster = [];
    };
    for (const f of sorted) {
      if (cluster.length === 0 || cluster.some((c) => spansOverlap(c, f))) {
        cluster.push(f);
      } else {
        flush();
        cluster = [f];
      }
    }
    flush();
  }
  return fixtures.filter((f) => !drop.has(f.id));
}

// The umbrella: every same-real-event rule, applied before the planner
// and the snapshot. Combat pairs and joint tennis tournaments today;
// any future "one event, two feeds" class belongs here too.
export function dedupeSameEvent(
  fixtures: readonly Fixture[],
  pinnedIds: ReadonlySet<string> = new Set(),
): Fixture[] {
  return dedupeJointTournaments(
    dedupeSameBout(fixtures, pinnedIds),
    pinnedIds,
  );
}

export function dedupeSameBout(
  fixtures: readonly Fixture[],
  pinnedIds: ReadonlySet<string> = new Set(),
): Fixture[] {
  // Cluster candidates by pair, then by time proximity within the pair.
  const byPair = new Map<string, Fixture[]>();
  for (const f of fixtures) {
    if (f.status === 'cancelled') continue;
    const key = pairKey(f);
    if (!key) continue;
    byPair.set(key, [...(byPair.get(key) ?? []), f]);
  }
  const drop = new Set<string>();
  for (const group of byPair.values()) {
    if (group.length < 2) continue;
    const sorted = [...group].sort((a, b) =>
      a.startUtc.localeCompare(b.startUtc),
    );
    let cluster: Fixture[] = [];
    let clusterStartMs = 0;
    const flush = () => {
      if (cluster.length < 2) {
        cluster = [];
        return;
      }
      const winner = [...cluster].sort(
        (a, b) => score(b) - score(a) || a.id.localeCompare(b.id),
      )[0];
      for (const f of cluster) {
        if (f.id !== winner.id && !pinnedIds.has(f.id)) drop.add(f.id);
      }
      cluster = [];
    };
    for (const f of sorted) {
      const ms = Date.parse(f.startUtc);
      if (cluster.length === 0 || ms - clusterStartMs <= SAME_BOUT_WINDOW_MS) {
        if (cluster.length === 0) clusterStartMs = ms;
        cluster.push(f);
      } else {
        flush();
        cluster = [f];
        clusterStartMs = ms;
      }
    }
    flush();
  }
  return fixtures.filter((f) => !drop.has(f.id));
}
