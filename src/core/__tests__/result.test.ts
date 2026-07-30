// User-facing error copy: never leak raw SDK text. A Firestore
// "unavailable" error arrived on Android as a paragraph of developer
// advice ("Run again without setting source to 'server'…") rendered
// straight into the sync chip.

import { messageOf } from '../result';

it('never surfaces a raw SDK dump', () => {
  const sdk =
    'fixture fetch failed: FirebaseError: [code=unavailable]: Failed to get documents from server. (However, these documents may exist in the local cache. Run again without setting source to "server" to retrieve the cached documents.)';
  const shown = messageOf({ kind: 'unknown', message: sdk });
  expect(shown).not.toContain('FirebaseError');
  expect(shown).not.toContain('source to');
  expect(shown.length).toBeLessThanOrEqual(80);
});

it('keeps a short, human unknown message as written', () => {
  expect(messageOf({ kind: 'unknown', message: 'Could not load fixtures.' })).toBe(
    'Could not load fixtures.',
  );
});

it('speaks plainly for the common failures', () => {
  expect(messageOf({ kind: 'offline' })).toBe('You appear to be offline.');
  expect(
    messageOf({ kind: 'permission-denied', resource: 'calendar' }),
  ).toContain('Calendar access');
});
