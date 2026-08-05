// May this invocation fetch the source right now? PURE.
//
// A poll route that reads a marker, decides, and then fetches has a gap
// between the decision and the record of it. Three follow taps inside
// ten minutes each read "due", each fetched, and the host answered 429
// to all three (2026-08-05). A per-source cool-down written AFTER the
// fetch does not close that gap: concurrent invocations all read the
// same stale marker and all pass the check.
//
// So the decision and the claim happen together, inside one Firestore
// transaction. A caller that wins the transaction holds a LEASE; every
// other caller in that window is told to skip. The lease EXPIRES on its
// own, so an invocation that dies mid-fetch — timeout, crash, cold-start
// kill — costs one lease window, not a permanently blocked source.
//
// Three reasons to skip, and they are reported distinctly because they
// mean different things operationally: the source is as fresh as our
// cadence commitment allows; the source recently refused us; someone
// else is fetching it this second.

export interface LeaseState {
  lastSuccessAt?: string | null;
  lastFailureAt?: string | null;
  leaseUntil?: string | null;
}

export interface LeaseConfig {
  // How long a success keeps the source quiet (the cadence commitment).
  minIntervalMs: number;
  // How long a failure keeps it quiet (do not amplify a refusal).
  failureBackoffMs: number;
  // How long a claim is honoured before it is presumed dead.
  leaseMs: number;
}

export type LeaseDecision =
  | { fetch: true; leaseUntil: string }
  | { fetch: false; reason: 'daily_cap' | 'failure_backoff' | 'leased' };

// An unparseable timestamp is treated as ABSENT, not as "now": a corrupt
// marker must not be able to silence a source indefinitely. The inverse
// error — one extra fetch — is the cheaper one.
function at(v: string | null | undefined): number | null {
  if (typeof v !== 'string') return null;
  const ms = Date.parse(v);
  return Number.isFinite(ms) ? ms : null;
}

export function leaseDecision(
  state: LeaseState,
  nowMs: number,
  cfg: LeaseConfig,
): LeaseDecision {
  const success = at(state.lastSuccessAt);
  const failure = at(state.lastFailureAt);
  const leased = at(state.leaseUntil);
  // Order matters only for which reason is reported; all three are
  // "do not fetch". Cadence first — it is the commitment we made to the
  // publisher, and it outranks our own retry appetite.
  if (success !== null && nowMs - success < cfg.minIntervalMs) {
    return { fetch: false, reason: 'daily_cap' };
  }
  if (failure !== null && nowMs - failure < cfg.failureBackoffMs) {
    return { fetch: false, reason: 'failure_backoff' };
  }
  if (leased !== null && leased > nowMs) {
    return { fetch: false, reason: 'leased' };
  }
  return { fetch: true, leaseUntil: new Date(nowMs + cfg.leaseMs).toISOString() };
}
