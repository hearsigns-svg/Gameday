// Who a fixture came from, in words a user can act on. PURE.
//
// The source is derived from the fixture id's provider prefix — the same
// one definition the server uses (coverage.ts::sourceOfFixtureId,
// identity.ts::providerOf) and the client already uses to cluster
// duplicate bouts (domain/sameBout.ts).
//
// NAMING IS A CLAIM, AND THE OBVIOUS NAME IS OFTEN THE WRONG ONE. Saying
// "not yet announced by the ATP" about a fixture that came from Tennis
// TV's published calendar attributes a silence to a body that never
// spoke to us; saying it about TheSportsDB attributes an announcement to
// somebody who does not make announcements. So each source carries what
// it IS:
//
//   organiser  — the body or promoter who actually announces the time
//                (the WTA's own API, the NHL's own api-web, MLB's
//                statsapi, World Athletics' own calendar, PBC's own card
//                pages). Naming them in "not yet announced by X" is
//                accurate.
//   relay      — somebody republishing what an organiser announced: an
//                aggregator (TheSportsDB, football-data.org, Jolpica) or
//                a broadcaster's feed (Tennis TV). About these we can
//                only say what OUR SOURCE carries, never who has or has
//                not announced anything.
//
// Anything unrecognised returns null and the UI says nothing about the
// source at all. An unknown provider must never be described.

export type SourceKind = 'organiser' | 'relay';

export interface FixtureSource {
  key: string; // the id prefix
  name: string;
  kind: SourceKind;
}

const SOURCES: Readonly<Record<string, { name: string; kind: SourceKind }>> = {
  // Organisers and promoters — they publish their own schedules.
  wta: { name: 'the WTA', kind: 'organiser' },
  wa: { name: 'World Athletics', kind: 'organiser' },
  nhl: { name: 'the NHL', kind: 'organiser' },
  mlb: { name: 'MLB', kind: 'organiser' },
  pbc: { name: 'Premier Boxing Champions', kind: 'organiser' },
  // Relays. TheSportsDB and football-data.org are aggregators; Jolpica
  // is the community Ergast successor, NOT Formula 1; the tennis ICS is
  // Tennis TV's subscription feed, NOT the ATP (atptour.com is a
  // standing refusal — calling this "the ATP" would misattribute it).
  tsdb: { name: 'TheSportsDB', kind: 'relay' },
  fdorg: { name: 'football-data.org', kind: 'relay' },
  f1: { name: 'Jolpica', kind: 'relay' },
  tennis: { name: 'Tennis TV', kind: 'relay' },
  apisports: { name: 'API-Sports', kind: 'relay' },
};

export function sourcePrefixOf(fixtureId: string): string {
  return fixtureId.split('-')[0];
}

export function sourceOf(fixtureId: string): FixtureSource | null {
  const key = sourcePrefixOf(fixtureId);
  const found = SOURCES[key];
  return found ? { key, ...found } : null;
}

// The ingest slice a fixture belongs to, as the server keys its run
// records: `source|competitionId` (functions/src/coverage.ts::sliceKey),
// sanitised the same way the freshness doc's field names are. Mirrored
// by hand, like every other server/client shape in this repo — the
// server-side test pins the pair.
export function sliceFreshnessKey(
  fixtureId: string,
  competitionId: string,
): string {
  return `${sourcePrefixOf(fixtureId)}|${competitionId}`.replace(/[./]/g, '_');
}
