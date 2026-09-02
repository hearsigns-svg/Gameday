// Composition layer: billing → entitlement store → funnel events, and
// the paywall presenter. Nothing here runs without a configured SDK key
// (core/billing.ts), so a build without keys keeps every locked surface
// inert.
import {
  logSubscriptionLapsed,
  logTrialConverted,
  logTrialStarted,
  PaywallEntry,
} from '../core/analytics';
import { configureBilling, currentCustomerInfo, onCustomerInfo } from '../core/billing';
import { billingTransition, entitlementFromCustomerInfo } from '../core/billingState';
import { entitlementState, setEntitlementState } from '../core/entitlementStore';
import { ensureSignedIn } from '../core/firebase';
import { setPaywallPresenter } from '../core/paywall';
import { CustomerInfoLike } from '../core/billingState';

let installed = false;

function absorb(info: CustomerInfoLike): void {
  const prev = entitlementState();
  const next = entitlementFromCustomerInfo(info, prev, Date.now());
  const transition = billingTransition(prev, next, info);
  setEntitlementState(next);
  switch (transition) {
    case 'trial_started':
      void logTrialStarted();
      break;
    case 'trial_converted':
      void logTrialConverted();
      break;
    case 'lapsed_trial':
      void logSubscriptionLapsed('trial');
      break;
    case 'lapsed_paid':
      void logSubscriptionLapsed('paid');
      break;
    default:
      break;
  }
}

export async function installBilling(present: (entry: PaywallEntry) => void): Promise<void> {
  if (installed) return;
  installed = true;
  const uid = await ensureSignedIn();
  if (!uid) return;
  const ok = await configureBilling(uid);
  if (!ok) return;
  onCustomerInfo(absorb);
  const info = await currentCustomerInfo();
  if (info.ok) absorb(info.value);
  setPaywallPresenter(present);
}
