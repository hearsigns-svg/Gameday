// Card participants — the boxing directory's backstop source.
//
// The sanctioning-bodies question closed 2026-08-17 with the same
// answers as 2026-08-03, re-verified: WBC refuses by name (ClaudeBot
// `Disallow: /` — the atptour class, never revisited), and WBA/WBO
// permit robots-wise but publish ratings only as HTML (wp-json answers
// 401), which the no-HTML-soup standing rule declines. So breadth
// comes from the population that needs no scraping at all: OUR OWN
// INGESTED CARDS. Anyone who actually fights on a card the app
// carries becomes findable — the product's own promise — and that
// catches every WBC/WBA/WBO-aligned name the moment they book (Ryan
// Garcia, the motivating miss, enters exactly this way).
//
// WHY THE APPEARANCE FUNNEL NEVER DID THIS: it sees the same names,
// but its id_backed CreationPolicy refuses to MINT from a name-only
// ref — correct for identity attachment, and exactly why Garcia never
// appeared. Roster entries are the one lane allowed to mint
// name-keyed athletes (the IBF's entries already do), so this source
// feeds the names through that lane instead.
//
// Titles are the vendor's, so parsing is defensive: a TSDB card title
// is its main event, sometimes wearing the event's name as a prefix
// ("Prime Video Boxing 16 Inoue vs Tenshin II"). The parser takes the
// trailing name-run on the left of ` vs ` and the leading name-run on
// the right — never event branding, never numerals (Roman-numeral
// suffixes excepted: Tenshin II is a person, 16 is not).

import { Firestore } from 'firebase-admin/firestore';
import { RosterEntry } from '../athletes';
import { normaliseName } from '../identity';

// Words that end a name-run: event branding, formats, broadcast names.
const NOT_NAME = new Set([
  'boxing', 'card', 'cards', 'night', 'fight', 'fights', 'live',
  'presents', 'championship', 'title', 'world', 'series', 'prime',
  'video', 'main', 'event',
]);

const ROMAN = /^(ii|iii|iv|v|vi|vii|viii|ix|x)$/i;
const NAME_SUFFIX = /^(jr\.?|sr\.?)$/i;

function isNameWord(word: string): boolean {
  if (ROMAN.test(word) || NAME_SUFFIX.test(word)) return true;
  if (/\d/.test(word)) return false;
  if (NOT_NAME.has(word.toLowerCase())) return false;
  return /^[\p{L}'’.-]+$/u.test(word);
}

function trailingNameOf(text: string): string {
  const words = text.trim().split(/\s+/);
  const run: string[] = [];
  for (let i = words.length - 1; i >= 0 && run.length < 3; i--) {
    if (!isNameWord(words[i])) break;
    run.unshift(words[i]);
  }
  return run.join(' ');
}

function leadingNameOf(text: string): string {
  const words = text.trim().split(/\s+/);
  const run: string[] = [];
  for (let i = 0; i < words.length && run.length < 4; i++) {
    if (!isNameWord(words[i])) break;
    run.push(words[i]);
  }
  return run.join(' ');
}

// The two participants a card title names, or nothing. Never a
// one-sided answer: a title this parser half-understands is a title it
// must not mint from.
export function participantsFromTitle(title: string): string[] {
  const head = title.split(' — ')[0];
  const sides = head.split(/ vs\.? /i);
  if (sides.length !== 2) return [];
  const left = trailingNameOf(sides[0]);
  const right = leadingNameOf(sides[1]);
  // A single word can be a surname (Inoue) — allowed. Empty or
  // branding-only sides reject the whole title.
  if (!left || !right) return [];
  return [left, right];
}

export async function fetchCardParticipants(
  db: Firestore,
): Promise<{ rawCount: number; entries: RosterEntry[] }> {
  // Equality-only query (no composite index needed); future-filter in
  // code. Boxing volume is a few hundred docs.
  const snap = await db
    .collection('fixtures')
    .where('sport', '==', 'boxing')
    .get();
  const nowIso = new Date().toISOString();
  const byKey = new Map<string, RosterEntry>();
  let rawCount = 0;
  for (const doc of snap.docs) {
    const f = doc.data() as { title?: string; startUtc?: string };
    if ((f.startUtc ?? '') < nowIso) continue;
    rawCount++;
    for (const name of participantsFromTitle(f.title ?? '')) {
      const key = normaliseName(name);
      if (!byKey.has(key)) {
        byKey.set(key, {
          source: 'cards',
          externalId: null,
          name,
          sport: 'boxing',
        });
      }
    }
  }
  return { rawCount, entries: [...byKey.values()] };
}
