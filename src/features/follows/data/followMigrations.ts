// Follow-store normalizers run at every launch — idempotent by
// construction, so a legacy follow arriving LATER (a base-key follow
// made from an old build, a stale search result) converts on the next
// start instead of slipping past a one-time flag.

import { t } from '../../../core/i18n';
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
