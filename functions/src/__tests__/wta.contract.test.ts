// WTA contract test — pinned to REAL payloads captured 2026-08-02 from
// api.wtatennis.com (owner-approved, no key, honest UA): the tournament
// calendar page, the DC Open's full matches feed, and its order of play
// trimmed to three real days that carry the shapes the parser must
// survive — a timed final, ATP skeleton entries at a joint event, a
// dict-shaped single-match court container, and qualifying matches with
// empty NotBeforeISOTime (the day-only path). Expectations are LITERAL
// values read off the banked payloads.

import matchesSample from './fixtures/wta-matches-sample.json';
import oopSample from './fixtures/wta-oop-sample.json';
import tournamentsSample from './fixtures/wta-tournaments-sample.json';
import {
  buildFinalSlot,
  buildTournamentAppearances,
  isActive,
  pickLiveSlot,
  playerSlots,
  playersStillIn,
  shortTitle,
  slotInstant,
  tournamentToFixture,
  WtaMatch,
  WtaTournament,
} from '../providers/wtaTennis';

const AT = '2026-08-01T00:00:00.000Z';
const tournaments = tournamentsSample.content as WtaTournament[];
const matches = matchesSample.matches as WtaMatch[];
const dc = tournaments[0];

test('a tournament becomes a date_only span parent under the tennis-wta slice', () => {
  const f = tournamentToFixture(dc, AT)!;
  expect(f).toEqual({
    id: 'wta-1045-2026',
    sport: 'tennis',
    competition: 'WTA Tour',
    competitionId: 'tennis-wta',
    title: 'Mubadala DC Open',
    // Tour slice + the canonical tournament key (Prompt 9). DC is the
    // evidenced ALIAS case: the WTA says "Mubadala DC Open", the ATP
    // ICS says "Mubadala Citi DC Open" — one Washington event, and
    // both slugs fold to tennis-t-dc-open.
    // …plus the women's draw key (Round 7 item 8): the sexed follow.
    followKeys: ['tennis-wta', 'tennis-t-dc-open', 'tennis-t-dc-open-w'],
    // City+country from the feed — the tournament-photo disambiguator
    // (Prompt 9c), never a photo key by itself.
    venueCity: 'WASHINGTON DC USA', // verbatim feed casing
    startUtc: '2026-07-27T00:00:00.000Z',
    status: 'scheduled',
    durationHours: 7 * 24, // 07-27..08-02, endDate INCLUSIVE
    timePrecision: 'date_only',
    confidence: 'confirmed',
    updatedAt: AT,
  });
});

test('the calendar carries the US Open — slam coverage without touching usopen.org', () => {
  const usOpen = tournaments.find((t) => t.tournamentGroup?.id === 905)!;
  expect(tournamentToFixture(usOpen, AT)!.id).toBe('wta-905-2026');
  expect(shortTitle(usOpen.title!)).toBe('US Open');
});

test('still-in means named in an undecided singles match — walkovers, doubles and finished matches do not count', () => {
  // LS001 is the unplayed final (Winner "0"); every other sampled match
  // is decided ("2"/"3"), a walkover ("5", Krueger–Osaka), or doubles.
  // Each ref carries the WTA's own numeric id — the disambiguation
  // source canonical identity runs on (Prompt 8).
  const stillIn = [...playersStillIn(matches)].sort((a, b) =>
    a.name.localeCompare(b.name),
  );
  expect(stillIn).toEqual([
    { name: 'Alexandra Eala', wtaId: '330332' },
    { name: 'Jessica Pegula', wtaId: '316956' },
  ]);
});

test('order-of-play times are venue-local with explicit offsets', () => {
  expect(slotInstant('2026-08-02', '13:30-0400')).toBe(
    '2026-08-02T17:30:00.000Z',
  );
  expect(slotInstant('2026-08-02', '')).toBeNull();
  expect(slotInstant('2026-08-02', 'Starting at 1:30 PM')).toBeNull();
});

