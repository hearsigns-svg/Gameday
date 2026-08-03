// The catalogue — what stays fresh with ZERO followers. PURE logic;
// the collection is the ops surface.
//
// Until Prompt 7 nothing was polled unless a registered device already
// followed it: a sport nobody follows was never fetched, a league froze
// the moment its last follower left, and browse could offer a
// competition the store had no data for. The catalogue closes that —
// the original defect the whole coverage remediation was working
// toward.
//
// TIERING, and why not everything is warm:
//   Tier 1 — every sweep (6h). Competitions whose schedules move
//     inside a day and whose absence from browse would be immediately
//     felt: the big-five soccer leagues + UCL, NBA, NFL, NHL, MLB, F1,
//     UFC, both boxing routes, both tennis tours, athletics (one path
//     serves every group), IPL. Postponements and slot confirmations in
//     these are same-day facts.
//   Tier 2 — the DAILY sweep (the one starting in the 00:00–06:00 UTC
//     window). Everything else browse offers: lower-division and
//     out-of-season competitions where a daily poll keeps browse
//     honest and season rollovers get caught within a day. Warming
//     these at 6h would quadruple provider load for schedules that
//     change weekly.
//   Never warmed — TEAM-level paths. Teams are the unbounded set
//     (~600 soccer teams alone); they are follower-driven by design,
//     and the catalogue must stay a bounded enumeration or the sweep
//     cap stops meaning anything.
//
// The collection is seeded from CATALOGUE_SEED (scripts/seed-catalogue
// .mjs) and ops-editable afterwards: `enabled: false` cools a path
// without a deploy. Entries are re-validated against the same route
// allowlist as device paths — a catalogue typo must be dropped, never
// fetched.

export interface CatalogueEntry {
  competitionId: string; // the ingest slice this keeps warm
  label: string;
  pollPath: string;
  tier: 1 | 2;
  enabled: boolean;
  // Client sport key (sportsConfig) — lets the ordering layer roll
  // priorities up into per-sport weights. Optional in the type because
  // pre-Prompt-11 live docs lack it; always set by the seed.
  sport?: string;
  // BROWSE/SEARCH ordering weight, 0–100, higher first (Prompt 11).
  // Deliberately a SEPARATE field from tier: tier is how often a
  // schedule MOVES (the World Cup off-season warms daily), priority is
  // how likely a human is to want it (the World Cup outranks nearly
  // everything). Ops-tunable in the collection without a deploy.
  priority?: number;
  // Ranking-only rows (tennis slams, athletics groups): browse keys the
  // sweep never polls individually — their tour/calendar slice is what
  // warms. Carried here so ONE collection owns ordering, never polled.
  rankOnly?: boolean;
}

// The daily (tier 2) window: the first sweep of the UTC day.
export function tierPollsThisSweep(tier: 1 | 2, sweepUtcHour: number): boolean {
  return tier === 1 || sweepUtcHour < 6;
}

const T1 = (competitionId: string, label: string, sport: string, pollPath: string, priority?: number): CatalogueEntry =>
  ({ competitionId, label, pollPath, tier: 1, enabled: true, sport, ...(priority !== undefined ? { priority } : {}) });
const T2 = (competitionId: string, label: string, sport: string, pollPath: string, priority?: number): CatalogueEntry =>
  ({ competitionId, label, pollPath, tier: 2, enabled: true, sport, ...(priority !== undefined ? { priority } : {}) });
// Ranking-only rows: ordering weight for keys the sweep never polls
// (their tour/calendar slice is what warms). One collection owns ordering.
const RANK = (competitionId: string, label: string, sport: string, priority: number): CatalogueEntry =>
  ({ competitionId, label, pollPath: '', tier: 2, enabled: false, sport, priority, rankOnly: true });

