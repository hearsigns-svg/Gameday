# Hero imagery — sources, licensing, and what we may actually ship

> **CURRENT POSITION (Prompt 13, owner ruling 2026-08-04).** This
> document has now been wrong in BOTH directions — it once described
> crests as shippable, then described their removal as settled. What
> follows is the position as of 2026-08-04.
>
> **The identity chain is: crest or competition logo → verified photo →
> generated treatment.**
>
> 1. **Club crests and competition logos — SHIPPED, risk accepted.**
>    The 9b removal is reversed. Trademark enforcement is discretionary
>    and complaint-driven, and the accepted risk is paired with a
>    takedown switch that works without a deploy: set `imagery: false`
>    on the competition's `catalogue` document and artwork stops within
>    the 5-minute serve cache. Full procedure in `docs/DECISIONS.md`.
>    Restored server-side too — fd.org `crest`, TSDB `strBadge`, the
>    NHL/MLB badge-by-name enrichment, and `strLeagueBadge` for
>    competition logos.
> 2. **Athlete images — Wikimedia Commons ONLY.** The verified-at-fetch
>    gate stands unchanged: an allowed licence AND a named artist AND a
>    recorded source, or no image. WTA, World Athletics and PBC
>    photography remain UNWIRED — those are agency images, which is
>    copyright rather than trademark, and agencies pursue it
>    commercially as a matter of course. Measured coverage: 979 of the
>    1,513 ATP directory men (64.7%) have a Commons image; the rest get
>    the generated treatment permanently.
> 3. **Olympic marks — EXCLUDED ENTIRELY, and not by the switch.** The
>    rings, Games emblems and torch iconography are protected by
>    dedicated statute (in the UK, the Olympic Symbol etc. (Protection)
>    Act 1995), not ordinary trademark law, and the IOC enforces against
>    non-commercial use. `IMAGERY_NEVER_PREFIXES` in
>    `functions/src/imagery.ts` refuses artwork for every `olympics*`
>    and `paralympics*` key; no catalogue edit can re-enable it, and
>    provider artwork arriving for an Olympic key is dropped rather than
>    passed through. Naming the events factually is fine.
>
> The generated treatments are NOT deprecated by any of this. They are
> the fallback layer and they cover every entity with no image.
>
> TheSportsDB data attribution stays on the Credits screen.
>
> The research below (2026-07-29) remains accurate about LICENSING; it
> predates both rulings, so read its conclusions about what we *ship*
> against this box.

Researched 2026-07-29 (agent sweep + direct verification of every claim
marked ✓ below). NOT legal advice; the athlete-likeness question should
get a lawyer's eye before store submission, alongside crest rights.

## Verdict

Real photography is shippable, but **venue-led, not athlete-led**. The
literal ask ("Lewis Hamilton in an F1 car") is not purchasable at indie
scale: in-car F1 action photography is exclusively licensed to Getty as
F1's official agency. Stadium/venue photography gets most of the visual
impact with none of the exposure.

## The two-layer licensing trap

1. **Photo copyright** — the easy half, and solved. Wikimedia Commons
   files are commercially reusable by policy (a sampled 74/74 athlete
   photos were commercially clean, zero NonCommercial), with
   machine-readable licence + author fields we can render automatically.
2. **Personality / publicity rights** — the hard half, and money does
   not fix it. A photo licence never conveys likeness rights (Getty's
   own EULA says so). Precedent that matters: MLB players sued
   DraftKings in 2024 over exactly this pattern; the court refused to
   dismiss, reasoning a likeness "divorced from historical context"
   functions as advertising, and DraftKings settled rather than test it.
   Putting an athlete's face on a commercial app's home screen is the
   risky shape; showing it beside factual fixture data is far safer.

## ⚠️ Do NOT ship these TSDB fields
<!-- Prompt 13: still accurate. These are the USER-UPLOADED composite
     art fields (strThumb / strPoster / strFanart), which are a
     different thing from `strBadge` and `strLeagueBadge` — the badge
     fields ARE now shipped under the reversal above. -->

We pay for TheSportsDB and its terms do permit app-store publication by
paid subscribers — but the tempting artwork is the dangerous artwork:

