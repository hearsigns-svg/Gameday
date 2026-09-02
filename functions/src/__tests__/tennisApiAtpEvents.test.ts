// The vendor chain, inside the function (Round 4 item 7). Pinned
// against REAL payloads captured 2026-09-02 from the live US Open men's
// draw: one events page (tennisapi1-events-sample — 30 matches,
// hasNextPage true) and two search results (US Open, Paris) whose
// look-alike entities are exactly the traps discovery must not fall
// into. No key lives in any fixture.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CATALOGUE_SEED } from '../catalogue';
import { Fixture } from '../fixture';
import {
  activeWindows,
  cacheEntryUsable,
  COST_PER_TOURNAMENT,
  DAILY_LIMIT_PER_KEY,
  discoveryCandidates,
  draftsFrom,
  EVENTS_PAGE_SIZE,
  forecastQuota,
  KNOWN_VENDOR_IDS,
  MAX_EVENT_PAGES,
  observationsFrom,
  pagesFor,
  parseEventsPage,
  pickAtpSinglesEntity,
  planCoverage,
  publishable,
  quotaAvailable,
  quotaFromHeaders,
  RESERVE,
  resolveVendorIds,
  rowsFrom,
  seasonIdFor,
  slamFortnightBudget,
  statusBody,
  TournamentCacheEntry,
  vendorGet,
  VendorGet,
} from '../providers/tennisApiAtpEvents';

const fixture = (name: string): unknown =>
  JSON.parse(readFileSync(join(__dirname, 'fixtures', name), 'utf8'));

const EVENTS_PAGE = fixture('tennisapi1-events-sample.json');
const SEARCH_US_OPEN = fixture('tennisapi1-search-us-open-sample.json');
const SEARCH_PARIS = fixture('tennisapi1-search-paris-sample.json');

const NOW = Date.parse('2026-09-02T10:40:00.000Z');
const NOW_ISO = new Date(NOW).toISOString();

// The live US Open men's parent, as the ICS mints it (probed 2026-09-02).
const US_OPEN: Fixture = {
  id: 'tennis-28pln73q7br6q1565elv65bikk',
  sport: 'tennis',
  competition: 'ATP Tour',
  competitionId: 'tennis-atp',
  title: 'US Open',
  followKeys: ['tennis-atp', 'tennis-t-us-open'],
  startUtc: '2026-08-30T00:00:00.000Z',
  durationHours: 360,
  venueCity: 'New York USA',
  status: 'scheduled',
  timePrecision: 'date_only',
  updatedAt: '2026-08-03T15:34:01.838Z',
};

const parent = (over: Partial<Fixture>): Fixture => ({ ...US_OPEN, ...over });

// ─── Which tournaments are on ─────────────────────────────────────────

describe('activeWindows — our store decides what the vendor is asked about', () => {
  it('a live tournament is a window; finished and far-future editions are not', () => {
    const parents = [
      US_OPEN,
      parent({ id: 'p-2025', startUtc: '2025-08-24T00:00:00.000Z' }),
      parent({ id: 'p-2027', startUtc: '2027-08-29T00:00:00.000Z' }),
    ];
    const w = activeWindows(parents, NOW);
    expect(w.map((x) => x.parent.id)).toEqual(['tennis-28pln73q7br6q1565elv65bikk']);
    expect(w[0]).toMatchObject({
      tournamentKey: 'tennis-t-us-open',
      name: 'US Open',
      venueCity: 'New York USA',
      startUtc: '2026-08-30T00:00:00.000Z',
      endUtc: '2026-09-14T00:00:00.000Z',
    });
  });

  it('a tournament starting inside 48h is a window; one starting later is not', () => {
    const soon = parent({
      id: 'p-soon',
      title: 'Chengdu Open',
      followKeys: ['tennis-atp', 'tennis-t-chengdu-open'],
      startUtc: new Date(NOW + 47 * 3_600_000).toISOString(),
      durationHours: 168,
    });
    const later = parent({
      id: 'p-later',
      title: 'Hangzhou Open',
      followKeys: ['tennis-atp', 'tennis-t-hangzhou-open'],
      startUtc: new Date(NOW + 49 * 3_600_000).toISOString(),
      durationHours: 168,
    });
    expect(activeWindows([soon, later], NOW).map((w) => w.tournamentKey)).toEqual([
      'tennis-t-chengdu-open',
    ]);
  });

  it('cancelled parents, keyless parents and unparseable dates are not windows', () => {
    expect(
      activeWindows(
        [
          parent({ status: 'cancelled' }),
          parent({ id: 'nokey', followKeys: ['tennis-atp'] }),
          parent({ id: 'baddate', startUtc: 'soon' }),
        ],
        NOW,
      ),
    ).toEqual([]);
  });

  it('the SOONEST edition owns a key, and windows come soonest first', () => {
    const cincy = parent({
      id: 'cincy',
      title: 'Cincinnati Open',
      followKeys: ['tennis-atp', 'tennis-t-cincinnati-open'],
      startUtc: new Date(NOW + 20 * 3_600_000).toISOString(),
    });
    const w = activeWindows([cincy, US_OPEN, parent({ id: 'dup', startUtc: '2026-09-01T00:00:00.000Z' })], NOW);
    expect(w.map((x) => [x.tournamentKey, x.parent.id])).toEqual([
      ['tennis-t-us-open', 'tennis-28pln73q7br6q1565elv65bikk'],
      ['tennis-t-cincinnati-open', 'cincy'],
    ]);
  });
});

