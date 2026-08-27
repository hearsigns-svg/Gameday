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
// Interaction: a competition with NO sub-levels navigates on tap like
// any team card. One WITH sub-levels (tournaments and/or teams) expands
// IN PLACE instead, revealing only the destinations that apply, and
// collapses on a second tap. The expansion grows out of the card and
// carries its style (house standard) — the buttons live inside the
// card's own border.

import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { FollowButton, SportCard, TileRow } from '../../core/components';
import { spacing, type, useTheme } from '../../core/tokens';
import type { TeamTheme } from '../../core/teamTheme';

export interface CompetitionCardProps {
  name: string;
  caption: string;
  theme: TeamTheme;
  monogram: string;
  crestUrl?: string;
  glyph: string;
  // No sub-levels → tap navigates here, exactly as a team card does.
  onOpen: () => void;
  // Sub-level destinations. Presence is what makes the card EXPAND on
  // tap instead of navigating; only the ones passed are offered.
  onTournaments?: (() => void) | undefined;
  onTeams?: (() => void) | undefined;
  // undefined → not followable (NHL/MLB are served team-by-team): the
  // card simply renders without a control, the way a Players row does —
  // the greyed placeholder was the segmented design's shape rule, and
  // this language never needed it.
  following?: boolean;
  onFollow?: (() => void) | undefined;
  busy?: boolean;
}

export function CompetitionCard(props: CompetitionCardProps) {
  const t = useTheme();
  const [expanded, setExpanded] = useState(false);
  const destinations = [
    ...(props.onTournaments
      ? [{ label: 'Tournaments', onPress: props.onTournaments }]
      : []),
    ...(props.onTeams ? [{ label: 'Teams', onPress: props.onTeams }] : []),
  ];
  const expandable = destinations.length > 0;
  return (
    <TileRow
      right={
        props.onFollow ? (
          <FollowButton
            following={props.following === true}
            subject={props.name}
            busy={props.busy === true}
            onPress={props.onFollow}
          />
        ) : undefined
      }
    >
      <SportCard
        fullWidth
        label={props.name}
        caption={props.caption}
        glyph={props.glyph}
        theme={props.theme}
        monogram={props.monogram}
        {...(props.crestUrl ? { imageUrl: props.crestUrl } : {})}
        accessibilityLabel={
          expandable
            ? `${props.name}, ${props.caption}`
            : `${props.name}, view fixtures`
        }
        {...(expandable ? { accessibilityExpanded: expanded } : {})}
        onPress={expandable ? () => setExpanded((v) => !v) : props.onOpen}
        expansion={
          expanded ? (
            <View style={[styles.destinations, { borderColor: t.border }]}>
              {destinations.map((d, i) => (
                <Pressable
                  key={d.label}
                  accessibilityRole="button"
                  accessibilityLabel={`${props.name} ${d.label.toLowerCase()}`}
                  onPress={d.onPress}
                  style={({ pressed }) => [
                    styles.destination,
                    i > 0 && [styles.destinationDivided, { borderColor: t.border }],
                    pressed && { opacity: 0.6 },
                  ]}
                >
                  <Text
                    style={[type.secondary, { color: t.primary, fontWeight: '600' }]}
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
