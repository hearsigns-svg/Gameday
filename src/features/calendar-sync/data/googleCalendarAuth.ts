// Google Sign-In, for exactly one purpose: authorizing calendar writes
// under calendar.app.created. This is NOT an account system — the app
// stays anonymous (Firebase anonymous auth is untouched); on Android
// the sign-in is a tap on the system account picker, and declining
// leaves the in-app calendar working as ever (Prompt 28 §2).
//
// The native module is required LAZILY. Importing it at module scope
// would drag a native binding into every jest suite that transitively
// touches this file — the exact failure mode the appearance store
// already taught this codebase (MMKV/Nitro, 2026-08-07).
//
// TOKEN PROVIDER CONTRACT (see googleCalendarRest.ts): hand back a
// token fresh enough to use, or the typed auth-expired error — never a
// throw, never a silent null. In Testing status Google kills refresh
// tokens after 7 days, so expiry is a WEEKLY certainty during the
// build, not an edge case: it must land on the sync chip as a
// reconnect ask.

import { err, ok, Result } from '../../../core/result';
import { GOOGLE_WEB_CLIENT_ID } from '../../../core/googleAuthConfig';
import { setActiveBackend } from './calendarBackend';
import { configureRestAuth } from './restCalendarDriver';

export const CALENDAR_SCOPE =
  'https://www.googleapis.com/auth/calendar.app.created';

interface SignInModule {
  GoogleSignin: {
    configure(opts: { webClientId?: string; scopes?: string[] }): void;
    hasPlayServices(opts?: { showPlayServicesUpdateDialog?: boolean }): Promise<boolean>;
    signIn(): Promise<{ type: string; data?: { user?: { email?: string } } | null }>;
    signInSilently(): Promise<{ type: string }>;
    getTokens(): Promise<{ accessToken: string }>;
    signOut(): Promise<null>;
  };
}

function loadModule(): SignInModule['GoogleSignin'] | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('@react-native-google-signin/google-signin') as SignInModule;
    return mod.GoogleSignin;
  } catch {
    return null;
  }
}

let configured = false;

function configuredSignIn(): SignInModule['GoogleSignin'] | null {
  const signin = loadModule();
  if (!signin) return null;
  if (!configured) {
    signin.configure({
      ...(GOOGLE_WEB_CLIENT_ID ? { webClientId: GOOGLE_WEB_CLIENT_ID } : {}),
      scopes: [CALENDAR_SCOPE],
    });
    configured = true;
  }
  return signin;
}

// The provider every REST call goes through. Silent refresh first —
// Play Services keeps access tokens fresh without UI — and when the
// refresh chain itself is dead (weekly, in Testing), the typed state
// the chip renders as a reconnect ask.
async function tokenProvider(): Promise<Result<string>> {
  const signin = configuredSignIn();
  if (!signin) return err({ kind: 'auth-expired' });
  try {
    const t = await signin.getTokens();
    return ok(t.accessToken);
  } catch {
    try {
      await signin.signInSilently();
      const t = await signin.getTokens();
      return ok(t.accessToken);
    } catch {
      return err({ kind: 'auth-expired' });
    }
  }
}

// Interactive connect: the account picker, then the consent screen
// naming exactly one permission. On success the REST driver has its
// token provider and the backend flips — from the next sync onward,
// writes go to the KickoffCal calendar in this account.
export async function connectGoogleCalendar(): Promise<Result<{ email: string | null }>> {
  const signin = configuredSignIn();
  if (!signin) {
    return err({ kind: 'unknown', message: 'Google Sign-In unavailable in this build' });
  }
  try {
    await signin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const res = await signin.signIn();
    if (res.type !== 'success') {
      // The user closed the picker. Not an error — a decline, and the
      // in-app calendar remains the whole product for them.
      return err({ kind: 'unknown', message: 'Sign-in was cancelled.' });
    }
    configureRestAuth(tokenProvider);
    setActiveBackend('rest');
    return ok({ email: res.data?.user?.email ?? null });
  } catch (e) {
    return err({ kind: 'unknown', message: `Google sign-in failed: ${e}` });
  }
}

// Cold-start resume: no UI, just re-arm the token provider so the
// first sync of the day can run. Called from App startup whenever the
// REST backend is active.
export function resumeGoogleCalendarAuth(): void {
  configureRestAuth(tokenProvider);
}

// Disconnect drops the authorization and falls the backend home to the
// provider path. What happens to the synced events is the CALLER's
// decision (P28-3 owns that flow and its copy).
export async function disconnectGoogleCalendar(): Promise<void> {
  const signin = configuredSignIn();
  try {
    await signin?.signOut();
  } catch {
    // Sign-out is best-effort: the backend flip below is what stops
    // writes, and a dead grant dies on its own server-side.
  }
  setActiveBackend('provider');
}
