// The OAuth WEB client id for Google Sign-In (server client id — the
// Android client is matched by package name + SHA-1 automatically).
// This is a PUBLIC identifier, same class as the Firebase apiKey in
// firebase.ts: it ships inside every binary and needs no redaction.
//
// Empty until the owner's console setup lands (Prompt 28, 2026-08-13:
// GCP project gameday-fixtures → Credentials → Web client). While
// empty, connect attempts fail loudly and the backend stays on the
// provider path — nothing silently half-works.
export const GOOGLE_WEB_CLIENT_ID = '';
