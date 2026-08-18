// The competition card (Prompt 27C revised, owner mockup).
//
// The title area is INFORMATION, not a button: crest, name, subtitle
// ("England · 20 teams" — what's behind Teams, said before it's
// tapped). Every action lives in the footer: three equal labelled
// segments divided by hairlines —
//
//     [ Fixtures ] [ Teams ] [ Follow ]
//
// Follow is the ONLY filled segment: one action, two destinations, and
// the fill is what separates them. Followed keeps the segment's weight
// but stops shouting — a light grey fill, never an outline. The first
// segment's word is per-sport (Fights, Matches, Tournaments…) via the
// same display-vocabulary module that handles regional terms. Teams
// GREYS OUT where a competition has none (FIBA, a boxing promotion)
// rather than disappearing: every card is the same shape, because the
// original complaint was that the same position meant different things
// down the list. Nothing is unlabelled, so nothing needs a chevron.

import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { GlyphTile } from '../../core/components';
import { radius, spacing, type, useTheme } from '../../core/tokens';
import type { TeamTheme } from '../../core/teamTheme';

export interface CompetitionCardProps {
  name: string;
  subtitle: string;
  theme: TeamTheme;
  monogram: string;
  crestUrl?: string;
  glyph: string;
  // The first segment's word — per-sport, occasionally per-row (a
  // tennis TOURNAMENT's contents are matches; the TOUR's are
  // tournaments).
  fixturesWord: string;
  onFixtures: () => void;
  // undefined → this competition has no teams to browse: the segment
  // stays, greyed, so the card keeps its shape.
  onTeams?: (() => void) | undefined;
  // undefined → not followable (NHL/MLB are served team-by-team): the
  // segment greys like Teams does, same rule, same reason.
  following?: boolean;
  onFollow?: (() => void) | undefined;
  busy?: boolean;
}

export function CompetitionCard(props: CompetitionCardProps) {
  const t = useTheme();
  const followable = props.onFollow !== undefined;
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: t.surface, borderColor: t.border },
      ]}
    >
      <View style={styles.title} accessible accessibilityRole="text">
        <GlyphTile
          glyph={props.glyph}
          theme={props.theme}
          monogram={props.monogram}
          size={48}
          {...(props.crestUrl ? { imageUrl: props.crestUrl } : {})}
        />
        <View style={{ flex: 1 }}>
          <Text
            style={[type.body, styles.name, { color: t.textPrimary }]}
            numberOfLines={2}
          >
            {props.name}
          </Text>
          <Text style={[type.secondary, { color: t.textSecondary }]} numberOfLines={1}>
            {props.subtitle}
          </Text>
        </View>
      </View>
      <View style={[styles.footer, { borderColor: t.border }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${props.name}: ${props.fixturesWord}`}
          onPress={props.onFixtures}
          style={({ pressed }) => [styles.segment, pressed && { opacity: 0.6 }]}
        >
          <Text
            style={[type.body, styles.segmentLabel, { color: t.primary }]}
            numberOfLines={1}
            maxFontSizeMultiplier={1.4}
          >
            {props.fixturesWord}
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            props.onTeams
              ? `Browse ${props.name} teams`
              : `${props.name} has no teams to browse`
          }
          accessibilityState={{ disabled: !props.onTeams }}
          disabled={!props.onTeams}
          onPress={props.onTeams}
          style={({ pressed }) => [
            styles.segment,
            styles.segmentDivided,
            { borderColor: t.border },
            pressed && { opacity: 0.6 },
          ]}
        >
          <Text
            style={[
              type.body,
              styles.segmentLabel,
              props.onTeams
                ? { color: t.primary }
                : { color: t.textSecondary, opacity: 0.5 },
            ]}
            numberOfLines={1}
            maxFontSizeMultiplier={1.4}
          >
            Teams
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            followable
              ? `${props.following ? 'Unfollow' : 'Follow'} ${props.name}`
              : `${props.name} is followed team by team`
          }
          accessibilityState={{
            disabled: !followable,
            ...(followable ? { selected: props.following === true } : {}),
          }}
          disabled={!followable || props.busy === true}
          onPress={props.onFollow}
          style={({ pressed }) => [
            styles.segment,
            styles.segmentDivided,
            { borderColor: t.border },
            // Followed = a light grey FILL, never an outline (27C): the
            // border grey is the palette's quiet step away from the card
            // surface in both modes — surfaceRaised is WHITE in light
            // mode, which read as no fill at all.
            followable &&
              (props.following
                ? { backgroundColor: t.border }
                : { backgroundColor: t.primary }),
            pressed && { opacity: 0.8 },
          ]}
        >
          {props.busy ? (
            <ActivityIndicator
              size="small"
              color={props.following || !followable ? t.primary : t.onPrimary}
            />
          ) : (
            <Text
              style={[
                type.body,
                styles.segmentLabel,
                !followable
                  ? { color: t.textSecondary, opacity: 0.5 }
                  : props.following
                    ? { color: t.textPrimary }
                    : { color: t.onPrimary },
              ]}
              numberOfLines={1}
              maxFontSizeMultiplier={1.4}
            >
              {!followable ? 'Follow' : props.following ? 'Following' : 'Follow'}
            </Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.card,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    marginHorizontal: spacing.l,
    marginBottom: spacing.m,
  },
  title: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.m,
    padding: spacing.l,
  },
  name: { fontWeight: '700', fontSize: 18 },
  footer: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  segment: {
    flex: 1,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xs,
  },
  segmentDivided: {
    borderLeftWidth: StyleSheet.hairlineWidth,
  },
  segmentLabel: { fontWeight: '600' },
});
