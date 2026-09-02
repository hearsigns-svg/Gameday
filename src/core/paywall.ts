// The paywall request seam. Stage 2 builds the LOCKS (Sync-row state,
// lock badges); the paywall itself is Stage 3/4. Every locked surface
// calls `requestPaywall(entry)`; whoever presents the paywall registers
// a presenter. With no presenter registered a request is a no-op — a
// locked surface in a flag-on test build is inert by design, never a
// crash and never an explanation (rule 10).

import type { PaywallEntry } from './analytics';

type Presenter = (entry: PaywallEntry) => void;
let presenter: Presenter | null = null;

export function setPaywallPresenter(p: Presenter | null): void {
  presenter = p;
}

export function requestPaywall(entry: PaywallEntry): void {
  presenter?.(entry);
}
