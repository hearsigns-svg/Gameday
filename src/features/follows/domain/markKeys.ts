// Which keys a follow's MARK may live under — PURE (Round 7 follow-up,
// owner report 2026-09-03: "the icon for all tennis majors has now
// disappeared again").
//
// The served art map is keyed by the EVENT: a tennis tournament's mark
// sits under its bare joint key (`tennis-t-us-open`), a TSDB league's
// under its numeric id ('4445') or its league key. A FOLLOW may be a
// DRAW of that event — `tennis-t-us-open-m`, `tsdb-league-4445-w` —
// and the day the follows became sexed, every lookup by follow key
// missed and the majors fell back to monograms on the strip, the entity
// page and the hero. The mark belongs to the event, so the lookup walks
// from the follow key to the event's keys: the key itself, its sexless
// base, and the base's numeric TSDB id.

const SEXED_SUFFIX = /^((?:tennis-t-|tsdb-league-).+)-(?:m|w)$/;
const TSDB_LEAGUE = /^tsdb-league-(\d+)$/;

export function markLookupKeys(followKey: string): string[] {
  const out: string[] = [followKey];
  const sexed = SEXED_SUFFIX.exec(followKey);
  const base = sexed ? sexed[1] : followKey;
  if (base !== followKey) out.push(base);
  const tsdb = TSDB_LEAGUE.exec(base);
  if (tsdb) out.push(tsdb[1]);
  return out;
}

// The first value a keyed map holds for any of the follow's mark keys.
export function lookupByMarkKeys<T>(
  map: Readonly<Record<string, T>>,
  followKey: string,
): T | undefined {
  for (const k of markLookupKeys(followKey)) {
    const v = map[k];
    if (v !== undefined) return v;
  }
  return undefined;
}
