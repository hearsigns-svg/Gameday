// Typed results at the data boundary — UI never sees raw throws.

export type Result<T, E extends AppError = AppError> =
  | { ok: true; value: T }
  | { ok: false; error: E };

export type AppError =
  | { kind: 'offline' }
  | { kind: 'permission-denied'; resource: 'calendar' | 'notifications' }
  | { kind: 'provider'; status: number; message: string }
  | { kind: 'not-found'; what: string }
  | { kind: 'sync-in-progress' }
  | { kind: 'suspect-empty' }
  | { kind: 'scan-anomaly'; scanned: number; ledgerEntries: number }
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
    case 'unknown':
      // Never surface raw SDK text: long, jargon-laden, and sometimes
      // contains developer instructions. Callers put detail in logs.
      return e.message.length <= 80 && !/[{}]|Error:/.test(e.message)
        ? e.message
        : 'Something went wrong — we will retry.';
  }
}