// ─── Discovery ────────────────────────────────────────────────────────

describe('discoveryCandidates — TITLE FIRST, then the city', () => {
  it('tries the title before either city form', () => {
    expect(
      discoveryCandidates({ name: 'Rolex Shanghai Masters', venueCity: 'Shanghai China' }),
    ).toEqual(['Rolex Shanghai Masters', 'Shanghai', 'Shanghai China']);
  });

  it('a slam is found by its title; its city would find nothing', () => {
    expect(discoveryCandidates({ name: 'US Open', venueCity: 'New York USA' })).toEqual([
      'US Open',
      'New York',
      'New York USA',
    ]);
  });

  it('keeps hyphenated names whole and cuts only at commas, dashes and spaced hyphens', () => {
    expect(discoveryCandidates({ name: 'Rolex Monte-Carlo Masters', venueCity: null })).toEqual([
      'Rolex Monte-Carlo Masters',
    ]);
    expect(
      discoveryCandidates({ name: 'Winston-Salem Open — presented by X', venueCity: 'Winston-Salem USA' }),
    ).toEqual(['Winston-Salem Open', 'Winston-Salem', 'Winston-Salem USA']);
  });

  it('a comma in the city splits there; duplicates collapse', () => {
    expect(discoveryCandidates({ name: 'Shanghai', venueCity: 'Shanghai, China' })).toEqual([
      'Shanghai',
      'Shanghai, China',
    ]);
    expect(discoveryCandidates({ name: 'Wimbledon', venueCity: 'Wimbledon' })).toEqual(['Wimbledon']);
  });
});

describe('pickAtpSinglesEntity — the men’s singles main draw, or nothing', () => {
  it('US Open: the men’s draw, not the women’s, not the (ATP-category!) mixed doubles', () => {
    const e = pickAtpSinglesEntity(SEARCH_US_OPEN, 'US Open');
    expect(e).toMatchObject({ id: 2449, name: 'US Open, Men' });
  });

  it('Paris: the ATP "Paris", not the WTA "Paris", not "Paris, Doubles", not a player called Paris', () => {
    const e = pickAtpSinglesEntity(SEARCH_PARIS, 'Paris');
    expect(e).toMatchObject({ id: 2404, name: 'Paris' });
  });

  it('refuses a wildcard playoff when the main draw is absent — first-hit would have taken it', () => {
    const results = (SEARCH_US_OPEN as { results: { type: string; entity: { name: string } }[] }).results;
    const withoutMain = {
      results: [
        ...results.filter((r) => r.entity.name !== 'US Open, Men'),
        {
          type: 'uniqueTournament',
          entity: { id: 10125, name: 'US Open Asia-Pacific Wildcard Playoff', category: { name: 'ATP' } },
        },
      ],
    };
    expect(pickAtpSinglesEntity(withoutMain, 'US Open')).toBeNull();
  });

  it('NAMED FOR THE TERM: an unrelated ATP singles entity ranked first is not the tournament', () => {
    // The vendor's search is fuzzy and ranks freely. With the script's
    // first-hit rule, a Cincinnati lookup that happened to rank another
    // ATP event first would have published THAT draw under Cincinnati's
    // key — the exclusion regex has nothing to say about a perfectly
    // ordinary tournament name.
    const results = [
      { type: 'uniqueTournament', entity: { id: 100, name: 'Winston-Salem', category: { name: 'ATP' } } },
      { type: 'uniqueTournament', entity: { id: 200, name: 'Cincinnati', category: { name: 'ATP' } } },
    ];
    expect(pickAtpSinglesEntity({ results }, 'Cincinnati')?.id).toBe(200);
    // And with the right one absent, the wrong one is NOT accepted.
    expect(pickAtpSinglesEntity({ results: results.slice(0, 1) }, 'Cincinnati')).toBeNull();
    // Nor is a same-category event whose name merely CONTAINS the term
    // somewhere other than the front ("Cincinnati" inside a longer name).
    const contains = [
      { type: 'uniqueTournament', entity: { id: 300, name: 'Western & Southern Cincinnati Invitational', category: { name: 'ATP' } } },
    ];
    expect(pickAtpSinglesEntity({ results: contains }, 'Cincinnati')).toBeNull();
  });

  it('accepts the city-prefixed form ("Shanghai, China") when nothing matches exactly', () => {
    const body = {
      results: [
        { type: 'uniqueTournament', entity: { id: 9, name: 'Shanghai, China', category: { name: 'ATP' } } },
      ],
    };
    expect(pickAtpSinglesEntity(body, 'Shanghai')?.id).toBe(9);
    // ...but an exact name still wins over a prefixed one.
    const both = {
      results: [
        ...body.results,
        { type: 'uniqueTournament', entity: { id: 7, name: 'Shanghai', category: { name: 'ATP' } } },
      ],
    };
    expect(pickAtpSinglesEntity(both, 'Shanghai')?.id).toBe(7);
  });

  it('a 204 (null body) is no hit; a body without results is a shape failure', () => {
    expect(pickAtpSinglesEntity(null, 'Anything')).toBeNull();
    expect(() => pickAtpSinglesEntity({ foo: 1 }, 'Anything')).toThrow(/missing "results"/);
  });
});

