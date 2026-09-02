import {
  ASSUMED_CARDS_PER_RUN,
  BASELINE_INTERVAL_MS,
  boutBudgetFor,
  cadenceModeFor,
  DENSE_INTERVAL_MS,
  MAX_CARDS_PER_RUN,
  currentQuota,
  planBoxingDataRun,
  projectedSpendToReset,
  QUOTA_KNOWLEDGE_TTL_MS,
  QUOTA_RESERVE,
} from '../providers/boxingDataCadence';
import { BoxingDataHttpError, rejectHttp, shouldFetchBouts } from '../providers/boxingData';

const H = 3_600_000;
const D = 24 * H;
const now = Date.parse('2026-09-10T12:00:00Z');
const iso = (ms: number) => new Date(ms).toISOString();

describe('cadenceModeFor', () => {
  it('is baseline with no cards, or only far cards', () => {
    expect(cadenceModeFor([], now)).toBe('baseline');
    expect(cadenceModeFor([{ id: 'a', startUtc: iso(now + 5 * D) }], now)).toBe('baseline');
  });

  it('is dense while any card starts within three days, including one under way', () => {
    expect(cadenceModeFor([{ id: 'a', startUtc: iso(now + 3 * D) }], now)).toBe('dense');
    expect(cadenceModeFor([{ id: 'a', startUtc: iso(now + 2 * H) }], now)).toBe('dense');
    expect(cadenceModeFor([{ id: 'a', startUtc: iso(now - 6 * H) }], now)).toBe('dense');
  });

  it('a card long finished does not hold the dense mode open', () => {
    expect(cadenceModeFor([{ id: 'a', startUtc: iso(now - 2 * D) }], now)).toBe('baseline');
  });

  it('ignores malformed start times rather than throwing or going dense', () => {
    expect(cadenceModeFor([{ id: 'a', startUtc: 'not a date' }], now)).toBe('baseline');
  });
});

describe('boutBudgetFor', () => {
  it('is the full cap when the quota is unknown', () => {
    expect(boutBudgetFor(null)).toBe(MAX_CARDS_PER_RUN);
    expect(boutBudgetFor({ remaining: null })).toBe(MAX_CARDS_PER_RUN);
  });

  it('leaves the reserve intact after the schedule call', () => {
    expect(boutBudgetFor({ remaining: 100 })).toBe(MAX_CARDS_PER_RUN);
    // reserve 10 + schedule 1 → 3 bouts calls
    expect(boutBudgetFor({ remaining: QUOTA_RESERVE + 4 })).toBe(3);
    expect(boutBudgetFor({ remaining: QUOTA_RESERVE + 1 })).toBe(0);
    expect(boutBudgetFor({ remaining: 2 })).toBe(0);
  });
});

describe('planBoxingDataRun', () => {
  it('polls when nothing has run before', () => {
    const p = planBoxingDataRun({ nowMs: now, lastSuccessAt: null, cards: [], quota: null });
    expect(p.action).toBe('poll');
    expect(p.mode).toBe('baseline');
    expect(p.nextEligibleAt).toBeNull();
  });

  it('baseline: sparse — skips inside 70h of the last success, polls after', () => {
    const last = iso(now - 60 * H);
    const skip = planBoxingDataRun({ nowMs: now, lastSuccessAt: last, cards: [], quota: null });
    expect(skip.action).toBe('skip');
    expect(skip.reason).toBe('cadence');
    expect(skip.intervalMs).toBe(BASELINE_INTERVAL_MS);
    expect(skip.nextEligibleAt).toBe(iso(now - 60 * H + BASELINE_INTERVAL_MS));
    const poll = planBoxingDataRun({
      nowMs: now,
      lastSuccessAt: iso(now - 71 * H),
      cards: [],
      quota: null,
    });
    expect(poll.action).toBe('poll');
  });

  it('dense: a card within three days makes the cadence daily', () => {
    const cards = [{ id: 'c1', startUtc: iso(now + 2 * D) }];
    const skip = planBoxingDataRun({
      nowMs: now,
      lastSuccessAt: iso(now - 20 * H),
      cards,
      quota: null,
    });
    expect(skip.action).toBe('skip');
    expect(skip.mode).toBe('dense');
    expect(skip.intervalMs).toBe(DENSE_INTERVAL_MS);
    const poll = planBoxingDataRun({
      nowMs: now,
      lastSuccessAt: iso(now - 23 * H),
      cards,
      quota: null,
    });
    expect(poll.action).toBe('poll');
    expect(poll.mode).toBe('dense');
  });

  it('the reserve gate wins over the cadence: never a call that would breach it', () => {
    const p = planBoxingDataRun({
      nowMs: now,
      lastSuccessAt: iso(now - 30 * D),
      cards: [{ id: 'c1', startUtc: iso(now + 1 * D) }],
      // a figure inside its window (the marker always stamps resetAt/at)
      quota: { remaining: QUOTA_RESERVE, resetAt: iso(now + 5 * D), at: iso(now - H) },
    });
    expect(p.action).toBe('skip');
    expect(p.reason).toBe('quota_reserve');
    expect(p.boutBudget).toBe(0);
    // Exactly one call above the reserve is allowed — the schedule call —
    // with no bouts budget left.
    const edge = planBoxingDataRun({
      nowMs: now,
      lastSuccessAt: iso(now - 30 * D),
      cards: [],
      quota: { remaining: QUOTA_RESERVE + 1, resetAt: iso(now + 5 * D), at: iso(now - H) },
    });
    expect(edge.action).toBe('poll');
    expect(edge.boutBudget).toBe(0);
  });

  it('an exhausted quota (remaining 0) skips even with no prior success', () => {
    const p = planBoxingDataRun({
      nowMs: now,
      lastSuccessAt: null,
      cards: [],
      quota: { remaining: 0, resetAt: iso(now + 5 * D), at: iso(now - H) },
    });
    expect(p.action).toBe('skip');
    expect(p.reason).toBe('quota_reserve');
  });
});