// PRIORITY DATA (Prompt 11) — a judgement call by design, made
// reviewable by being data: global audience and cultural weight, not
// provider ids and not the alphabet. Distinct within a sport so
// ordering is deterministic; cross-sport ties are harmless. Absence
// means "sort last, keep source order" — deliberate for the athletics
// catch-all. A dormant competition (World Cup, Euros) keeps its weight;
// browse hides it while its season is dead, so the weight only ever
// acts when the competition is real again.
export const CATALOGUE_SEED: CatalogueEntry[] = [
  // ── Tier 1 ──────────────────────────────────────────────────────────
  T1('fdorg-comp-PL', 'Premier League', 'soccer', 'pollFdCompetition?code=PL&season=2026', 90),
  T1('fdorg-comp-BL1', 'Bundesliga', 'soccer', 'pollFdCompetition?code=BL1&season=2026', 74),
  T1('fdorg-comp-SA', 'Serie A', 'soccer', 'pollFdCompetition?code=SA&season=2026', 72),
  T1('fdorg-comp-PD', 'La Liga', 'soccer', 'pollFdCompetition?code=PD&season=2026', 78),
  T1('fdorg-comp-FL1', 'Ligue 1', 'soccer', 'pollFdCompetition?code=FL1&season=2026', 54),
  T1('fdorg-comp-CL', 'Champions League', 'soccer', 'pollFdCompetition?code=CL&season=2026', 92),
  T1('tsdb-league-4387', 'NBA', 'basketball', 'pollTsdbLeague?leagueId=4387&season=2025-2026&sport=basketball&durationHours=2.5', 82),
  T1('tsdb-league-4391', 'NFL', 'nfl', 'pollTsdbLeague?leagueId=4391&season=2026&sport=nfl&durationHours=3', 86),
  T1('tsdb-league-4920', 'NHL', 'ice-hockey', 'pollTsdbLeague?leagueId=4920&season=2026-2027&sport=ice-hockey&durationHours=2.5', 68),
  T1('tsdb-league-4591', 'MLB', 'baseball', 'pollTsdbLeague?leagueId=4591&season=2026&sport=baseball&durationHours=3', 70),
  T1('f1-series-1', 'Formula 1', 'f1', 'pollF1?season=2026', 85),
  T1('tsdb-league-4443', 'UFC', 'ufc', 'pollTsdbLeague?leagueId=4443&season=2026&sport=ufc&durationHours=4', 76),
  T1('tsdb-league-4445', 'Boxing cards', 'boxing', 'pollTsdbLeague?leagueId=4445&season=2026&sport=boxing&durationHours=3', 64),
  T1('pbc-cards', 'Premier Boxing Champions', 'boxing', 'pollPbc', 60),
  // tennis-atp STAYS tier 1 even though the ICS is fetched once daily
  // by owner ruling (F41): the CONNECTOR enforces the cadence (a
  // pollTennis invocation within 22h of the last success skips without
  // fetching), so tier 1 costs three cheap skip records a day and buys
  // same-day retries when the single real fetch fails — tier 2's one
  // 00:20 attempt would turn any transient failure into 48h of data
  // age (review round).
  T1('tennis-atp', 'ATP Tour', 'tennis', 'pollTennis', 66),
  T1('tennis-wta', 'WTA Tour', 'tennis', 'pollWtaTennis', 66),
  // wa-calendar carries NO priority: it is the "Everything on the
  // calendar" catch-all (1,372 future meetings) and must sort LAST
  // within athletics, after every curated group below.
  T1('wa-calendar', 'World Athletics', 'athletics', 'pollAthletics'),
  T1('tsdb-league-4460', 'Indian Premier League', 'cricket', 'pollTsdbLeague?leagueId=4460&season=2026&sport=cricket&durationHours=4', 52),
  // ── Tier 2 ──────────────────────────────────────────────────────────
  T2('fdorg-comp-ELC', 'Championship', 'soccer', 'pollFdCompetition?code=ELC&season=2026', 46),
  T2('fdorg-comp-DED', 'Eredivisie', 'soccer', 'pollFdCompetition?code=DED&season=2026', 38),
  T2('fdorg-comp-PPL', 'Primeira Liga', 'soccer', 'pollFdCompetition?code=PPL&season=2026', 34),
  T2('fdorg-comp-BSA', 'Brasileirão', 'soccer', 'pollFdCompetition?code=BSA&season=2026', 43),
  T2('fdorg-comp-EC', 'Euros', 'soccer', 'pollFdCompetition?code=EC&season=2026', 88),
  T2('fdorg-comp-WC', 'World Cup', 'soccer', 'pollFdCompetition?code=WC&season=2026', 100),
  // Season hints mirror the browse directory's EXACT strings (they are
  // hints — the server resolves — but the strings must match or the
  // union stops deduplicating against device-registered paths).
  T2('tsdb-league-4482', 'FA Cup', 'soccer', 'pollTsdbLeague?leagueId=4482&season=2025-2026&sport=soccer&durationHours=2', 42),
  T2('tsdb-league-4570', 'EFL Cup', 'soccer', 'pollTsdbLeague?leagueId=4570&season=2026-2027&sport=soccer&durationHours=2', 36),
  T2('tsdb-league-4481', 'Europa League', 'soccer', 'pollTsdbLeague?leagueId=4481&season=2026-2027&sport=soccer&durationHours=2', 44),
  T2('tsdb-league-4931', 'Liiga', 'ice-hockey', 'pollTsdbLeague?leagueId=4931&season=2026-2027&sport=ice-hockey&durationHours=2.5', 25),
  T2('tsdb-league-4419', 'SHL', 'ice-hockey', 'pollTsdbLeague?leagueId=4419&season=2026-2027&sport=ice-hockey&durationHours=2.5', 26),
  T2('tsdb-league-4801', 'ODI Internationals', 'cricket', 'pollTsdbLeague?leagueId=4801&season=2026&sport=cricket&durationHours=8', 39),
  T2('tsdb-league-4979', 'T20 Internationals', 'cricket', 'pollTsdbLeague?leagueId=4979&season=2026&sport=cricket&durationHours=4', 41),
  T2('tsdb-league-5103', 'T20 World Cup', 'cricket', 'pollTsdbLeague?leagueId=5103&season=2026&sport=cricket&durationHours=4', 55),
  T2('tsdb-league-4458', 'County Championship', 'cricket', 'pollTsdbLeague?leagueId=4458&season=2026&sport=cricket&durationHours=96', 24),
  T2('tsdb-league-4516', 'WNBA', 'basketball', 'pollTsdbLeague?leagueId=4516&season=2026&sport=basketball&durationHours=2.5', 36),
  T2('tsdb-league-4549', 'FIBA WC qualifiers', 'basketball', 'pollTsdbLeague?leagueId=4549&season=2027&sport=basketball&durationHours=2', 28),
  T2('tsdb-league-4830', 'KBO League', 'baseball', 'pollTsdbLeague?leagueId=4830&season=2026&sport=baseball&durationHours=3', 27),
  T2('tsdb-league-4714', 'Six Nations', 'rugby', 'pollTsdbLeague?leagueId=4714&season=2027&sport=rugby&durationHours=2', 40),
  T2('tsdb-league-4414', 'Premiership Rugby', 'rugby', 'pollTsdbLeague?leagueId=4414&season=2025-2026&sport=rugby&durationHours=2', 32),
  T2('tsdb-league-4550', 'Champions Cup', 'rugby', 'pollTsdbLeague?leagueId=4550&season=2025-2026&sport=rugby&durationHours=2', 33),
  T2('tsdb-league-4430', 'Top 14', 'rugby', 'pollTsdbLeague?leagueId=4430&season=2025-2026&sport=rugby&durationHours=2', 30),
  T2('tsdb-league-4415', 'Super League', 'rugby', 'pollTsdbLeague?leagueId=4415&season=2026&sport=rugby&durationHours=2', 27),
  T2('tsdb-league-4416', 'NRL', 'rugby', 'pollTsdbLeague?leagueId=4416&season=2026&sport=rugby&durationHours=2', 29),
  T2('tsdb-league-5852', 'Nations Championship', 'rugby', 'pollTsdbLeague?leagueId=5852&season=2026&sport=rugby&durationHours=2', 31),
  T2('tsdb-league-5806', 'RL World Cup', 'rugby', 'pollTsdbLeague?leagueId=5806&season=2026&sport=rugby&durationHours=2', 37),
  T2('tsdb-league-5479', 'Rugby Championship', 'rugby', 'pollTsdbLeague?leagueId=5479&season=2026&sport=rugby&durationHours=2', 35),
  T2('tsdb-league-4425', 'PGA Tour', 'golf', 'pollTsdbLeague?leagueId=4425&season=2026&sport=golf&durationHours=5', 62),
  T2('tsdb-league-4426', 'DP World Tour', 'golf', 'pollTsdbLeague?leagueId=4426&season=2026&sport=golf&durationHours=5', 46),
  T2('tsdb-league-4553', 'LPGA Tour', 'golf', 'pollTsdbLeague?leagueId=4553&season=2026&sport=golf&durationHours=5', 48),
  T2('tsdb-league-5329', 'LIV Golf', 'golf', 'pollTsdbLeague?leagueId=5329&season=2026&sport=golf&durationHours=5', 44),
  T2('tsdb-league-4495', 'ONE Championship', 'ufc', 'pollTsdbLeague?leagueId=4495&season=2026&sport=ufc&durationHours=4', 34),
  T2('tsdb-league-5430', 'PFL', 'ufc', 'pollTsdbLeague?leagueId=5430&season=2026&sport=ufc&durationHours=4', 30),
  T2('tsdb-league-4567', 'Bare Knuckle FC', 'ufc', 'pollTsdbLeague?leagueId=4567&season=2026&sport=ufc&durationHours=4', 22),
  T2('tsdb-league-4407', 'MotoGP', 'motorsport', 'pollTsdbLeague?leagueId=4407&season=2026&sport=motorsport&durationHours=2', 50),
  T2('tsdb-league-4393', 'NASCAR Cup Series', 'motorsport', 'pollTsdbLeague?leagueId=4393&season=2026&sport=motorsport&durationHours=4', 42),
  T2('tsdb-league-4373', 'IndyCar', 'motorsport', 'pollTsdbLeague?leagueId=4373&season=2026&sport=motorsport&durationHours=3', 37),
  T2('tsdb-league-4486', 'Formula 2', 'motorsport', 'pollTsdbLeague?leagueId=4486&season=2026&sport=motorsport&durationHours=1.5', 28),
  T2('tsdb-league-4413', 'WEC', 'motorsport', 'pollTsdbLeague?leagueId=4413&season=2026&sport=motorsport&durationHours=6', 38),
  // ── Ranking-only (Prompt 11) ────────────────────────────────────────
  // The four slams above their tours; keys must match what
  // tennisTournaments.tournamentKey mints from the live feed titles.
  RANK('tennis-t-wimbledon', 'Wimbledon', 'tennis', 98),
  RANK('tennis-t-us-open', 'US Open', 'tennis', 96),
  RANK('tennis-t-roland-garros', 'Roland Garros', 'tennis', 95),
  RANK('tennis-t-australian-open', 'Australian Open', 'tennis', 94),
  // Athletics browse groups (keys mirror sportsConfig staticCompetitions;
  // the catch-all wa-calendar is a real poll entry above, unpriced so it
  // sorts last).
  RANK('wa-wanda-diamond-league-meeting', 'Diamond League', 'athletics', 58),
  RANK('wa-world-athletics-championships-world-athletics-series', 'World Athletics Championships', 'athletics', 57),
  RANK('wa-world-athletics-continental-tour-gold', 'Continental Tour Gold', 'athletics', 45),
  RANK('wa-world-athletics-indoor-tour-gold', 'Indoor Tour Gold', 'athletics', 35),
  RANK('wa-world-athletics-cross-country-tour-gold', 'Cross Country Tour Gold', 'athletics', 33),
  RANK('wa-national-senior-outdoor-championships', 'National Championships', 'athletics', 31),
];