it('seasonIdFor: the year’s season, null for an unpublished year, a throw for a missing array', () => {
  const seasons = {
    seasons: [
      { name: 'US Open Men Singles 2026', year: '2026', id: 85956 },
      { name: 'US Open Men Singles 2025', year: '2025', id: 67287 },
    ],
  };
  expect(seasonIdFor(seasons, 2026)).toBe(85956);
  expect(seasonIdFor(seasons, 2031)).toBeNull();
  expect(() => seasonIdFor({}, 2026)).toThrow(/missing "seasons"/);
});

// ─── The events page ──────────────────────────────────────────────────

describe('parseEventsPage — a real page, and the shape failures it must not swallow', () => {
  it('reads the captured page: 30 events, more to come', () => {
    const page = parseEventsPage(EVENTS_PAGE);
    expect(page.events).toHaveLength(EVENTS_PAGE_SIZE);
    expect(page.hasNextPage).toBe(true);
  });

  it('a missing events array or a missing hasNextPage flag is a failed read, not an empty draw', () => {
    expect(() => parseEventsPage({ hasNextPage: false })).toThrow(/missing "events"/);
    expect(() => parseEventsPage({ events: [] })).toThrow(/hasNextPage/);
    expect(() => parseEventsPage(null)).toThrow(/not an object/);
    expect(() => parseEventsPage({ events: 'nope', hasNextPage: false })).toThrow(/not an array/);
  });
});

describe('observationsFrom — the captured US Open page', () => {
  const { events } = parseEventsPage(EVENTS_PAGE);
  const { observations, malformed } = observationsFrom(events, 'tennis-t-us-open', 2449, NOW_ISO);

  it('turns every event into a neutral observation', () => {
    expect(observations).toHaveLength(30);
    expect(malformed).toBe(0);
    expect(observations.every((o) => o.singles)).toBe(true);
    expect(observations[0]).toEqual({
      fetchedAt: NOW_ISO,
      vendor: 'tennisapi1',
      tournamentKey: 'tennis-t-us-open',
      vendorTournamentId: 2449,
      vendorMatchId: '16901497',
      round: 'Round of 64',
      homeDisplay: 'Daniil Medvedev',
      homeVendorPlayerId: '163504',
      homeCountry: 'RUS',
      awayDisplay: 'Sebastian Gorzny',
      awayVendorPlayerId: '408344',
      awayCountry: 'USA',
      scheduledUtc: '2026-09-02T15:00:00.000Z',
      status: 'notstarted',
      changeTimestamp: 0,
      singles: true,
    });
  });

  it('carries the vendor’s live states through untouched (a rain-suspended match is still a match)', () => {
    const suspended = observations.filter((o) => o.status === 'suspended');
    expect(suspended).toHaveLength(3);
    expect(suspended[0]).toMatchObject({ round: 'Round of 128', homeDisplay: 'Alex Molčan' });
    expect(suspended[0].changeTimestamp).toBeGreaterThan(0);
  });

  it('flags a doubles pairing that reached us anyway, and counts a nameless event as malformed', () => {
    const doubles = {
      id: 1,
      startTimestamp: 1788361200,
      roundInfo: { name: 'Round of 16' },
      status: { type: 'notstarted' },
      homeTeam: { id: 5, name: 'Bopanna R. / Ebden M.', subTeams: [{ id: 51 }, { id: 52 }] },
      awayTeam: { id: 6, name: 'Krawietz K. / Puetz T.', subTeams: [{ id: 61 }, { id: 62 }] },
    };
    const nameless = { id: 2, homeTeam: { id: 7 }, awayTeam: { id: 8, name: 'Someone' } };
    const r = observationsFrom([doubles, nameless], 'tennis-t-x', 1, NOW_ISO);
    expect(r.observations).toHaveLength(1);
    expect(r.observations[0].singles).toBe(false);
    expect(r.malformed).toBe(1);
  });
});

