// The Following page's rows for one visit — PURE (owner ruling
// 2026-09-23, replacing the Undo row).
//
// A row keeps its place for the whole visit. A follow that ends while the
// page is open — unfollowed here, or anywhere else — stays on screen with
// Follow in place of Following, until the page is next opened; a follow
// made elsewhere during the visit joins at the end. Nothing is removed and
// nothing is reordered while the page is open, so nothing moves under a
// finger: no Undo row, no timer. Opening the page (a tab press, a fresh
// launch) starts a new visit from the store, which drops the rows that
// were unfollowed.

export interface FollowingVisit<T extends { key: string }> {
  // Display order, fixed for the visit (new follows appended).
  order: readonly string[];
  // The last record seen for every row shown — an unfollowed row keeps
  // rendering (and re-follows) from it.
  known: Readonly<Record<string, T>>;
  // The last "N upcoming" count seen per row. An unfollowed row keeps its
  // count, so its caption — and so its height — never changes under it.
  counts: Readonly<Record<string, number>>;
}

export interface VisitRow<T> {
  follow: T;
  followed: boolean;
}

export function openVisit<T extends { key: string }>(
  stored: readonly T[],
  counts: Readonly<Record<string, number>>,
): FollowingVisit<T> {
  return {
    order: stored.map((f) => f.key),
    known: Object.fromEntries(stored.map((f) => [f.key, f])),
    counts: { ...counts },
  };
}

// Fold the store's current state into the visit: every record still in
// the store refreshed (artwork heals, a calendar preference changes), a
// new follow appended, live counts remembered. Nothing removed, nothing
// reordered.
export function advanceVisit<T extends { key: string }>(
  visit: FollowingVisit<T>,
  stored: readonly T[],
  counts: Readonly<Record<string, number>>,
): FollowingVisit<T> {
  const order = [...visit.order];
  const known: Record<string, T> = { ...visit.known };
  for (const f of stored) {
    if (!(f.key in known)) order.push(f.key);
    known[f.key] = f;
  }
  return { order, known, counts: { ...visit.counts, ...counts } };
}

export function visitRows<T extends { key: string }>(
  visit: FollowingVisit<T>,
  stored: readonly T[],
): VisitRow<T>[] {
  const followed = new Set(stored.map((f) => f.key));
  return visit.order.flatMap((key) => {
    const follow = visit.known[key];
    return follow ? [{ follow, followed: followed.has(key) }] : [];
  });
}

// The rows shown after `key` — where a re-follow puts it back in the
// store, so the list it is put back into is the list on screen.
export function keysAfter<T extends { key: string }>(
  visit: FollowingVisit<T>,
  key: string,
): string[] {
  const i = visit.order.indexOf(key);
  return i < 0 ? [] : visit.order.slice(i + 1);
}
