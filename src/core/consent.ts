// Consent — the ONE switch both SDKs read (owner confirmation 2026-09-02,
// Stage 2 acceptance): in the UK/EU analytics identifiers sit in consent
// territory, so the Stage 6 consent form covers analytics AS WELL AS ads
// and launch ships one consent surface. This store holds what the form
// recorded; analytics.ts and (Stage 6) the ads SDK read it.
//
// Until the form exists nothing has been decided. PRE_CONSENT_ANALYTICS
// is the pre-decision default — ON for the test-build period (owner
// ruling), and it FLIPS TO FALSE IN THE SAME CHANGE THAT SHIPS THE FORM.

import { readJson, writeJson } from './storage';

export interface ConsentState {
  analytics: boolean;
  ads: boolean; // ad_storage + ad_user_data + ad_personalization together
  decidedAt: string | null; // null = the form has not been answered
}

// See the header: flips to false with the Stage 6 form.
export const PRE_CONSENT_ANALYTICS = true;
export const PRE_CONSENT_ADS = false;

const KEY = 'consent.v1';

export const UNDECIDED: ConsentState = {
  analytics: PRE_CONSENT_ANALYTICS,
  ads: PRE_CONSENT_ADS,
  decidedAt: null,
};

export function consentState(): ConsentState {
  const stored = readJson<ConsentState | null>(KEY, null);
  if (!stored || typeof stored.analytics !== 'boolean' || typeof stored.ads !== 'boolean') {
    return UNDECIDED;
  }
  return stored;
}

export function recordConsent(choice: { analytics: boolean; ads: boolean }): ConsentState {
  const next: ConsentState = { ...choice, decidedAt: new Date().toISOString() };
  writeJson(KEY, next);
  return next;
}

// PURE: what each signal resolves to right now — the recorded answer,
// or the pre-decision default while the form has not been shown.
export function effectiveConsent(state: ConsentState): { analytics: boolean; ads: boolean } {
  if (state.decidedAt === null) return { analytics: PRE_CONSENT_ANALYTICS, ads: PRE_CONSENT_ADS };
  return { analytics: state.analytics, ads: state.ads };
}
