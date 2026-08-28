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
}

export function CompetitionCard(props: CompetitionCardProps) {
  const t = useTheme();
  const [expanded, setExpanded] = useState(false);
  const expandable = props.onTeams !== undefined;
  const destinations = props.onTeams
    ? [
        { label: props.fixturesWord ?? 'Fixtures', onPress: props.onOpen },
        { label: 'Teams', onPress: props.onTeams },
      ]
    : [];
  return (
    <TileRow
      right={
        <FollowButton
          theme={props.theme}
          following={props.following}
          subject={props.name}
          busy={props.busy === true}
          onPress={props.onFollow}
        />
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
