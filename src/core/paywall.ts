// The paywall request seam. Stage 2 builds the LOCKS (Sync-row state,
// lock badges); the paywall itself is Stage 3/4. Every locked surface
// calls `requestPaywall(entry)`; whoever presents the paywall registers
// a presenter. With no presenter registered a request is a no-op — a
// locked surface in a flag-on test build is inert by design, never a
// crash and never an explanation (rule 10).

import type { PaywallEntry } from './analytics';

type Presenter = (entry: PaywallEntry) => void;
let presenter: Presenter | null = null;
// SUPPRESS AFTER DECLINE (Round 5 paywall model, DECISIONS): an on-demand
// Premium tap opens the paywall — never in the same session as a
// decline. Session-scoped by construction (module memory); the next
// session's first Premium tap shows the offer again.
let declinedThisSession = false;

export function setPaywallPresenter(p: Presenter | null): void {
  presenter = p;
}

export function notePaywallDeclined(): void {
  declinedThisSession = true;
}

// True when the paywall was actually presented. False = suppressed
// (declined this session) or no presenter (billing not configured) — the
// caller shows its own inline Premium state instead, never nothing.
export function requestPaywall(entry: PaywallEntry): boolean {
  if (entry === 'on_demand' && declinedThisSession) return false;
  if (!presenter) return false;
  presenter(entry);
  return true;
}

// Test seam.
export function __resetPaywallForTests(): void {
  presenter = null;
  declinedThisSession = false;
}
