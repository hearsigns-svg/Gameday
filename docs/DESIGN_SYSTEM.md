# Gameday — Design System

Governing principle: **the app provides the gallery; the user's
favourites provide the identity.** The interface is a neutral warm shell;
crests, colour and fixtures are the art. The app never competes with the
content. This principle settles arguments before they happen.

## The ten rules

1. **Neutral shell, expressive content.** Warm-white gallery (light) /
   warm graphite (dark); identity comes from followed content.
2. **One brand accent; team colour is scoped.** Team/sport colour appears
   only inside content that belongs to that entity — hero surfaces,
   glyph tiles, follow/selected states. App chrome (nav, primary buttons,
   links) always uses the single brand accent (`primary`).
3. **No raw team hex, ever.** Brand colour is data. Every colour that
   reaches a UI slot passes through `teamTheme()` (src/core/teamTheme.ts),
   which tone-maps in OKLCH to accessible variants per surface. Its
   contrast guarantees are pinned by unit tests (worst cases: pure white,
   yellow, sky blue, near-black, no colour).
4. **Dark is a content surface, not a theme.** Hero posters are dark and
   dramatic inside the light shell; the whole app also ships a proper
   dark appearance (token swap, not redesign).
5. **One type family.** Platform system fonts (SF Pro / Roboto) are the
   family; hierarchy from weight, size, and case. A display cut is added
   only if the brand ever demands it.
6. **One geometry.** Single radius scale + one pill shape (tokens).
   Hairline borders preferred; one soft shadow level, used only on heroes.
7. **Three tabs, three jobs.** Home (hero + next up + sport pills),
   Following (manage follows), Schedule (what Gameday manages, with sync
   status). Browse and Preferences push over the tabs. Resist
   News/Video/Community forever — different product.
8. **Onboarding is choosing favourites, not configuring software.**
   No account. One primary action per screen. Calendar permission is
   primed in plain language and skippable — re-asked in context.
9. **Motion only where it means something.** Follow, sync completion,
   hero transitions. Durations from `motion` tokens (120/200/300 ms),
   standard platform easing, full reduced-motion support.
10. **The fallback is the design.** Glyph/crest + tone-derived gradient +
    confident typography must look intentionally good. Photography and
    crest artwork are upgrades, never dependencies — "no colour" is a
    first-class identity, not an error state.

## Semantic colour tokens

Brand-agnostic roles from `src/core/tokens`; never raw hex in components.

| Role | Light | Dark |
|---|---|---|
| bg | #FBFAF8 | #121110 |
| surface | #F3F2EF | #1C1B19 |
| surfaceRaised | #FFFFFF | #242220 |
| textPrimary | #171512 | #F5F3F0 |
| textSecondary | #5F5B54 | #A5A099 |
| primary | #1463F3 | #4C8DFF |
| onPrimary | #FFFFFF | #06101F |
| accent | #0B7A4B | #2ECC8F |
| danger | #C22A2A | #FF6B6B |
| border | #E7E5E0 | #32302C |

### Team colour slots (derived, never stored)

`teamTheme(brandColour, mode)` returns `accent / onAccent / container /
onContainer / gradient / onGradient`, each guaranteed ≥4.5:1 against the
surface it targets. Sport hues live in `sportsConfig` as data and are the
fallback identity for entities without a brand colour (the median case).

## Typography

Platform system fonts. Scale (pt): display 32/bold, hero 28/800 (event
titles on posters), title 24/semibold, heading 18/semibold, body
16/regular, secondary 14/regular, caption 12/regular, label 12/700
uppercase +0.8 tracking (section headers). Dynamic Type honoured —
layouts must survive 130% scaling.

## Spacing, shape, elevation

4-pt base scale: 4 / 8 / 12 / 16 / 24 / 32. Screen gutter 16. Radius:
chips 8, buttons 10, cards 12, sheets 16 top, hero 20, pill 999.
Hairline borders over shadows; the hero carries the one soft shadow.

## Component inventory (canonical, keep it small)

HeroCard · EventRow · ListRow · GlyphTile · SportPill · FollowButton ·
SectionHeader · SyncStatusChip · CountdownBadge · EmptyState · search
field. Every screen is a composition of these. A screen that seems to
need a new component is a screen to question first.

## Voice

The app speaks like a person, not a diff. "Calendar up to date · checked
5 min ago", never "0 added · 0 updated · 0 removed". Honest unglamorous
states are part of the product's trust promise: off-season ("no upcoming
fixtures yet"), TBC times ("Time TBC", italic), postponements, permission
revoked, offline — every one specified, none left to chance.

## Friction rules

- No sign-up to start. One calendar-permission prompt, primed with a
  plain-language explainer immediately before the OS dialog.
- Every screen has exactly one primary action.
- Follow = one tap; unfollow = one tap + undo toast, no confirmation.
- Manage-follows lives on Following; Home never risks a mis-tap unfollow.

## Accessibility

44-pt minimum targets; VoiceOver/TalkBack labels on all interactive
elements; contrast ≥4.5:1 for text — enforced in CI for every derived
team colour via the teamTheme test suite; focus order matches visual
order; no information conveyed by colour alone; reduced-motion disables
all meaning-free motion.

## Platform split

Shared: tokens, component look, iconography, copy. Native per platform:
navigation transitions, sheets, haptics, pickers, text-scaling.
Consistent must never mean identical.
