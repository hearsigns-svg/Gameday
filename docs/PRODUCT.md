# Gameday — Product

## Problem

Sports fans miss games because fixture schedules live in dozens of places
and change without warning. Manually maintaining calendar entries is
tedious and fails exactly when it matters most: World Cups, playoffs,
rescheduled kickoffs.

## Persona

Any sports fan with a phone calendar. One role; everyone sees the same app.

## Core journey (the whole app, deliberately)

Open app → pick sports → follow teams / competitions / athletes → set
calendar preferences (reminders, all-day vs timed, event naming) → grant
calendar access → fixtures appear in the calendar. Gameday then keeps them
correct forever, silently. The calendar IS the product; the app is the
remote control.

## Follow taxonomy

What you follow differs by sport. `Followable` types: team, competition,
athlete, series. Each sport declares its browse hierarchy and offered types:

| Sport | Browse path | Primary follow | Also followable |
|---|---|---|---|
| Soccer, cricket, ice hockey, basketball, baseball, NFL, rugby | sport → league → team | Team | Competition (World Cup, Six Nations, IPL) |
| Tennis | sport → tour/competitions | Tournament | Player |
| Golf | sport → tour | Tournament | — (players deferred) |
| F1 | sport | Series (season calendar) | — |
| UFC | sport → athletes | Athlete | Event card |

Rules:
- Team-follow spans ALL competitions (league is navigation, not a filter):
  following Liverpool yields PL + UCL + cups.
- Multi-day units (golf/tennis tournaments) render as day-span entries,
  not per-match events. F1 creates per-session events (practice/quali/
  race) with a "race only" preference.
- Late-scheduling sports (tennis order-of-play, UFC cards) create
  placeholder events ("Gauff vs Day — National Bank Open", day known,
  time TBC) that sharpen in place as data confirms. The example used to
  read "Djokovic — Wimbledon", which is precisely the case we cannot
  serve: see the men's line in v1 scope.

## v1 scope (amended 2026-07-27; tennis and athlete-follows amended 2026-08-05)

In: the core journey; 12 sports (soccer, cricket, ice hockey, basketball, baseball, NFL, rugby, golf, F1, boxing, MMA, motorsport — motorsport and boxing added post-gate); ~60 competitions; background change detection with silent calendar correction; iOS + Android; store-launchable.

TENNIS IS IN, ASYMMETRICALLY — and the asymmetry is the status, not a
caveat on it (measured against production, 2026-08-05):

- **Women's: complete.** api.wtatennis.com, approved by owner ruling
  2026-08-02, carries tournaments, draws AND order of play. A player
  follow yields one appearance document per match — the opponent named
  from the draw, the day from the schedule, sharpened in place to an
  exact time when the order of play publishes it. Live now: 40 future
  tournament banners, 38 live appearances, 36 of them reaching a
  followable athlete.
- **Men's: tournaments only.** The Tennis TV ICS is a TOURNAMENT
  calendar — 78 future banners and, by construction, not one match.
  There is no men's draw or order-of-play source we can use:
  atptour.com is challenged by Cloudflare bot management and its terms
  make production use an open legal question (DECISIONS 2026-08-05), so
  the routes are an authorised-access request or a licensed feed. Until
  one lands, a followed ATP player's page SAYS SO rather than promising
  events that cannot arrive.
- **Athlete follows generally are IN**, not deferred: boxing, tennis
  (women), MMA and F1 all deliver appearance-level events.

Deferred: Test cricket (only Cricbuzz carries it; scraping decision
open), push notifications on changes, server-side Google Calendar API
write, Outlook/web, monetisation UI.

## Monetisation (architecture-relevant only)

Round 5 model (owner ruling 2026-09-02, full text in DECISIONS): Free
forever = unlimited follows, the full in-app schedule (windowed by date,
paged), one system-notification reminder slot, no calendar sync, banner
ads after a 14-day grace from the first follow. Premium = calendar sync
with a full-season horizon, tournament tiers, calendar colour, three
reminder slots, no ads; 14-day store-managed trial on the annual plan.
ENFORCEMENT IS CLIENT-SIDE, in the sync planner: a pure, tested layer
reads the billing SDK's cached entitlement (offline grace) and gates
`create` only — placed events keep receiving corrections, removal is
never gated, downgrade removals follow the recorded keep-window rules.
The server never gates polling; `entitlements/{uid}` is a server-written
mirror from the billing webhook, not the enforcement point. Feature-
flagged (`status/flags`, fail-safe defaults: sync gate open, ads off,
paywall dismissible) until Stage 5.

## Non-goals

Not a scores app, not a news app, not a streaming guide. No social
features. The value is a correct calendar, nothing else.
