// The unified Schedule screen's calendar↔list sync rules (consolidation
// brief, Stage 3), pure so they are testable without a list on screen.
//
// Day keys are the app's one per-day grouping key (core/when dayKey,
// "YYYY-MM-DD" in device-local time) — the same string the month grid
// cells carry, which is what makes tap-to-jump a string comparison.

// Where a tap on `day` lands in the day-sectioned list: the section for
// that day when one exists, otherwise the NEAREST FOLLOWING dated
// section (the tapped day stays highlighted on the calendar — the list
// just shows what is next from there). A tap past the final section has
// no following section to snap to, so it lands on the last one — the
// closest the list can honestly get. Null only when there are no
// sections at all.
export function sectionIndexForDay(
  sectionKeys: readonly string[],
  day: string,
): number | null {
  if (sectionKeys.length === 0) return null;
  for (let i = 0; i < sectionKeys.length; i++) {
    // Keys are zero-padded ISO days, so lexicographic order IS date order.
    if (sectionKeys[i] >= day) return i;
  }
  return sectionKeys.length - 1;
}

// The calendar's per-day mark: 'shown' when the day has at least one
// fixture still in the calendar, 'removed' when everything that day has
// been opted out — the shown/removed distinction the list rows already
// carry, on the grid.
export function dayMarks(
  entries: ReadonlyArray<{ id: string; day: string }>,
  excluded: ReadonlySet<string>,
): Map<string, 'shown' | 'removed'> {
  const marks = new Map<string, 'shown' | 'removed'>();
  for (const e of entries) {
    const active = !excluded.has(e.id);
    const current = marks.get(e.day);
    if (active) marks.set(e.day, 'shown');
    else if (current === undefined) marks.set(e.day, 'removed');
  }
  return marks;
}

// The month a day key belongs to, for paging the grid as the list
// scrolls across a boundary.
export function monthOfDay(day: string): { year: number; month: number } {
  return { year: Number(day.slice(0, 4)), month: Number(day.slice(5, 7)) - 1 };
}
