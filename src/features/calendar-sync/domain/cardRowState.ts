// A card row's calendar state and what one tap does to it — PURE
// (owner, 2026-09-03: "they should be pre-added and the option should
// be to remove them, not to add events which are already there").
//
// A row is IN the calendar through a follow ("covered" — by the entry's
// own keys or by the tournament tier) or through a pin. Covered rows
// used to render "Added" as a dead, dimmed pill: correct about the
// state, useless as a control. Now every row is one two-state toggle,
// whatever put it there:
//
//   on  → tap removes: a covered row gains a per-event EXCLUSION (the
//         same mechanism the Schedule's Remove uses, honoured by the
//         planner by id, visible and reversible); a pinned row loses
//         its pin.
//   off → tap adds: a covered-but-excluded row drops the exclusion; an
//         uncovered row gains a pin.
//
// Nothing here knows about tennis or fight cards — a row is a row.

export interface RowCalendarState {
  covered: boolean;
  excluded: boolean;
  pinned: boolean;
}

export function rowOn(s: RowCalendarState): boolean {
  return (s.covered && !s.excluded) || s.pinned;
}

// The writes one tap performs. `exclude`/`pin` are the NEW values for
// the two stores where they change; absent means leave that store alone.
export interface RowToggleOps {
  exclude?: boolean;
  pin?: boolean;
}

export function toggleRowOps(s: RowCalendarState): RowToggleOps {
  if (rowOn(s)) {
    const ops: RowToggleOps = {};
    if (s.covered) ops.exclude = true;
    if (s.pinned) ops.pin = false;
    return ops;
  }
  if (s.covered && s.excluded) return { exclude: false };
  return { pin: true };
}

// The master toggle over a visible set: on → every row off, off →
// every row on. Each row gets only the writes it needs, so a row that is
// already where the master wants it is untouched.
export function setRowsOps(
  rows: readonly RowCalendarState[],
  on: boolean,
): RowToggleOps[] {
  return rows.map((s) => {
    if (rowOn(s) === on) return {};
    return toggleRowOps(s);
  });
}
