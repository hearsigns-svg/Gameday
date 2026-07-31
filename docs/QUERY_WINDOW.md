# Design note — a time window on the fixture query

Stage 1b item 4. **Nothing here is implemented.** This is the input to a
decision, and the decision is the same risk class as Stage 4's reaper.

## The situation

`fetchFixturesForFollows` has no `startUtc` constraint. It fetches every
fixture matching a follow key, forever, on every sync. The store is 52%
past fixtures (5,543 of 10,755 on 2026-07-31), so roughly half of every
read is of events that have already happened.

## Read volume

Measured against the live store, 2026-07-31. "Windowed" is what the same
follow set would read with `where('startUtc', '>=', horizon)`.

| Follow set | docs/sync now | windowed | waste | per device-day @10 syncs |
|---|---|---|---|---|
| 1 team | 194 | 54 | 72% | 1,940 → 540 |
| 10 teams | 1,113 | 317 | 72% | 11,130 → 3,170 |
| 40 teams | 3,100 | 529 | 83% | 31,000 → 5,290 |
| 3 competitions | 3,204 | 272 | 92% | 32,040 → 2,720 |
| 10 competitions | 7,112 | 3,369 | 53% | 71,120 → 33,690 |
| 40 teams + 5 comps | 4,982 | 1,277 | 74% | 49,820 → 12,770 |

Sync triggers are app mount, foreground, silent push, the ~12h background
task, and manual — ten a day is a plausible middle estimate, not a
measurement.

**p50 and p95 follow counts are `NOT MEASURABLE` from here.** They live in
the `devices` collection, which `firestore.rules` denies to clients and
which needs Admin SDK credentials this machine does not have. The table
above is scenarios, not a distribution. Getting the real percentiles is a
one-query job for whoever holds the credentials, and it should be done
before this decision is made.

**Stage 7 projection.** A catalogue that keeps every served competition
current independently of follows grows the store; it does not by itself
grow per-user reads, which are bounded by what each user follows. But it
removes the accident that currently limits the store to what someone has
already followed — so the heavy rows above (a 10-competition follower at
7,112 reads/sync) become reachable by more users, and stay heavy for
longer, because competitions no longer go stale and stop growing.

## The prune consequence — this is the part that bites

`planSync` keeps a past fixture in `wanted` if it is already ledgered:

```ts
if (desired.startUtc < horizonStartUtc && !ledger[f.id]) continue;
```

The comment is explicit — "Events we already created stay put as they age
— erasing someone's history would be worse than leaving it." That
protection only works because past fixtures are still *in the fetch*. Filter
them out at the query and they never reach `wanted`, so every ledgered past
event falls into the delete branch.

Dry run, real planner over real data, against a steady-state ledger (a user
who has been following long enough that their past fixtures are in their
calendar):

| Follow set | deletes today | deletes if windowed |
|---|---|---|
| 1 team | 1 | **140** |
| 10 teams | 1 | **796** |
| 40 teams | 1 | **2,571** |
| 3 competitions | 0 | **2,932** |
| 10 competitions | 0 | **3,743** |
| 40 teams + 5 comps | 1 | **3,705** |

Adding a window naively deletes thousands of past events from real
calendars — silently, on the first sync after the change ships. That is a
larger destructive event than the bug Stage 1 fixed.

## Options

**(a) Filter at query time, accept the deletions.** Cheapest reads, and the
calendar stops accumulating history. Costs users their record of what they
went to. Would need to be a deliberate, announced product decision, and
almost certainly a one-time migration rather than a silent sync.

**(b) Filter at query time, exempt out-of-window fixtures from pruning.**
Keep the read saving; stop the planner from deleting a ledgered event
merely because its fixture was not in this fetch. Concretely: an entry
whose `startUtc` is older than the horizon is never a delete candidate —
it ages out of the ledger by a separate rule, not by absence. This is the
only option that gets the saving without the deletions, and it makes the
"absence means unfollow" inference — the same inference behind the Stage 1
bug — explicitly conditional on the fixture being in scope. It is more
code, in the layer that must not be got wrong.

**(c) Leave the query alone, accept the read cost.** Zero risk. At the
scenarios above, a 40-team user costs ~31k reads/device-day; at Firestore's
published rate that is small money per user but scales linearly with both
users and follows, and the 10-competition case is already 71k.

**Recommendation: (b), and not before Stage 4.** Stage 4's reaper already
introduces one "absence means delete" rule; adding a second one in the same
window doubles the chance of getting the interaction wrong. (c) is a
perfectly good holding position — the cost is real but bounded, and it is
the only option that cannot delete anything.

Whichever is chosen, the p50/p95 numbers should be measured first.