// Per-sport ordering weight: the sport's best competition speaks for
// the sport ("the top sports should lead the list"). Derived, not a
// second knob — tuning a competition's priority is what moves its
// sport. rankOnly rows count (Wimbledon speaks for tennis).
export function sportWeightsOf(
  entries: readonly CatalogueEntry[],
): Record<string, number> {
  const weights: Record<string, number> = {};
  for (const e of entries) {
    if (!e.sport || typeof e.priority !== 'number') continue;
    weights[e.sport] = Math.max(weights[e.sport] ?? 0, e.priority);
  }
  return weights;
}

// Union device and catalogue paths under the cap, DEVICE FIRST — a real
// follower's slice must never be starved by a warming entry (the
// owner's rule, and the fix for F10's arbitrary drop order: what
// survives the ceiling is now decided by priority — device, then
// tier 1, then tier 2 — never by uid lexicography ALONE; within each
// band the incoming order is kept, which for devices is the same
// uid-scan order as before, now explicitly the lowest-priority sort
// key rather than the whole rule).
export interface OrderedSweepPaths {
  paths: string[];
  originOf: Map<string, 'device' | 'catalogue'>;
  skippedByCap: string[];
}

export function orderSweepPaths(
  devicePaths: readonly string[],
  cataloguePaths: readonly string[],
  cap: number,
): OrderedSweepPaths {
  const originOf = new Map<string, 'device' | 'catalogue'>();
  const ordered: string[] = [];
  for (const p of devicePaths) {
    if (originOf.has(p)) continue;
    originOf.set(p, 'device');
    ordered.push(p);
  }
  for (const p of cataloguePaths) {
    if (originOf.has(p)) continue; // a followed slice is already a device path
    originOf.set(p, 'catalogue');
    ordered.push(p);
  }
  return {
    paths: ordered.slice(0, cap),
    originOf,
    skippedByCap: ordered.slice(cap),
  };
}
