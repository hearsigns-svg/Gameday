// Where a fixture sits in its competition. PURE.
//
// Providers describe structure in four incompatible dialects and we
// discarded all four. This turns each into the shared shape without
// pretending they are the same thing — see FixtureStage in fixture.ts
// for why round, group and ordinal are kept apart.
//
// THE RULE THAT MATTERS: an unrecognised value KEEPS ITS LABEL and gets
// no `round`. Forcing "Play-offs" or "Group Stage - 3" into the nearest
// rung would put a group game in a quarter-final scope, which is worse
// than having no scope at all. Every normalisation here is a value we
// have actually seen in a real payload.

import { RoundCode, FixtureStage } from './fixture';

// Verbatim provider strings → rung. Lower-cased and space-collapsed
// before lookup, so "Quarter-finals" and "quarter finals" both land.
const ROUND_WORDS: Record<string, RoundCode> = {
  'round of 128': 'r128',
  'round of 64': 'r64',
  'round of 32': 'r32',
  'round of 16': 'r16',
  '1/16': 'r32',
  '1/8': 'r16',
  'last 16': 'r16',
  'quarter final': 'qf',
  'quarter finals': 'qf',
  'quarter-final': 'qf',
  'quarter-finals': 'qf',
  // The vendor's own spellings, verbatim (roundInfo.name and .slug),
  // captured 2026-08-07 from the 2024 Montreal ladder: one word, no
  // hyphen.
  quarterfinal: 'qf',
  quarterfinals: 'qf',
  qf: 'qf',
  'semi final': 'sf',
  'semi finals': 'sf',
  'semi-final': 'sf',
  'semi-finals': 'sf',
  semifinal: 'sf',
  semifinals: 'sf',
  sf: 'sf',
  final: 'f',
  finals: 'f',
  f: 'f',
  'third place final': 'third-place',
  'third place play-off': 'third-place',
  'play-off for third place': 'third-place',
};

// HYPHENS FOLD TOO. Measured against the vendor 2026-08-07: its round
// SLUGS are "round-of-64", "quarterfinals", "final" — and slug is the
// field to key on, because `name` is what a vendor localises and the
// `round` integer is an internal id space (32, 6, 5, 27, 28, 29 up the
// ladder — non-monotonic, and wrong at both ends if sorted). Without
// folding hyphens, three of the six slugs silently missed.
const tidy = (s: string): string =>
  s.toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();

export function roundFromText(raw: string | null | undefined): RoundCode | undefined {
  if (typeof raw !== 'string') return undefined;
  const t = tidy(raw);
  if (t === '') return undefined;
  const direct = ROUND_WORDS[t];
  if (direct) return direct;
  // "Final Round" is GOLF and is a sequence position, not a knockout
  // rung — the one collision worth naming, because it would otherwise
  // put every golf Sunday into a "final" scope.
  if (/\bround\b/.test(t) && /\bfinal\b/.test(t)) return undefined;
  return undefined;
}

// A bare number is a SEQUENCE, never a rung. TheSportsDB's intRound is
// "38" for a league matchday and "1" for a cup's first round; nothing in
// the value says which, so it becomes an ordinal and the label carries
// the raw text.
export function ordinalFromText(raw: string | null | undefined): number | undefined {
  if (raw === null || raw === undefined) return undefined;
  const t = tidy(String(raw));
  const m = /^(?:round|matchday|md|week|day)?\s*(\d{1,3})$/.exec(t);
  if (!m) return undefined;
  const n = Number(m[1]);
  return Number.isInteger(n) && n > 0 ? n : undefined;
}

// Build a stage from whatever a provider gave us. Returns undefined when
// there is genuinely nothing — an absent stage must stay absent rather
// than become an empty object on 14,000 documents.
export function stageFrom(parts: {
  round?: string | number | null;
  group?: string | null;
  ordinal?: number | null;
}): FixtureStage | undefined {
  const rawRound =
    parts.round === null || parts.round === undefined ? undefined : String(parts.round);
  const round = roundFromText(rawRound);
  const ordinal =
    parts.ordinal ?? (round === undefined ? ordinalFromText(rawRound) : undefined);
  const group =
    typeof parts.group === 'string' && parts.group.trim() !== ''
      ? parts.group.trim()
      : undefined;
  const label = rawRound !== undefined && rawRound.trim() !== '' ? rawRound.trim() : undefined;
  if (label === undefined && group === undefined && ordinal === undefined) {
    return undefined;
  }
  return {
    ...(label !== undefined ? { label } : {}),
    ...(round !== undefined ? { round } : {}),
    ...(group !== undefined ? { group } : {}),
    ...(ordinal !== undefined ? { ordinal } : {}),
  };
}

// Ladder order, for a future scope like "quarters onward". Exported so
// the rung sequence lives in ONE place rather than being re-listed
// wherever a comparison is needed.
export const ROUND_ORDER: RoundCode[] = [
  'r128',
  'r64',
  'r32',
  'r16',
  'qf',
  'sf',
  'third-place',
  'f',
];

export function atOrAfter(round: RoundCode, from: RoundCode): boolean {
  return ROUND_ORDER.indexOf(round) >= ROUND_ORDER.indexOf(from);
}
