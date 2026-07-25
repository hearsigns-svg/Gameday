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
    case 'unknown':
      return e.message;
  }
}
