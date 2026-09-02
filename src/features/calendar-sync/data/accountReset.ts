// Stage 7B: the two Data & privacy flows, in one place so their
// load-bearing ORDER is code, not screen logic.
//
// Erase = delete the app-created calendar (past events included — the
// sanctioned exception to the future-only horizon rule) and clear the
// ledger so the engine stops believing in ghosts. Delete-and-reset =
// optional erase (while the grant still lives) → server wipe → grant
// disconnect → identity deletion → full local wipe; a fresh anonymous
// uid is minted on next launch and sees a clean slate.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { deleteUser, signOut } from 'firebase/auth';
import { auth, functionsBaseUrl } from '../../../core/firebase';
import { err, ok, Result } from '../../../core/result';
import { wipeAllLocalData } from '../../../core/storage';
import { activeBackend } from './calendarBackend';
import { storedTarget } from './calendarTargetStore';
import { deleteFixtureEvent, eraseAppCalendar } from './driver';
import { clearLedger, loadLedger, removeLedgerEntry } from './ledger';
import { disconnectGoogleCalendar } from './googleCalendarAuth';

export interface EraseOutcome {
  // container — the app-created calendar was deleted whole.
  // events    — ledger-scoped removal from the user's OWN calendar.
  // nothing   — no calendar of ours and no ledgered events.
  mode: 'container' | 'events' | 'nothing';
  removed: number;
  failed: number;
}

// Whether erase runs in own-calendar mode: the sync target is the
// user's calendar, so there is no container of ours to delete — the
// erase is the LEDGERED EVENTS, exactly (owner ruling 2026-08-28).
export function ownCalendarEraseMode(): boolean {
  return activeBackend() !== 'rest' && storedTarget()?.kind === 'user';
}

// Erase what KickOffCal put in the calendar, past events included — the
// sanctioned user-invoked exception to the future-only horizon rule,
// in both modes identically.
//
// Own-calendar mode is STRICTLY LEDGER-SCOPED: walk the ledger's stored
// event ids and delete exact matches only — never a title, time or
// pattern match, never an enumeration of the calendar hunting for
// ours-looking events. deleteFixtureEvent is already that contract: it
// resolves the exact id, REFUSES an event whose readable notes lack our
// tag, and reports already-gone as success. An id that no longer
// resolves is confirmed gone; under-deleting is acceptable,
// over-deleting never is. Each entry clears as its delete succeeds (or
// the event is confirmed gone); a FAILED delete keeps its entry, so
// protection and retry survive, and the caller is told. The calendar
// container itself is never touched in this mode.
//
// No delete pacing, deliberately: this mode is reachable only through
// EventKit (Android's native path greys the control while disconnected,
// and the REST backend's target is ours-by-construction → container
// mode), and EventKit has no mass-deletion gate. If own-calendar
// targets ever become reachable on the Android provider path, AGENTS
// rule 16's sync-adapter gate applies — pace before shipping that.
export async function eraseSyncedEvents(): Promise<Result<EraseOutcome>> {
  if (ownCalendarEraseMode()) {
    const entries = Object.entries(loadLedger());
    if (entries.length === 0) {
      return ok({ mode: 'nothing', removed: 0, failed: 0 });
    }
    let removed = 0;
    let failed = 0;
    for (const [fixtureId, entry] of entries) {
      const r = await deleteFixtureEvent(entry.eventId);
      if (!r.ok) {
        failed++;
        continue;
      }
      // A mid-migration leftover in the OLD calendar is ours too —
      // best-effort (Result ignored): its calendar may already be gone.
      if (entry.strayEventId) {
        await deleteFixtureEvent(entry.strayEventId);
      }
      removeLedgerEntry(fixtureId);
      removed++;
    }
    return ok({ mode: 'events', removed, failed });
  }
  const r = await eraseAppCalendar();
  if (!r.ok) return r;
  if (r.value) clearLedger();
  return ok({ mode: r.value ? 'container' : 'nothing', removed: 0, failed: 0 });
}

// The server-side wipe: the deleteAccountData callable removes
// devices/{uid} AND entitlements/{uid} for the caller — the recorded
// tombstone. Round 5 (Stage 3): the client's direct devices/{uid}
// delete FALLBACK IS GONE. entitlements/{uid} is server-written by the
// billing webhook and a client cannot delete it, so a fallback that
// removed only the device doc would leave the entitlement mirror behind
// while telling the user their data was gone. Callable failure = abort,
// and the user is told; the next attempt retries.
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
    return err({
      kind: 'unknown',
      message: `Couldn’t remove server data (HTTP ${res.status}). Try again in a moment.`,
    });
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
  // below there is no token to erase with. A PARTIAL failure aborts
  // too: the local wipe below would destroy the ledger entries that
  // are the failed events' protection and retry path.
  if (opts.eraseCalendar) {
    const erased = await eraseSyncedEvents();
    if (!erased.ok) return erased;
    if (erased.value.failed > 0) {
      return err({
        kind: 'unknown',
        message: `${erased.value.failed} synced ${erased.value.failed === 1 ? 'event' : 'events'} couldn’t be removed — nothing was deleted. Try again.`,
      });
    }
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
  // 5. Everything local. MMKV holds every app store (clearAll, so a
  // future store cannot be missed); AsyncStorage holds exactly one
  // thing — the Firebase auth persistence entry — and is cleared too:
  // sign-out normally removes it, but the fallback chain above can
  // swallow a double failure, and the wipe must not leave the old uid
  // resumable behind a clean-looking slate. Next launch mints a fresh
  // uid and sees the first-run experience.
  wipeAllLocalData();
  try {
    await AsyncStorage.clear();
  } catch {
    // Auth state was already ended above; a failed storage clear must
    // not fail the reset the user just confirmed.
  }
  return ok(undefined);
}
