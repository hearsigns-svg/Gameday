// Follow-store normalizers run at every launch — idempotent by
// construction, so a legacy follow arriving LATER (a base-key follow
// made from an old build, a stale search result) converts on the next
// start instead of slipping past a one-time flag.

import { t } from '../../../core/i18n';
import { SPORTS } from '../domain/sportsConfig';
import { Followable, loadFollowables, replaceFollowables } from './followStore';

// B7 final shape (owner 2026-08-30): the boxing card follows are
// sex-scoped now. An existing base-key follower keeps EQUIVALENT
// COVERAGE by mapping to BOTH sexed follows — the same underlying
// fixtures (every card carries at least one scoped key; a zero-classed
// card carries both), and the planner's wanted-map is keyed by fixture
// id, so two follows delivering one fixture is still one calendar
// event: no churn.
const BOXING_BASE_KEYS: readonly string[] = ['tsdb-league-4445', 'pbc-cards'];

export function migrateBoxingSexFollows(): void {
  const follows = loadFollowables();
  if (!follows.some((f) => BOXING_BASE_KEYS.includes(f.key))) return;
  const next: Followable[] = [];
  for (const f of follows) {
    if (!BOXING_BASE_KEYS.includes(f.key)) {
      next.push(f);
      continue;
    }
    for (const sex of ['m', 'w'] as const) {
      const scopedKey = `${f.key}-${sex}`;
      // A sexed follow the user already holds wins over the copy.
      if (
        follows.some((o) => o.key === scopedKey) ||
        next.some((o) => o.key === scopedKey)
      ) {
        continue;
      }
      next.push({
        ...f,
        key: scopedKey,
        label: `${f.label} — ${t(
          sex === 'm' ? 'follows.athletes.mens' : 'follows.athletes.womens',
        )}`,
      });
    }
  }
  replaceFollowables(next);
}

// Round 7: the tennis 'Tournament + final' scope is retired — the tier
// model owns what a tournament writes, and the final slot reaches the
// planner through the tier pass's children fetch. A stored 'finals'
// scope maps to the nearest RICHER tier ('key-rounds': bookends plus
// finals/semis/quarters — the user explicitly asked for more than the
// block, and under the default preference this is what they were
// already receiving). Idempotent: after one pass no 'finals' remains.
export function migrateTournamentFinalsScope(): void {
  const follows = loadFollowables();
  if (!follows.some((f) => f.scope === 'finals')) return;
  replaceFollowables(
    follows.map((f) =>
      f.scope === 'finals' ? { ...f, scope: 'key-rounds' as const } : f,
    ),
  );
}

// Round 6 item 4: PBC follow keys migrate to the corresponding Major
// fight cards keys. Runs AFTER the sex split above, so the keys it sees
// are `pbc-cards-m` / `pbc-cards-w` (a bare `pbc-cards` is handled too).
// A Major fight cards follow the user already holds wins; otherwise the
// PBC follow is REWRITTEN in place (same object, new key/label/poll
// path) — its exclusions and pins are fixture-id keyed and unaffected,
// and the PBC cards it wanted still arrive under the new key, so the
// planner sees no create and no delete: no calendar churn.
const PBC_BASE = 'pbc-cards';
const MAJOR_CARDS_BASE = 'tsdb-league-4445';
const MAJOR_CARDS_POLL_PATH =
  'pollTsdbLeague?leagueId=4445&season=2026&sport=boxing&durationHours=3';

export function pbcTargetKey(key: string): string | null {
  if (key === PBC_BASE) return MAJOR_CARDS_BASE;
  const m = /^pbc-cards-(m|w)$/.exec(key);
  return m ? `${MAJOR_CARDS_BASE}-${m[1]}` : null;
}

export function migratePbcFollows(): void {
  const follows = loadFollowables();
  if (!follows.some((f) => pbcTargetKey(f.key) !== null)) return;
  const next: Followable[] = [];
  for (const f of follows) {
    const target = pbcTargetKey(f.key);
    if (target === null) {
      next.push(f);
      continue;
    }
    if (follows.some((o) => o.key === target) || next.some((o) => o.key === target)) {
      continue; // the Major fight cards follow already covers it
    }
    const sex = target.endsWith('-m') ? 'm' : target.endsWith('-w') ? 'w' : null;
    const baseLabel =
      SPORTS.find((sp) => sp.key === 'boxing')?.staticCompetitions?.find(
        (c) => c.key === MAJOR_CARDS_BASE,
      )?.name ?? 'Major fight cards';
    next.push({
      ...f,
      key: target,
      label:
        sex === null
          ? baseLabel
          : `${baseLabel} — ${t(sex === 'm' ? 'follows.athletes.mens' : 'follows.athletes.womens')}`,
      pollPath: MAJOR_CARDS_POLL_PATH,
    });
  }
  replaceFollowables(next);
}
