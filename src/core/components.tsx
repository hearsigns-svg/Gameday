// Canonical shared components (see DESIGN_SYSTEM.md). Tokens only —
// no raw hex, 44pt minimum targets, labels on every interactive element.
// Team/sport colour arrives here ONLY as a TeamTheme (never raw hex).

import { LinearGradient } from 'expo-linear-gradient';
import { ReactNode, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';
import { radius, spacing, type, useTheme } from './tokens';
import { TeamTheme } from './teamTheme';
import { countdownLabel, isDateOnly, timeLabel, whenLabel } from './when';

// ---------------------------------------------------------------------------
// Identity atoms

// RN Image cannot rasterise SVG; skip those crests and let the glyph
// fallback carry the identity (the fallback is the design).
export const usableCrest = (url: string | undefined): string | undefined =>
  url && !url.toLowerCase().split('?')[0].endsWith('.svg') ? url : undefined;

// Rounded-square sport/entity mark: quiet container tint + crest where
// the provider gives us one, glyph otherwise.
export function GlyphTile(props: {
  glyph: string;
  theme: TeamTheme;
  crestUrl?: string;
  size?: number;
}) {
  const size = props.size ?? 40;
  const [crestFailed, setCrestFailed] = useState(false);
  const crest = crestFailed ? undefined : usableCrest(props.crestUrl);
  return (
    <View
      accessible={false}
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.3,
        backgroundColor: props.theme.container,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {crest ? (
        <Image
          source={{ uri: crest }}
          resizeMode="contain"
          onError={() => setCrestFailed(true)} // broken art → glyph, never a blank tile
          style={{ width: size * 0.72, height: size * 0.72 }}
          accessible={false}
        />
      ) : (
        <Text style={{ fontSize: size * 0.5 }} accessible={false}>
          {props.glyph}
        </Text>
      )}
    </View>
  );
}

export function SectionHeader(props: { title: string; right?: ReactNode }) {
  const t = useTheme();
  return (
    <View style={styles.sectionHeader}>
      <Text
        accessibilityRole="header"
        style={[type.label, { color: t.textSecondary }]}
      >
        {props.title}
      </Text>
      {props.right}
    </View>
  );
}

export function CountdownBadge(props: {
  startUtc: string;
  theme: TeamTheme;
  dateOnly?: boolean;
}) {
  return (
    <View
      style={[
        styles.countdown,
        { backgroundColor: props.theme.onGradient },
      ]}
    >
      <Text style={[type.label, { color: props.theme.gradient[1] }]}>
        {countdownLabel(props.startUtc, props.dateOnly ?? false)}
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Hero: the one place the app goes loud. A dark poster surface derived
// from the entity's tone — dark is a content surface, not a theme.

export function HeroCard(props: {
  title: string;
  competition: string;
  startUtc: string;
  status: string;
  glyph: string;
  theme: TeamTheme;
  crestUrl?: string;
  // Venue photograph layer (docs/IMAGERY.md): the photo renders
  // UNMODIFIED in its own layer — the gradient scrim and type are
  // separate overlays (baking a composite would create a ShareAlike
  // adaptation) — and the credit line is a licence condition.
  photoUrl?: string;
  photoCredit?: string;
  style?: StyleProp<ViewStyle>; // carousel overrides width/margins
}) {
  const th = props.theme;
  const crest = usableCrest(props.crestUrl);
  const [photoFailed, setPhotoFailed] = useState(false);
  const photo = photoFailed ? undefined : props.photoUrl;
  const dateOnly = isDateOnly(props.status);
  const when = `${whenLabel(props.startUtc, dateOnly)} · ${timeLabel(props.startUtc, props.status)}`;
  return (
    <View
      accessible
      accessibilityLabel={`Next up: ${props.title}, ${when}`}
      style={[styles.heroShadow, props.style]}
    >
      {photo ? (
        <Image
          source={{ uri: photo }}
          resizeMode="cover"
          onError={() => setPhotoFailed(true)}
          style={styles.heroPhoto}
          accessible={false}
        />
      ) : null}
      <LinearGradient
        colors={th.gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        // Scrim is a SIBLING layer: opacity on a parent would dim the
        // type as well. Full-strength poster when there is no photo.
        style={[styles.heroFill, photo ? styles.heroScrim : null]}
      />
      <View style={styles.hero}>
        <Text style={styles.heroWatermark} accessible={false}>
          {props.glyph}
        </Text>
        <View style={styles.heroTop}>
          {crest ? (
            <Image
              source={{ uri: crest }}
              resizeMode="contain"
              style={{ width: 28, height: 28 }}
              accessible={false}
            />
          ) : null}
          <Text
            style={[type.label, { color: th.onGradient, opacity: 0.85, flex: 1 }]}
            numberOfLines={1}
          >
            {props.competition}
          </Text>
          <CountdownBadge startUtc={props.startUtc} theme={th} dateOnly={dateOnly} />
        </View>
        <View style={{ flex: 1 }} />
        <Text
          style={[type.hero, { color: th.onGradient }]}
          numberOfLines={2}
          adjustsFontSizeToFit
          minimumFontScale={0.7}
        >
          {props.title}
        </Text>
        <Text
          style={[
            type.secondary,
            { color: th.onGradient, opacity: 0.85, marginTop: spacing.xs },
          ]}
        >
          {when}
        </Text>
        {photo && props.photoCredit ? (
          <Text
            style={[type.caption, styles.heroCredit, { color: th.onGradient }]}
            numberOfLines={1}
          >
            {props.photoCredit}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Rows

export function EventRow(props: {
  title: string;
  caption: string;
  timeText: string;
  glyph: string;
  theme: TeamTheme;
  crestUrl?: string;
  tbc?: boolean;
  // Per-event opt-out: greyed-but-visible with a restore affordance —
  // a removed event must never just vanish (owner ruling).
  excluded?: boolean;
  onToggleExcluded?: () => void;
  // Per-event opt-IN: add ONE fixture without following anything.
  pinned?: boolean;
  onTogglePinned?: () => void;
  // Licence-gated photo of a participant NAMED in this fixture
  // (combat sports). Identifies who is fighting; credited on the
  // Photo credits screen, never used as decoration elsewhere.
  participantPhotoUrl?: string;
}) {
  const t = useTheme();
  const dimmed = props.excluded === true;
  return (
    <View
      accessible
      accessibilityLabel={`${props.title}, ${props.caption}, ${
        dimmed ? 'removed from calendar' : props.timeText
      }`}
      style={[styles.eventRow, { borderColor: t.border }]}
    >
      <View style={[{ flexDirection: 'row', alignItems: 'center', gap: spacing.m, flex: 1 }, dimmed && { opacity: 0.4 }]}>
        <GlyphTile
          glyph={props.glyph}
          theme={props.theme}
          crestUrl={props.participantPhotoUrl ?? props.crestUrl}
        />
        <View style={{ flex: 1 }}>
          <Text
            style={[type.body, { color: t.textPrimary, fontWeight: '600' }]}
            numberOfLines={1}
          >
            {props.title}
          </Text>
          <Text
            style={[type.caption, { color: t.textSecondary, marginTop: 2 }]}
            numberOfLines={1}
          >
            {dimmed ? 'Removed — not in your calendar' : props.caption}
          </Text>
        </View>
        <Text
          style={[
            type.secondary,
            props.tbc || dimmed
              ? { color: t.textSecondary, fontStyle: 'italic' }
              : { color: t.textPrimary, fontWeight: '600' },
          ]}
        >
          {props.timeText}
        </Text>
      </View>
      {props.onTogglePinned ? (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ selected: props.pinned === true }}
          accessibilityLabel={
            props.pinned
              ? `Remove ${props.title} from your calendar`
              : `Add ${props.title} to your calendar`
          }
          onPress={props.onTogglePinned}
          hitSlop={8}
          style={styles.excludeButton}
        >
          <Text
            style={[
              type.heading,
              { color: props.pinned ? t.accent : t.primary },
            ]}
            accessible={false}
          >
            {props.pinned ? '✓' : '+'}
          </Text>
        </Pressable>
      ) : null}
      {props.onToggleExcluded ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            dimmed
              ? `Restore ${props.title} to your calendar`
              : `Remove ${props.title} from your calendar`
          }
          onPress={props.onToggleExcluded}
          hitSlop={8}
          style={styles.excludeButton}
        >
          <Text
            style={[
              type.heading,
              { color: dimmed ? t.accent : t.textSecondary },
            ]}
            accessible={false}
          >
            {dimmed ? '↩' : '×'}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function ListRow(props: {
  title: string;
  caption?: string;
  glyph?: string;
  tileTheme?: TeamTheme; // when present the glyph renders in a GlyphTile
  crestUrl?: string;
  right?: ReactNode;
  onPress?: () => void;
  accessibilityLabel: string;
  disabled?: boolean;
}) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole={props.onPress ? 'button' : undefined}
      // A row without onPress is a passive container, NOT a disabled
      // control — marking it disabled makes VoiceOver skip the Follow
      // button inside it.
      accessibilityLabel={props.onPress ? props.accessibilityLabel : undefined}
      onPress={props.onPress}
      disabled={props.disabled === true}
      style={({ pressed }) => [
        styles.row,
        { borderColor: t.border, opacity: props.disabled ? 0.45 : 1 },
        pressed && props.onPress && { backgroundColor: t.surface },
      ]}
    >
      {props.glyph ? (
        props.tileTheme ? (
          <GlyphTile
            glyph={props.glyph}
            theme={props.tileTheme}
            crestUrl={props.crestUrl}
          />
        ) : (
          <Text style={[type.heading, styles.glyph]} accessible={false}>
            {props.glyph}
          </Text>
        )
      ) : null}
      <View style={{ flex: 1 }}>
        <Text style={[type.body, { color: t.textPrimary }]}>{props.title}</Text>
        {props.caption ? (
          <Text style={[type.caption, { color: t.textSecondary }]}>
            {props.caption}
          </Text>
        ) : null}
      </View>
      {props.right}
    </Pressable>
  );
}

// Carousel page indicator — passive; the cards themselves are the
// swipe surface. Never auto-advances (ten-rules brief).
export function CarouselDots(props: { count: number; active: number }) {
  const t = useTheme();
  if (props.count < 2) return null;
  return (
    <View style={styles.dots} accessible={false}>
      {Array.from({ length: props.count }, (_, i) => (
        <View
          key={i}
          style={[
            styles.dot,
            { backgroundColor: i === props.active ? t.primary : t.border },
          ]}
        />
      ))}
    </View>
  );
}

// Sport entry card (2-per-row grid on Home). Every card NAVIGATES —
// following always happens on a visible Follow button inside, never as
// a hidden tap side-effect (owner ruling: no invisible affordances).
export function SportCard(props: {
  label: string;
  glyph: string;
  theme: TeamTheme;
  caption: string;
  captionAccent?: boolean;
  onPress: () => void;
  accessibilityLabel: string;
}) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={props.accessibilityLabel}
      onPress={props.onPress}
      style={({ pressed }) => [
        styles.sportCard,
        { backgroundColor: t.surfaceRaised, borderColor: t.border },
        pressed && { backgroundColor: t.surface },
      ]}
    >
      <GlyphTile glyph={props.glyph} theme={props.theme} size={36} />
      <View style={{ flex: 1 }}>
        <Text
          style={[type.secondary, { color: t.textPrimary, fontWeight: '600' }]}
          numberOfLines={1}
        >
          {props.label}
        </Text>
        <Text
          style={[
            type.caption,
            { color: props.captionAccent ? t.accent : t.textSecondary },
          ]}
          numberOfLines={1}
        >
          {props.caption}
        </Text>
      </View>
      <Text style={[type.body, { color: t.textSecondary }]} accessible={false}>
        ›
      </Text>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Sport pills: browse entry points. Series sports follow straight from
// the pill (one-tap follow, filled when following).

export function SportPill(props: {
  label: string;
  glyph: string;
  theme: TeamTheme;
  following?: boolean;
  busy?: boolean;
  onPress: () => void;
  accessibilityLabel: string;
}) {
  const t = useTheme();
  const filled = props.following === true;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={props.accessibilityLabel}
      accessibilityState={{
        ...(filled ? { selected: true } : {}),
        ...(props.busy ? { busy: true } : {}),
      }}
      onPress={props.onPress}
      disabled={props.busy}
      style={({ pressed }) => [
        styles.pillButton,
        filled
          ? { backgroundColor: props.theme.accent, borderColor: props.theme.accent }
          : {
              backgroundColor: t.surfaceRaised,
              borderColor: t.border,
            },
        (pressed || props.busy) && { opacity: 0.7 },
      ]}
    >
      <Text style={{ fontSize: 16 }} accessible={false}>
        {props.glyph}
      </Text>
      <Text
        style={[
          type.secondary,
          {
            fontWeight: '600',
            color: filled ? props.theme.onAccent : t.textPrimary,
          },
        ]}
      >
        {props.label}
      </Text>
      {filled ? (
        <Text style={[type.secondary, { color: props.theme.onAccent }]}>✓</Text>
      ) : null}
    </Pressable>
  );
}

export function FollowButton(props: {
  following: boolean;
  subject: string;
  onPress: () => void;
  busy?: boolean;
  label?: string; // e.g. 'Follow all' on competition rows
}) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        props.following ? `Unfollow ${props.subject}` : `Follow ${props.subject}`
      }
      onPress={props.onPress}
      disabled={props.busy}
      style={[
        styles.followButton,
        props.following
          ? { backgroundColor: 'transparent', borderColor: t.border }
          : { backgroundColor: t.primary, borderColor: t.primary },
      ]}
    >
      {props.busy ? (
        <ActivityIndicator
          size="small"
          color={props.following ? t.textPrimary : t.onPrimary}
        />
      ) : (
        <Text
          style={[
            type.secondary,
            {
              color: props.following ? t.textPrimary : t.onPrimary,
              fontWeight: '600',
            },
          ]}
        >
          {props.following ? 'Following' : (props.label ?? 'Follow')}
        </Text>
      )}
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Status: one chip that speaks like a person, not a diff.

function relative(atIso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(atIso).getTime()) / 60_000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return hours === 1 ? '1 hour ago' : `${hours} hours ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? 'yesterday' : `${days} days ago`;
}

export function SyncStatusChip(props: {
  running: boolean;
  lastAt: string | null;
  changed: number; // created + updated + deleted on the last run
  error?: string | null;
  calendarOff?: boolean; // fixtures fresh, calendar not opted in
}) {
  const t = useTheme();
  let text: string;
  if (props.running)
    text = props.calendarOff ? 'Checking for fixtures…' : 'Updating your calendar…';
  else if (props.error) text = props.error;
  else if (props.calendarOff)
    text =
      props.lastAt === null
        ? 'Calendar sync is off'
        : 'Fixtures up to date · calendar off';
  else if (props.lastAt === null) text = 'Not synced yet';
  else if (props.changed > 0)
    text = `Calendar updated · ${props.changed} ${props.changed === 1 ? 'change' : 'changes'} · ${relative(props.lastAt)}`;
  else text = `Calendar up to date · checked ${relative(props.lastAt)}`;
  return (
    <View
      accessibilityLiveRegion="polite"
      style={[
        styles.statusChip,
        { backgroundColor: t.surface, borderColor: t.border },
      ]}
    >
      {props.running ? (
        <ActivityIndicator size="small" color={t.primary} />
      ) : (
        <Text
          style={[
            type.caption,
            { color: props.error ? t.danger : t.accent, fontWeight: '700' },
          ]}
          accessible={false}
        >
          {props.error ? '!' : '✓'}
        </Text>
      )}
      <Text style={[type.caption, { color: t.textSecondary, flexShrink: 1 }]}>
        {text}
      </Text>
    </View>
  );
}

// Calendar-off banner: the standing, non-nagging path back to the
// primed calendar ask. Rendered only while follows exist and the user
// hasn't opted in.
export function CalendarOffBanner(props: {
  fixtureCount: number;
  onEnable: () => void;
}) {
  const t = useTheme();
  return (
    <View
      style={[
        styles.banner,
        { backgroundColor: t.surfaceRaised, borderColor: t.border },
      ]}
    >
      <View style={{ flex: 1 }}>
        {/* "Sync is off" is true in every reachable state — after a
            reinstall, events may in fact still BE in the calendar. */}
        <Text style={[type.body, { color: t.textPrimary, fontWeight: '600' }]}>
          Calendar sync is off
        </Text>
        <Text style={[type.caption, { color: t.textSecondary, marginTop: 2 }]}>
          {props.fixtureCount > 0
            ? `${props.fixtureCount} fixture${props.fixtureCount === 1 ? '' : 's'} ready to add`
            : 'Fixtures will be added once you connect your calendar'}
        </Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Add fixtures to my calendar"
        onPress={props.onEnable}
        style={[styles.bannerCta, { backgroundColor: t.primary }]}
      >
        <Text style={[type.secondary, { color: t.onPrimary, fontWeight: '600' }]}>
          Add
        </Text>
      </Pressable>
    </View>
  );
}

export function EmptyState(props: {
  headline: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const t = useTheme();
  return (
    <View style={styles.empty}>
      <Text style={[type.title, { color: t.textPrimary, textAlign: 'center' }]}>
        {props.headline}
      </Text>
      <Text
        style={[
          type.body,
          {
            color: t.textSecondary,
            textAlign: 'center',
            marginTop: spacing.s,
          },
        ]}
      >
        {props.body}
      </Text>
      {props.actionLabel && props.onAction ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={props.actionLabel}
          onPress={props.onAction}
          style={[styles.primaryAction, { backgroundColor: t.primary }]}
        >
          <Text style={[type.body, { color: t.onPrimary, fontWeight: '600' }]}>
            {props.actionLabel}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.l,
    paddingTop: spacing.xl,
    paddingBottom: spacing.s,
  },
  countdown: {
    paddingHorizontal: spacing.m,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
  },
  heroShadow: {
    marginHorizontal: spacing.l,
    borderRadius: radius.hero,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 5,
  },
  hero: {
    borderRadius: radius.hero,
    minHeight: 180,
    padding: spacing.l,
    overflow: 'hidden',
  },
  heroPhoto: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: radius.hero,
  },
  heroFill: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: radius.hero,
  },
  heroScrim: { opacity: 0.82 },
  heroCredit: {
    position: 'absolute',
    right: spacing.m,
    top: spacing.m + 32, // clear of the label/countdown row
    opacity: 0.6,
    fontSize: 10,
  },
  heroWatermark: {
    position: 'absolute',
    right: -18,
    bottom: -22,
    fontSize: 130,
    opacity: 0.12,
  },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.m },
  eventRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.m,
    paddingVertical: spacing.m,
    paddingHorizontal: spacing.l,
    borderBottomWidth: StyleSheet.hairlineWidth,
    minHeight: 60,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.m,
    paddingHorizontal: spacing.l,
    borderBottomWidth: StyleSheet.hairlineWidth,
    minHeight: 56,
    gap: spacing.m,
  },
  glyph: { width: 32, textAlign: 'center' },
  pillButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s,
    paddingHorizontal: spacing.l,
    minHeight: 44,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  followButton: {
    paddingHorizontal: spacing.l,
    borderRadius: radius.button,
    borderWidth: 1,
    minHeight: 44,
    minWidth: 104,
    alignItems: 'center',
    justifyContent: 'center',
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.l,
    marginHorizontal: spacing.l,
    marginTop: spacing.l,
    paddingHorizontal: spacing.l,
    paddingVertical: spacing.m,
    borderRadius: radius.card,
    borderWidth: StyleSheet.hairlineWidth,
  },
  bannerCta: {
    minHeight: 44,
    paddingHorizontal: spacing.l,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  excludeButton: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.s,
    marginTop: spacing.m,
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
  sportCard: {
    flexBasis: '46%',
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.m,
    minHeight: 64,
    paddingHorizontal: spacing.m,
    paddingVertical: spacing.m,
    borderRadius: radius.card,
    borderWidth: StyleSheet.hairlineWidth,
  },
  statusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s,
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.m,
    paddingVertical: spacing.s,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  empty: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    paddingTop: spacing.xxl,
  },
  primaryAction: {
    marginTop: spacing.xl,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.m,
    borderRadius: radius.button,
    minHeight: 44,
    justifyContent: 'center',
  },
});
