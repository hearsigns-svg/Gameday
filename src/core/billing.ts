// Billing — the RevenueCat adapter (Round 5 Stage 3). ONE billing and
// entitlement layer: app user id = our anonymous uid; restore re-links a
// fresh uid on reinstall; the SDK's cached CustomerInfo is what the
// planner reads (via core/entitlementStore), never a network call at
// plan time. Everything the paywall shows comes from the STORE: the
// localised price strings, the trial eligibility (Apple's intro-offer
// check), the management URL.
//
// Configured only when the platform's PUBLIC SDK key is present
// (`EXPO_PUBLIC_RC_IOS_KEY` / `EXPO_PUBLIC_RC_ANDROID_KEY`, inlined by
// Expo at bundle time; public identifiers, not secrets). Without a key
// nothing here runs and no paywall presenter registers — a locked
// surface in such a build is inert, never broken.
//
// The native module is loaded lazily and every call is guarded, so jest
// and a build without the pod never touch it.

import { Platform } from 'react-native';
import type {
  CustomerInfo,
  PurchasesOfferings,
  PurchasesPackage,
} from 'react-native-purchases';
import { err, ok, Result } from './result';
import { CustomerInfoLike } from './billingState';

export const TERMS_URL = 'https://kickoffcal.app/terms';
export const PRIVACY_URL = 'https://kickoffcal.app/privacy';

export interface PaywallPackage {
  id: string; // the RevenueCat package identifier
  kind: 'monthly' | 'annual';
  priceString: string; // the store's localised string — shown verbatim
  price: number; // numeric, for the saving percentage only
  productId: string;
}

export interface PaywallOffer {
  monthly: PaywallPackage | null;
  annual: PaywallPackage | null;
  // Apple's intro-offer eligibility for the ANNUAL product (the plan
  // that carries the 14-day trial); Android reports eligibility through
  // the offer itself and is treated as eligible when a free phase exists.
  trialEligible: boolean;
}

type PurchasesModule = typeof import('react-native-purchases').default;

let purchases: PurchasesModule | null | undefined;
let configured = false;
let cachedPackages: Record<string, PurchasesPackage> = {};
const infoListeners = new Set<(info: CustomerInfo) => void>();

function sdk(): PurchasesModule | null {
  if (purchases !== undefined) return purchases;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const m = require('react-native-purchases');
    purchases = (m.default ?? m) as PurchasesModule;
  } catch (e) {
    purchases = null;
    console.warn(`[kickoffcal] billing SDK unavailable: ${e}`);
  }
  return purchases;
}

export function billingApiKey(): string | null {
  const key =
    Platform.OS === 'ios'
      ? process.env.EXPO_PUBLIC_RC_IOS_KEY
      : process.env.EXPO_PUBLIC_RC_ANDROID_KEY;
  return key && key.length > 0 ? key : null;
}

export function billingConfigured(): boolean {
  return configured;
}

// Configure once per launch with our anonymous uid as the app user id.
export async function configureBilling(uid: string): Promise<boolean> {
  if (configured) return true;
  const key = billingApiKey();
  const P = key ? sdk() : null;
  if (!key || !P) return false;
  try {
    P.configure({ apiKey: key, appUserID: uid });
    P.addCustomerInfoUpdateListener((info) => {
      for (const l of infoListeners) l(info);
    });
    configured = true;
    return true;
  } catch (e) {
    console.warn(`[kickoffcal] billing configure failed: ${e}`);
    return false;
  }
}

export function onCustomerInfo(l: (info: CustomerInfoLike) => void): () => void {
  const wrapped = (info: CustomerInfo) => l(info as unknown as CustomerInfoLike);
  infoListeners.add(wrapped);
  return () => {
    infoListeners.delete(wrapped);
  };
}

export async function currentCustomerInfo(): Promise<Result<CustomerInfoLike>> {
  const P = sdk();
  if (!P || !configured) return err({ kind: 'unknown', message: 'billing not configured' });
  try {
    return ok((await P.getCustomerInfo()) as unknown as CustomerInfoLike);
  } catch (e) {
    return err({ kind: 'offline' });
  }
}

