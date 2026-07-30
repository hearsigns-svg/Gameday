// Human labels for fixture times, in the device's locale and timezone.
// Pure functions of (iso, now) so the edge days are unit-testable.
//
// dateOnly: tbd/postponed fixtures carry a DAY, not an instant — their
// startUtc is a midnight/noon sentinel. Rendering that sentinel through
// local time shifts the DAY for users west of UTC (a Saturday match
// showed as Friday in Los Angeles — the same class of bug as the fixed
// calendar write path). For those, the intended day is the UTC day of
// the sentinel, anchored at local noon so weekday/date formatting is
// DST-safe in every zone.

const DAY_MS = 86_400_000;

function dayAnchor(iso: string, dateOnly: boolean): Date {
  const d = new Date(iso);
  if (!dateOnly) return d;
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 12);
}

function startOfLocalDay(d: Date): number {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.getTime();
}

function daysAhead(iso: string, now: Date, dateOnly: boolean): number {
  return Math.round(
    (startOfLocalDay(dayAnchor(iso, dateOnly)) - startOfLocalDay(now)) /
      DAY_MS,
  );
}

// 'Today' / 'Tomorrow' / 'Saturday' (this week) / 'Sat 8 Aug' beyond.
export function whenLabel(
  iso: string,
  dateOnly = false,
  now: Date = new Date(),
): string {
  const ahead = daysAhead(iso, now, dateOnly);
  const d = dayAnchor(iso, dateOnly);
  if (ahead === 0) return 'Today';
  if (ahead === 1) return 'Tomorrow';
  if (ahead > 1 && ahead < 7) {
    return d.toLocaleDateString(undefined, { weekday: 'long' });
  }
  return d.toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

// Kick-off time — or the honest state when there isn't one. Postponed
// says so: 'Time TBC' hides the one fact the fan most needs.
export function timeLabel(iso: string, status: string): string {
  if (status === 'postponed') return 'Postponed';
  if (status === 'tbd') return 'Time TBC';
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
}

// Compact urgency chip: 'TODAY' / 'TOMORROW' / 'IN 5 DAYS' / date.
export function countdownLabel(
  iso: string,
  dateOnly = false,
  now: Date = new Date(),
): string {
  const ahead = daysAhead(iso, now, dateOnly);
  if (ahead <= 0) return 'TODAY';
  if (ahead === 1) return 'TOMORROW';
  if (ahead < 7) return `IN ${ahead} DAYS`;
  return dayAnchor(iso, dateOnly)
    .toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
    .toUpperCase();
}

// Stable per-day grouping key for schedule sections.
export function dayKey(iso: string, dateOnly = false): string {
  const d = dayAnchor(iso, dateOnly);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function dayHeading(
  iso: string,
  dateOnly = false,
  now: Date = new Date(),
): string {
  const ahead = daysAhead(iso, now, dateOnly);
  const d = dayAnchor(iso, dateOnly);
  const base = d.toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
  if (ahead === 0) return `Today · ${base}`;
  if (ahead === 1) return `Tomorrow · ${base}`;
  return base;
}

// Fixtures whose start is a day sentinel, not an instant.
export const isDateOnly = (status: string): boolean =>
  status === 'tbd' || status === 'postponed';
