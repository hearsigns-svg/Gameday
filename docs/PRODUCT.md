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
| Tennis | sport → tour/competitions | Tournament DRAW — one follow per draw (men's from the ATP section, women's from the WTA section; both followed = one joint card) | Player |
| Golf | sport → tour | Tournament | — (players deferred) |
| Motorsport (one tile: "F1 & Motorsport" / "Motorsport") | sport → Formula run (F1, F2, Formula E) + series run | Series / competition | Driver (Formula 1's directory) |
| UFC / MMA | sport → fighters (the UFC roster by division, refreshed quarterly, plus fighters on announced cards) → cards | Athlete | Event card |

Rules:
- Team-follow spans ALL competitions (league is navigation, not a filter):
  following Liverpool yields PL + UCL + cups.
- Every follow is `in` or `out` of the calendar (per-follow calendar
  control, 2026-09-23). A fixture goes in when the most specific follows
  that match it (participant → container → competition → sport) include
  one that is in — "NBA in, Warriors out" is every NBA game but the
  Warriors'; "Warriors out, Lakers in" keeps Warriors @ Lakers. Following
  and being in the calendar are separate: the app shows everything you
  follow. The calendar glyph (+ not in / ✓ in) sits on every hero card
  whose entity is followed and inside every Following row, at the
  tile's right-hand end before the Following button. There are two
  control points: per follow (hero card, Following row) and the Settings
  default for new follows. The Following page stays one flat list.
- Unfollowing on the Following page happens in place: the row stays with
  a Follow button that restores exactly what it had (calendar in/out
  included); unfollowed rows leave the next time the page is opened.
- A NEW follow starts in if a broader followed thing that is in already
  covers it; otherwise it takes the Settings default "Add new follows to
  your calendar" (on by default; off in the free state). The default never
  changes an existing follow.
- WHERE the calendar's events live is one choice for the whole calendar,
  never per follow (2026-09-24): one KickOffCal calendar (the default), or
  — Settings → "Separate calendar for each sport" — a "KickOffCal ·
  <Sport>" calendar per sport, named with the Following row's word for the
  sport (Motorsport is ONE calendar, "F1 & Motorsport" or "Motorsport" by
  region; Olympic events have their own Olympics calendar). Each is
  created, in a colour of its own, when its sport first has an event, and
  removed once it holds nothing. Premium; the switch is shown to everyone
  and in the free state leads to the offer. The layout decides where,
  never which:
  the per-follow glyph, the inclusion rule and the new-follow default work
  the same either way. Switching moves every game (a confirmation first
  when there are any), survives the app being closed partway, and says
  when it is done.
- Motorsport series with session data (Formula 1) carry a per-series
  session ladder — Race only · Qualifying & race · All sessions, default
  Qualifying & race — on their cards and pages. A sprint counts as a race,
  sprint qualifying as qualifying; practice only under All sessions.
  Series without session data have no ladder and deliver every session.
- Finished games stay in the calendar as history (the app never changes
  or removes them), with one exception (2026-09-24): a finished game whose
  fixture record no longer exists — re-keyed or withdrawn at the source —
  is removed on the next sync, since the app can no longer vouch for it.
- Multi-day units (golf/tennis tournaments) render as day-span entries
  by default; the tournament tier setting (Dates only / Key rounds / All
  matches) adds bookend notes plus matches, and the in-app Schedule
  mirrors whatever the calendar holds. The tier is a property of the
  FOLLOW: the global preference is the default, and any competition
  whose fixtures include a block-shaped tournament offers the same three
  chips on its own page as a per-tournament override — resolved per
  follow, so on a joint tournament the men's and women's draws each
  keep their own answer. The tournament's page lists the span and the
  matches its tier delivers; the expanded card's rows toggle each match
  in or out of the calendar whatever put it there. F1 creates
  per-session events (practice/quali/race) with a "race only"
  preference.
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
with a full-season horizon, tournament tiers, calendar colour, a
separate calendar for each sport (2026-09-24), three reminder slots, no
ads; 14-day store-managed trial on the annual plan.
Premium SETTINGS (calendar colour, a calendar per sport) are shown to
everyone: in the free state a tap opens the offer and changes nothing;
after a lapse they stay as the user left them, and changing them needs
Premium again (2026-09-24). ENFORCEMENT IS CLIENT-SIDE, in the sync planner: a pure, tested layer
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
