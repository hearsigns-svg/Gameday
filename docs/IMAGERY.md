# Hero imagery — sources, licensing, and what we may actually ship

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

**Safe TSDB fields**: `strBadge`, `strLogo`, event `strThumb` /
`strPoster` — used unmodified, credited to TSDB with a link back.

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
