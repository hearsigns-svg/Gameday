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
| Soccer | API-Sports (current) + football-data.org (candidate) | LIVE (2022–24 window) | Free tier now; paid tier ~$25–40/mo for current seasons, OR football-data.org free tier (top ~12 comps) | Free tier locked to 2022–24 | OWNER DECISION: paid API-Sports (full coverage) vs football-data.org free (top comps only) vs both. |
| Basketball (NBA) | API-Sports basketball OR public league endpoints | pending | ~$10–25/mo or free-grey | — | Decide at enablement. |
| NFL | API-Sports american-football OR public endpoints | pending | ~$10–25/mo or free-grey | — | Decide at enablement. |
| Rugby | API-Sports rugby | pending | ~$10–25/mo | — | |
| Cricket | cricketdata.org / Roanuz | pending | free tier / ~$ | — | Dedicated provider; evaluate quality. |
| Tennis | aggregator (TheSportsDB or paid) | pending | ~$10/mo (TSDB covers all sports) | — | Order-of-play is late-breaking → placeholders. |
| Golf | aggregator | pending | (same TSDB sub) | — | Span events. |
| UFC | API-Sports MMA or TSDB | pending | ~$10–25/mo or TSDB | — | Cards shift → placeholders. |

Gap-filler: **TheSportsDB** premium (~$10/mo, one sub, all sports) —
free key verified live but truncates responses; premium unlocks full
seasons. Rejected: multi-account free-tier farming (ToS; doesn't lift
season locks).

Grey-zone rule: "public but undocumented" league endpoints (NBA/NFL)
get a per-source owner decision before enablement — never enabled
silently.

Current spend: $0/month. Sports live on free official APIs: baseball,
ice hockey, F1 (plus soccer on the free-tier window).
