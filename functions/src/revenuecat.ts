// RevenueCat webhook → entitlements/{uid} — PURE mapping (Round 5
// Stage 3). The webhook writes the server-side MIRROR of the store's
// entitlement; the CLIENT planner enforces from the SDK's cached state
// (DECISIONS 2026-09-02), so this document is for support, the
// deletion tombstone and any later web surface — never a gate.
//
// Event shape: RevenueCat v1 webhooks POST `{ api_version, event }` with
// `event.type` ∈ INITIAL_PURCHASE | RENEWAL | PRODUCT_CHANGE |
// CANCELLATION | UNCANCELLATION | BILLING_ISSUE | EXPIRATION |
// SUBSCRIBER_ALIAS | TRANSFER | TEST | …; `app_user_id`,
// `original_app_user_id`, `product_id`, `period_type` (TRIAL | INTRO |
// NORMAL | PROMOTIONAL), `purchased_at_ms`, `expiration_at_ms`,
// `entitlement_ids`, `store`, `environment` (SANDBOX | PRODUCTION).

export interface RevenueCatEvent {
  type: string;
  app_user_id?: string;
  original_app_user_id?: string;
  product_id?: string;
  period_type?: string;
  purchased_at_ms?: number;
  expiration_at_ms?: number | null;
  entitlement_ids?: string[] | null;
  store?: string;
  environment?: string;
  id?: string;
}

export interface EntitlementMirror {
  tier: 'premium' | 'free';
  productId: string | null;
  periodType: string | null;
  expiresAt: string | null;
  purchasedAt: string | null;
  store: string | null;
  environment: string | null;
  lastEvent: string;
  lastEventId: string | null;
  updatedAt: string;
}

// Events that END or suspend access. CANCELLATION alone does NOT — the
// user keeps what they paid for until EXPIRATION arrives.
const ENDING = new Set(['EXPIRATION', 'TRANSFER_OUT']);
// Events that (re)assert access for the period they carry.
const GRANTING = new Set([
  'INITIAL_PURCHASE',
  'RENEWAL',
  'PRODUCT_CHANGE',
  'UNCANCELLATION',
  'NON_RENEWING_PURCHASE',
  'TRANSFER',
  'TEST',
]);

export function isEventForUs(e: RevenueCatEvent, entitlementId: string): boolean {
  if (!e.app_user_id) return false;
  if (e.type === 'TEST') return true;
  const ids = e.entitlement_ids ?? [];
  return ids.length === 0 || ids.includes(entitlementId);
}

export function mirrorFromEvent(
  e: RevenueCatEvent,
  nowMs: number,
): { uid: string; mirror: EntitlementMirror } | null {
  const uid = e.app_user_id;
  if (!uid) return null;
  const expiresAt =
    typeof e.expiration_at_ms === 'number' ? new Date(e.expiration_at_ms).toISOString() : null;
  const purchasedAt =
    typeof e.purchased_at_ms === 'number' ? new Date(e.purchased_at_ms).toISOString() : null;
  let tier: 'premium' | 'free';
  if (ENDING.has(e.type)) tier = 'free';
  else if (GRANTING.has(e.type)) {
    // Granted — unless the period it carries has already ended.
    tier = expiresAt !== null && Date.parse(expiresAt) <= nowMs ? 'free' : 'premium';
  } else {
    // CANCELLATION, BILLING_ISSUE, SUBSCRIBER_ALIAS, …: access stands as
    // it was for the carried period; judge by expiry alone.
    tier = expiresAt === null || Date.parse(expiresAt) > nowMs ? 'premium' : 'free';
  }
  return {
    uid,
    mirror: {
      tier,
      productId: e.product_id ?? null,
      periodType: e.period_type ?? null,
      expiresAt,
      purchasedAt,
      store: e.store ?? null,
      environment: e.environment ?? null,
      lastEvent: e.type,
      lastEventId: e.id ?? null,
      updatedAt: new Date(nowMs).toISOString(),
    },
  };
}

// Constant-time-ish comparison for the shared secret (same shape as the
// sweep key guard): length mismatch short-circuits deliberately — the
// secret's length is not what we protect.
export function authorised(header: string | undefined, expected: string | undefined): boolean {
  if (!expected || !header) return false;
  const provided = header.replace(/^Bearer\s+/i, '');
  if (provided.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}
