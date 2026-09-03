// The competition card, RETURNED to the original card language (Stage 6
// of the consolidation brief — an intentional reversal of 27C's
// segmented-footer design, owner ruling, not drift).
//
// At rest it IS a player/team card: the same tile, the same Follow
// button in the same place — because two card languages side by side on
// one screen (the Tennis screenshot: Players in one language, ATP Tour
// in another) was exactly the divergence the reversal ends. Follow acts
// on the whole competition, reads Follow/Following as text, and never
// expands or navigates anything.
//
// Interaction (owner ruling on the flagged Fixtures gap): a competition
// with NO teams navigates straight to its content on tap — the ATP Tour
// opens its tournament list, a tournament its matches — like any team
// card. One WITH teams expands IN PLACE to exactly TWO destinations,
// [Fixtures-word | Teams], and collapses on a second tap; that pairing
// is what keeps the fixtures page reachable for team leagues. The
// expansion grows out of the card and carries its style (house
// standard) — the buttons live inside the card's own border.

import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  COMPETITION_ROW_HEIGHT,
  FollowButton,
  SportCard,
  TileRow,
} from '../../core/components';
import { t } from '../../core/i18n';
import { spacing, type, useTheme } from '../../core/tokens';
import type { TeamTheme } from '../../core/teamTheme';

export interface CompetitionCardProps {
  name: string;
  caption: string;
  theme: TeamTheme;
  monogram: string;
  crestUrl?: string;
  // Per-mark tile fill behind crestUrl (Round 6 tile prep).
  tileFill?: string;
  glyph: string;
  // The competition's own content: its fixtures page, or for a tennis
  // tour its tournament list. No teams → tap lands here directly;
  // teams → this is the expansion's first button.
  onOpen: () => void;
  // The first button's word, per-sport (Fixtures/Fights/Matches/
  // Tournaments) — the same display vocabulary the segmented card used.
  fixturesWord?: string;
  // Teams list. Presence is what makes the card EXPAND on tap.
  onTeams?: (() => void) | undefined;
  // REQUIRED, deliberately (Stage 6 addendum, owner ruling): every
  // competition card carries the Follow control as its text state pair,
  // present and operable in both rest and expanded states. Making these
  // optional is how MLB and NHL shipped buttonless — the full-width
  // no-affordance layout is now impossible by construction.
  following: boolean;
  onFollow: () => void;
  busy?: boolean;
  // The competition badge's extracted colour pair (Round 3) — the
  // follow burst's discrete palette.
  burstColours?: readonly string[];
  // NAMED destinations override the [Fixtures-word | Teams] pair
  // (Round 3 B6: the Olympics season cards expand to [Sports | Games]).
  // Same expansion, same geometry — only the words and targets differ.
  destinations?: ReadonlyArray<{ label: string; onPress: () => void }>;
  // ONE-OPEN (Round 6 item 3): a list that passes these owns the
  // expansion — expanding one card collapses any other in the same list,
  // an instant switch. Omitted, the card keeps its own state.
  expanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
  // Round 7 item 5: an EMOJI-STYLE tile — the glyph IS the mark and no
  // monogram is drawn (an Olympic sport's emoji).
  emoji?: boolean;
}

export function CompetitionCard(props: CompetitionCardProps) {
  // `ui`, not `t`: the catalog's `t()` is imported above, and a theme
  // binding named `t` would shadow it in every string below.
  const ui = useTheme();
  const [ownExpanded, setOwnExpanded] = useState(false);
  const controlled = props.expanded !== undefined;
  const expanded = controlled ? (props.expanded as boolean) : ownExpanded;
  const setExpanded = (next: boolean) => {
    if (controlled) props.onExpandedChange?.(next);
    else setOwnExpanded(next);
  };
  const expandable =
    props.onTeams !== undefined || props.destinations !== undefined;
  const destinations =
    props.destinations ??
    (props.onTeams
      ? [
          { label: props.fixturesWord ?? t('core.fixtures'), onPress: props.onOpen },
          { label: t('core.teams'), onPress: props.onTeams },
        ]
      : []);
  return (
    <TileRow
      right={
        <FollowButton
          theme={props.theme}
          {...(props.burstColours ? { burstColours: props.burstColours } : {})}
          following={props.following}
          subject={props.name}
          busy={props.busy === true}
          onPress={props.onFollow}
        />
      }
    >
      <SportCard
        fullWidth
        rowHeight={COMPETITION_ROW_HEIGHT}
        label={props.name}
        caption={props.caption}
        glyph={props.glyph}
        theme={props.theme}
        {...(props.emoji ? {} : { monogram: props.monogram })}
        {...(props.crestUrl ? { imageUrl: props.crestUrl } : {})}
        {...(props.tileFill ? { tileFill: props.tileFill } : {})}
        accessibilityLabel={
          expandable
            ? t('follows.card.a11ySummary', {
                name: props.name,
                caption: props.caption,
              })
            : t('follows.card.a11yViewFixtures', { name: props.name })
        }
        {...(expandable ? { accessibilityExpanded: expanded } : {})}
        onPress={expandable ? () => setExpanded(!expanded) : props.onOpen}
        expansion={
          expanded ? (
            <View style={[styles.destinations, { borderColor: ui.border }]}>
              {destinations.map((d, i) => (
                <Pressable
                  key={d.label}
                  accessibilityRole="button"
                  accessibilityLabel={t('follows.card.a11yDestination', {
                    name: props.name,
                    label: d.label.toLowerCase(),
                  })}
                  onPress={d.onPress}
                  style={({ pressed }) => [
                    styles.destination,
                    i > 0 && [styles.destinationDivided, { borderColor: ui.border }],
                    pressed && { opacity: 0.6 },
                  ]}
                >
                  <Text
                    style={[type.secondary, { color: ui.primary, fontWeight: '600' }]}
                    numberOfLines={1}
                    maxFontSizeMultiplier={1.4}
                  >
                    {d.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          ) : undefined
        }
      />
    </TileRow>
  );
}

const styles = StyleSheet.create({
  destinations: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  destination: {
    flex: 1,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xs,
  },
  destinationDivided: {
    borderLeftWidth: StyleSheet.hairlineWidth,
  },
});
