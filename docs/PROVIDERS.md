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

Current spend: $9/month (TSDB premium). 11 of 12 sports live; tennis
deferred on evidence. Production cache 2026-07-27: 3,114 fixtures across
all live sports; NBA shows 0 upcoming because the 2026-27 schedule is
not published yet (~Aug) — the horizon rule makes that state honest
rather than filling calendars with last season.

## Coverage-gap analysis — what paid API-Sports would add (2026-07-29)

Researched live (owner asked what declining the API-Sports subscription
costs us). Prices approximate, from vendor pages.

**API-Sports does NOT sell tennis.** Their family is Football, AFL,
Baseball, Basketball, Formula-1, Handball, Hockey, MMA, NBA, NFL/NCAA,
Rugby, Volleyball. So the one sport we genuinely lack is the one sport
that subscription could never fix. Pricing is PER SPORT ($19–39/mo
each), so "just subscribe" is not one line item.

Where paid API-Sports would add NOTHING (we use official/free or the
existing TSDB sub): MLB, NHL, F1, NFL, NBA, rugby, cricket*, golf*,
MMA, boxing, motorsport. (*not in the API-Sports lineup at all.)

Where it WOULD add real coverage — soccer breadth only. We serve ~23
competitions (12 football-data.org free + ~11 TSDB cups/extras);
API-Football advertises ~1,236 leagues. Raw ratio ~2%, but that number
is misleading: the tail is lower divisions nobody follows. By FAN
DEMAND we already hold the big five, UCL/UEL/UECL, FA/EFL Cups,
Championship–League Two, Scottish Prem, DFB-Pokal, Coppa Italia,
Brasileirão, Euros, World Cup. Notable real absences: MLS, WSL (and
women's football generally), Liga MX, Saudi Pro League, Copa
Libertadores, AFC Champions League, National League.

Options if we want them:
- Soccer breadth: API-Football $19–39/mo (~1,236 leagues) is better
  value than football-data.org's paid tiers (€49/mo = 30 comps,
  €99 = 50, €199 = 100).
- Tennis: needs a different vendor. Goalserve ~$150/mo (fixtures +
  ATP/WTA/ITF/slams) or tennis-api.com (fixtures/schedules; price
  unconfirmed). At $150/mo tennis alone would be 16x our current
  total data spend — hard to justify pre-revenue.

Recommendation: ship on the current $9/mo mix. Add API-Football only if
US/women's-football demand shows up in real users (MLS + WSL are the
two names most likely to be asked for). Treat tennis as a post-launch
question, not a launch blocker.
