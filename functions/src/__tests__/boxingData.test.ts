// boxing-data.com adapter. Every payload here is REAL — captured from the
// live API on 2026-08-07, not invented — because the two things that could
// go wrong (a wrong time, a refusal read as an empty result) are both
// invisible against a payload written to pass.

import {
  eventToFixture,
  fightsToAppearances,
  isMainEvent,
  isTimeless,
  toUtc,
  unwrapList,
  shouldFetchBouts,
  SLICE,
  SOURCE,
} from '../providers/boxingData';

const NOW = '2026-08-07T18:00:00.000Z';

// ─── The refusal that looks like success ──────────────────────────────
//
// Captured verbatim from `GET /v2/events/schedule?days=30`. HTTP 403, and
// a body that a `?? []` would happily read as "no boxing next month".

const REFUSAL = {
  metadata: { timestamp: '2026-08-07T18:09:24.795553+00:00' },
  pagination: { page: 1, items: 0, total_pages: 1, total_items: 0 },
  error: {
    code: 'DateOutOfRange',
    message: "Requested date is outside your subscription's allowed date range",
  },
  data: null,
};

describe('unwrapList — a refusal is never an empty result', () => {
  it('throws on the real DateOutOfRange envelope, and names the code', () => {
    expect(() => unwrapList(403, REFUSAL, 'events/schedule')).toThrow(
      /DateOutOfRange/,
    );
  });

  it('throws on a non-2xx even when the body looks perfectly normal', () => {
    const looksFine = {
      pagination: { total_items: 0 },
      error: {},
      data: [],
    };
    expect(() => unwrapList(403, looksFine, 'events/schedule')).toThrow(/HTTP 403/);
  });

  it('throws on data:null even at HTTP 200 — no null-means-empty here', () => {
    expect(() =>
      unwrapList(200, { pagination: { total_items: 0 }, error: {}, data: null }, 'x'),
    ).toThrow(/"data" is null/);
  });

  it('throws when pagination is missing — an empty must prove it is empty', () => {
    expect(() => unwrapList(200, { error: {}, data: [] }, 'x')).toThrow(
      /pagination\.total_items/,
    );
  });

  it('throws when data is present but not a list', () => {
    expect(() =>
      unwrapList(200, { pagination: { total_items: 1 }, data: 'nope' }, 'x'),
    ).toThrow(/not an array/);
  });

  // The one thing that legitimately means "nothing scheduled".
  it('accepts a genuinely empty week', () => {
    expect(
      unwrapList(200, { pagination: { total_items: 0 }, error: {}, data: [] }, 'x'),
    ).toEqual([]);
  });

  it('accepts a real populated response', () => {
    expect(
      unwrapList<{ id: string }>(
        200,
        { pagination: { total_items: 1 }, error: {}, data: [{ id: 'a' }] },
        'x',
      ),
    ).toHaveLength(1);
  });
});

// ─── Time ─────────────────────────────────────────────────────────────

describe('toUtc — the convention established in 22d', () => {
  // Williamson vs Simpson 2, Leeds. DAZN/ESPN publish "from 7pm BST";
  // BST is UTC+1, so 7pm BST IS 18:00 UTC. This is the anchor case.
  it('reads the offset-free string as UTC, matching the published start', () => {
    expect(toUtc('2026-08-08T18:00:00')).toBe('2026-08-08T18:00:00.000Z');
  });

  // Auckland (UTC+12): 07:00 UTC is 7pm NZST. As local it would be 7am.
  it('gives Auckland an evening, not a dawn', () => {
    const iso = toUtc('2026-08-08T07:00:00')!;
    const nz = new Date(iso).toLocaleString('en-NZ', {
      timeZone: 'Pacific/Auckland',
      hour: '2-digit',
      hour12: false,
    });
    expect(Number(nz)).toBeGreaterThanOrEqual(18);
  });

  // Gold Coast (UTC+10): 08:00 UTC is 6pm AEST. As local it would be 8am.
  it('gives the Gold Coast an evening, not a breakfast', () => {
    const iso = toUtc('2026-08-12T08:00:00')!;
    const au = new Date(iso).toLocaleString('en-AU', {
      timeZone: 'Australia/Brisbane',
      hour: '2-digit',
      hour12: false,
    });
    expect(Number(au)).toBeGreaterThanOrEqual(17);
  });

  it('refuses a shape it has not verified rather than guessing', () => {
    // An offset appearing would mean the convention changed under us.
    expect(toUtc('2026-08-08T18:00:00+01:00')).toBeNull();
    expect(toUtc('2026-08-08T18:00:00Z')).toBeNull();
    expect(toUtc('08/08/2026')).toBeNull();
    expect(toUtc('')).toBeNull();
    expect(toUtc(null)).toBeNull();
  });
});

