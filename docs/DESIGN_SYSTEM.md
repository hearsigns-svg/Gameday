# Gameday — Design System

First principle: clean, native, minimal friction. Platform conventions are
respected, not flattened — iOS feels iOS, Android feels Material.

## Semantic colour tokens

Brand-agnostic roles; every colour referenced by role, never by hex, from
`src/core/tokens`. Light and dark from day one.

| Role | Light | Dark |
|---|---|---|
| bg | #FFFFFF | #0B0F14 |
| surface | #F5F6F8 | #161B22 |
| surfaceRaised | #FFFFFF | #1D242E |
| textPrimary | #0B0F14 | #F2F5F8 |
| textSecondary | #5B6572 | #98A2AE |
| primary | #1463F3 | #4C8DFF |
| onPrimary | #FFFFFF | #06101F |
| accent | #0FA968 | #2ECC8F |
| danger | #D83A3A | #FF6B6B |
| border | #E3E6EA | #2A323D |

Sport identity appears only as small glyph/accent touches, never as
full-surface theming.

## Typography

Platform system fonts (SF Pro / Roboto). Scale (pt): display 32/bold,
title 24/semibold, heading 18/semibold, body 16/regular, secondary
14/regular, caption 12/regular. Dynamic Type / font scaling honoured —
layouts must survive 130% scaling.

## Spacing, shape, elevation

4-pt base scale: 4 / 8 / 12 / 16 / 24 / 32. Screen gutter 16. Radius:
cards 12, buttons 10, chips 8, sheets 16 top. Elevation: prefer hairline
borders (border token) over heavy shadows; one soft shadow level for
raised surfaces.

## Motion

150–250 ms, standard platform easing. Motion communicates state change
(sync running, fixture added), never decoration. Respect reduced-motion
settings.

## Components (canonical set)

Buttons (primary / secondary / destructive), list rows with chevron,
follow chips (sport-glyph + name + following-state), search field,
bottom sheets for options, empty states with a single next action,
sync-status pill (idle / syncing / error).

## Friction rules

- No sign-up to start. One calendar-permission prompt, primed with a
  plain-language explainer screen immediately before the OS dialog.
- Every screen has exactly one primary action.
- Follow = one tap; unfollow = one tap + no confirmation (undo toast
  instead).

## Accessibility

44-pt minimum targets; VoiceOver/TalkBack labels on all interactive
elements; contrast ≥ 4.5:1 for text (token pairs above comply); focus
order matches visual order; no information conveyed by colour alone.