test('playerSlots reads days, courts and dict-shaped containers; ATP skeletons never leak', () => {
  const { slots, ids } = playerSlots(oopSample);
  // The OOP carries the same numeric ids as the draw (verified on the
  // banked joint payloads) — either feed can certify identity.
  expect(ids.get('Jessica Pegula')).toBe('316956');
  // Pegula carries BOTH her slots — the July 30 quarter and the final.
  expect(slots.get('Jessica Pegula')).toEqual([
    {
      startUtc: '2026-08-02T17:30:00.000Z',
      endUtc: '2026-08-02T20:30:00.000Z',
      dayOnly: false,
      opponent: 'Alexandra Eala',
    },
    {
      startUtc: '2026-07-30T19:00:00.000Z',
      endUtc: '2026-07-30T22:00:00.000Z',
      dayOnly: false,
      opponent: 'Magdalena Frech',
    },
  ]);
  // Qualifying (RS) with an empty NotBeforeISOTime → the DAY (with the
  // 36h venue-local window), never an invented instant.
  expect(slots.get('Clervie Ngounoue')).toEqual([
    {
      startUtc: '2026-07-25T00:00:00.000Z',
      endUtc: '2026-07-26T12:00:00.000Z',
      dayOnly: true,
      opponent: 'Varvara Lepchenko',
    },
  ]);
  // No ATP name from the joint-event skeletons can appear.
  for (const name of slots.keys()) {
    expect(name).not.toMatch(/^undefined/);
  }
});

test('REGRESSION: a played morning slot yields to the same payload\'s later final — and an in-progress match keeps its slot', () => {
  const pegula = playerSlots(oopSample).slots.get('Jessica Pegula')!;
  // Mid-quarter (19:00–22:00Z window): the quarter is the thing to show.
  expect(pickLiveSlot(pegula, '2026-07-30T21:00:00.000Z')!.opponent).toBe(
    'Magdalena Frech',
  );
  // Quarter over: the final is next — NOT the played slot shadowing it,
  // and NOT a provisional demotion.
  expect(pickLiveSlot(pegula, '2026-07-30T23:00:00.000Z')!.opponent).toBe(
    'Alexandra Eala',
  );
  // Mid-final: the confirmed final stays through the match…
  expect(pickLiveSlot(pegula, '2026-08-02T18:30:00.000Z')!.startUtc).toBe(
    '2026-08-02T17:30:00.000Z',
  );
  // …and through the feed-lag grace after it ends.
  expect(pickLiveSlot(pegula, '2026-08-03T01:00:00.000Z')!.startUtc).toBe(
    '2026-08-02T17:30:00.000Z',
  );
  expect(pickLiveSlot(pegula, '2026-08-03T03:00:00.000Z')).toBeUndefined();
});

test('draw only (no order of play yet) → provisional appearances on the parent window', () => {
  const parent = tournamentToFixture(dc, AT)!;
  const apps = buildTournamentAppearances(parent, matches, null, AT).map(
    (d) => d.fixture,
  );
  expect(apps.map((a) => a.id).sort()).toEqual([
    'wta-1045-2026-app-alexandra-eala',
    'wta-1045-2026-app-jessica-pegula',
  ]);
  for (const a of apps) {
    expect(a.parentFixtureId).toBe('wta-1045-2026');
    expect(a.startUtc).toBe(parent.startUtc);
    expect(a.durationHours).toBe(168);
    expect(a.timePrecision).toBe('date_only');
    expect(a.confidence).toBe('provisional');
    expect(a.followKeys[0]).toBe('tennis-wta-appearances');
  }
});

test('order of play confirms the SAME ids in place — the appearanceLifecycle mechanism, fed by real data', () => {
  const parent = tournamentToFixture(dc, AT)!;
  const provisional = buildTournamentAppearances(parent, matches, null, AT);
  const confirmedDrafts = buildTournamentAppearances(
    parent,
    matches,
    oopSample,
    AT,
  );
  const confirmed = confirmedDrafts.map((d) => d.fixture);
  const eala = confirmed.find((a) => a.id === 'wta-1045-2026-app-alexandra-eala')!;
  expect(provisional.map((d) => d.fixture.id).sort()).toEqual(
    confirmed.map((a) => a.id).sort(),
  );
  // The draft's ref carries her id — resolution links CERTAIN, and a
  // player outside the top-200 roster still becomes an id-backed
  // athlete rather than a name guess.
  const ealaDraft = confirmedDrafts.find(
    (d) => d.fixture.id === 'wta-1045-2026-app-alexandra-eala',
  )!;
  expect(ealaDraft.refs).toEqual([
    { name: 'Alexandra Eala', source: 'wta', externalId: '330332' },
  ]);
  expect(eala.startUtc).toBe('2026-08-02T17:30:00.000Z');
  expect(eala.durationHours).toBe(3);
  expect(eala.timePrecision).toBe('exact');
  expect(eala.confidence).toBe('confirmed');
  expect(eala.title).toBe('Alexandra Eala vs Jessica Pegula — Mubadala DC Open');
  expect(eala.athletes).toEqual(['Alexandra Eala']);
  // Keys are resolution's job now: the draft carries only its slice key.
  expect(eala.followKeys).toEqual(['tennis-wta-appearances']);
});

