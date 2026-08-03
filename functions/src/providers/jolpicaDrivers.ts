// Jolpica F1 drivers — the motorsport roster source.
//
// The Ergast successor the F1 calendar already polls (approved,
// catalogued). The per-season drivers endpoint carries stable string
// ids ('max_verstappen', 'alonso') — canonical identity at no new
// source cost. The season's driver list is also the season's
// PARTICIPATION truth: every entrant runs every weekend, so driver
// follow keys are stamped onto the season's session fixtures at ingest
// (see stampF1DriverKeys in index.ts) rather than minting thousands of
// per-driver-per-session appearance docs that would all say the same
// thing.
//
// COMPLETENESS: limit=100 with the response's own `total` checked
// against what arrived — a fixed slice must state its ordering, and
// "all of them, verified" is the strongest ordering there is.

import { RosterEntry } from '../athletes';
import { requireArray } from './fetchResult';

const BASE = 'https://api.jolpi.ca/ergast/f1';

interface JolpicaDriver {
  driverId?: string;
  givenName?: string;
  familyName?: string;
  permanentNumber?: string;
  nationality?: string;
}

export function driversToEntries(
  drivers: readonly JolpicaDriver[],
): RosterEntry[] {
  const out: RosterEntry[] = [];
  for (const d of drivers) {
    if (!d.driverId || !d.givenName || !d.familyName) {
      throw new Error(
        `jolpica drivers: row missing id/name: ${JSON.stringify(d).slice(0, 120)}`,
      );
    }
    out.push({
      source: 'f1',
      externalId: d.driverId,
      name: `${d.givenName} ${d.familyName}`,
      sport: 'f1',
      grouping: 'Formula 1',
      groupingKey: 'f1',
    });
  }
  return out;
}

export async function fetchJolpicaDrivers(
  season: number,
): Promise<{ rawCount: number; entries: RosterEntry[] }> {
  const res = await fetch(`${BASE}/${season}/drivers/?format=json&limit=100`);
  if (!res.ok) throw new Error(`jolpica http ${res.status}`);
  const body = (await res.json()) as {
    MRData?: { total?: string; DriverTable?: { Drivers?: JolpicaDriver[] } };
  };
  const drivers = requireArray(
    body.MRData?.DriverTable?.Drivers,
    'jolpica',
    'MRData.DriverTable.Drivers',
  );
  // `total` is the completeness proof — a missing or unparseable value
  // is shape rot that would silently disable the check (`?? fetched` is
  // the exact class the standing invariant forbids), so it throws.
  const total = Number(body.MRData?.total);
  if (!Number.isFinite(total)) {
    throw new Error(
      `jolpica drivers: MRData.total is not a number (got ${JSON.stringify(body.MRData?.total)})`,
    );
  }
  if (total > drivers.length) {
    // More drivers exist than one page carried: never publish a roster
    // that silently marks the overflow absent.
    throw new Error(
      `jolpica drivers: total ${total} exceeds fetched ${drivers.length}`,
    );
  }
  return { rawCount: drivers.length, entries: driversToEntries(drivers) };
}