// PURE: the paywall's view of an offering.
export function offerFromOfferings(
  offerings: Pick<PurchasesOfferings, 'current'> | null,
  annualTrialEligible: boolean,
): PaywallOffer | null {
  const current = offerings?.current ?? null;
  if (!current) return null;
  const view = (p: PurchasesPackage | null, kind: 'monthly' | 'annual'): PaywallPackage | null =>
    p
      ? {
          id: p.identifier,
          kind,
          priceString: p.product.priceString,
          price: p.product.price,
          productId: p.product.identifier,
        }
      : null;
  const annual = view(current.annual, 'annual');
  const monthly = view(current.monthly, 'monthly');
  if (!annual && !monthly) return null;
  return { monthly, annual, trialEligible: annual !== null && annualTrialEligible };
}

export async function loadPaywall(): Promise<Result<PaywallOffer>> {
  const P = sdk();
  if (!P || !configured) return err({ kind: 'unknown', message: 'billing not configured' });
  try {
    const offerings = await P.getOfferings();
    const current = offerings.current;
    cachedPackages = {};
    for (const p of current?.availablePackages ?? []) cachedPackages[p.identifier] = p;
    let eligible = false;
    const annualProduct = current?.annual?.product;
    if (annualProduct) {
      if (Platform.OS === 'ios') {
        const r = await P.checkTrialOrIntroductoryPriceEligibility([annualProduct.identifier]);
        const status = r[annualProduct.identifier]?.status;
        // 2 = INTRO_ELIGIBILITY_STATUS_ELIGIBLE (enum in the SDK typings).
        eligible = status === 2;
      } else {
        // Google: a free phase on the default offer means the trial
        // applies (Play enforces one per account server-side).
        const opts = annualProduct.subscriptionOptions ?? [];
        eligible =
          annualProduct.introPrice !== null ||
          opts.some((o) => (o.freePhase ?? null) !== null);
      }
    }
    const offer = offerFromOfferings(offerings, eligible);
    if (!offer) return err({ kind: 'not-found', what: 'offering' });
    return ok(offer);
  } catch (e) {
    console.warn(`[kickoffcal] offerings failed: ${e}`);
    return err({ kind: 'offline' });
  }
}

export type PurchaseOutcome = 'purchased' | 'pending' | 'cancelled';

export async function purchasePackage(packageId: string): Promise<Result<PurchaseOutcome>> {
  const P = sdk();
  const pkg = cachedPackages[packageId];
  if (!P || !configured || !pkg) return err({ kind: 'unknown', message: 'package unavailable' });
  try {
    const r = await P.purchasePackage(pkg);
    for (const l of infoListeners) l(r.customerInfo);
    return ok('purchased');
  } catch (e) {
    const code = (e as { code?: unknown } | null)?.code;
    const codes = P.PURCHASES_ERROR_CODE;
    if (code === codes.PURCHASE_CANCELLED_ERROR) return ok('cancelled');
    if (code === codes.PAYMENT_PENDING_ERROR) return ok('pending');
    console.warn(`[kickoffcal] purchase failed: ${e}`);
    return err({ kind: 'unknown', message: 'purchase failed' });
  }
}

export async function restorePurchases(): Promise<Result<{ premium: boolean }>> {
  const P = sdk();
  if (!P || !configured) return err({ kind: 'unknown', message: 'billing not configured' });
  try {
    const info = await P.restorePurchases();
    for (const l of infoListeners) l(info);
    return ok({ premium: Boolean(info.entitlements.active['premium']) });
  } catch (e) {
    console.warn(`[kickoffcal] restore failed: ${e}`);
    return err({ kind: 'offline' });
  }
}

// The store's own management page: RevenueCat hands us the URL for the
// store that sold the subscription; the platform page is the fallback.
export async function manageSubscriptionUrl(): Promise<string> {
  const fallback =
    Platform.OS === 'ios'
      ? 'https://apps.apple.com/account/subscriptions'
      : 'https://play.google.com/store/account/subscriptions';
  const P = sdk();
  if (!P || !configured) return fallback;
  try {
    const info = await P.getCustomerInfo();
    return info.managementURL ?? fallback;
  } catch {
    return fallback;
  }
}
