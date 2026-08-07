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
// fold, non-decomposing letters transliterated (đ→dj — Prompt 10b),
// every non-alphanumeric becomes a space — so "Teófimo López" and
// "Teofimo Lopez" are one participant.
function normalise(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/đ/g, 'dj')
    .replace(/ø/g, 'o')
    .replace(/ł/g, 'l')
    .replace(/æ/g, 'ae')
    .replace(/ß/g, 'ss')
    .replace(/þ/g, 'th')
    .replace(/ð/g, 'd')
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

// THE CANONICAL PAIR (Prompt 14). Two combat records are the same
// event when the same canonical FIGHTER PAIR meets on the same date
// from different providers — and canonical athlete ids make that safe
// in a way names never were: `athlete_000003` is one person, "Rolando
// Romero" is a string two feeds may spell differently ("Rolando 'Rolly'
// Romero", "Teófimo López"). Normalisation catches the accents; it does
// not catch a nickname.
//
// This is an ADDITIONAL key, not a replacement. Card docs carry no
// participants BY CONSTRUCTION — a TSDB card's title is its main event
// and its athletes array is empty — so requiring ids would stop a card
// merging with the bout it names, which is a merge that already ships
// and that a cards-plus-fighter follower depends on. Names remain the
// fallback for exactly that case; ids strictly ADD merges, never remove
// them.
const CANONICAL_ATHLETE = /^athlete_\d{6}$/;

// THE PER-PLAYER TWIN (Prompt 20). Tennis appearances are ONE DOC PER
// PLAYER — `index.ts` emits both sides separately because a single doc
// carrying two id-bearing refs trips resolution's F34 guard. That is
// right for identity and wrong for calendars: 45 production pairs
// describe the SAME match, so a user following both players of a match
// gets two events for it today, and it would become the default the day
// a competition follow delivers matches.
//
// Neither existing rule catches them. `pairKey`/`canonicalPairKey` are
// gated on PERSON_SPORTS (boxing, UFC) and `tournamentPairKey` returns
// null for anything carrying a parentFixtureId.
//
// The key is the PARENT plus the unordered pair of names, taken from the
// title's own prefix — which is safe to read here in a way the round
// suffix is not, because the pair is everything BEFORE the first em
// dash and the separator is a literal " vs " this codebase writes
// itself (`matchTitle`, and the WTA provider's title builder).
//
// DROPPING THE LOSER IS CORRECT, not lossy: a user who follows only one
// of the two players never fetches the other's doc, so there is no twin
// to collapse; when both are followed either doc is the same match, and
// the survivor still carries a key that user holds.
function appearanceTwinKey(f: Fixture): string | null {
  if (!f.parentFixtureId) return null;
  // A FINALS SLOT IS NOT A TWIN. Once a final is confirmed the slot doc
  // names the same two players under the same parent as their own
  // appearances, so this rule would collapse it — stealing a decision
  // `dedupeFinalSlots` already owns and makes follow-key-aware, and
  // which deliberately STANDS DOWN without that context rather than
  // deleting an event the user wanted (regression test, Prompt 11).
  if (f.followKeys.some((k) => k.endsWith('-finals'))) return null;
  const head = (f.title ?? '').split(' — ')[0];
  const sides = head.split(' vs ');
  if (sides.length !== 2) return null;
  const pair = [normalise(sides[0]), normalise(sides[1])].sort();
  if (pair[0].length === 0 || pair[1].length === 0) return null;
  if (pair[0] === pair[1]) return null; // a player cannot play themselves
  return `${f.parentFixtureId}|${pair.join('|')}`;
}

