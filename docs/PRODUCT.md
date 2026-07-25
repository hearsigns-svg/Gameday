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
  placeholder events ("Djokovic — Wimbledon, time TBC") that sharpen as
  data confirms.

## v1 scope

In: the core journey; 11 sports (soccer, cricket, ice hockey, tennis,
basketball, baseball, NFL, rugby, golf, F1, UFC); background change
detection with silent calendar correction; iOS + Android; store-launchable.

Deferred: boxing (data quality bar), push notifications on changes,
server-side Google Calendar API write, Outlook/web, monetisation UI.

## Monetisation (architecture-relevant only)

Planned: free first month → ads or subscription. Entitlements are enforced
server-side from day one so gating never needs a client update. No
monetisation UI in v1.

## Non-goals

Not a scores app, not a news app, not a streaming guide. No social
features. The value is a correct calendar, nothing else.