- **team `strFanart1-3`** — professional press-agency match photography
  (Arsenal's is a Champions League celebration shot). 100% coverage, no
  licence field at all. This is the field that looks exactly like the
  reference design and it is the one to avoid.
- **UFC `strPoster`** — Zuffa trademark artwork.
- **player `strCutout` / `strRender` / `strThumb`** whenever
  `strCreativeCommons != 'Yes'` — ~54% of sampled rosters fail this.
  ✓ Verified: Lewis Hamilton and Tyson Fury both HAVE cutouts and both
  have an EMPTY `strCreativeCommons`. Empty is a fail, not a pass.

**CORRECTED 2026-08-03 (Prompt 9b licensing research).** The earlier
"safe TSDB fields" claim here was WRONG and is superseded:
- `strBadge` / `strLogo` are club and competition TRADEMARKS. TSDB's
  terms license their service, not that IP ("trademarked sports logos
  must be used as-is" is an acknowledgement, not a grant), and App
  Store guideline 5.2.1 lets Apple demand an authorisation we cannot
  produce. REMOVED from the app by owner ruling; do not re-wire.
- event `strThumb` / `strPoster` are user-uploaded, frequently
  fan-made composites of agency photography with no traceable licence.
  NOT wired; do not wire them.
The only TSDB condition we do owe — crediting TSDB as the data source —
is implemented on the Credits screen. Identity now comes from the
GENERATED treatments (palette + monogram + sport geometry) plus
verifiably-licensed Wikimedia photography with per-image
artist/licence/source recorded at fetch time.

## The plan: a cached server-side waterfall

- **Tier 1 — VENUE photo (the workhorse, zero likeness risk).**
  team → Wikidata `P115` (home venue) → venue `P18` → Commons file.
  ✓ Verified end-to-end: Liverpool FC (Q1130849) → Anfield (Q45671) →
  `Liverpool anfield road stadium.jpg`, 4595×3441, CC BY-SA 3.0 de,
  `AttributionRequired: true`, artist Arne Mueseler. ~85% of Premier
  League grounds measured.
  NOTE: TSDB does NOT expose `idWikidata` on teams (✓ checked
  searchteams.php — only `strStadium` / `strLocation`), so entity
  resolution needs a name/Wikidata-search step or a curated map.
- **Tier 2 — ATHLETE photo, licence-gated, fixture cards only.**
  Wikidata `P18` via entity lookup, allowlisted licences. ~57%
  end-to-end coverage. Never on Home as decoration.
- **Tier 3** — generic sport imagery (Unsplash).
- **Tier 4** — today's tone-mapped gradient: the guaranteed floor, which
  is why the fallback-first design rule already paid off.

## In-app requirements (non-negotiable if we use Commons)

- A visible credit line (~86% of Commons files require attribution).
- Render the photo **unmodified in its own layer**, with our gradient
  scrim and typography as separate overlays. Baking a flat composite
  JPEG creates a ShareAlike *adaptation* and drags our design under the
  licence.
- No athlete photo in App Store screenshots, paywall screens, or push
  marketing — that is the advertising-shaped use the DraftKings case
  turned on.
- Revalidate licences periodically; Commons files can be re-licensed or
  deleted.

## Recommendation

Ship venue-led photography now at $0 on top of the existing $9/mo. Add
athlete photos only inside fixture cards, licence-gated and credited.
Keep the gradient as the floor. Revisit paid editorial feeds (Getty,
Imagn, Icon Sportswire) only if there is revenue to justify them.

## Implementation state (2026-07-30)

SHIPPED, Tier 1 (venue): client-side resolver, licence-gated, inline
credit on the hero card, gradient floor on any failure.

SHIPPED, Tier 2 (athlete): licence-gated portraits resolved from
Wikidata P18 → Commons, rendered ONLY in the identity tile of a fixture
whose title NAMES that participant (combat sports — "Rolando Romero vs
Teofimo Lopez"). This is the editorial shape: the photo identifies who
is competing in the event being listed. Guards in code:
- domain/participants.ts extracts the headline fighter and returns null
  for club sports, motorsport, and title-only strings, so no photo can
  attach to a fixture that does not name a person.
- The entity search skips Wikidata items described as a competition or
  event, so "Tyson Fury vs Wilder III" cannot supply a "portrait".
- Only CC BY / CC BY-SA / CC0 / public domain pass the same allowlist
  as venues; NC and ND never.
- Transient failures are NOT cached (a network blip must not deny an
  entity its photo forever).

ATTRIBUTION: every rendered photo is registered and listed on a
**Photo credits** screen (Preferences → Photo credits) with artist and
licence, alongside the hero's inline credit. Required by CC BY/BY-SA.

STILL FORBIDDEN, unchanged: TSDB team strFanart, TSDB player artwork
without strCreativeCommons='Yes', athlete photos in App Store
screenshots, on paywall screens, or in any marketing — that is the
advertising-shaped use the DraftKings case turned on.

## 2026-07-31 — venue photos follow the HOME TEAM

Tier 1 was keyed on the FOLLOWED entity, which was wrong twice over:

- **Wrong ground.** A Liverpool follow put Anfield on Liverpool's away
  games. The photograph is of the ground the match is played at, so it
  belongs to the home side.
- **No ground at all.** A COMPETITION follow (Premier League) has no
  home venue to look up, so every one of its fixtures — the majority on
  a browse-led Home — fell straight through to the sport emoji. The app
  knew the league and nothing about the two clubs playing.

Fixed by carrying `homeTeam` / `awayTeam` (already on `Fixture`) through
`SnapshotFixture`, and resolving Tier 1 from the home team's name.
Non-team sports have no home side and fall back to the followed team
where there is one, then to the gradient floor.

Venue art now shares the name-keyed `photoCache` with athlete photos,
under a `venue:` prefix so a ground and a fighter of the same name can
never be served for one another. Consequence worth having: venue photos
now appear on the **Photo credits** screen, which they did not before —
they were credited only inline on the card, and attribution is a licence
condition, not a per-surface nicety.

MEASURED on the simulator against a Premier League follow, where
coverage was previously ZERO: Arsenal→Emirates, Hull City→MKM,
Ipswich→Portman Road, Everton→Goodison all resolved with licence and
artist. One miss in five: "Nottingham" — provider team names are
short-forms, and Wikidata search does not reach the club from the city
name within its candidate window.

KNOWN GAP, needs the backend: crests for teams the user does not follow.
`crestUrl` only exists on a Followable or a browsed DirectoryTeam; there
is no on-device team directory to look one up by name, so a competition
follow still has no badge to show. The fix is a `homeCrestUrl` on the
fixture from the functions layer (safe TSDB `strBadge`), not more
client-side guessing.

The hero watermark now prefers the crest over the sport emoji. A badge
says whose game this is; the emoji says only "football", which the
competition line already said.