// ─── Players by vendor id ─────────────────────────────────────────────

describe('rowsFrom + publishable — mapping is BY VENDOR ID against our directory, never by name', () => {
  const { events } = parseEventsPage(EVENTS_PAGE);
  const { observations } = observationsFrom(events, 'tennis-t-us-open', 2449, NOW_ISO);
  const directory = new Map([
    ['163504', 'athlete_000900'], // Medvedev
    ['408344', 'athlete_000901'], // Gorzny
  ]);
  const lookup = (id: string) => directory.get(id) ?? null;

  it('a match whose players both carry the id publishes; the rest are skipped and NAMED', () => {
    const rows = rowsFrom(observations, lookup);
    const { publish, skipped } = publishable(rows, new Set(['tennis-t-us-open']));
    expect(publish).toHaveLength(1);
    expect(publish[0].row).toMatchObject({
      homeAthleteId: 'athlete_000900',
      awayAthleteId: 'athlete_000901',
      timePrecision: 'exact',
      vendors: 'tennisapi1',
      vendorMatchId: '16901497',
    });
    expect(skipped).toHaveLength(29);
    expect(skipped.every((s) => s.reason === 'unmapped_player')).toBe(true);
    // Both names on the row when both are missing — a human sees who.
    expect(skipped[0].detail).toMatch(/ \+ .* \(in /);
  });

  it('one mapped side is not enough: the unmapped side is named, nothing is guessed', () => {
    const rows = rowsFrom(observations.slice(0, 1), (id) => (id === '163504' ? 'athlete_000900' : null));
    const { publish, skipped } = publishable(rows, new Set(['tennis-t-us-open']));
    expect(publish).toEqual([]);
    expect(skipped[0]).toEqual({
      reason: 'unmapped_player',
      detail: 'Sebastian Gorzny (in Daniil Medvedev vs Sebastian Gorzny)',
    });
  });

  it('an event with no vendor player id is unmapped, whatever the name', () => {
    const rows = rowsFrom(
      [{ ...observations[0], homeVendorPlayerId: '' }],
      () => 'athlete_000001',
    );
    expect(rows[0].homeAthleteId).toBeNull();
    expect(rows[0].awayAthleteId).toBe('athlete_000001');
  });
});

// ─── Rows → drafts ────────────────────────────────────────────────────

describe('draftsFrom — one appearance doc per player, id-bearing refs, round as a field', () => {
  const { events } = parseEventsPage(EVENTS_PAGE);
  const { observations } = observationsFrom(events.slice(0, 1), 'tennis-t-us-open', 2449, NOW_ISO);
  const rows = rowsFrom(observations, () => 'mapped');
  const rowsFixed = rows.map((r) => ({ ...r, homeAthleteId: 'athlete_000900', awayAthleteId: 'athlete_000901' }));
  const parents = new Map([['tennis-t-us-open', US_OPEN]]);

  it('publishes both sides under the parent, titled from each player’s side', () => {
    const { publish } = publishable(rowsFixed, new Set(parents.keys()));
    const drafts = draftsFrom(publish, parents, NOW_ISO);
    expect(drafts.map((d) => d.fixture.id)).toEqual([
      'tennis-28pln73q7br6q1565elv65bikk-app-daniil-medvedev',
      'tennis-28pln73q7br6q1565elv65bikk-app-sebastian-gorzny',
    ]);
    expect(drafts[0].fixture).toMatchObject({
      title: 'Daniil Medvedev vs Sebastian Gorzny — US Open, Round of 64',
      competitionId: 'tennis-atp-appearances',
      parentFixtureId: 'tennis-28pln73q7br6q1565elv65bikk',
      startUtc: '2026-09-02T15:00:00.000Z',
      timePrecision: 'exact',
      confidence: 'confirmed',
      durationHours: 3,
      stage: { label: 'Round of 64', round: 'r64' },
      venueCity: 'New York USA',
      status: 'scheduled',
    });
    expect(drafts[1].fixture.title).toBe('Sebastian Gorzny vs Daniil Medvedev — US Open, Round of 64');
    // Identity travels as the vendor's id, so resolution is CERTAIN.
    expect(drafts[0].refs).toEqual([{ name: 'Daniil Medvedev', source: 'tennisapi1', externalId: '163504' }]);
    expect(drafts[1].refs).toEqual([{ name: 'Sebastian Gorzny', source: 'tennisapi1', externalId: '408344' }]);
  });

  it('a cancelling status publishes cancelled docs with no slot — the event leaves the calendar', () => {
    const { publish } = publishable(
      rowsFixed.map((r) => ({ ...r, status: 'canceled' })),
      new Set(parents.keys()),
    );
    const drafts = draftsFrom(publish, parents, NOW_ISO);
    expect(drafts).toHaveLength(2);
    for (const d of drafts) {
      expect(d.fixture.status).toBe('cancelled');
      expect(d.fixture.confidence).toBe('provisional'); // the parent's window, no slot
    }
  });

  it('a row whose parent is not in the map yields nothing (never mints a parent)', () => {
    const { publish } = publishable(rowsFixed, new Set(parents.keys()));
    expect(draftsFrom(publish, new Map(), NOW_ISO)).toEqual([]);
  });
});

// ─── The static map ───────────────────────────────────────────────────

describe('KNOWN_VENDOR_IDS — the four slams and the nine Masters, by OUR keys', () => {
  it('holds exactly thirteen tournaments, every key a tennis-t- key', () => {
    const keys = Object.keys(KNOWN_VENDOR_IDS);
    expect(keys).toHaveLength(13);
    for (const k of keys) expect(k).toMatch(/^tennis-t-[a-z0-9-]+$/);
  });

  it('the slam keys are the catalogue’s ranking rows, and every slam id is confirmed', () => {
    const slamRows = CATALOGUE_SEED.filter(
      (e) => e.rankOnly && e.sport === 'tennis' && e.competitionId.startsWith('tennis-t-'),
    ).map((e) => e.competitionId);
    expect(slamRows.sort()).toEqual(
      ['tennis-t-australian-open', 'tennis-t-roland-garros', 'tennis-t-us-open', 'tennis-t-wimbledon'],
    );
    for (const k of slamRows) {
      expect({ k, id: typeof KNOWN_VENDOR_IDS[k].vendorTournamentId }).toEqual({ k, id: 'number' });
    }
  });

  it('the US Open id is the one the captured events page names', () => {
    const e0 = (EVENTS_PAGE as { events: { tournament: { uniqueTournament: { id: number; name: string } } }[] }).events[0];
    expect(KNOWN_VENDOR_IDS['tennis-t-us-open']).toMatchObject({
      vendorTournamentId: e0.tournament.uniqueTournament.id,
      vendorName: e0.tournament.uniqueTournament.name,
    });
  });

  it('every confirmed id carries the vendor’s name; every TODO is null with a note, never a guess', () => {
    for (const [k, v] of Object.entries(KNOWN_VENDOR_IDS)) {
      if (v.vendorTournamentId === null) {
        expect({ k, todo: /TODO/.test(v.note) }).toEqual({ k, todo: true });
      } else {
        expect({ k, named: typeof v.vendorName, confirmed: /confirmed/.test(v.note) }).toEqual({
          k,
          named: 'string',
          confirmed: true,
        });
      }
    }
  });
});

// ─── Resolving ids: static → cache → discovery, seasons paid once ─────

describe('resolveVendorIds', () => {
  const win = activeWindows([US_OPEN], NOW)[0];
  const SEASONS = { seasons: [{ year: '2026', id: 85956 }, { year: '2025', id: 67287 }] };

  const recorder = (answers: (path: string) => unknown) => {
    const calls: string[] = [];
    const get: VendorGet = async (_kind, path) => {
      calls.push(path);
      return answers(path);
    };
    return { calls, get };
  };

  it('a static id costs one seasons call the first year, and nothing after', async () => {
    const first = recorder((p) => (p.endsWith('/seasons') ? SEASONS : null));
    const r1 = await resolveVendorIds(win, {}, first.get, NOW_ISO);
    expect(r1).toMatchObject({ tournamentId: 2449, seasonId: 85956, via: 'static', searched: [] });
    expect(first.calls).toEqual(['/api/tennis/tournament/2449/seasons']);
    expect(r1.entry).toMatchObject({ via: 'static', vendorName: 'US Open, Men', seasons: { '2026': 85956 } });

    const second = recorder(() => {
      throw new Error('should not be called');
    });
    const r2 = await resolveVendorIds(win, { 'tennis-t-us-open': r1.entry }, second.get, NOW_ISO);
    expect(r2).toMatchObject({ tournamentId: 2449, seasonId: 85956, via: 'static' });
    expect(second.calls).toEqual([]);
  });

  it('discovery searches the title first and stops at the first hit; the answer is cached with its city', async () => {
    const chengdu = activeWindows(
      [
        parent({
          id: 'chengdu',
          title: 'Chengdu Open',
          followKeys: ['tennis-atp', 'tennis-t-chengdu-open'],
          venueCity: 'Chengdu China',
          startUtc: '2026-09-01T00:00:00.000Z',
        }),
      ],
      NOW,
    )[0];
    const { calls, get } = recorder((p) => {
      if (p === '/api/tennis/search/Chengdu%20Open') return { results: [] };
      if (p === '/api/tennis/search/Chengdu') {
        return { results: [{ type: 'uniqueTournament', entity: { id: 777, name: 'Chengdu', category: { name: 'ATP' } } }] };
      }
      if (p === '/api/tennis/tournament/777/seasons') return SEASONS;
      throw new Error(`unexpected ${p}`);
    });
    const r = await resolveVendorIds(chengdu, {}, get, NOW_ISO);
    expect(r).toMatchObject({ tournamentId: 777, seasonId: 85956, via: 'discovered', searched: ['Chengdu Open', 'Chengdu'] });
    expect(calls).toEqual([
      '/api/tennis/search/Chengdu%20Open',
      '/api/tennis/search/Chengdu',
      '/api/tennis/tournament/777/seasons',
    ]);
    expect(r.entry).toMatchObject({ vendorTournamentId: 777, vendorName: 'Chengdu', venueCity: 'Chengdu China', via: 'discovered' });

    // Cached: zero calls next time, same city.
    const again = recorder(() => {
      throw new Error('should not be called');
    });
    const r2 = await resolveVendorIds(chengdu, { 'tennis-t-chengdu-open': r.entry }, again.get, NOW_ISO);
    expect(r2.via).toBe('cached');
    expect(again.calls).toEqual([]);
  });

  it('a discovered entry is NOT trusted for a different city — the National Bank Open alternates', () => {
    const entry: TournamentCacheEntry = {
      vendorTournamentId: 1,
      vendorName: 'Montreal',
      venueCity: 'Montreal Canada',
      via: 'discovered',
      resolvedAt: NOW_ISO,
      seasons: {},
    };
    expect(cacheEntryUsable(entry, { venueCity: 'Montreal Canada' })).toBe(true);
    expect(cacheEntryUsable(entry, { venueCity: 'Toronto Canada' })).toBe(false);
    expect(cacheEntryUsable({ ...entry, via: 'static' }, { venueCity: 'Toronto Canada' })).toBe(true);
    expect(cacheEntryUsable(undefined, { venueCity: null })).toBe(false);
  });

  it('a discovery miss throws, naming every term it spent — never improvises an id', async () => {
    const mystery = activeWindows(
      [parent({ id: 'm', title: 'Mystery Cup', followKeys: ['tennis-atp', 'tennis-t-mystery-cup'], venueCity: 'Nowhere Utopia', startUtc: '2026-09-01T00:00:00.000Z' })],
      NOW,
    )[0];
    const { get } = recorder(() => ({ results: [] }));
    await expect(resolveVendorIds(mystery, {}, get, NOW_ISO)).rejects.toThrow(
      /no ATP singles entity for tennis-t-mystery-cup; searched Mystery Cup, Nowhere, Nowhere Utopia/,
    );
  });

  it('a year the vendor has not published is an error, not an empty draw', async () => {
    const { get } = recorder(() => ({ seasons: [{ year: '2025', id: 67287 }] }));
    await expect(resolveVendorIds(win, {}, get, NOW_ISO)).rejects.toThrow(/no 2026 season/);
  });
});

// ─── Quota, coverage, forecast ────────────────────────────────────────

describe('quota — read from the vendor’s headers, so exhaustion is predicted', () => {
  // The exact headers the vendor returned on 2026-09-02 10:38 UTC.
  const HEADERS: Record<string, string> = {
    'x-ratelimit-requests-limit': '50',
    'x-ratelimit-requests-remaining': '25',
    'x-ratelimit-requests-reset': '564',
  };
  const q = quotaFromHeaders((n) => HEADERS[n], NOW)!;

  it('parses limit, remaining and the reset instant', () => {
    expect(q).toEqual({
      limit: 50,
      remaining: 25,
      resetAt: new Date(NOW + 564_000).toISOString(),
      observedAt: NOW_ISO,
    });
    expect(DAILY_LIMIT_PER_KEY).toBe(50);
    expect(quotaFromHeaders(() => undefined, NOW)).toBeNull();
  });

  it('unknown counts as FULL, a passed reset is full again, otherwise the remaining', () => {
    expect(quotaAvailable(null, NOW)).toBe(50);
    expect(quotaAvailable(q, NOW)).toBe(25);
    expect(quotaAvailable(q, NOW + 600_000)).toBe(50);
  });

  it('planCoverage covers the soonest tournaments the budget affords and NAMES the deferred', () => {
    const windows = Array.from({ length: 13 }, (_, i) => ({
      tournamentKey: `t${i}`,
      startUtc: new Date(NOW + (13 - i) * 3_600_000).toISOString(), // reverse order on purpose
    }));
    const full = planCoverage(windows, 50);
    expect(full.cover).toHaveLength(Math.floor((50 - RESERVE) / COST_PER_TOURNAMENT));
    expect(full.deferred).toHaveLength(13 - full.cover.length);
    expect(full.cover[0].tournamentKey).toBe('t12'); // soonest first
    // Below the reserve the run still covers ONE — freshness degrades, never stalls.
    const thin = planCoverage(windows, 3);
    expect(thin.cover).toHaveLength(1);
    expect(thin.deferred).toHaveLength(12);
  });

  it('forecastQuota flags the run that would not fit, and a day of runs that would exceed the limit', () => {
    expect(forecastQuota(q, 7)).toEqual({
      spentThisRun: 7,
      projectedDailySpend: 28,
      remaining: 25,
      runsLeftInWindow: 3,
      exhaustionRisk: false,
    });
    expect(forecastQuota({ ...q, remaining: 5 }, 7).exhaustionRisk).toBe(true);
    expect(forecastQuota(q, 13).exhaustionRisk).toBe(true); // 52/day > 50
    expect(forecastQuota(null, 3)).toMatchObject({ remaining: null, runsLeftInWindow: null, exhaustionRisk: false });
    expect(forecastQuota(q, 0).runsLeftInWindow).toBeNull();
  });
});

// ─── The budget: a slam fortnight on one key ──────────────────────────

describe('slamFortnightBudget — sized against the measured page and limit', () => {
  it('a 128-draw first round is three pages of thirty', () => {
    expect(pagesFor(64)).toBe(3);
    expect(pagesFor(30)).toBe(1);
    expect(pagesFor(31)).toBe(2);
    expect(pagesFor(0)).toBe(1);
    expect(MAX_EVENT_PAGES).toBeGreaterThan(pagesFor(64));
  });

  it('fits a single free key with margin, on the peak day and even in the no-real-draw worst case', () => {
    const b = slamFortnightBudget();
    expect(b.pageSize).toBe(30);
    expect(b.perDay).toHaveLength(14);
    expect(b.perDay).toEqual([14, 12, 8, 8, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4]);
    expect(b.peakDay).toBe(15); // 3 pages × 4 sweeps + discovery 2 + the weekly ranking call
    expect(b.fortnightTotal).toBe(84); // 82 pages + 2 ranking calls
    expect(b.worstCaseDay).toBe(15);
    expect(b.worstCaseFortnight).toBe(172); // 3 pages every sweep for 14 days + 2 + 2
    expect(b.fitsPeakDay).toBe(true);
    expect(b.fitsWorstCaseDay).toBe(true);
    expect(b.marginOnPeakDay).toBe(35);
  });

  it('a 96-draw Masters needs two pages a sweep at most', () => {
    const b = slamFortnightBudget({ drawSize: 96, discoveryCalls: 1 });
    expect(b.perDay[0]).toBe(2 * 4 + 1);
    expect(b.fitsPeakDay).toBe(true);
  });

  it('says NO when the cadence would not fit — the answer is then the paid tier on the same key', () => {
    const hourly = slamFortnightBudget({ sweepsPerDay: 24 });
    expect(hourly.peakDay).toBe(3 * 24 + 2 + 1);
    expect(hourly.fitsPeakDay).toBe(false);
    expect(hourly.marginOnPeakDay).toBeLessThan(0);
  });
});

// ─── The run record body ──────────────────────────────────────────────

describe('statusBody — status is SURFACED in the run record', () => {
  const input = {
    nowMs: NOW,
    windows: { seen: 1, covered: ['tennis-t-us-open'], deferred: [] },
    discovery: { static: 1, cached: 0, discovered: 0, misses: [] },
    requests: { search: 0, seasons: 1, events: 2 },
    pages: 2,
    quota: quotaFromHeaders(
      (n) => ({ 'x-ratelimit-requests-limit': '50', 'x-ratelimit-requests-remaining': '47', 'x-ratelimit-requests-reset': '3600' })[n],
      NOW,
    ),
    rows: { fetched: 36, malformed: 0, notSingles: 0, published: 70 },
    skipped: [{ reason: 'unmapped_player' as const, detail: 'X (in X vs Y)' }],
    errors: [],
  };

  it('carries windows, discovery, requests, quota, forecast and rows by reason', () => {
    const body = statusBody(input);
    expect(body).toEqual({
      status: 'ok',
      windows: input.windows,
      discovery: input.discovery,
      requests: { spent: 3, search: 0, seasons: 1, events: 2, pages: 2 },
      quota: input.quota,
      forecast: { spentThisRun: 3, projectedDailySpend: 12, remaining: 47, runsLeftInWindow: 15, exhaustionRisk: false },
      rows: {
        fetched: 36,
        malformed: 0,
        notSingles: 0,
        published: 70,
        skipped: 1,
        skippedByReason: { unmapped_player: 1 },
        skippedDetail: ['unmapped_player: X (in X vs Y)'],
      },
      errors: [],
    });
  });

  it('names the run state honestly: idle, partial, budgeted, both', () => {
    expect(statusBody({ ...input, windows: { seen: 0, covered: [], deferred: [] } }).status).toBe('idle');
    expect(statusBody({ ...input, errors: ['tennis-t-x: boom'] }).status).toBe('partial');
    expect(statusBody({ ...input, windows: { ...input.windows, deferred: ['tennis-t-y'] } }).status).toBe('budgeted');
    expect(
      statusBody({ ...input, errors: ['e'], windows: { ...input.windows, deferred: ['tennis-t-y'] } }).status,
    ).toBe('partial+budgeted');
  });

  it('caps the named skips at 25 but counts them all', () => {
    const many = Array.from({ length: 40 }, (_, i) => ({ reason: 'unmapped_player' as const, detail: `p${i}` }));
    const body = statusBody({ ...input, skipped: many });
    expect(body.rows.skipped).toBe(40);
    expect(body.rows.skippedDetail).toHaveLength(25);
  });
});

// ─── The fetch: one key, quota read on every answer ───────────────────

describe('vendorGet', () => {
  const response = (status: number, body: string, headers: Record<string, string>) =>
    ({
      status,
      ok: status >= 200 && status < 300,
      headers: { get: (n: string) => headers[n.toLowerCase()] ?? null },
      text: async () => body,
      json: async () => JSON.parse(body),
    }) as unknown as Response;

  it('sends the one key to the one host and reports the quota', async () => {
    let seen: { url: string; headers: Record<string, string> } | null = null;
    const quotas: number[] = [];
    const fake: typeof fetch = async (url, init) => {
      seen = { url: String(url), headers: (init?.headers ?? {}) as Record<string, string> };
      return response(200, '{"ok":true}', { 'x-ratelimit-requests-limit': '50', 'x-ratelimit-requests-remaining': '41', 'x-ratelimit-requests-reset': '100' });
    };
    const body = await vendorGet('/api/tennis/search/Paris', 'the-key', (q) => quotas.push(q.remaining), fake);
    expect(body).toEqual({ ok: true });
    expect(seen).toEqual({
      url: 'https://tennisapi1.p.rapidapi.com/api/tennis/search/Paris',
      headers: { 'x-rapidapi-host': 'tennisapi1.p.rapidapi.com', 'x-rapidapi-key': 'the-key' },
    });
    expect(quotas).toEqual([41]);
  });

  it('a 429 still reports the quota, then throws with the real status for the run record', async () => {
    const quotas: number[] = [];
    const fake: typeof fetch = async () =>
      response(429, '{"message":"Too many requests"}', { 'x-ratelimit-requests-limit': '50', 'x-ratelimit-requests-remaining': '0', 'x-ratelimit-requests-reset': '9' });
    await expect(vendorGet('/x', 'k', (q) => quotas.push(q.remaining), fake)).rejects.toThrow(/tennisapi1 http 429 on \/x/);
    expect(quotas).toEqual([0]);
  });

  it('a 204 is genuinely nothing there', async () => {
    const fake: typeof fetch = async () => response(204, '', {});
    expect(await vendorGet('/x', 'k', () => undefined, fake)).toBeNull();
  });
});
