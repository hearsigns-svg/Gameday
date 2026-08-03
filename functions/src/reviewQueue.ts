// The review queue — how boxing gets covered where a connector cannot.
//
// Four promoters are out of reach: Golden Boy 403s automated clients,
// MVP's robots.txt names this agent, and Matchroom, BOXXER and Queensberry
// publish only HTML that would be three indefinite maintenance
// commitments for a handful of events a month. This is the answer to all
// of them, and to whatever comes next.
//
// The shape is deliberate:
//   - EXTRACTION IS FROM SUPPLIED TEXT ONLY. An extractor may never
//     contribute a fact from its own knowledge. Boxing schedules are
//     exactly the domain where a plausible-sounding hallucination —
//     right fighters, wrong date — would be indistinguishable from truth
//     until someone missed the fight.
//   - EVERY RECORD CARRIES ITS SOURCE URL. Nothing is publishable without
//     one, so any claim can be checked against where it came from.
//   - NOTHING REACHES A CALENDAR UNAPPROVED. Items land `provisional` and
//     a human moves them to `confirmed`.
//
// The extractor itself is not in this file and not in the cluster: there
// is no LLM key in this project. An operator (or an agent session) reads
// the page, extracts to ReviewSubmission, and POSTs it. Running extraction
// server-side would need a provider key and a budget decision — see
// docs/PLAN.md.

import { Firestore } from 'firebase-admin/firestore';
import { boutAppearance } from './appearances';
import { AppearanceDraft } from './athletes';
import { Fixture } from './fixture';
import { normaliseName } from './identity';

export type ReviewStatus = 'provisional' | 'confirmed' | 'cancelled';

export type CardPosition = 'main' | 'co-main' | 'undercard';

export interface ReviewBout {
  first: string;
  second: string;
  cardPosition: CardPosition;
  titleOnTheLine?: string; // e.g. "WBA Welterweight"
}

export interface ReviewSubmission {
  sourceUrl: string; // MANDATORY — never publishable without it
  promoter: string;
  title: string;
  startUtc: string; // ISO 8601
  venue?: string;
  broadcaster?: string;
  bouts: ReviewBout[];
  extractedBy?: string; // who or what produced this
}

export interface ReviewItem extends ReviewSubmission {
  id: string;
  status: ReviewStatus;
  submittedAt: string;
  decidedAt?: string;
  decidedBy?: string;
  rejectionReason?: string;
}

const POSITIONS: readonly CardPosition[] = ['main', 'co-main', 'undercard'];

// Strict. A submission that fails here is REJECTED, not repaired: a
// repaired record is a record nobody verified.
export function validateSubmission(input: unknown): {
  ok: true; value: ReviewSubmission;
} | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const o = (input ?? {}) as Record<string, unknown>;
  const str = (k: string, required = true): string | undefined => {
    const v = o[k];
    if (typeof v === 'string' && v.trim().length > 0) return v.trim();
    if (required) errors.push(`${k} is required and must be a non-empty string`);
    return undefined;
  };

  const sourceUrl = str('sourceUrl');
  if (sourceUrl && !/^https?:\/\/\S+$/i.test(sourceUrl)) {
    errors.push('sourceUrl must be an http(s) URL');
  }
  const promoter = str('promoter');
  const title = str('title');
  const startUtc = str('startUtc');
  if (startUtc && Number.isNaN(Date.parse(startUtc))) {
    errors.push('startUtc must be a parseable ISO 8601 instant');
  }
  const venue = str('venue', false);
  const broadcaster = str('broadcaster', false);
  const extractedBy = str('extractedBy', false);

  const rawBouts = o.bouts;
  const bouts: ReviewBout[] = [];
  if (!Array.isArray(rawBouts) || rawBouts.length === 0) {
    errors.push('bouts must be a non-empty array');
  } else {
    rawBouts.forEach((b, i) => {
      const bo = (b ?? {}) as Record<string, unknown>;
      const first = typeof bo.first === 'string' ? bo.first.trim() : '';
      const second = typeof bo.second === 'string' ? bo.second.trim() : '';
      const pos = bo.cardPosition as CardPosition;
      if (!first || !second) {
        errors.push(`bouts[${i}]: first and second are required`);
        return;
      }
      if (!POSITIONS.includes(pos)) {
        errors.push(`bouts[${i}].cardPosition must be one of ${POSITIONS.join('|')}`);
        return;
      }
      if (normaliseName(first) === normaliseName(second)) {
        errors.push(`bouts[${i}]: first and second are the same person`);
        return;
      }
      bouts.push({
        first,
        second,
        cardPosition: pos,
        ...(typeof bo.titleOnTheLine === 'string' && bo.titleOnTheLine.trim()
          ? { titleOnTheLine: bo.titleOnTheLine.trim() }
          : {}),
      });
    });
    if (bouts.length > 0 && !bouts.some((b) => b.cardPosition === 'main')) {
      errors.push('exactly one bout must be the main event');
    }
  }

  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: {
      sourceUrl: sourceUrl!,
      promoter: promoter!,
      title: title!,
      startUtc: new Date(startUtc!).toISOString(),
      bouts,
      ...(venue ? { venue } : {}),
      ...(broadcaster ? { broadcaster } : {}),
      ...(extractedBy ? { extractedBy } : {}),
    },
  };
}