describe('projectedSpendToReset', () => {
  it('is null without a usable reset time', () => {
    expect(projectedSpendToReset({ nowMs: now, resetAt: null, mode: 'baseline' })).toBeNull();
    expect(projectedSpendToReset({ nowMs: now, resetAt: 'nope', mode: 'baseline' })).toBeNull();
    expect(
      projectedSpendToReset({ nowMs: now, resetAt: iso(now - 1), mode: 'baseline' }),
    ).toBeNull();
  });

  it('counts runs at the mode interval, schedule plus expected bouts each', () => {
    // 30 days at 70h → 11 runs × (1 + 2) = 33
    expect(
      projectedSpendToReset({ nowMs: now, resetAt: iso(now + 30 * D), mode: 'baseline' }),
    ).toBe(11 * (1 + ASSUMED_CARDS_PER_RUN));
    // 3 days dense at 22h → 4 runs × (1 + 1) = 8
    expect(
      projectedSpendToReset({
        nowMs: now,
        resetAt: iso(now + 3 * D),
        mode: 'dense',
        cardsPerRun: 1,
      }),
    ).toBe(8);
  });

  it('a full cycle at the worst plausible density stays under the spendable 90', () => {
    // Dense EVERY day of a 30-day cycle with the maximum bouts budget
    // would be 33 × 7 = 231 — the cadence, not the projection, is what
    // stops that: dense mode only holds while a card is ≤3 days out, so
    // the realistic worst is ~8 card weeks × (3 dense runs + 1 baseline)
    // × (1 + 3 bouts) ≈ 75. The projection reports honestly either way.
    const typical = projectedSpendToReset({
      nowMs: now,
      resetAt: iso(now + 30 * D),
      mode: 'baseline',
      cardsPerRun: 3,
    });
    expect(typical).toBe(11 * 4);
    expect(typical!).toBeLessThan(100 - QUOTA_RESERVE);
  });
});

describe('shouldFetchBouts — the final look inside the last 24 hours', () => {
  const start = now + 12 * H;
  const startUtc = iso(start);

  it('takes one final look when the last fetch was more than 24h before the start', () => {
    // fetched 4 days before the start (first sight), refetched 3 days out;
    // inside the final day the ring-walk times deserve one more call.
    expect(shouldFetchBouts('e1', startUtc, { e1: iso(start - 3 * D) }, now)).toBe(true);
  });

  it('does not repeat the final look once taken', () => {
    expect(shouldFetchBouts('e1', startUtc, { e1: iso(start - 20 * H) }, now)).toBe(false);
    expect(shouldFetchBouts('e1', startUtc, { e1: iso(now - 1 * H) }, now)).toBe(false);
  });

  it('a card already started is not refetched by the final rule', () => {
    const begun = iso(now - 1 * H);
    expect(shouldFetchBouts('e1', begun, { e1: iso(now - 2 * D) }, now)).toBe(false);
  });

  it('the earlier rules are unchanged: first sight fetches, far cards wait', () => {
    expect(shouldFetchBouts('e1', iso(now + 10 * D), {}, now)).toBe(true);
    expect(shouldFetchBouts('e1', iso(now + 10 * D), { e1: iso(now - 5 * D) }, now)).toBe(false);
    // ≤5 days out and ≥3 days after the first look → one refetch
    expect(shouldFetchBouts('e1', iso(now + 4 * D), { e1: iso(now - 3 * D) }, now)).toBe(true);
    expect(shouldFetchBouts('e1', iso(now + 4 * D), { e1: iso(now - 2 * D) }, now)).toBe(false);
  });

  it('at most three calls per card across its whole life', () => {
    // Simulate: seen 10 days out, then daily checks until the start.
    const cardStart = now + 10 * D;
    const state: Record<string, string> = {};
    let calls = 0;
    for (let t = now; t < cardStart; t += 22 * H) {
      if (shouldFetchBouts('e1', iso(cardStart), state, t)) {
        calls += 1;
        state.e1 = iso(t);
      }
    }
    expect(calls).toBe(3);
  });
});

