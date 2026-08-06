const UA =
  'KickOffCal/1.0 (+https://kickoffcal.app; calendar sync; contact hearsigns@gmail.com)';
const BASE = 'https://api.wtatennis.com/tennis';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function get(url) {
  const r = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!r.ok) throw new Error(`http ${r.status} ${url}`);
  return r.json();
}

// A COMPLETED tournament shows the whole ladder. DC Open finished 2026-08-02.
for (const [label, id, from, to] of [
  ['DC Open (completed)', 1045, '2026-07-27', '2026-08-02'],
  ['Warsaw (live, QF stage)', 2087, '2026-07-30', '2026-08-08'],
  ['National Bank Open (live, R3)', 806, '2026-08-02', '2026-08-13'],
]) {
  try {
    const body = await get(`${BASE}/tournaments/${id}/2026/matches?from=${from}&to=${to}`);
    const ms = body.matches ?? [];
    const singles = ms.filter((m) => m.DrawMatchType === 'S' && m.DrawLevelType === 'M');
    const dist = new Map();
    for (const m of singles) {
      const t = typeof m.RoundID;
      const k = `${JSON.stringify(m.RoundID)} (${t})`;
      dist.set(k, (dist.get(k) ?? 0) + 1);
    }
    console.log(`\n### ${label} — ${ms.length} matches, ${singles.length} main-draw singles`);
    for (const [k, v] of [...dist].sort()) console.log(`   RoundID ${k}: ${v}`);
    // Show what a numeric-RoundID record actually looks like
    const numeric = singles.filter((m) => typeof m.RoundID !== 'string');
    if (numeric.length) {
      console.log(`   --- numeric-RoundID sample (${numeric.length} such) ---`);
      const n = numeric[0];
      console.log('   ', JSON.stringify({
        MatchID: n.MatchID, RoundID: n.RoundID, MatchState: n.MatchState,
        Winner: n.Winner, A: n.PlayerNameLastA, B: n.PlayerNameLastB,
        SeedA: n.SeedA, DateSeq: n.DateSeq, LastUpdated: n.LastUpdated,
      }));
    }
    // list letter rounds explicitly
    for (const letter of ['Q', 'S', 'F']) {
      const hits = singles.filter((m) => m.RoundID === letter);
      if (hits.length) {
        console.log(`   >>> RoundID '${letter}': ${hits.length} main-draw singles matches`);
        for (const h of hits) {
          console.log(
            `        ${h.MatchID} ${h.PlayerNameFirstA} ${h.PlayerNameLastA} vs ${h.PlayerNameFirstB} ${h.PlayerNameLastB} Winner=${h.Winner} state=${h.MatchState}`,
          );
        }
      } else {
        console.log(`   >>> RoundID '${letter}': ABSENT`);
      }
    }
  } catch (e) {
    console.log(`\n### ${label}: FAILED ${e}`);
  }
  await wait(1200);
}
process.exit(0);
