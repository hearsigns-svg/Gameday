// The Motorsport tile's two sections — PURE (Round 7 items 3 and 4,
// owner ruling 2026-09-03).
//
// One structure everywhere (Round 6 item 7), presented in two runs
// under small headers: the FORMULA group — Formula 1, Formula 2,
// Formula E — and the rest of motorsport. Where F1 is the draw the
// Formula group leads; in North America the order flips and the
// motorsport series lead. Within a run the rows keep the order the
// catalogue weights gave them. The region list mirrors the regional
// label table (sportTerms: "Motorsport" is the North American word).

import { RegionKey } from '../../../core/region';

export const FORMULA_KEYS: readonly string[] = [
  'f1-series-1', // Formula 1 (follows AS the f1 series — followAs)
  'tsdb-league-4486', // Formula 2
  'tsdb-league-4371', // Formula E
];

export const MOTORSPORT_PLAIN_REGIONS: readonly RegionKey[] = ['north-america'];

export type MotorsportSectionId = 'formula' | 'motorsport';

export interface MotorsportSection<T> {
  id: MotorsportSectionId;
  rows: T[];
}

export function isFormulaKey(key: string): boolean {
  return FORMULA_KEYS.includes(key);
}

export function motorsportSections<T extends { key: string }>(
  rows: readonly T[],
  region: RegionKey,
): MotorsportSection<T>[] {
  const formula = rows.filter((r) => isFormulaKey(r.key));
  const rest = rows.filter((r) => !isFormulaKey(r.key));
  const ordered: MotorsportSection<T>[] = MOTORSPORT_PLAIN_REGIONS.includes(region)
    ? [
        { id: 'motorsport', rows: rest },
        { id: 'formula', rows: formula },
      ]
    : [
        { id: 'formula', rows: formula },
        { id: 'motorsport', rows: rest },
      ];
  return ordered.filter((s) => s.rows.length > 0);
}
