// Cross-provider team aliasing.
//
// The blueprint promises that following a team yields ALL its fixtures.
// That breaks across providers: football-data calls Liverpool
// 'fdorg-team-64', TheSportsDB calls the same club 'tsdb-team-133602',
// so cup ties ingested from TSDB never match a league follow. Here we
// resolve team NAMES to every provider key that means the same club and
// stamp them all onto the fixture, so one follow catches every
// competition regardless of which provider supplied it.

import { Firestore } from 'firebase-admin/firestore';
import { Fixture } from './fixture';
import { normaliseName } from './identity';

export type AliasMap = Map<string, string[]>;

interface DirectoryTeamDoc {
  teams?: Array<{ name?: string; key?: string; aliases?: string[] }>;
}

// Built from the cached team directories: every name we know for a club
// points at every provider key for that club.
export async function loadTeamAliases(db: Firestore): Promise<AliasMap> {
  const snap = await db.collection('teamDirectory').get();
  const map: AliasMap = new Map();
  for (const doc of snap.docs) {
    const data = doc.data() as DirectoryTeamDoc;
    for (const team of data.teams ?? []) {
      if (!team.key) continue;
      const names = [team.name, ...(team.aliases ?? [])].filter(
        (n): n is string => typeof n === 'string' && n.length > 0,
      );
      for (const raw of names) {
        const norm = normaliseName(raw);
        if (!norm) continue;
        const existing = map.get(norm) ?? [];
        if (!existing.includes(team.key)) existing.push(team.key);
        map.set(norm, existing);
      }
    }
  }
  return map;
}

// Add every known provider key for the fixture's teams, so a follow made
// against one provider still matches fixtures supplied by another.
export function augmentFollowKeys(
  fixtures: readonly Fixture[],
  aliases: AliasMap,
): Fixture[] {
  if (aliases.size === 0) return [...fixtures];
  return fixtures.map((f) => {
    const extra = [f.homeTeam, f.awayTeam]
      .filter((n): n is string => typeof n === 'string' && n.length > 0)
      .flatMap((n) => aliases.get(normaliseName(n)) ?? []);
    if (extra.length === 0) return f;
    const merged = [...new Set([...f.followKeys, ...extra])];
    return merged.length === f.followKeys.length ? f : { ...f, followKeys: merged };
  });
}
