// The persisted entitlement state and the ONE place the planner's
// entitlement input is computed. Stage 2: no billing yet — the state is
// written by nothing in release builds (everyone is `FREE_STATE`), and
// the sync gate flag is open, so the planner sees Premium everywhere.
// Stage 3 makes the store SDK the writer. A dev/test-build setter lets
// the flag-on test build exercise every downgrade path.

import { flags } from './flags';
import {
  EntitlementState,
  FREE_STATE,
  PlanEntitlement,
  planEntitlementFrom,
} from './entitlement';
import { readJson, writeJson } from './storage';

const KEY = 'entitlement.v1';

const listeners = new Set<() => void>();

export function entitlementState(): EntitlementState {
  const stored = readJson<EntitlementState | null>(KEY, null);
  return stored && (stored.tier === 'free' || stored.tier === 'premium') ? stored : FREE_STATE;
}

export function setEntitlementState(state: EntitlementState): void {
  writeJson(KEY, state);
  for (const l of listeners) l();
}

export function subscribeEntitlement(l: () => void): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

// What the planner is told this run. Reads the flag every time: flipping
// the gate takes effect on the next sync, no restart.
export function planEntitlement(nowMs: number = Date.now()): PlanEntitlement {
  return planEntitlementFrom(entitlementState(), nowMs, flags().syncGate === 'open');
}

// The UI's question: is a Premium action locked right now? Open gate →
// never locked (the whole rollout switch must be inert while open).
export function premiumLocked(nowMs: number = Date.now()): boolean {
  return planEntitlement(nowMs).tier === 'free';
}
