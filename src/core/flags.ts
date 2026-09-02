// Feature flags — the remote switchboard (Round 5, owner ruling 5).
//
// Carrier: the world-readable, server-written `status/flags` document,
// read with the same cached-server-read pattern as the freshness docs.
// FAIL-SAFE DEFAULTS when the doc is absent, unreadable or malformed:
// ads OFF, paywall dismissible, sync gate OPEN. A flag that cannot be
// read must never turn a switch the wrong way — the defaults are the
// launch state, so an unreachable backend leaves the app exactly as it
// shipped. Unknown fields are dropped; wrong-typed fields fall back to
// their default individually.

import { doc, getDocFromServer } from 'firebase/firestore';
import { db } from './firebase';
import { readJson, writeJson } from './storage';

export interface Flags {
  // 'open' = everyone plans as Premium (launch default until Stage 5);
  // 'entitled' = the planner reads the entitlement.
  syncGate: 'open' | 'entitled';
  paywallDismissible: boolean; // false = the hard-paywall dial (off at launch)
  adsEnabled: boolean;
  analyticsEnabled: boolean;
}

export const DEFAULT_FLAGS: Flags = {
  syncGate: 'open',
  paywallDismissible: true,
  adsEnabled: false,
  analyticsEnabled: true,
};

// PURE: shape-check field by field. Anything unexpected → that field's
// default, never a thrown error and never a half-applied object.
export function parseFlags(data: unknown): Flags {
  const d = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
  const bool = (v: unknown, fallback: boolean): boolean =>
    typeof v === 'boolean' ? v : fallback;
  return {
    syncGate:
      d.syncGate === 'open' || d.syncGate === 'entitled'
        ? d.syncGate
        : DEFAULT_FLAGS.syncGate,
    paywallDismissible: bool(d.paywallDismissible, DEFAULT_FLAGS.paywallDismissible),
    adsEnabled: bool(d.adsEnabled, DEFAULT_FLAGS.adsEnabled),
    analyticsEnabled: bool(d.analyticsEnabled, DEFAULT_FLAGS.analyticsEnabled),
  };
}

interface FlagsCache {
  flags: Flags;
  fetchedAt: string;
}

const CACHE_KEY = 'flags.v1';
// Development/test-build override: lets a test build run with a flag
// flipped without writing production data. Never read in release.
const OVERRIDE_KEY = 'flags.override.v1';
const REFRESH_MIN_INTERVAL_MS = 3_600_000;

let inMemory: Flags | null = null;

export function flags(): Flags {
  if (__DEV__) {
    const override = readJson<Partial<Flags> | null>(OVERRIDE_KEY, null);
    if (override) return { ...(inMemory ?? cachedFlags() ?? DEFAULT_FLAGS), ...parseOverride(override) };
  }
  return inMemory ?? cachedFlags() ?? DEFAULT_FLAGS;
}

function parseOverride(o: Partial<Flags>): Partial<Flags> {
  const parsed = parseFlags(o);
  const out: Partial<Flags> = {};
  for (const k of Object.keys(o) as (keyof Flags)[]) {
    if (k in parsed) (out as Record<string, unknown>)[k] = parsed[k];
  }
  return out;
}

export function setFlagsOverrideForDev(override: Partial<Flags> | null): void {
  if (!__DEV__) return;
  writeJson(OVERRIDE_KEY, override);
}

export function cachedFlags(): Flags | null {
  const c = readJson<FlagsCache | null>(CACHE_KEY, null);
  return c ? parseFlags(c.flags) : null;
}

// Hourly, fire-and-forget. Failure leaves the cache (or the defaults)
// in place — see the header: an unreadable switchboard changes nothing.
export async function refreshFlags(): Promise<Flags> {
  const cached = readJson<FlagsCache | null>(CACHE_KEY, null);
  if (cached && Date.now() - Date.parse(cached.fetchedAt) < REFRESH_MIN_INTERVAL_MS) {
    inMemory = parseFlags(cached.flags);
    return flags();
  }
  try {
    const snap = await getDocFromServer(doc(db, 'status', 'flags'));
    const parsed = parseFlags(snap.exists() ? snap.data() : {});
    inMemory = parsed;
    writeJson(CACHE_KEY, { flags: parsed, fetchedAt: new Date().toISOString() } as FlagsCache);
  } catch (e) {
    console.warn(`[kickoffcal] flags read failed — defaults/cached stand: ${e}`);
  }
  return flags();
}