function canonicalPairKey(f: Fixture): string | null {
  if (!PERSON_SPORTS.has(f.sport)) return null;
  const ids = f.followKeys.filter((k) => CANONICAL_ATHLETE.test(k)).sort();
  // Exactly two: a bout is two people. One id is an undercard doc we
  // could only half-identify; three would not be a bout at all, and
  // guessing which two it means is the failure the surname rule exists
  // to prevent.
  if (ids.length !== 2) return null;
  return `${f.sport}|${ids.join('|')}`;
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

// ─── Tennis: the finals slot and a followed finalist ──────────────────
//
// A "tournament + final" follow fetches the competition-scoped slot doc
// (`…-slot-final`, carrying a `tennis-t-…-finals` key); a follower of a
// FINALIST fetches her rolling appearance, which IS the same match once
// the order of play confirms it. Both confirmed at the same instant
// under the same parent ⇒ one real event; the appearance wins (it
// carries the athlete's identity and her follow key) — but ONLY when
// somebody actually wants it. A pinned fixture's slice key drags every
// appearance of the whole tour into the fetch, and an appearance
// nothing follows must never eat the followed slot: the slot would be
// dropped, the twin never planned, and the final the user opted into
// deleted (review round, confirmed trace). While shapes differ — a
// provisional last-day slot beside a player's mid-week match — they
// are genuinely different statements and both stay.
function dedupeFinalSlots(
  fixtures: readonly Fixture[],
  pinnedIds: ReadonlySet<string>,
  wantedKeys: ReadonlySet<string> | null,
): Fixture[] {
  // Without the follow-key context there is no safe drop decision —
  // keeping both is harmless; deleting a wanted event is not.
  if (wantedKeys === null) return [...fixtures];
  const drop = new Set<string>();
  for (const s of fixtures) {
    if (s.status === 'cancelled' || pinnedIds.has(s.id)) continue;
    if (!s.parentFixtureId) continue;
    if (!s.followKeys.some((k) => k.startsWith('tennis-t-') && k.endsWith('-finals'))) {
      continue;
    }
    if (timePrecisionOf(s) !== 'exact') continue;
    const twin = fixtures.some(
      (f) =>
        f.id !== s.id &&
        f.status !== 'cancelled' &&
        f.parentFixtureId === s.parentFixtureId &&
        !f.followKeys.some((k) => k.endsWith('-finals')) &&
        timePrecisionOf(f) === 'exact' &&
        f.startUtc === s.startUtc &&
        (pinnedIds.has(f.id) ||
          f.followKeys.some((k) => wantedKeys.has(k))),
    );
    if (twin) drop.add(s.id);
  }
  return drop.size === 0 ? [...fixtures] : fixtures.filter((f) => !drop.has(f.id));
}

// The umbrella: every same-real-event rule, applied before the planner
// and the snapshot. Combat pairs, joint tennis tournaments and the
// tennis finals slot today; any future "one event, two feeds" class
// belongs here too. `wantedKeys` is the scope-expanded follow-key set;
// callers that cannot supply it get the finals rule skipped rather
// than guessed.
export function dedupeSameEvent(
  fixtures: readonly Fixture[],
  pinnedIds: ReadonlySet<string> = new Set(),
  wantedKeys: ReadonlySet<string> | null = null,
): Fixture[] {
  return dedupeFinalSlots(
    dedupeJointTournaments(dedupeSameBout(fixtures, pinnedIds), pinnedIds),
    pinnedIds,
    wantedKeys,
  );
}

export function dedupeSameBout(
  fixtures: readonly Fixture[],
  pinnedIds: ReadonlySet<string> = new Set(),
): Fixture[] {
  // Cluster candidates by pair, then by time proximity within the pair.
  // TWO KEYINGS, one loop: the canonical id pair (certain, and blind to
  // how each feed spells a name) and the normalised name pair (the only
  // key a participant-less card doc can offer). A doc may appear in
  // both; the drop set is a union, so a merge found either way counts
  // and neither can undo the other.
  const buckets = new Map<string, Fixture[]>();
  for (const f of fixtures) {
    if (f.status === 'cancelled') continue;
    for (const [kind, key] of [
      ['id', canonicalPairKey(f)],
      ['name', pairKey(f)],
      ['twin', appearanceTwinKey(f)],
    ] as const) {
      if (!key) continue;
      const k = `${kind}:${key}`;
      buckets.set(k, [...(buckets.get(k) ?? []), f]);
    }
  }
  const drop = new Set<string>();
  for (const group of buckets.values()) {
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
