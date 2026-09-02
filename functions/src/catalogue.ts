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
  // Why a row ships disabled (Round 4 item 5). 'born_dead' = the
  // provider has published no season yet; the seeder probes such rows
  // on every run and re-enables the moment fixtures exist, so a
  // disabled row is a held row, not a forgotten one.
  disabledReason?: 'born_dead';
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
  // REGIONAL ORDERING OVERLAY (Prompt 15). Region key → priority,
  // applied over `priority` when a request names a region. SPARSE BY
  // DESIGN: a region lists only what it reorders, and everything absent
  // keeps the default weight — so a region is never a second complete
  // ranking to maintain, and a new competition is correctly ordered
  // everywhere the day it is added without touching this at all.
  //
  // Ops-editable in the console exactly like `priority`, which is what
  // makes regional curation a data exercise rather than a release.
  priorityByRegion?: Record<string, number>;
  // TAKEDOWN SWITCH (Prompt 13). `imagery: false` suppresses crests and
  // logos for this competition WITHOUT A DEPLOY — the same ops shape as
  // `enabled`, which already cools a poller from the console. Absent or
  // true means artwork flows. This is the response that makes
  // "trademark risk accepted" a defensible position rather than a hope:
  // a rights holder complains, an operator flips one field, the artwork
  // is gone on the next serve. Olympic marks are NOT governed by this —
  // they are excluded in code (src/imagery.ts).
  imagery?: boolean;
  // Ranking-only rows (tennis slams, athletics groups): browse keys the
  // sweep never polls individually — their tour/calendar slice is what
  // warms. Carried here so ONE collection owns ordering, never polled.
  rankOnly?: boolean;
  // Sport-row entries (`sport:<key>`, Prompt 11b): the SPORT's own
  // browse weight, a separate knob from any competition's priority.
  // Deriving sport order from the best competition conflated "has one
  // giant event" with "is a big sport" — Wimbledon put tennis second
  // globally (owner review).
  sportRow?: boolean;
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
// Sport rows: the sport's OWN browse weight (Prompt 11b). The `sport:`
// id prefix cannot collide with a real competition key (no served key
// carries a colon), and rankOnly keeps every route invariant exempting
// them.
const SPORT = (sport: string, label: string, priority: number): CatalogueEntry =>
  ({ competitionId: `sport:${sport}`, label, pollPath: '', tier: 2, enabled: false, sport, priority, rankOnly: true, sportRow: true });

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
  // MISLABEL CORRECTED (2026-08-28): these two rows were seeded as
  // 'NHL' and 'MLB', but TSDB 4920 is the KHL (22-team directory) and
  // 4591 is NPB (12 teams) — the client config always said so, and the
  // T1 priorities 68/70 intended for the North American majors were
  // boosting the wrong leagues' browse rank. The real NHL/MLB rows are
  // the league-route T2 entries below, which now carry those weights.
  // Seed is ADD-only, so the LIVE 4920/4591 docs still hold the wrong
  // labels/priorities — correcting them is an ops edit (owner).
  T1('tsdb-league-4920', 'KHL', 'ice-hockey', 'pollTsdbLeague?leagueId=4920&season=2026-2027&sport=ice-hockey&durationHours=2.5', 28),
  T1('tsdb-league-4591', 'NPB', 'baseball', 'pollTsdbLeague?leagueId=4591&season=2026&sport=baseball&durationHours=3', 28),
  T1('f1-series-1', 'Formula 1', 'f1', 'pollF1?season=2026', 85),
  T1('tsdb-league-4443', 'UFC', 'ufc', 'pollTsdbLeague?leagueId=4443&season=2026&sport=ufc&durationHours=4', 76),
  T1('tsdb-league-4445', 'Boxing cards', 'boxing', 'pollTsdbLeague?leagueId=4445&season=2026&sport=boxing&durationHours=3', 64),
  T1('pbc-cards', 'Premier Boxing Champions', 'boxing', 'pollPbc', 60),
  // TIER 2, and the tier is the quota. 100 requests a MONTH means one
  // schedule call a day plus a bounded number of bouts calls; tier 1
  // polls every sweep, which would spend the month in under a fortnight.
  // The route enforces the cadence itself (BOXINGDATA_MIN_INTERVAL_MS)
  // rather than trusting whoever invokes it — the same commitment shape
  // the Tennis TV ICS carries.
  T2('boxingdata-cards', 'Boxing (times and undercards)', 'boxing', 'pollBoxingData', 62),
  // tennis-atp STAYS tier 1 even though the ICS is fetched once daily
  // by owner ruling (F41): the CONNECTOR enforces the cadence (a
  // pollTennis invocation within 22h of the last success skips without
  // fetching), so tier 1 costs three cheap skip records a day and buys
  // same-day retries when the single real fetch fails — tier 2's one
  // 00:20 attempt would turn any transient failure into 48h of data
  // age (review round).
  T1('tennis-atp', 'ATP Tour', 'tennis', 'pollTennis', 66),
  T1('tennis-wta', 'WTA Tour', 'tennis', 'pollWtaTennis', 66),
  // The men's matches, from the vendor inside the function (Round 4
  // item 7; replaces `tennis-atp-sheet` / pollSheetAtp, whose Apps
  // Script half died unwatched). Tier 1 is what makes the quota model
  // work, not what strains it: the route asks OUR store for live
  // windows before spending anything, so three of the day's four
  // sweeps outside a tournament cost zero vendor requests, and during
  // one a sweep costs the events pages of the live draws (measured:
  // 30 matches a page, 1–3 pages a draw) against a 50/day key.
  T1('tennis-atp-vendor', 'ATP matches', 'tennis', 'pollAtpVendor', 65),
  // wa-calendar carries NO priority: it is the "Everything on the
  // calendar" catch-all (1,372 future meetings) and must sort LAST
  // within athletics, after every curated group below.
  T1('wa-calendar', 'World Athletics', 'athletics', 'pollAthletics'),
  // IPL: 161 straight no_future_events across seasons 2026 and 2027 —
  // TSDB has published nothing (born_dead open since 08-17). Held
  // disabled; the seeder re-enables on detection (Round 4 item 5).
  { ...T1('tsdb-league-4460', 'Indian Premier League', 'cricket', 'pollTsdbLeague?leagueId=4460&season=2026&sport=cricket&durationHours=4', 52), enabled: false, disabledReason: 'born_dead' as const },
  // ── Tier 2 ──────────────────────────────────────────────────────────
  T2('fdorg-comp-ELC', 'Championship', 'soccer', 'pollFdCompetition?code=ELC&season=2026', 46),
  T2('fdorg-comp-DED', 'Eredivisie', 'soccer', 'pollFdCompetition?code=DED&season=2026', 38),
  T2('fdorg-comp-PPL', 'Primeira Liga', 'soccer', 'pollFdCompetition?code=PPL&season=2026', 34),
  T2('fdorg-comp-BSA', 'Brasileirão', 'soccer', 'pollFdCompetition?code=BSA&season=2026', 43),
  // Born-dead 2026-08-17: seasoned 2026 — no Euros in 2026. Disabled
  // until fd.org publishes 2028; the TSDB Euros row is the standby.
  { ...T2('fdorg-comp-EC', 'Euros', 'soccer', 'pollFdCompetition?code=EC&season=2026', 88), enabled: false },
  // Born-dead 2026-08-17: created two weeks after the 2026 final, so it
  // never had a future fixture to yield. Disabled until 2030 nears;
  // dual-sourced with the TSDB World Cup row (owner ruling).
  { ...T2('fdorg-comp-WC', 'World Cup', 'soccer', 'pollFdCompetition?code=WC&season=2026', 100), enabled: false },
  // Season hints mirror the browse directory's EXACT strings (they are
  // hints — the server resolves — but the strings must match or the
  // union stops deduplicating against device-registered paths).
  T2('tsdb-league-4482', 'FA Cup', 'soccer', 'pollTsdbLeague?leagueId=4482&season=2025-2026&sport=soccer&durationHours=2', 42),
  T2('tsdb-league-4570', 'EFL Cup', 'soccer', 'pollTsdbLeague?leagueId=4570&season=2026-2027&sport=soccer&durationHours=2', 36),
  T2('tsdb-league-4481', 'Europa League', 'soccer', 'pollTsdbLeague?leagueId=4481&season=2026-2027&sport=soccer&durationHours=2', 44),
  T2('tsdb-league-4931', 'Liiga', 'ice-hockey', 'pollTsdbLeague?leagueId=4931&season=2026-2027&sport=ice-hockey&durationHours=2.5', 25),
  T2('tsdb-league-4419', 'SHL', 'ice-hockey', 'pollTsdbLeague?leagueId=4419&season=2026-2027&sport=ice-hockey&durationHours=2.5', 26),
  // League-only freshness for the NA majors (Stage 6 addendum ruling):
  // their fixtures came only from team followers' device poll paths.
  // Tier 2 (daily): league schedules move slowly, and the NHL route
  // fans out to 33 upstream calls per poll (per-club is all api-web
  // offers); MLB is one call. These rows carry the majors' intended
  // browse weights (see the mislabel note on the T1 rows above).
  T2('nhl-league-1', 'NHL', 'ice-hockey', 'pollNhlLeague?season=20262027', 68),
  T2('mlb-league-1', 'MLB', 'baseball', 'pollMlbLeague?season=2026', 70),
  T2('tsdb-league-4801', 'ODI Internationals', 'cricket', 'pollTsdbLeague?leagueId=4801&season=2026&sport=cricket&durationHours=8', 39),
  T2('tsdb-league-4979', 'T20 Internationals', 'cricket', 'pollTsdbLeague?leagueId=4979&season=2026&sport=cricket&durationHours=4', 41),
  // T20 World Cup: same shape (45 runs, no season published; alert open
  // since 08-18). Held disabled until the seeder detects fixtures.
  { ...T2('tsdb-league-5103', 'T20 World Cup', 'cricket', 'pollTsdbLeague?leagueId=5103&season=2026&sport=cricket&durationHours=4', 55), enabled: false, disabledReason: 'born_dead' as const },
  T2('tsdb-league-4458', 'County Championship', 'cricket', 'pollTsdbLeague?leagueId=4458&season=2026&sport=cricket&durationHours=96', 34),
  T2('tsdb-league-4516', 'WNBA', 'basketball', 'pollTsdbLeague?leagueId=4516&season=2026&sport=basketball&durationHours=2.5', 36),
  T2('tsdb-league-4549', 'FIBA WC qualifiers', 'basketball', 'pollTsdbLeague?leagueId=4549&season=2027&sport=basketball&durationHours=2', 28),
  T2('tsdb-league-4830', 'KBO League', 'baseball', 'pollTsdbLeague?leagueId=4830&season=2026&sport=baseball&durationHours=3', 27),
  T2('tsdb-league-4714', 'Six Nations', 'rugby', 'pollTsdbLeague?leagueId=4714&season=2027&sport=rugby&durationHours=2', 40),
  T2('tsdb-league-4414', 'Premiership Rugby', 'rugby', 'pollTsdbLeague?leagueId=4414&season=2025-2026&sport=rugby&durationHours=2', 32),
  // ── Part B additions (owner rulings, 2026-08-17) ──────────────────
  T2('tsdb-league-4546', 'EuroLeague', 'basketball', 'pollTsdbLeague?leagueId=4546&season=2026-2027&sport=basketball&durationHours=2.5', 48),
  T2('tsdb-league-4501', 'Copa Libertadores', 'soccer', 'pollTsdbLeague?leagueId=4501&season=2026&sport=soccer&durationHours=2', 47),
  // Tournament-cycle rows, seeded DISABLED — born_dead's lesson applied
  // at seeding time: a row enabled for a season that cannot yield pages
  // from birth. FLIP each (enabled:true in the console) when its
  // schedule publishes, and add its browse static + search alias in the
  // same change — a followable row nobody polls is a promise that
  // breaks silently. Probed empty on 2026-08-17.
  { ...T2('tsdb-league-4429', 'World Cup (TSDB)', 'soccer', 'pollTsdbLeague?leagueId=4429&season=2030&sport=soccer&durationHours=2', 100), enabled: false },
  { ...T2('tsdb-league-4496', 'Africa Cup of Nations', 'soccer', 'pollTsdbLeague?leagueId=4496&season=2027&sport=soccer&durationHours=2', 58), enabled: false },
  { ...T2('tsdb-league-4499', 'Copa América', 'soccer', 'pollTsdbLeague?leagueId=4499&season=2028&sport=soccer&durationHours=2', 60), enabled: false },
  { ...T2('tsdb-league-4502', 'Euros (TSDB)', 'soccer', 'pollTsdbLeague?leagueId=4502&season=2028&sport=soccer&durationHours=2', 88), enabled: false },
  { ...T2('tsdb-league-4866', 'AFC Asian Cup', 'soccer', 'pollTsdbLeague?leagueId=4866&season=2027&sport=soccer&durationHours=2', 39), enabled: false },
  { ...T2('tsdb-league-4873', 'CONCACAF Gold Cup', 'soccer', 'pollTsdbLeague?leagueId=4873&season=2027&sport=soccer&durationHours=2', 37), enabled: false },
  { ...T2('tsdb-league-4461', 'Big Bash League', 'cricket', 'pollTsdbLeague?leagueId=4461&season=2026-2027&sport=cricket&durationHours=4', 38), enabled: false },
  { ...T2('tsdb-league-4844', 'Test Match Series', 'cricket', 'pollTsdbLeague?leagueId=4844&season=2027&sport=cricket&durationHours=96', 45), enabled: false },
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
  // ── Round 3 Phase B ruling 7 — the majors additions (2026-08-29) ───
  // Curated omissions, sequenced by season proximity. Each comment
  // carries the row's measured per-poll volume (eventsseason, live
  // 2026-08-29): pollTsdbLeague ingests a whole season per run, so that
  // number IS the row's cost on every sweep that polls it.
  //
  // NCAA football is THE EXPENSIVE ROW — 1,439 events for 2026, NBA
  // scale (the NBA runs ~1,380). It shipped seeded-disabled behind the
  // volume flag; the owner weighed that number and ENABLED it
  // (2026-08-29 ruling), so the seed now creates it live directly —
  // table entry unstaged and client row landed in the same commit,
  // exactly the trio the searchRoutes pin forces.
  T2('tsdb-league-4479', 'NCAA Division 1 Football', 'nfl', 'pollTsdbLeague?leagueId=4479&season=2026&sport=nfl&durationHours=3', 44),
  // MLS: 510 events 2026 — in season (196 still future at seeding).
  T2('tsdb-league-4346', 'MLS', 'soccer', 'pollTsdbLeague?leagueId=4346&season=2026&sport=soccer&durationHours=2', 45),
  // NWSL: 240 events 2026 — in season.
  T2('tsdb-league-4521', 'NWSL', 'soccer', 'pollTsdbLeague?leagueId=4521&season=2026&sport=soccer&durationHours=2', 31),
  // WSL: 182 events 2026-2027, published in full; season starts
  // 2026-09-04.
  T2('tsdb-league-4849', 'WSL', 'soccer', 'pollTsdbLeague?leagueId=4849&season=2026-2027&sport=soccer&durationHours=2', 35),
  // URC: 144 events 2026-2027; season starts 2026-09-25. Weighted
  // beside Premiership Rugby (32) and the Champions Cup (33) — the
  // weekly league for four of the home unions' fanbases.
  T2('tsdb-league-4446', 'URC', 'rugby', 'pollTsdbLeague?leagueId=4446&season=2026-2027&sport=rugby&durationHours=2', 34),
  // IIHF World Championship: the 2026 edition is over (64 events, all
  // past), and 2027 is already published — 56 events, every one on the
  // placeholder date 2027-05-14, which the date_only/tbd machinery
  // renders honestly. Pollable from birth, so it seeds enabled.
  T2('tsdb-league-4976', 'IIHF World Championship', 'ice-hockey', 'pollTsdbLeague?leagueId=4976&season=2027&sport=ice-hockey&durationHours=2.5', 40),
  // Rugby World Cup 2027: 36 events, 1–17 Oct 2027, published in full —
  // NOT born-dead, so it seeds enabled, and dormancy demotion holds the
  // big weight back until the fixtures near (the World Cup case exactly).
  T2('tsdb-league-4574', 'Rugby World Cup', 'rugby', 'pollTsdbLeague?leagueId=4574&season=2027&sport=rugby&durationHours=2', 50),
  // Tournament-cycle rows, seeded DISABLED — the Part B lesson applied:
  // both PROBED EMPTY 2026-08-29 (eventsseason returns null), so a row
  // enabled today could never yield a page. FLIP each (enabled:true in
  // the console) when its schedule publishes, and add its browse static
  // + search alias in the same change.
  { ...T2('tsdb-league-4565', 'Women\'s World Cup', 'soccer', 'pollTsdbLeague?leagueId=4565&season=2027&sport=soccer&durationHours=2', 65), enabled: false },
  { ...T2('tsdb-league-4503', 'Club World Cup', 'soccer', 'pollTsdbLeague?leagueId=4503&season=2029&sport=soccer&durationHours=2', 61), enabled: false },
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
  RANK('wa-area-senior-outdoor-championships', 'Continental Championships', 'athletics', 44),
  RANK('wa-world-athletics-label-road-races-platinum', 'Marathon Majors', 'athletics', 56),
  RANK('wa-world-athletics-label-road-races-gold', 'Gold Label Road Races', 'athletics', 30),
  RANK('wa-world-athletics-u20-championships-world-athletics-series', 'World U20 Championships', 'athletics', 29),
  // ── Sport rows (Prompt 11b/11c): the sports-grid order, its own knob ─
  // The 11c shape (owner tune): soccer clearly first; then a cluster of
  // genuinely global sports — F1, tennis, cricket, basketball (the NBA
  // is a top-five global league and must not sink below golf); the UK
  // lean shows in rugby, boxing and athletics sitting ABOVE where a
  // US-built app would put them — not in the NBA and NFL falling into
  // the bottom half. Competition priorities above order rows only
  // WITHIN a sport.
  SPORT('soccer', 'Soccer', 100),
  SPORT('f1', 'Formula 1', 88),
  SPORT('tennis', 'Tennis', 86),
  SPORT('cricket', 'Cricket', 84),
  SPORT('basketball', 'Basketball', 82),
  SPORT('rugby', 'Rugby', 78),
  SPORT('nfl', 'American football', 76),
  SPORT('boxing', 'Boxing', 74),
  SPORT('athletics', 'Athletics', 70),
  SPORT('golf', 'Golf', 66),
  SPORT('ufc', 'MMA', 62),
  SPORT('ice-hockey', 'Ice hockey', 58),
  // 11c owner swap: MotoGP alone likely outranks MLB for a UK
  // audience — baseball has essentially no UK footprint.
  SPORT('motorsport', 'Motorsport', 54),
  SPORT('baseball', 'Baseball', 50),
  // ── THE OLYMPICS (Prompt 13) ──────────────────────────────────────
  // RANK-ONLY, every row: there is no poller and no published schedule
  // to poll. Wikidata carries the discipline list (verified 2026-08-04:
  // 39 summer, 15 winter) and NOTHING with a start date — the IOC
  // releases session times closer to the Games. So these rows exist to
  // ORDER a browse list, and the sweep never touches them.
  //
  // HIGH PRIORITY, LOW PLACEMENT — deliberately, and the machinery
  // already does it. The Games outrank almost everything a human might
  // want (priority 96), and DORMANCY DEMOTION (Prompt 11b) sorts a key
  // with zero future fixtures below every live one, so the Olympics
  // cannot lead a list into an empty screen between Games. It is the
  // World Cup case exactly: keep the weight, let dormancy hold it back
  // until the fixtures are real.
  RANK('olympics-2028', 'Los Angeles 2028', 'olympics', 96),
  RANK('olympics-2030', 'Milano-Cortina 2030', 'olympics', 94),
  RANK('olympics-2028-archery', 'Archery 2028', 'olympics', 40),
  RANK('olympics-2028-artistic-swimming', 'Artistic swimming 2028', 'olympics', 40),
  RANK('olympics-2028-athletics', 'Athletics 2028', 'olympics', 40),
  RANK('olympics-2028-badminton', 'Badminton 2028', 'olympics', 40),
  RANK('olympics-2028-baseball', 'Baseball 2028', 'olympics', 40),
  RANK('olympics-2028-basketball', 'Basketball 2028', 'olympics', 40),
  RANK('olympics-2028-beach-volleyball', 'Beach volleyball 2028', 'olympics', 40),
  RANK('olympics-2028-boxing', 'Boxing 2028', 'olympics', 40),
  RANK('olympics-2028-canoeing', 'Canoeing 2028', 'olympics', 40),
  RANK('olympics-2028-cricket', 'Cricket 2028', 'olympics', 40),
  RANK('olympics-2028-cycling', 'Cycling 2028', 'olympics', 40),
  RANK('olympics-2028-diving', 'Diving 2028', 'olympics', 40),
  RANK('olympics-2028-equestrian', 'Equestrian 2028', 'olympics', 40),
  RANK('olympics-2028-fencing', 'Fencing 2028', 'olympics', 40),
  RANK('olympics-2028-field-hockey', 'Field hockey 2028', 'olympics', 40),
  RANK('olympics-2028-football', 'Football 2028', 'olympics', 40),
  RANK('olympics-2028-golf', 'Golf 2028', 'olympics', 40),
  RANK('olympics-2028-gymnastics', 'Gymnastics 2028', 'olympics', 40),
  RANK('olympics-2028-handball', 'Handball 2028', 'olympics', 40),
  RANK('olympics-2028-judo', 'Judo 2028', 'olympics', 40),
  RANK('olympics-2028-lacrosse', 'Lacrosse 2028', 'olympics', 40),
  RANK('olympics-2028-modern-pentathlon', 'Modern pentathlon 2028', 'olympics', 40),
  RANK('olympics-2028-rowing', 'Rowing 2028', 'olympics', 40),
  RANK('olympics-2028-rugby-sevens', 'Rugby sevens 2028', 'olympics', 40),
  RANK('olympics-2028-sailing', 'Sailing 2028', 'olympics', 40),
  RANK('olympics-2028-shooting', 'Shooting 2028', 'olympics', 40),
  RANK('olympics-2028-skateboarding', 'Skateboarding 2028', 'olympics', 40),
  RANK('olympics-2028-softball', 'Softball 2028', 'olympics', 40),
  RANK('olympics-2028-sport-climbing', 'Sport climbing 2028', 'olympics', 40),
  RANK('olympics-2028-surfing', 'Surfing 2028', 'olympics', 40),
  RANK('olympics-2028-swimming', 'Swimming 2028', 'olympics', 40),
  RANK('olympics-2028-table-tennis', 'Table tennis 2028', 'olympics', 40),
  RANK('olympics-2028-taekwondo', 'Taekwondo 2028', 'olympics', 40),
  RANK('olympics-2028-tennis', 'Tennis 2028', 'olympics', 40),
  RANK('olympics-2028-triathlon', 'Triathlon 2028', 'olympics', 40),
  RANK('olympics-2028-volleyball', 'Volleyball 2028', 'olympics', 40),
  RANK('olympics-2028-water-polo', 'Water polo 2028', 'olympics', 40),
  RANK('olympics-2028-weightlifting', 'Weightlifting 2028', 'olympics', 40),
  RANK('olympics-2028-wrestling', 'Wrestling 2028', 'olympics', 40),
  RANK('olympics-2030-alpine-skiing', 'Alpine skiing 2030', 'olympics', 40),
  RANK('olympics-2030-biathlon', 'Biathlon 2030', 'olympics', 40),
  RANK('olympics-2030-bobsleigh', 'Bobsleigh 2030', 'olympics', 40),
  RANK('olympics-2030-cross-country-skiing', 'Cross-country skiing 2030', 'olympics', 40),
  RANK('olympics-2030-curling', 'Curling 2030', 'olympics', 40),
  RANK('olympics-2030-figure-skating', 'Figure skating 2030', 'olympics', 40),
  RANK('olympics-2030-freestyle-skiing', 'Freestyle skiing 2030', 'olympics', 40),
  RANK('olympics-2030-ice-hockey', 'Ice hockey 2030', 'olympics', 40),
  RANK('olympics-2030-luge', 'Luge 2030', 'olympics', 40),
  RANK('olympics-2030-nordic-combined', 'Nordic combined 2030', 'olympics', 40),
  RANK('olympics-2030-skeleton', 'Skeleton 2030', 'olympics', 40),
  RANK('olympics-2030-ski-jumping', 'Ski jumping 2030', 'olympics', 40),
  RANK('olympics-2030-ski-mountaineering', 'Ski mountaineering 2030', 'olympics', 40),
  RANK('olympics-2030-snowboarding', 'Snowboarding 2030', 'olympics', 40),
  RANK('olympics-2030-speed-skating', 'Speed skating 2030', 'olympics', 40),
  SPORT('olympics', 'Olympics', 46),

];

// Per-sport ordering weight. An EXPLICIT sport row wins outright — its
// own knob, tuned independently of any competition (Prompt 11b: the
// derived-max rule conflated "has one giant event" with "is a big
// sport"). The derived max survives only as the fallback for a sport
// with no row, so a missing row degrades to the old behaviour instead
// of to zero.
export function sportWeightsOf(
  entries: readonly CatalogueEntry[],
): Record<string, number> {
  const weights: Record<string, number> = {};
  const explicit = new Set<string>();
  for (const e of entries) {
    if (!e.sport || typeof e.priority !== 'number') continue;
    if (e.sportRow) {
      weights[e.sport] = e.priority;
      explicit.add(e.sport);
    } else if (!explicit.has(e.sport)) {
      weights[e.sport] = Math.max(weights[e.sport] ?? 0, e.priority);
    }
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