export const promoterKey = (promoter: string): string =>
  `review-${normaliseName(promoter).replace(/\s+/g, '-')}`;

// A CONFIRMED item becomes a fixture. Provisional and cancelled ones never
// do — nothing reaches a calendar that a human has not approved.
export function reviewItemToFixture(
  item: ReviewItem,
  updatedAt: string,
): Fixture | null {
  if (item.status !== 'confirmed') return null;
  const main = item.bouts.find((b) => b.cardPosition === 'main');
  if (!main) return null;
  return {
    id: `review-${item.id}`,
    sport: 'boxing',
    competition: item.promoter,
    competitionId: promoterKey(item.promoter),
    title: item.title,
    homeTeam: main.first,
    awayTeam: main.second,
    followKeys: [promoterKey(item.promoter)],
    startUtc: item.startUtc,
    status: 'scheduled',
    durationHours: 4,
    // Hand-verified against a promoter's own page, but the time is still a
    // card start rather than a ringwalk — same as every other boxing feed.
    timePrecision: 'nominal',
    confidence: 'provisional',
    updatedAt,
  };
}

// Every bout on a CONFIRMED card — main, co-main and undercard alike —
// becomes an appearance DRAFT, which is the whole point of collecting
// bouts in the queue: a fighter on the prelims is followable the same
// way the headliner is. Whether a draft survives to a stored doc is
// canonical resolution's decision (athletes.ts); review bouts are
// operator-verified against the promoter's own page, so they MAY create
// directory athletes — provenance 'review', name-keyed and saying so.
export function reviewItemToAppearances(
  item: ReviewItem,
  updatedAt: string,
): AppearanceDraft[] {
  const parent = reviewItemToFixture(item, updatedAt);
  if (!parent) return [];
  return item.bouts
    .map((b) => boutAppearance(parent, b, updatedAt))
    .filter((a): a is AppearanceDraft => a !== null);
}

export async function submitReviewItem(
  db: Firestore,
  value: ReviewSubmission,
  nowIso: string,
): Promise<ReviewItem> {
  const ref = db.collection('reviewQueue').doc();
  const item: ReviewItem = {
    ...value,
    id: ref.id,
    status: 'provisional',
    submittedAt: nowIso,
  };
  await ref.set(item);
  return item;
}

export async function listReviewItems(
  db: Firestore,
  status?: ReviewStatus,
): Promise<ReviewItem[]> {
  // Ordered only, then filtered in memory. A `where('status')` alongside
  // `orderBy('submittedAt')` needs a composite index, and the queue is
  // bounded at 200 — an index is not worth owning for a filter over a
  // list that small.
  const snap = await db
    .collection('reviewQueue')
    .orderBy('submittedAt', 'desc')
    .limit(200)
    .get();
  const items = snap.docs.map((d) => d.data() as ReviewItem);
  return status ? items.filter((i) => i.status === status) : items;
}
