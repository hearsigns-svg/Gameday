// Human labels for fixture times, in the device's locale and timezone.
// Pure functions of (iso, now) so the edge days are unit-testable.

const DAY_MS = 86_400_000;

function startOfLocalDay(d: Date): number {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.getTime();
}

function daysAhead(iso: string, now: Date): number {
  return Math.round(
    (startOfLocalDay(new Date(iso)) - startOfLocalDay(now)) / DAY_MS,
  );
}

// 'Today' / 'Tomorrow' / 'Saturday' (this week) / 'Sat 8 Aug' beyond.
export function whenLabel(iso: string, now: Date = new Date()): string {
  const ahead = daysAhead(iso, now);
  const d = new Date(iso);
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

// Kick-off time, or an honest placeholder while the time is unsettled.
export function timeLabel(iso: string, status: string): string {
  if (status === 'tbd' || status === 'postponed') return 'Time TBC';
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
}

// Compact urgency chip: 'TODAY' / 'TOMORROW' / 'IN 5 DAYS' / date.
export function countdownLabel(iso: string, now: Date = new Date()): string {
  const ahead = daysAhead(iso, now);
  if (ahead <= 0) return 'TODAY';
  if (ahead === 1) return 'TOMORROW';
  if (ahead < 7) return `IN ${ahead} DAYS`;
  return new Date(iso)
    .toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
    .toUpperCase();
}

// Stable per-day grouping key for schedule sections (local calendar day).
export function dayKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function dayHeading(iso: string, now: Date = new Date()): string {
  const ahead = daysAhead(iso, now);
  const d = new Date(iso);
  const base = d.toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
  if (ahead === 0) return `Today · ${base}`;
  if (ahead === 1) return `Tomorrow · ${base}`;
  return base;
}
