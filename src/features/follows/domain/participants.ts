// Who is named in a fixture title. Combat-sport fixtures ARE their
// participants ("Rolando Romero vs Teofimo Lopez"), which is the only
// place an athlete photo is editorially justified: it identifies a
// named participant on that participant's own fixture. PURE.

const VS = /\s+(?:vs\.?|v)\s+/i;

// Sports whose fixture titles name people rather than clubs.
const PERSON_SPORTS = new Set(['boxing', 'ufc']);

export function namesPeople(sportKey: string): boolean {
  return PERSON_SPORTS.has(sportKey);
}

// The headline participant — the first named fighter. Strips event
// prefixes ("UFC 330 Makhachev vs Machado") and trailing qualifiers.
export function headlineParticipant(
  title: string,
  sportKey: string,
): string | null {
  if (!namesPeople(sportKey)) return null;
  if (!VS.test(title)) return null;
  const [left] = title.split(VS);
  // Drop a leading promotion/event number ("UFC 330 ", "Fight Night 284 ")
  const cleaned = left
    .replace(/^(ufc|bellator|pfl|one championship|bkfc)\s*/i, '')
    .replace(/^fight night\s*/i, '')
    .replace(/^\d+\s*/, '')
    .trim();
  // A bare number or an empty remainder is not a person.
  if (cleaned.length < 3 || /^\d+$/.test(cleaned)) return null;
  return cleaned;
}
