// Which server route keeps a follow's fixtures fresh. PURE — no engine,
// no network — so the null cases can be tested.

import { Followable } from '../data/followStore';
import {
  F1_SEASON,
  FD_ROUTE_SEASON,
  MLB_SEASON,
  NHL_SEASON_ID,
} from './sportsConfig';

// The route that keeps a follow's fixtures fresh, or NULL when there is
// no route that can. Null is a real answer, not a failure: an API-Sports
// follow from before the account was suspended has no working poller, and
// a league-level NHL/MLB key has no league route at all. Returning a
// broken path instead meant `follow()` rolled back on a 400, and the
// sweep spent a request per cycle on a call that cannot succeed.
export function pollPathFor(item: Followable): string | null {
  if (item.pollPath) return item.pollPath;
  const tail = item.key.split('-').pop() ?? '';
  // QUARANTINED: API-Sports' account is suspended. Legacy apisports-*
  // follows have no poller; their cached fixtures stay until reconciled.
  if (item.key.startsWith('apisports-')) return null;
  if (item.key.startsWith('fdorg-')) {
    // The season here only fills the slot the route validator requires —
    // the server resolves the real one per competition.
    return item.type === 'competition'
      ? `pollFdCompetition?code=${tail}&season=${FD_ROUTE_SEASON}`
      : `pollFdTeam?teamId=${Number(tail)}&season=${FD_ROUTE_SEASON}`;
  }
  // League-level keys for team-pollered sports have no route: `mlb-league-1`
  // would build pollMlbTeam?teamId=1. Their browse rows no longer offer a
  // follow; this covers anything already stored.
  if (item.type === 'competition' && /-league-\d+$/.test(item.key)) return null;
  switch (item.sportKey) {
    case 'baseball':
      return `pollMlbTeam?teamId=${Number(tail)}&season=${MLB_SEASON}`;
    case 'ice-hockey':
      return `pollNhlTeam?abbrev=${tail}&season=${NHL_SEASON_ID}`;
    case 'f1':
      return `pollF1?season=${F1_SEASON}`;
    default:
      return null;
  }
}