describe('isTimeless — midnight is a sentinel, not a time', () => {
  it('recognises the no-time-known marker', () => {
    expect(isTimeless('2026-08-09T00:00:00')).toBe(true);
    expect(isTimeless('2026-08-09T00:00:00.000')).toBe(true);
  });
  it('does not mistake a real time for one', () => {
    expect(isTimeless('2026-08-08T18:00:00')).toBe(false);
    expect(isTimeless('2026-08-08T21:00:00')).toBe(false);
  });
});

// ─── Cards ────────────────────────────────────────────────────────────

// Captured from `GET /v2/events/schedule?days=7`.
const LEEDS = {
  id: '6a28a9833ded9efcbbb76261',
  title: 'Williamson vs. Simpson 2',
  date: '2026-08-08T18:00:00',
  venue: 'First Direct Bank Arena',
  location: 'Leeds, Yorkshire',
  promotion: null,
  co_promotion: null,
  updated_at: '2026-08-07T18:03:30.753000',
};

// MVPW 5, Orlando — the timeless one.
const ORLANDO = {
  id: '6a18d7bd3f905622bd99d821',
  title: 'MVPW 5: Johnson vs. Thorslund',
  date: '2026-08-09T00:00:00',
  venue: 'Caribe Royale Orlando',
  location: 'Orlando, Florida, United States',
  promotion: null,
  updated_at: '2026-08-07T18:03:29.009000',
};

describe('eventToFixture', () => {
  it('carries a real card time as nominal', () => {
    const f = eventToFixture(LEEDS, NOW)!;
    expect(f.startUtc).toBe('2026-08-08T18:00:00.000Z');
    expect(f.timePrecision).toBe('nominal');
    expect(f.id).toBe('boxingdata-6a28a9833ded9efcbbb76261');
    expect(f.followKeys).toEqual([SLICE]);
    expect(f.venue).toBe('First Direct Bank Arena');
  });

  // THE FAILURE THIS CONNECTOR WAS GATED ON. Midnight must not become a
  // time, or an Orlando card lands at 8pm the previous evening for a US
  // follower — confident, checkable and wrong.
  it('marks a timeless card date_only rather than inventing midnight', () => {
    const f = eventToFixture(ORLANDO, NOW)!;
    expect(f.timePrecision).toBe('date_only');
  });

  it('omits promoter while the vendor sends null — never inferred', () => {
    expect(eventToFixture(LEEDS, NOW)!.promoter).toBeUndefined();
  });

  it('reads promoter if the vendor ever starts sending one', () => {
    const f = eventToFixture({ ...LEEDS, promotion: 'BOXXER' }, NOW)!;
    expect(f.promoter).toBe('BOXXER');
  });

  it('returns null rather than a half-built fixture', () => {
    expect(eventToFixture({ ...LEEDS, date: undefined }, NOW)).toBeNull();
    expect(eventToFixture({ ...LEEDS, title: undefined }, NOW)).toBeNull();
    expect(eventToFixture({ ...LEEDS, id: undefined }, NOW)).toBeNull();
  });
});

// ─── Bouts ────────────────────────────────────────────────────────────

