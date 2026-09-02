// Funnel instrumentation — Firebase Analytics (Round 5 ruling 6).
//
// THE BRIEF'S EVENTS ONLY: follow, paywall shown/accepted/declined per
// entry point, trial started, converted, lapsed. Platform is a built-in
// dimension of every Firebase event, so "per platform" costs nothing
// here. No screen tracking, no ad events, no PII — the app has no
// accounts and this module never receives a name, an email or a uid.
//
// CONSENT: signals come from the same form the ads use (Stage 6). Until
// that form exists the defaults are the conservative first-party set —
// analytics storage on, every ad signal off — and the remote flag can
// switch collection off entirely (fail-safe default: on, because the
// flag's absence must not silence launch-month measurement).
//
// The native module is loaded lazily and every call is guarded: a
// build without the pod (jest, a stale sim build) logs once and moves
// on — measurement must never be able to crash the product.

import { consentState, effectiveConsent, recordConsent } from './consent';
import { flags } from './flags';

export type PaywallEntry = 'proactive' | 'on_demand';

export interface AnalyticsConsent {
  analytics: boolean;
  ads: boolean; // ad_storage + ad_user_data + ad_personalization together
}

export const DEFAULT_CONSENT: AnalyticsConsent = { analytics: true, ads: false };

type Module = {
  logEvent(name: string, params?: Record<string, string | number | boolean>): Promise<void>;
  setAnalyticsCollectionEnabled(enabled: boolean): Promise<void>;
  setConsent(c: Record<string, boolean>): Promise<void>;
};

let mod: Module | null | undefined;
let warned = false;

function analytics(): Module | null {
  if (mod !== undefined) return mod;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const m = require('@react-native-firebase/analytics');
    const factory = (m.getAnalytics ?? m.default) as (() => Module) | undefined;
    const instance = m.getAnalytics ? m.getAnalytics() : m.default();
    mod = factory ? (instance as Module) : null;
  } catch (e) {
    mod = null;
    if (!warned) {
      warned = true;
      console.warn(`[kickoffcal] analytics unavailable: ${e}`);
    }
  }
  return mod;
}

// PURE: the Firebase consent map for a consent choice.
export function consentMapFor(c: AnalyticsConsent): Record<string, boolean> {
  return {
    analytics_storage: c.analytics,
    ad_storage: c.ads,
    ad_user_data: c.ads,
    ad_personalization: c.ads,
  };
}

// Reads the ONE consent store (core/consent.ts) — the Stage 6 form
// writes it for analytics AND ads, so launch has one consent surface.
export async function initAnalytics(
  consent: AnalyticsConsent = effectiveConsent(consentState()),
): Promise<void> {
  const a = analytics();
  if (!a) return;
  try {
    await a.setConsent(consentMapFor(consent));
    await a.setAnalyticsCollectionEnabled(flags().analyticsEnabled && consent.analytics);
  } catch (e) {
    console.warn(`[kickoffcal] analytics init failed: ${e}`);
  }
}

// Stage 6 calls this with the form's answer; the store is written first
// so a relaunch resolves the same way without the form.
export async function applyConsentChoice(choice: AnalyticsConsent): Promise<void> {
  recordConsent(choice);
  await initAnalytics(choice);
}

async function log(name: string, params?: Record<string, string | number | boolean>): Promise<void> {
  if (!flags().analyticsEnabled) return;
  const a = analytics();
  if (!a) return;
  try {
    await a.logEvent(name, params);
  } catch (e) {
    console.warn(`[kickoffcal] analytics event ${name} failed: ${e}`);
  }
}

// ── The funnel ────────────────────────────────────────────────────────
export const logFollow = (sport: string, kind: string) => log('follow', { sport, kind });
export const logPaywallShown = (entry: PaywallEntry) => log('paywall_shown', { entry });
export const logPaywallAccepted = (entry: PaywallEntry) => log('paywall_accepted', { entry });
export const logPaywallDeclined = (entry: PaywallEntry) => log('paywall_declined', { entry });
export const logTrialStarted = () => log('trial_started');
export const logTrialConverted = () => log('trial_converted');
export const logSubscriptionLapsed = (kind: 'trial' | 'paid') => log('subscription_lapsed', { kind });
