// Stage 7B: the two Data & privacy flows, in one place so their
// load-bearing ORDER is code, not screen logic.
//
// Erase = delete the app-created calendar (past events included — the
// sanctioned exception to the future-only horizon rule) and clear the
// ledger so the engine stops believing in ghosts. Delete-and-reset =
// optional erase (while the grant still lives) → server wipe → grant
// disconnect → identity deletion → full local wipe; a fresh anonymous
// uid is minted on next launch and sees a clean slate.

import { deleteUser, signOut } from 'firebase/auth';
import { deleteDoc, doc } from 'firebase/firestore';
import { auth, db, functionsBaseUrl } from '../../../core/firebase';
import { err, ok, Result } from '../../../core/result';
import { wipeAllLocalData } from '../../../core/storage';
import { eraseAppCalendar } from './driver';
import { clearLedger } from './ledger';
import { disconnectGoogleCalendar } from './googleCalendarAuth';

// Erase the KickoffCal calendar and everything in it. The ledger is
// cleared ONLY when a calendar was actually deleted: when the sync
// target is the user's own calendar there is nothing of ours to erase,
// and the ledger (plus notes-tag recovery) is what keeps those events
// managed. Returns whether anything was erased.
export async function eraseSyncedEvents(): Promise<Result<boolean>> {
  const r = await eraseAppCalendar();
  if (!r.ok) return r;
  if (r.value) clearLedger();
  return r;
}

// The server-side wipe: the deleteAccountData callable removes
// devices/{uid} and entitlements/{uid} for the caller. The direct
// Firestore delete of devices/{uid} (which rules allow the owner) is
// the fallback so the flow does not strand on a cold or undeployed
// function — entitlements are server-written and empty today, and the
// callable remains the canonical path (and the core of any future web
// deletion endpoint).
async function wipeServerData(): Promise<Result<void>> {
  const user = auth.currentUser;
  if (!user) return ok(undefined); // nothing was ever registered
  try {
    const token = await user.getIdToken();
    const res = await fetch(`${functionsBaseUrl}/deleteAccountData`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) return ok(undefined);
    console.warn(`[gameday] deleteAccountData ${res.status} — falling back`);
  } catch (e) {
    console.warn(`[gameday] deleteAccountData unreachable: ${e} — falling back`);
  }
  try {
    await deleteDoc(doc(db, 'devices', user.uid));
    return ok(undefined);
  } catch (e) {
    // A failed server wipe ABORTS the flow: deleting the identity first
    // would orphan the registration with no credential left to remove it.
    return err({ kind: 'unknown', message: `Couldn’t remove server data: ${e}` });
  }
}

export async function deleteAllDataAndReset(opts: {
  eraseCalendar: boolean;
}): Promise<Result<void>> {
  // 1. The calendar, while the grant still lives — after the disconnect
  // below there is no token to erase with.
  if (opts.eraseCalendar) {
    const erased = await eraseSyncedEvents();
    if (!erased.ok) return erased;
  }
  // 2. Server wipe, while the uid can still prove itself.
  const server = await wipeServerData();
  if (!server.ok) return server;
  // 3. The Google grant.
  await disconnectGoogleCalendar();
  // 4. The identity. An anonymous uid can never be signed back into, so
  // deletion and sign-out end in the same place; Firebase occasionally
  // demands a recent login for deleteUser, and the fallback is fine —
  // the uid is unreachable either way.
  const user = auth.currentUser;
  if (user) {
    try {
      await deleteUser(user);
    } catch {
      try {
        await signOut(auth);
      } catch {
        // Already signed out — nothing left to end.
      }
    }
  }
  // 5. Everything local. Next launch mints a fresh uid and sees the
  // first-run experience.
  wipeAllLocalData();
  return ok(undefined);
}
