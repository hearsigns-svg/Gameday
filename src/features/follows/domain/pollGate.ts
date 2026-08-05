// Should this follow fire a provider fetch at all? PURE.
//
// A follow warms the central cache by calling that followable's poll
// route. Two things were wrong with doing it on every tap.
//
// IT AMPLIFIED RATE LIMITS. Three attempts to follow the ATP tour in ten
// minutes were three fetches of the same ICS, and Google — which hosts
// it — answered 429 to all three. The server now cools down per source,
// but that only covers the one route someone thought to fix; a gate on
// the CLIENT covers every provider, and it stops the request before it
// leaves the device.
//
// IT WAS ALSO POINTLESS. The cache is central and shared: whatever the
// last device's poll fetched is already there. Re-fetching within a
// minute cannot produce a different answer for any sport we carry —
// the fastest-moving feed we have is an order of play that changes
// hourly.
//
// The window is per POLL PATH, not per follow: two teams in the same
// league share a route, and following both should cost one fetch.

export const POLL_COOLDOWN_MS = 60_000;

export function shouldPoll(
  lastAttemptAt: number | undefined,
  nowMs: number,
  cooldownMs = POLL_COOLDOWN_MS,
): boolean {
  if (lastAttemptAt === undefined) return true;
  // A clock that moved backwards (timezone change, NTP correction) must
  // not lock the path out until it catches up.
  if (nowMs < lastAttemptAt) return true;
  return nowMs - lastAttemptAt >= cooldownMs;
}
