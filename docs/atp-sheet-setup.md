# ATP review sheet — what the owner has to do

Everything else is built and deployed. These are the steps that need a
Google login, which the agent does not do.

## 1. Enable the Sheets API (one click)

The connector is live and failing correctly — it returns **502** with
"Google Sheets API has not been used in project 188261010398 before or
it is disabled". That is the standing invariant working: a read it
cannot perform is an error, never "no matches today".

https://console.developers.google.com/apis/api/sheets.googleapis.com/overview?project=188261010398

## 2. Share the sheet with the function

Share the spreadsheet with **Viewer** access to:

```
188261010398-compute@developer.gserviceaccount.com
```

That is the identity the Cloud Functions already run as. No key, no
secret, nothing to rotate or leak — and the function can only READ.

## 3. Paste the Apps Script

Sheet → **Extensions → Apps Script** → replace the contents with
`scripts/atp-sheet.gs` from this repo.

Then **File → Project Settings → Script Properties**, add two:

| Property | Value |
|---|---|
| `RAPID_KEYS` | the three keys, comma-separated, no spaces |
| `FUNCTIONS_BASE` | `https://us-central1-gameday-fixtures.cloudfunctions.net` |

Then run `install()` once (it will ask for authorisation — that is the
script asking to edit its own sheet and to call out to the two hosts).
It creates the six tabs and the 2-hourly trigger.

## What then happens without anyone touching it

1. Every 2 hours the script asks **our** backend what is live. Right now
   that answers: National Bank Open, to 14 August. No ATP tennis on = no
   vendor requests at all.
2. It fetches the men's draw, appends to `raw_pulls`, and rebuilds
   `canonical_matches`.
3. New players get one lookup against our own directory. An exact,
   unique full-name hit is auto-mapped; anything else lands in
   `player_mapping` marked **NEEDS A HUMAN** with a blank id.
4. The sweep calls `pollSheetAtp`, which reads `canonical_matches`,
   stamps each curated mapping onto the athlete as a provider id — so
   that player resolves by id for ever after — and publishes the matches
   through the same appearance path the WTA uses.

## The two things worth knowing

**A blank id in `player_mapping` means that match does not publish.**
Not a guess, not a near-match. Fill the `canonical_athlete_id` cell and
it appears on the next sweep.

**The override columns beat the vendor, always.** `override_scheduled_utc`,
`override_status` (`withdrawn` removes an event from calendars),
`override_note`. They survive every rebuild — the script reads them
before it rewrites the tab, which is the one bug that would make the
whole editable-sheet idea worthless.

## Quota

The `status` tab records, every run, the remaining quota reported by
each key. Free tier measured at **50 requests/key/day**. At 2-hourly
with one tournament live this run costs 1 request (plus 2 once, the
first time a tournament is seen). Three keys is ~150/day of headroom
against roughly 12–36/day of use.
