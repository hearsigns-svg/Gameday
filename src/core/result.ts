// Typed results at the data boundary — UI never sees raw throws.

export type Result<T, E extends AppError = AppError> =
  | { ok: true; value: T }
  | { ok: false; error: E };

export type AppError =
  | { kind: 'offline' }
  // The request was sent and nothing came back within the budget — a
  // cold backend or a slow network, not an outage. Distinct from
  // 'offline' so the screen can say "slow" rather than accuse the
  // connection (2026-09-03 search audit).
  | { kind: 'timeout' }
  // `canAskAgain`: whether the OS would still show its dialog. False
  // means only Settings can change the answer — the surface offers the
  // deep-link and never re-prompts (Round 5 ruling 7).
  | {
      kind: 'permission-denied';
      resource: 'calendar' | 'notifications';
      canAskAgain?: boolean;
    }
  | { kind: 'provider'; status: number; message: string }
  | { kind: 'not-found'; what: string }
  | { kind: 'sync-in-progress' }
  | { kind: 'suspect-empty' }
  | { kind: 'scan-anomaly'; scanned: number; ledgerEntries: number }
  // The Google authorization died under us — in Testing status refresh
  // tokens expire every 7 days, and in production a user can revoke at
  // any time. A dedicated kind so it can NEVER melt into 'unknown':
  // this is the "sync silently stops" failure class, and it must reach
  // the chip as a reconnect ask, not as a shrug.
  | { kind: 'auth-expired' }
  | { kind: 'unknown'; message: string };

export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });
export const err = <E extends AppError>(error: E): Result<never, E> => ({
  ok: false,
  error,
});

export function messageOf(e: AppError): string {
  switch (e.kind) {
    case 'offline':
      return 'You appear to be offline.';
    case 'timeout':
      return 'Taking longer than usual — still trying.';
    case 'permission-denied':
      return e.resource === 'calendar'
        ? 'Calendar access is needed to add fixtures.'
        : 'Notification access is needed.';
    case 'provider':
      return `Fixture service error (${e.status}).`;
    case 'not-found':
      return `Could not find ${e.what}.`;
    case 'sync-in-progress':
      return 'A sync is already running.';
    case 'suspect-empty':
      return 'Fixture service returned nothing — calendar left untouched.';
    case 'scan-anomaly':
      // The calendar could not be read back. Saying "up to date" here
      // would be a lie, and acting on it would delete real events.
      return 'Could not read your calendar — nothing was changed.';
    case 'auth-expired':
      return 'Google sign-in expired — reconnect to keep your calendar in sync.';
    case 'unknown':
      // Never surface raw SDK text: long, jargon-laden, and sometimes
      // contains developer instructions. Callers put detail in logs.
      return e.message.length <= 80 && !/[{}]|Error:/.test(e.message)
        ? e.message
        : 'Something went wrong — we will retry.';
  }
}