test('a day-only slot is a confirmed date_only appearance for that day — all day, not only at midnight', () => {
  const parent = tournamentToFixture(dc, AT)!;
  // REGRESSION: the first cut compared the day sentinel against the poll
  // instant, so any poll after 00:00Z demoted a today-scheduled match
  // back to a week-long provisional banner. Midnight and midday must
  // agree.
  for (const nowIso of [
    '2026-07-25T00:00:00.000Z',
    '2026-07-25T12:00:00.000Z',
  ]) {
    const apps = buildTournamentAppearances(
      parent,
      matches,
      oopSample,
      nowIso,
    ).map((d) => d.fixture);
    const ngounoue = apps.find(
      (a) => a.id === 'wta-1045-2026-app-clervie-ngounoue',
    )!;
    expect(ngounoue.startUtc).toBe('2026-07-25T00:00:00.000Z');
    expect(ngounoue.timePrecision).toBe('date_only');
    expect(ngounoue.confidence).toBe('confirmed');
    expect(ngounoue.durationHours).toBe(24);
    expect(ngounoue.title).toBe(
      'Clervie Ngounoue vs Varvara Lepchenko — Mubadala DC Open',
    );
  }
});

test('REGRESSION: a confirmed slot never demotes to provisional mid-match', () => {
  const parent = tournamentToFixture(dc, AT)!;
  // 18:30Z: the final (17:30Z + 3h) is in progress and the draw still
  // says Winner "0". The follower's calendar must keep the match slot,
  // not regress to the week-long parent banner with the opponent
  // dropped.
  const apps = buildTournamentAppearances(
    parent,
    matches,
    oopSample,
    '2026-08-02T18:30:00.000Z',
  ).map((d) => d.fixture);
  const eala = apps.find((a) => a.id === 'wta-1045-2026-app-alexandra-eala')!;
  expect(eala.confidence).toBe('confirmed');
  expect(eala.startUtc).toBe('2026-08-02T17:30:00.000Z');
  expect(eala.title).toBe('Alexandra Eala vs Jessica Pegula — Mubadala DC Open');
});

test('an eliminated player with only past slots stops being emitted — retirement never sees a past doc', () => {
  const parent = tournamentToFixture(dc, AT)!;
  // At tournament end (+1d) nobody is still in a live match in this
  // capture except the final's players, whose slot is now past.
  const apps = buildTournamentAppearances(
    parent,
    matches.filter((m) => m.MatchID !== 'LS001'),
    oopSample,
    '2026-08-03T12:00:00.000Z',
  );
  expect(apps).toEqual([]);
});

test('isActive: live and imminent tournaments qualify; long-past and far-future do not', () => {
  expect(isActive(tournaments[0], AT)).toBe(true); // DC, status live
  expect(isActive(tournaments[1], AT)).toBe(true); // Toronto, inProgress
  const usOpen = tournaments.find((t) => t.tournamentGroup?.id === 905)!;
  expect(isActive(usOpen, AT)).toBe(false); // starts Aug 31
  expect(isActive(usOpen, '2026-08-29T00:00:00.000Z')).toBe(true); // 3-day lookahead
});

// ── Competition-scoped final slot (Prompt 11) ─────────────────────────

test('the final slot confirms from the banked OOP: one doc, scoped key only', () => {
  const parent = tournamentToFixture(dc, AT)!;
  const slot = buildFinalSlot(parent, matches, oopSample, AT)!;
  expect(slot).toEqual({
    id: 'wta-1045-2026-slot-final',
    sport: 'tennis',
    competition: 'WTA Tour',
    competitionId: 'tennis-wta-appearances',
    title: 'Jessica Pegula vs Alexandra Eala — Mubadala DC Open Final',
    // The appearance slice plus the SCOPED tournament key — never the
    // bare tennis-t-dc-open, which the block follower queries.
    followKeys: ['tennis-wta-appearances', 'tennis-t-dc-open-finals'],
    startUtc: '2026-08-02T17:30:00.000Z', // 13:30-0400, the banked final
    status: 'scheduled',
    parentFixtureId: 'wta-1045-2026',
    athletes: ['Jessica Pegula', 'Alexandra Eala'],
    durationHours: 3,
    timePrecision: 'exact',
    confidence: 'confirmed',
    updatedAt: AT,
  });
});

