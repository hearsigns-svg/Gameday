// Roster refresh cadence — PURE (Round 7 item 1, owner ruling
// 2026-09-03: the UFC roster is quarterly).
//
// The weekly roster job runs every source; a source that declares a
// cadence is skipped while its last SUCCESS marker (status/rosters,
// written only after a non-empty, fully applied refresh) is younger
// than the cadence. A failed run writes no marker, so a source that
// broke keeps being retried weekly until it succeeds — the cadence
// throttles success, never failure.

export function rosterWithinCadence(
  lastSuccessIso: string | undefined,
  cadenceDays: number | undefined,
  nowMs: number,
): boolean {
  if (cadenceDays === undefined || !lastSuccessIso) return false;
  const last = Date.parse(lastSuccessIso);
  return Number.isFinite(last) && nowMs - last < cadenceDays * 86_400_000;
}
