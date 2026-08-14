// The OAuth WEB client id for Google Sign-In (server client id — the
// Android client is matched by package name + SHA-1 automatically).
// This is a PUBLIC identifier, same class as the Firebase apiKey in
// firebase.ts: it ships inside every binary and needs no redaction.
//
// Console setup landed 2026-08-13: Calendar API enabled, consent
// screen in Testing (owner as test user), calendar.app.created scope,
// Android client matched by package + upload-key SHA-1.
export const GOOGLE_WEB_CLIENT_ID =
  '188261010398-tdkgf7slmajpqe0kkr9auphv098latde.apps.googleusercontent.com';
