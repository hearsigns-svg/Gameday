# Provider matrix

Verified 2026-07-26 by live calls (payloads banked in
`functions/src/__tests__/fixtures/`). Provider websites 403 automated
fetches — pricing rows marked ~ were confirmed in-browser by the owner
or await that check. Cost is user-independent by architecture (central
cache; polls scale with competitions, not users).

| Sport | Provider | Status | Cost | Seasons | Notes |
|---|---|---|---|---|---|
| Baseball (MLB) | MLB Stats API (statsapi.mlb.com) | LIVE in app | Free, no key | Current ✓ (2026 verified) | Official. No SLA; contract tests guard shape. |
| Ice hockey (NHL) | NHL api-web (api-web.nhle.com) | LIVE in app | Free, no key | Current ✓ (2026-27 verified) | Official. Team keys = abbrevs. |
| Formula 1 | Jolpica (api.jolpi.ca, Ergast successor) | LIVE in app | Free, open | Current ✓ (2026: 22 races verified) | Community-run; donation-worthy if we scale. |
| Soccer | football-data.org free (leagues, current seasons) + TSDB cups (FA Cup/EFL Cup/UEL) | LIVE in app | Free + existing TSDB sub | 2026-27 verified | Cups: FA Cup 26-27 populates ~Aug. API-Sports legacy adapter retained. |
| Basketball (NBA) | TheSportsDB (existing sub) | LIVE in app | covered by $9 TSDB sub | 2025-26 full (1,380 games) | 2026-27 schedule lands ~Aug. |
| NFL | TheSportsDB (existing sub) | LIVE in app | covered by $9 TSDB sub | 2026 (321 games incl. preseason) | Round-18 times TBD → placeholders. |
| Rugby | TheSportsDB (existing sub) | LIVE in app | covered by $9 TSDB sub | Six Nations 2027 + NRL/Super League current; Prem 26-27 ~Aug | Sky scraping rejected; world.rugby API = internationals candidate |
| Cricket | TheSportsDB (existing sub) | LIVE in app | covered by $9 TSDB sub | IPL + ODI/T20I + T20 WC 2026 | Test cricket dead upstream; internationals white-ball only. |
| Tennis | — DEFERRED | blocked | — | — | TSDB results-only even premium (zero forward fixtures); needs a different provider. |
| Golf | TheSportsDB (existing sub) | LIVE in app | covered by $9 TSDB sub | PGA/DP World/LPGA 2026 | Per-round events; future rounds tbd→sharpen. |
| UFC | TheSportsDB (existing sub) | LIVE in app | covered by $9 TSDB sub | 2026 cards (38) | Event-card follow; no bout/athlete data upstream. |

Gap-filler: **TheSportsDB** premium (~$10/mo, one sub, all sports) —
free key verified live but truncates responses; premium unlocks full
seasons. Rejected: multi-account free-tier farming (ToS; doesn't lift
season locks).

Grey-zone rule: "public but undocumented" league endpoints (NBA/NFL)
get a per-source owner decision before enablement — never enabled
silently.

Current spend: $9/month (TSDB premium). 10 of 11 sports live; tennis deferred on evidence.
