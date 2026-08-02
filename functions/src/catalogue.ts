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
}

// The daily (tier 2) window: the first sweep of the UTC day.
export function tierPollsThisSweep(tier: 1 | 2, sweepUtcHour: number): boolean {
  return tier === 1 || sweepUtcHour < 6;
}

const T1 = (competitionId: string, label: string, pollPath: string): CatalogueEntry =>
  ({ competitionId, label, pollPath, tier: 1, enabled: true });
const T2 = (competitionId: string, label: string, pollPath: string): CatalogueEntry =>
  ({ competitionId, label, pollPath, tier: 2, enabled: true });

export const CATALOGUE_SEED: CatalogueEntry[] = [
  // ── Tier 1 ──────────────────────────────────────────────────────────
  T1('fdorg-comp-PL', 'Premier League', 'pollFdCompetition?code=PL&season=2026'),
  T1('fdorg-comp-BL1', 'Bundesliga', 'pollFdCompetition?code=BL1&season=2026'),
  T1('fdorg-comp-SA', 'Serie A', 'pollFdCompetition?code=SA&season=2026'),
  T1('fdorg-comp-PD', 'La Liga', 'pollFdCompetition?code=PD&season=2026'),
  T1('fdorg-comp-FL1', 'Ligue 1', 'pollFdCompetition?code=FL1&season=2026'),
  T1('fdorg-comp-CL', 'Champions League', 'pollFdCompetition?code=CL&season=2026'),
  T1('tsdb-league-4387', 'NBA', 'pollTsdbLeague?leagueId=4387&season=2025-2026&sport=basketball&durationHours=2.5'),
  T1('tsdb-league-4391', 'NFL', 'pollTsdbLeague?leagueId=4391&season=2026&sport=nfl&durationHours=3'),
  T1('tsdb-league-4920', 'NHL', 'pollTsdbLeague?leagueId=4920&season=2026-2027&sport=ice-hockey&durationHours=2.5'),
  T1('tsdb-league-4591', 'MLB', 'pollTsdbLeague?leagueId=4591&season=2026&sport=baseball&durationHours=3'),
  T1('f1-series-1', 'Formula 1', 'pollF1?season=2026'),
  T1('tsdb-league-4443', 'UFC', 'pollTsdbLeague?leagueId=4443&season=2026&sport=ufc&durationHours=4'),
  T1('tsdb-league-4445', 'Boxing cards', 'pollTsdbLeague?leagueId=4445&season=2026&sport=boxing&durationHours=3'),
  T1('pbc-cards', 'Premier Boxing Champions', 'pollPbc'),
  T1('tennis-atp', 'ATP Tour', 'pollTennis'),
  T1('tennis-wta', 'WTA Tour', 'pollWtaTennis'),
  T1('wa-calendar', 'World Athletics', 'pollAthletics'),
  T1('tsdb-league-4460', 'Indian Premier League', 'pollTsdbLeague?leagueId=4460&season=2026&sport=cricket&durationHours=4'),
  // ── Tier 2 ──────────────────────────────────────────────────────────
  T2('fdorg-comp-ELC', 'Championship', 'pollFdCompetition?code=ELC&season=2026'),
  T2('fdorg-comp-DED', 'Eredivisie', 'pollFdCompetition?code=DED&season=2026'),
  T2('fdorg-comp-PPL', 'Primeira Liga', 'pollFdCompetition?code=PPL&season=2026'),
  T2('fdorg-comp-BSA', 'Brasileirão', 'pollFdCompetition?code=BSA&season=2026'),
  T2('fdorg-comp-EC', 'Euros', 'pollFdCompetition?code=EC&season=2026'),
  T2('fdorg-comp-WC', 'World Cup', 'pollFdCompetition?code=WC&season=2026'),
  // Season hints mirror the browse directory's EXACT strings (they are
  // hints — the server resolves — but the strings must match or the
  // union stops deduplicating against device-registered paths).
  T2('tsdb-league-4482', 'FA Cup', 'pollTsdbLeague?leagueId=4482&season=2025-2026&sport=soccer&durationHours=2'),
  T2('tsdb-league-4570', 'EFL Cup', 'pollTsdbLeague?leagueId=4570&season=2026-2027&sport=soccer&durationHours=2'),
  T2('tsdb-league-4481', 'Europa League', 'pollTsdbLeague?leagueId=4481&season=2026-2027&sport=soccer&durationHours=2'),
  T2('tsdb-league-4931', 'Liiga', 'pollTsdbLeague?leagueId=4931&season=2026-2027&sport=ice-hockey&durationHours=2.5'),
  T2('tsdb-league-4419', 'SHL', 'pollTsdbLeague?leagueId=4419&season=2026-2027&sport=ice-hockey&durationHours=2.5'),
  T2('tsdb-league-4801', 'ODI Internationals', 'pollTsdbLeague?leagueId=4801&season=2026&sport=cricket&durationHours=8'),
  T2('tsdb-league-4979', 'T20 Internationals', 'pollTsdbLeague?leagueId=4979&season=2026&sport=cricket&durationHours=4'),
  T2('tsdb-league-5103', 'T20 World Cup', 'pollTsdbLeague?leagueId=5103&season=2026&sport=cricket&durationHours=4'),
  T2('tsdb-league-4458', 'County Championship', 'pollTsdbLeague?leagueId=4458&season=2026&sport=cricket&durationHours=96'),
  T2('tsdb-league-4516', 'WNBA', 'pollTsdbLeague?leagueId=4516&season=2026&sport=basketball&durationHours=2.5'),
  T2('tsdb-league-4549', 'FIBA WC qualifiers', 'pollTsdbLeague?leagueId=4549&season=2027&sport=basketball&durationHours=2'),
  T2('tsdb-league-4830', 'KBO League', 'pollTsdbLeague?leagueId=4830&season=2026&sport=baseball&durationHours=3'),
  T2('tsdb-league-4714', 'Six Nations', 'pollTsdbLeague?leagueId=4714&season=2027&sport=rugby&durationHours=2'),
  T2('tsdb-league-4414', 'Premiership Rugby', 'pollTsdbLeague?leagueId=4414&season=2025-2026&sport=rugby&durationHours=2'),
  T2('tsdb-league-4550', 'Champions Cup', 'pollTsdbLeague?leagueId=4550&season=2025-2026&sport=rugby&durationHours=2'),
  T2('tsdb-league-4430', 'Top 14', 'pollTsdbLeague?leagueId=4430&season=2025-2026&sport=rugby&durationHours=2'),
  T2('tsdb-league-4415', 'Super League', 'pollTsdbLeague?leagueId=4415&season=2026&sport=rugby&durationHours=2'),
  T2('tsdb-league-4416', 'NRL', 'pollTsdbLeague?leagueId=4416&season=2026&sport=rugby&durationHours=2'),
  T2('tsdb-league-5852', 'Nations Championship', 'pollTsdbLeague?leagueId=5852&season=2026&sport=rugby&durationHours=2'),
  T2('tsdb-league-5806', 'RL World Cup', 'pollTsdbLeague?leagueId=5806&season=2026&sport=rugby&durationHours=2'),
  T2('tsdb-league-5479', 'Rugby Championship', 'pollTsdbLeague?leagueId=5479&season=2026&sport=rugby&durationHours=2'),
  T2('tsdb-league-4425', 'PGA Tour', 'pollTsdbLeague?leagueId=4425&season=2026&sport=golf&durationHours=5'),
  T2('tsdb-league-4426', 'DP World Tour', 'pollTsdbLeague?leagueId=4426&season=2026&sport=golf&durationHours=5'),
  T2('tsdb-league-4553', 'LPGA Tour', 'pollTsdbLeague?leagueId=4553&season=2026&sport=golf&durationHours=5'),
  T2('tsdb-league-5329', 'LIV Golf', 'pollTsdbLeague?leagueId=5329&season=2026&sport=golf&durationHours=5'),
  T2('tsdb-league-4495', 'ONE Championship', 'pollTsdbLeague?leagueId=4495&season=2026&sport=ufc&durationHours=4'),
  T2('tsdb-league-5430', 'PFL', 'pollTsdbLeague?leagueId=5430&season=2026&sport=ufc&durationHours=4'),
  T2('tsdb-league-4567', 'Bare Knuckle FC', 'pollTsdbLeague?leagueId=4567&season=2026&sport=ufc&durationHours=4'),
  T2('tsdb-league-4407', 'MotoGP', 'pollTsdbLeague?leagueId=4407&season=2026&sport=motorsport&durationHours=2'),
  T2('tsdb-league-4393', 'NASCAR Cup Series', 'pollTsdbLeague?leagueId=4393&season=2026&sport=motorsport&durationHours=4'),
  T2('tsdb-league-4373', 'IndyCar', 'pollTsdbLeague?leagueId=4373&season=2026&sport=motorsport&durationHours=3'),
  T2('tsdb-league-4486', 'Formula 2', 'pollTsdbLeague?leagueId=4486&season=2026&sport=motorsport&durationHours=1.5'),
  T2('tsdb-league-4413', 'WEC', 'pollTsdbLeague?leagueId=4413&season=2026&sport=motorsport&durationHours=6'),
];

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
