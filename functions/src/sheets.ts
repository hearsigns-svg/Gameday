// Reading the ATP review sheet. The only impure part of that source —
// everything that DECIDES anything lives in providers/sheetAtp.ts.
//
// AUTH IS THE FUNCTION'S OWN IDENTITY, not a key. Cloud Run hands us a
// token for the service account this function already runs as, so the
// owner shares the sheet with that address once (Viewer) and there is no
// credential to rotate, leak, or check into the repo.

const METADATA_TOKEN_URL =
  'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token';
const SCOPE = 'https://www.googleapis.com/auth/spreadsheets.readonly';

async function accessToken(): Promise<string> {
  const r = await fetch(`${METADATA_TOKEN_URL}?scopes=${encodeURIComponent(SCOPE)}`, {
    headers: { 'Metadata-Flavor': 'Google' },
  });
  if (!r.ok) {
    throw new Error(`metadata token ${r.status}: ${(await r.text()).slice(0, 200)}`);
  }
  const body = (await r.json()) as { access_token?: string };
  if (!body.access_token) throw new Error('metadata token response had no token');
  return body.access_token;
}

// Raw cell values for one tab. UNFORMATTED_VALUE keeps a date cell a
// number rather than whatever the viewer's locale renders, and
// FORMATTED_STRING on top of it would hand us "06/08/2026" — ambiguous
// in exactly the way that puts a match on the wrong day. We ask for the
// strings the editor typed and parse them ourselves.
export async function readSheetTab(
  spreadsheetId: string,
  tab: string,
): Promise<string[][]> {
  const token = await accessToken();
  const url =
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}` +
    `/values/${encodeURIComponent(tab)}` +
    `?majorDimension=ROWS&valueRenderOption=FORMATTED_VALUE`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) {
    // Every failure mode here — sheet not shared, tab renamed, API not
    // enabled, quota — must be a THROW, because the caller's next line
    // would otherwise treat "no values" as "no matches today".
    throw new Error(`sheets ${r.status}: ${(await r.text()).slice(0, 300)}`);
  }
  const body = (await r.json()) as { values?: string[][] };
  // `values` is ABSENT for a genuinely empty range. That is still not an
  // empty result for our purposes: the header alone should always be
  // there, and parseSheet turns its absence into a loud error.
  return body.values ?? [];
}