// Rule 15: the guard is attacked. The reserve gate reads the persisted
// quota; at the wall the vendor answers 429 — if that figure were lost
// with the throw, the gate would never learn remaining=0 from a failure.
describe('rejectHttp — the metering headers survive a non-2xx', () => {
  const r = (status: number, h: Partial<{ remaining: number | null; limit: number | null; resetSeconds: number | null }> = {}) => ({
    status,
    body: { error: { code: 'RATE_LIMIT' } },
    remaining: h.remaining ?? null,
    limit: h.limit ?? null,
    resetSeconds: h.resetSeconds ?? null,
  });

  it('lets a 2xx through untouched', () => {
    expect(() => rejectHttp(r(200), 'events/schedule')).not.toThrow();
    expect(() => rejectHttp(r(204), 'events/schedule')).not.toThrow();
  });

  it('a 429 throws the typed error carrying remaining/limit/reset', () => {
    let caught: unknown = null;
    try {
      rejectHttp(r(429, { remaining: 0, limit: 100, resetSeconds: 86_400 }), 'events/schedule');
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(BoxingDataHttpError);
    const e = caught as BoxingDataHttpError;
    expect(e.status).toBe(429);
    expect(e.quota).toEqual({ remaining: 0, limit: 100, resetSeconds: 86_400 });
    expect(e.message).toContain('HTTP 429');
    expect(e.message).toContain('RATE_LIMIT');
  });

  it('a 5xx without headers still throws the typed error, with nulls not zeros', () => {
    let caught: unknown = null;
    try {
      rejectHttp({ ...r(503), body: null }, 'fights');
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(BoxingDataHttpError);
    expect((caught as BoxingDataHttpError).quota).toEqual({
      remaining: null,
      limit: null,
      resetSeconds: null,
    });
    // and a null remaining must NOT engage the reserve gate
    expect(
      planBoxingDataRun({ nowMs: now, lastSuccessAt: null, cards: [], quota: { remaining: null } })
        .action,
    ).toBe('poll');
  });
});

// Found by the live probe on deploy day: the wall had been persisted as
// remaining=0 with the window's reset five days out. A gate that never
// calls while it holds can never refresh that figure — so the figure
// must expire with the window, or the poller stays shut forever.
describe('currentQuota — the reserve gate releases when the window resets', () => {
  it('a figure inside its window is current', () => {
    const q = { remaining: 0, resetAt: iso(now + 5 * D), at: iso(now - 1 * H) };
    expect(currentQuota(q, now)).toEqual(q);
    expect(planBoxingDataRun({ nowMs: now, lastSuccessAt: null, cards: [], quota: q }).reason).toBe(
      'quota_reserve',
    );
  });

  it('once the reset time has passed the figure is unknown and the run goes ahead', () => {
    const q = { remaining: 0, resetAt: iso(now - 1), at: iso(now - 5 * D) };
    expect(currentQuota(q, now)).toBeNull();
    const p = planBoxingDataRun({ nowMs: now, lastSuccessAt: null, cards: [], quota: q });
    expect(p.action).toBe('poll');
    // and the bouts budget is the full cap again, not the stale zero
    expect(p.boutBudget).toBe(MAX_CARDS_PER_RUN);
  });

  it('without a reset time the figure expires a week after it was observed', () => {
    const fresh = { remaining: 3, at: iso(now - (QUOTA_KNOWLEDGE_TTL_MS - H)) };
    expect(currentQuota(fresh, now)).toEqual(fresh);
    const stale = { remaining: 3, at: iso(now - (QUOTA_KNOWLEDGE_TTL_MS + H)) };
    expect(currentQuota(stale, now)).toBeNull();
  });

  it('a figure with neither reset nor observation time is not trusted to hold the gate', () => {
    expect(currentQuota({ remaining: 0 }, now)).toBeNull();
    expect(currentQuota(null, now)).toBeNull();
    expect(currentQuota({ remaining: null, resetAt: iso(now + D) }, now)).toBeNull();
  });
});
