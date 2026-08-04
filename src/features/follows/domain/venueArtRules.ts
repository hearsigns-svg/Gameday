// Licensing rules for venue photography (docs/IMAGERY.md). Only
// commercially-safe licences pass; attribution is carried with the
// image and RENDERED (a visible credit is a condition of use, not a
// nicety). Pure — pinned by unit tests.

export interface VenueArt {
  url: string; // sized Commons thumb URL
  artist: string; // plain text, HTML stripped
  licence: string; // short licence name, e.g. 'CC BY-SA 4.0'
  // The Commons file page — the attribution LINK CC 4.0 asks for, and
  // the audit trail for the licence we verified (Prompt 9b: recorded
  // at FETCH time, per image). Optional because entries cached before
  // 9b lack them; every NEW fetch records both.
  sourceUrl?: string;
  verifiedAt?: string;
}

// Fetch-time verification (Prompt 9b): an image is usable only when
// its metadata carries BOTH an allowed licence AND a named artist —
// Commons metadata is user-asserted, and an image with no author
// claim is exactly the one whose licence tag deserves no trust.
export function verifiedArt(fields: {
  fileTitle: string;
  artistHtml?: string;
  licenceShort?: string;
  nowIso: string;
}): VenueArt | null {
  if (!isAllowedLicence(fields.licenceShort)) return null;
  const artist = stripHtml(fields.artistHtml);
  if (artist.length === 0) return null;
  const clean = fields.fileTitle.replace(/^File:/, '').replace(/ /g, '_');
  return {
    url: commonsThumbUrl(fields.fileTitle),
    artist,
    licence: (fields.licenceShort ?? '').trim(),
    sourceUrl: `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(clean)}`,
    verifiedAt: fields.nowIso,
  };
}

// Commercial-use allowlist. NC (non-commercial) and ND (no-derivative)
// never pass; unknown licence strings never pass.
export function isAllowedLicence(short: string | undefined): boolean {
  if (!short) return false;
  const s = short.trim().toUpperCase();
  if (s.includes('NC') || s.includes('ND')) return false;
  return (
    s.startsWith('CC BY') || // CC BY x.x and CC BY-SA x.x
    s === 'CC0' ||
    s.startsWith('CC0') ||
    s.startsWith('PUBLIC DOMAIN') ||
    s === 'PD'
  );
}

// Commons Artist fields arrive as HTML anchors — credit lines render
// plain text.
export function stripHtml(html: string | undefined): string {
  if (!html) return '';
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Stable sized-thumbnail URL for a Commons file title.
export function commonsThumbUrl(fileTitle: string, width = 1280): string {
  const clean = fileTitle.replace(/^File:/, '').replace(/ /g, '_');
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(clean)}?width=${width}`;
}

// Tournament-entity candidate selection (Prompt 9c). "Wimbledon"
// returns tube stops, a tram stop, a suburb AND the tournament — the
// live probe measured 4 of 5 candidates as transit/geography. Only a
// tennis-shaped description qualifies, and when several do (a
// name-sharing golf major, a defunct edition) the CITY the feeds
// publish breaks the tie. Pure, so the choice is pinned by tests.
export interface WikidataCandidate {
  id: string;
  description?: string;
}

const TENNIS_SHAPED = /tennis|grand slam/;

// PERSON-candidate selection (Prompt 16 B). The resolver used to take
// the first candidate carrying an image, having only ruled out
// competition-shaped descriptions — so a name shared with somebody else
// famous returned THEIR face. Measured against production names,
// 2026-08-04: 3 of 10 boxing "hits" were the wrong person — "Gary
// Russell" resolved to a writer, "Albert Gonzalez" to a computer
// criminal, "Sara Bailey" to an ice dancer — and 1 of 26 WTA hits was a
// rhythmic gymnast who shares a name with the tennis player.
//
// A wrong face is worse than no face, and it is the same failure the
// no-generated-likeness ruling exists to avoid: something nearly right
// reads as broken to the fans who know the person. So a candidate must
// be describable as this sport's kind of competitor, and when none is,
// the answer is NONE.
// NOT A PERSON. Wikidata's answer to "Tyson Fury" includes the fighter
// AND the bouts he is famous for ("Tyson Fury vs. Deontay Wilder",
// described as a boxing match), and every one of those matches a
// sport-shaped test. Without this the uniqueness rule below refuses a
// correct portrait for almost every famous fighter — a false negative
// that would empty the feature out.
// Measured against the live search on 2026-08-04, these are the shapes
// that share an athlete's name and their sport's vocabulary: the bouts
// ("Tyson Fury vs. Deontay Wilder", a boxing match), the per-season
// statistics items every top tennis player has ("professional statistics
// of …", "2025 tennis player season"), and Wikimedia's own plumbing.
const NOT_A_PERSON =
  /\bmatch\b|\bbout\b|fight card|fight night|\bevent\b|competition|championship match|\bseason\b|\bseries\b|statistic|\brivalry\b|head-to-head|\blist of\b|\bresults\b|\brecords\b|\btimeline\b|disambiguation|wikimedia|\bfilm\b|\balbum\b|\bsong\b|video game|\bcard\b/;

const SPORT_SHAPED: Readonly<Record<string, RegExp>> = {
  boxing: /\bboxer\b|\bboxing\b|\bpugilist\b/,
  ufc: /mixed martial|\bmma\b|martial artist|\bfighter\b|kickbox/,
  tennis: /tennis/,
  f1: /racing driver|formula one|formula 1|motorsport|race car driver/,
  athletics: /athlet|sprinter|runner|hurdler|jumper|thrower|track and field|marathon/,
};

export function isAthleteCandidate(
  description: string | undefined,
  sportKey: string,
): boolean {
  const shape = SPORT_SHAPED[sportKey];
  // A sport we have no shape for gets no photo rather than a guess.
  if (!shape) return false;
  const desc = (description ?? '').toLowerCase();
  if (desc.length === 0) return false; // undescribed ⇒ unverifiable
  if (NOT_A_PERSON.test(desc)) return false;
  return shape.test(desc);
}

// A SURNAME IS NOT AN IDENTITY — the repo's standing rule (F31), and it
// applies to photographs as much as to minting athletes. Combat titles
// often carry only surnames ("UFC 330 Makhachev vs Machado Garry"), and
// a one-word search is exactly where a confident single match is most
// likely to be the wrong person.
export function isNameSpecificEnough(name: string): boolean {
  return name.trim().split(/\s+/).filter((w) => w.length > 1).length >= 2;
}

export function pickAthleteCandidate(
  candidates: readonly WikidataCandidate[],
  sportKey: string,
  personName?: string,
): string | null {
  if (personName !== undefined && !isNameSpecificEnough(personName)) return null;
  const shaped = candidates.filter((c) =>
    isAthleteCandidate(c.description, sportKey),
  );
  // Ambiguity is not a tie to break: two plausible boxers of the same
  // name give us no way to know which one is fighting tonight.
  return shaped.length === 1 ? shaped[0].id : null;
}

export function pickTournamentCandidate(
  candidates: readonly WikidataCandidate[],
  city?: string,
): string | null {
  const shaped = candidates.filter((c) =>
    TENNIS_SHAPED.test((c.description ?? '').toLowerCase()),
  );
  if (shaped.length === 0) return null;
  if (shaped.length === 1 || !city) return shaped[0].id;
  const needle = city.toLowerCase().split(/[,\s]+/)[0];
  const inCity = shaped.find((c) =>
    (c.description ?? '').toLowerCase().includes(needle),
  );
  return (inCity ?? shaped[0]).id;
}
