// READ-ONLY probe of the WTA API (same unauthenticated GET the provider makes).
const UA =
  'KickOffCal/1.0 (+https://kickoffcal.app; calendar sync; contact hearsigns@gmail.com)';
const BASE = 'https://api.wtatennis.com/tennis';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(url) {
  const r = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!r.ok) throw new Error(`http ${r.status} ${url}`);
  return r.json();
}

// National Bank Open (wta-806-2026) — live now per production.
for (const [id, year, from, to] of [
  [806, 2026, '2026-08-02', '2026-08-13'],
  [2087, 2026, '2026-07-30', '2026-08-08'],
]) {
  try {
    const body = await get(
      `${BASE}/tournaments/${id}/${year}/matches?from=${from}&to=${to}`,
    );
    const ms = body.matches ?? [];
    console.log(`\n### tournament ${id}/${year}: ${ms.length} matches`);
    const byType = new Map();
    for (const m of ms) {
      const k = `DrawMatchType=${m.DrawMatchType} DrawLevelType=${m.DrawLevelType} RoundID=${JSON.stringify(m.RoundID)}`;
      byType.set(k, (byType.get(k) ?? 0) + 1);
    }
    for (const [k, v] of [...byType].sort()) console.log(`   ${k}: ${v}`);
    // distinct RoundID overall, singles main draw only
    const singles = ms.filter((m) => m.DrawMatchType === 'S');
    const rid = new Map();
    for (const m of singles) rid.set(String(m.RoundID), (rid.get(String(m.RoundID)) ?? 0) + 1);
    console.log('   singles RoundID distribution:', JSON.stringify([...rid].sort()));
    // any other round-looking key on the match object?
    const keys = new Set();
    for (const m of ms) for (const k of Object.keys(m)) keys.add(k);
    console.log('   round-ish keys present:', [...keys].filter((k) => /round/i.test(k)));
    // show one match per distinct RoundID with names, to read the ladder
    const seen = new Set();
    for (const m of singles.sort((a, b) => Number(a.DateSeq ?? 0) - Number(b.DateSeq ?? 0))) {
      const k = `${m.DrawLevelType}/${m.RoundID}`;
      if (seen.has(k)) continue;
      seen.add(k);
      console.log(
        `   e.g. ${k}: ${m.MatchID} DateSeq=${m.DateSeq} ${m.PlayerNameLastA} vs ${m.PlayerNameLastB} Winner=${m.Winner}`,
      );
    }
  } catch (e) {
    console.log(`\n### tournament ${id}/${year}: FAILED ${e}`);
  }
  await wait(1200);
}

// Does the ORDER OF PLAY carry any round label?
try {
  const oop = await get(`${BASE}/tournaments/806/2026/oop`);
  const raw = oop.orderOfPlay ?? [];
  console.log(`\n### OOP entries: ${raw.length}`);
  const parsed = JSON.parse(raw[0]);
  const txt = JSON.stringify(parsed);
  console.log('   OOP top keys:', Object.keys(parsed));
  const roundKeys = [...txt.matchAll(/"([A-Za-z]*[Rr]ound[A-Za-z]*)"\s*:/g)].map((m) => m[1]);
  console.log('   round-ish keys anywhere in OOP JSON:', [...new Set(roundKeys)]);
  // sample one match node
  const day = parsed.OOP?.Schedule?.Day;
  const d0 = Array.isArray(day) ? day[0] : day;
  const court = Array.isArray(d0?.Court) ? d0.Court[0] : d0?.Court;
  const match = Array.isArray(court?.Matches?.Match)
    ? court.Matches.Match[0]
    : court?.Matches?.Match;
  console.log('   sample OOP match keys:', match ? Object.keys(match) : '(none)');
  console.log('   sample OOP match:', JSON.stringify(match).slice(0, 900));
} catch (e) {
  console.log(`\n### OOP FAILED ${e}`);
}
process.exit(0);
