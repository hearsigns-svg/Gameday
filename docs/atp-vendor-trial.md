# Track 3 — licensed vendor trial for men's draws and order of play

Status: **prepared, not run.** What blocks it is not research — it is
two actions only the owner can take. Stated plainly below rather than
worked around.

## What blocks the trial

1. **Account creation and payment are the owner's.** Every candidate
   requires signing up for a key, and this agent does not create
   accounts or enter payment details. No key, no live trial.
2. **The commercial gate is answered in writing by a human.** "May
   KickOffCal store, transform and redistribute scheduling fields as
   Google, Apple and Outlook calendar events?" is a question a vendor
   answers to a named counterparty, not something inferable from a
   pricing page.
3. **Prompt 17's two named vendors never reached this session** (the
   message was interrupted before it arrived). The shortlist below is
   mine; substitute yours if they differ.

## The fact that decides this before any trial does

TDI — Tennis Data Innovations, the ATP / ATP Media joint venture — owns
the ATP's data rights and is described in its own announcements as
running *"the central management and exploitation of tennis data in a
variety of markets, both betting and non-betting"*. Sportradar is its
exclusive distribution partner.

So any vendor selling ATP draws and order of play is either (a)
licensed by TDI, or (b) collecting it themselves. Only (a) can grant us
redistribution rights that survive contact with a lawyer. Sportradar's
published Official ATP Addendum makes the shape explicit: the licence
runs to a named signatory, all IP stays with TDI, and sublicensing or
supplying the data onward is restricted.

**This is why the access request (Track 1) and the vendor trial are the
same conversation.** Both end at TDI. The trial's real question is not
"whose JSON is nicest" but "who will put our use in writing".

## Shortlist

| Vendor | Route | Published cost | What must be asked |
|---|---|---|---|
| **Sportradar / TDI** | Official — the rights holder's own distributor | Not published; enterprise | Is there a non-betting media/schedule tier at indie scale? |
| **Goalserve** | Aggregator | $150/mo, $1,200/yr | Coverage page lists "Results/Schedules" but **never mentions draws or order of play** — confirm both exist before anything else |
| **SportDevs** | Aggregator | Free trial, 300 req/day | Same question; the free tier makes it the cheapest way to see real payloads |
| **api-tennis.com** | Aggregator | Low tiers (~£29 class) | Same question, plus the rights question in writing |

Ranked deliberately: the two that can answer the rights question
properly are at the top, and the two that can show payloads today are at
the bottom. Run both ends at once — the cheap tier tells you whether the
data is even good enough to be worth licensing.

## The one question that gates everything

Send this verbatim, before any integration work:

> KickOffCal is a consumer calendar app. It writes fixture times into
> the user's own Google, Apple or Outlook calendar and corrects them
> when schedules change. Under your licence, may we store your
> scheduling fields — tournament, round, players, scheduled date and
> time, and subsequent changes — transform them into calendar events,
> and deliver those events to end users' personal calendars? Please
> confirm in writing, including any attribution or volume conditions.
> We do not need scores, odds or streaming, and we do not use the data
> to train models.

A vendor that will not answer this in writing has failed the gate,
whatever their JSON looks like.

## The lifecycle test, when a key exists

Against a **currently active ATP tournament** — the National Bank Open
men's draw runs to 14 August, and Cincinnati follows 13–23 August, so
there is no waiting.

Capture, for one named player, the full arc:

1. **Draw pairing** — the opponent appears before any time does.
2. **Scheduled day** — the match acquires a date but not a time.
3. **Exact time** — the order of play publishes it.
4. **A change** — a reschedule, rain delay or withdrawal. THIS IS THE
   ONE THAT MATTERS: a feed that only ever tells the truth prospectively
   is useless to a calendar app, whose whole job is correcting an event
   already in someone's phone.
5. **Completion** — the result lands and the event stops moving.

Also record, because our ingest needs them: stable ids for player,
match and tournament that survive the transitions; how a withdrawal is
distinguished from a deletion; and the publication lag between the real
order of play and the feed.

`scripts/vendor-capture.mjs` runs this: point it at an endpoint, it
snapshots the response on an interval and writes only the diffs, so the
five transitions above become a file you can read rather than a claim.

```bash
VENDOR_URL='https://…' VENDOR_HEADERS='{"x-api-key":"…"}' node scripts/vendor-capture.mjs
```

## Sources

- Sportradar / TDI rights and the Official ATP Addendum —
  sportradar.com/official-atp-addendum
- TDI's remit and contact — GlobeNewswire, "Sportradar Wins Major Bid
  for ATP Rights", 13 March 2023
- Goalserve tennis coverage and pricing — goalserve.com tennis-api
  coverage and prices pages