test('REGRESSION: an open earlier-round slot never confirms the final — opponent-checked', () => {
  // At 07-30 21:00 Pegula has an OPEN slot in an earlier round (the
  // pickLiveSlot regression above pins it) — soonest-open without the
  // opponent filter would confirm the FINAL at that earlier match's
  // time. The slot must come from the Pegula-vs-Eala match only.
  const parent = tournamentToFixture(dc, AT)!;
  const slot = buildFinalSlot(parent, matches, oopSample, '2026-07-30T21:00:00.000Z')!;
  expect(slot.timePrecision).toBe('exact');
  expect(slot.startUtc).toBe('2026-08-02T17:30:00.000Z');
});

test('draw only (no OOP): provisional on the parent window LAST day, not a fortnight banner', () => {
  const parent = tournamentToFixture(dc, AT)!;
  const slot = buildFinalSlot(parent, matches, null, AT)!;
  expect(slot.timePrecision).toBe('date_only');
  expect(slot.confidence).toBe('provisional');
  expect(slot.startUtc).toBe('2026-08-02T00:00:00.000Z'); // 07-27 + 6d, the 7-day window's last day
  expect(slot.durationHours).toBe(24);
  expect(slot.athletes).toEqual(['Jessica Pegula', 'Alexandra Eala']);
});

test('no final row yet: provisional slot with the tournament title alone', () => {
  const parent = tournamentToFixture(dc, AT)!;
  const slot = buildFinalSlot(
    parent,
    matches.filter((m) => m.RoundID !== 'F'),
    oopSample,
    AT,
  )!;
  expect(slot.title).toBe('Mubadala DC Open — Final');
  expect(slot.confidence).toBe('provisional');
  expect(slot.athletes).toBeUndefined();
});

test('a DECIDED final keeps its confirmed shape while the slot is live-or-graced — retirement must keep seeing it', () => {
  // The review round's HIGH: returning null at Winner-flip left the
  // finalists' graced rolling appearances as retirement evidence, and
  // the absent slot was soft-cancelled — deleting the final from
  // finals-scoped calendars on the night of the final. The slot must
  // stay in the fresh yield exactly as long as the freeze has not yet
  // taken over.
  const parent = tournamentToFixture(dc, AT)!;
  const decided = matches.map((m) =>
    m.RoundID === 'F' ? { ...m, Winner: '2' } : m,
  );
  const slot = buildFinalSlot(parent, decided, oopSample, AT)!;
  expect(slot.timePrecision).toBe('exact');
  expect(slot.confidence).toBe('confirmed');
  expect(slot.startUtc).toBe('2026-08-02T17:30:00.000Z');
});

test('a DECIDED final past its grace emits nothing — the stored doc is frozen by then', () => {
  // Final ended 20:30Z on 08-02; slot grace runs to 02:30Z. By 12:00
  // the freeze owns the stored doc, so absence can no longer retire it.
  const parent = tournamentToFixture(dc, AT)!;
  const decided = matches.map((m) =>
    m.RoundID === 'F' ? { ...m, Winner: '2' } : m,
  );
  expect(
    buildFinalSlot(parent, decided, oopSample, '2026-08-03T12:00:00.000Z'),
  ).toBeNull();
});

test('a DECIDED final never falls back to the provisional banner', () => {
  const parent = tournamentToFixture(dc, AT)!;
  const decided = matches.map((m) =>
    m.RoundID === 'F' ? { ...m, Winner: '2' } : m,
  );
  expect(buildFinalSlot(parent, decided, null, AT)).toBeNull();
});

test('a parent with no tournament key mints no slot', () => {
  const parent = tournamentToFixture(dc, AT)!;
  const keyless = { ...parent, followKeys: ['tennis-wta'] };
  expect(buildFinalSlot(keyless, matches, oopSample, AT)).toBeNull();
});
