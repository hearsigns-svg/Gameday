# Track 3 — licensed vendor trial for men's draws and order of play

Status: **prepared, not run.** What blocks it is not research — it is
two actions only the owner can take. Stated plainly below rather than
worked around.

## What blocks the trial — and what did not

1. **Live data needs a key; a key needs an account and payment.** Both
   are the owner's: this agent does not create accounts or enter
   payment details. So the LIFECYCLE half of the trial — watching one
   match move from pairing to time to change to result — cannot start
   here.
2. **The commercial gate is answered in writing by a human.** "May
   KickOffCal store, transform and redistribute scheduling fields as
   Google, Apple and Outlook calendar events?" is a question a vendor
   answers to a named counterparty, not something inferable from a
   pricing page.
3. **Prompt 17's two named vendors never reached this session** (the
   message was interrupted before it arrived). The shortlist below is
   mine; substitute yours if they differ.

WHAT WAS NOT BLOCKED, and should not have been called blocked: the
SHAPE question. Both cheap vendors publish enough in public — sample
feeds and documentation, no key — to establish whether the fields we
need exist at all. Measured below, and it already separates them.

## Measured from public artefacts (2026-08-05, no account)

**api-tennis.com** — `get_fixtures` is documented field by field:

| Field | Value in their own example |
|---|---|
| `event_key` | `"143104"` — per-match id |
| `tournament_key` / `tournament_name` | `"2833"` / `"Aachen"` |
| `event_date` / `event_time` | `"2022-06-17"` / `"18:00"` |
| `event_first_player` / `first_player_key` | `"M. Navone"` / `"949"` |
| `tournament_round` | present |
| `event_status`, `event_qualification`, `tournament_season` | present |

Stable ids at all three levels, a scheduled time, AND a round. Methods:
`get_fixtures`, `get_tournaments`, `get_players`, `get_livescore`,
`get_standings`, `get_H2H`, plus odds and news.

**Goalserve** — two public XML samples (34 livescore, 35 prematch):

```xml
<match status="Fin." date="26.02.2019" time="11:11" court="Centre Court" id="40237703">
  <player name="R. Berankis" sets_won="2" winner="True" id="1048" />
  <player name="D. Medvedev" sets_won="0" winner="False" id="6591" />
</match>
```

Date, time, COURT, status, match id, player ids — but **no round field
anywhere in the samples, and no draw/bracket structure**. The two
samples also use different id spaces (`40237703` vs `567872`), so
joining their own feeds is work.

**Both abbreviate player names** — "M. Navone", "D. Medvedev". This
repo has already ruled that a surname is not an identity (F31/F34), so
either vendor means building a key→canonical-athlete mapping before a
single event reaches a calendar. That is a real integration cost and it
belongs in the decision, not in a surprise later.

**What no public artefact answers**, and what the live trial is
therefore actually for: whether `event_time` is PRE-ANNOUNCED (an order
of play) or only appears at match time; how a withdrawal differs from a
reschedule differs from a deletion; and the rights question.

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
| **api-tennis.com** | Aggregator | Low tiers (~£29 class) | Best shape on paper: round + stable keys + scheduled time. Is the time pre-announced? Rights in writing? |
| **Goalserve** | Aggregator | $150/mo, $1,200/yr | Public samples show NO round and no draw structure — confirm both exist before anything else |
| **SportDevs** | Aggregator | Free trial, 300 req/day | Free tier is the cheapest way to see live payloads, but still needs an account |

Ranked deliberately: Sportradar/TDI is the only route that can grant
redistribution with certainty, and api-tennis is the cheapest one whose
published shape already carries what we need. Run both ends at once —
the cheap tier tells you whether the data is good enough to be worth
licensing, and the licensed route tells you whether it can be used.

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
- Goalserve tennis coverage, pricing and the two public XML samples —
  goalserve.com/en/sport-data-feeds/tennis-api/{coverage,prices,samples}
  and .../sample/34, .../sample/35 (fetched 2026-08-05, honest UA, 200)
- api-tennis.com documented response shape — api-tennis.com/documentation
  (fetched 2026-08-05, honest UA, 200; no key required to read it)