// Captured from `GET /v2/fights?event_id=6a28a9833ded9efcbbb76261`.
const LEEDS_FIGHTS = [
  {
    id: '6a28a9863ded9efcbbb76262',
    title: 'Williamson vs. Simpson 2',
    date: '2026-08-08T21:00:00',
    card_billing: 'Main Event',
    scheduled_rounds: 12,
    status: 'NOT_STARTED',
    fighters: {
      fighter_1: {
        fighter_id: '6715fc1faf69bb50508b7ca3',
        name: 'Williamson',
        full_name: 'Troy Williamson',
      },
      fighter_2: {
        fighter_id: '6715fc1faf69bb50508b7c2e',
        name: 'Simpson',
        full_name: 'Callum Simpson',
      },
    },
  },
  {
    id: '6a28a9863ded9efcbbb76263',
    title: 'Kraus vs. Hemphill',
    date: '2026-08-08T20:00:00',
    card_billing: 'Main Card',
    scheduled_rounds: 10,
    status: 'NOT_STARTED',
    fighters: {
      fighter_1: {
        fighter_id: '6828deed162efadfc8bcdd9b',
        name: 'Kraus',
        full_name: 'Gradus Kraus',
      },
      fighter_2: {
        fighter_id: '68289284162efadfc8bc5345',
        name: 'Hemphill',
        full_name: 'Sean Hemphill',
      },
    },
  },
];

describe('fightsToAppearances', () => {
  const card = eventToFixture(LEEDS, NOW)!;

  it('gives every bout its OWN ring-walk time, not the card start', () => {
    const as = fightsToAppearances(card, LEEDS_FIGHTS, NOW);
    expect(as).toHaveLength(2);
    const byTitle = Object.fromEntries(as.map((a) => [a.fixture.title, a.fixture.startUtc]));
    expect(byTitle['Troy Williamson vs Callum Simpson']).toBe('2026-08-08T21:00:00.000Z');
    expect(byTitle['Gradus Kraus vs Sean Hemphill']).toBe('2026-08-08T20:00:00.000Z');
    // ...and neither is the card's own 18:00.
    expect(card.startUtc).toBe('2026-08-08T18:00:00.000Z');
  });

  it('orders bouts as they are fought', () => {
    const as = fightsToAppearances(card, LEEDS_FIGHTS, NOW);
    expect(as[0].fixture.title).toBe('Gradus Kraus vs Sean Hemphill');
    expect(as[1].fixture.title).toBe('Troy Williamson vs Callum Simpson');
  });

  it('scopes the main event from card_billing, which is STORED', () => {
    const as = fightsToAppearances(card, LEEDS_FIGHTS, NOW);
    const main = as.find((a) => a.fixture.title.includes('Williamson'))!;
    const under = as.find((a) => a.fixture.title.includes('Kraus'))!;
    expect(main.fixture.followKeys).toContain(`${SLICE}-main`);
    expect(under.fixture.followKeys).not.toContain(`${SLICE}-main`);
  });

  it('carries the vendor id on every ref, so identity is id-backed', () => {
    const as = fightsToAppearances(card, LEEDS_FIGHTS, NOW);
    for (const a of as) {
      for (const r of a.refs) {
        expect(r.source).toBe(SOURCE);
        expect(r.externalId).toMatch(/^[0-9a-f]{24}$/);
        expect(r.name.split(' ').length).toBeGreaterThanOrEqual(2);
      }
    }
  });

  // THE 22d SCOPING RULE: no id, no publish and no mint — whatever the
  // name looks like.
  it('drops a bout whose fighter has no id', () => {
    const noId = [
      {
        ...LEEDS_FIGHTS[0],
        fighters: {
          fighter_1: { full_name: 'Troy Williamson' },
          fighter_2: LEEDS_FIGHTS[0].fighters.fighter_2,
        },
      },
    ];
    expect(fightsToAppearances(card, noId, NOW)).toHaveLength(0);
  });

  it('drops a bout whose fighter has an id but no full name', () => {
    const noName = [
      {
        ...LEEDS_FIGHTS[0],
        fighters: {
          fighter_1: { fighter_id: '6715fc1faf69bb50508b7ca3', name: 'Williamson' },
          fighter_2: LEEDS_FIGHTS[0].fighters.fighter_2,
        },
      },
    ];
    expect(fightsToAppearances(card, noName, NOW)).toHaveLength(0);
  });

  it('falls back to the card start when a bout carries no time of its own', () => {
    const undated = [{ ...LEEDS_FIGHTS[0], date: undefined }];
    const as = fightsToAppearances(card, undated, NOW);
    expect(as[0].fixture.startUtc).toBe(card.startUtc);
  });
});

describe('isMainEvent', () => {
  it('reads the stored billing, case-insensitively', () => {
    expect(isMainEvent({ card_billing: 'Main Event' })).toBe(true);
    expect(isMainEvent({ card_billing: 'main event' })).toBe(true);
    expect(isMainEvent({ card_billing: 'Main Card' })).toBe(false);
    expect(isMainEvent({ card_billing: null })).toBe(false);
    expect(isMainEvent({})).toBe(false);
  });
});

// ─── Quota ────────────────────────────────────────────────────────────
//
// 100 requests a MONTH. Refetching every card's bouts daily would cost
// ~180 and the ceiling would be gone by the eleventh, so this policy is
// what keeps the connector inside its budget — and it is pure, because a
// quota rule that can only be checked by spending the quota is not a rule.

describe('shouldFetchBouts', () => {
  const now = Date.parse('2026-08-07T12:00:00Z');
  const soon = '2026-08-09T18:00:00Z'; // 2 days out
  const far = '2026-08-13T18:00:00Z'; // 6 days out

  it('always fetches a card it has never seen', () => {
    expect(shouldFetchBouts('e1', far, {}, now)).toBe(true);
    expect(shouldFetchBouts('e1', soon, {}, now)).toBe(true);
  });

  it('does not refetch a distant card just because a day passed', () => {
    const yesterday = new Date(now - 86_400_000).toISOString();
    expect(shouldFetchBouts('e1', far, { e1: yesterday }, now)).toBe(false);
  });

  // The second look, where late undercard additions and ring-walk times
  // actually land.
  it('refetches a near card once it has gone stale', () => {
    const fourDaysAgo = new Date(now - 4 * 86_400_000).toISOString();
    expect(shouldFetchBouts('e1', soon, { e1: fourDaysAgo }, now)).toBe(true);
  });

  it('does not refetch a near card that was just fetched', () => {
    const anHourAgo = new Date(now - 3_600_000).toISOString();
    expect(shouldFetchBouts('e1', soon, { e1: anHourAgo }, now)).toBe(false);
  });

  it('treats an unreadable marker as never-fetched rather than trusting it', () => {
    expect(shouldFetchBouts('e1', soon, { e1: 'not-a-date' }, now)).toBe(true);
  });

  it('refuses to spend a call on a card whose start it cannot read', () => {
    const old = new Date(now - 9 * 86_400_000).toISOString();
    expect(shouldFetchBouts('e1', 'nonsense', { e1: old }, now)).toBe(false);
  });

  // The whole point, as arithmetic: a realistic month must fit in 100.
  it('keeps a realistic month inside the free tier', () => {
    const state: Record<string, string> = {};
    let calls = 0;
    // 30 daily runs; ~10 cards a month, each visible for its final week.
    const cards = Array.from({ length: 10 }, (_, i) => ({
      id: `e${i}`,
      start: new Date(Date.parse('2026-08-03T20:00:00Z') + i * 3 * 86_400_000).toISOString(),
    }));
    for (let day = 0; day < 30; day++) {
      const t = Date.parse('2026-08-01T06:00:00Z') + day * 86_400_000;
      calls += 1; // the schedule call
      for (const c of cards) {
        const startMs = Date.parse(c.start);
        const inWindow = startMs >= t && startMs - t <= 7 * 86_400_000;
        if (!inWindow) continue;
        if (shouldFetchBouts(c.id, c.start, state, t)) {
          calls += 1;
          state[c.id] = new Date(t).toISOString();
        }
      }
    }
    expect(calls).toBeLessThanOrEqual(100);
  });
});
