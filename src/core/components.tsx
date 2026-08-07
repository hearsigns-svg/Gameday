// Canonical shared components (see DESIGN_SYSTEM.md). Tokens only —
// no raw hex, 44pt minimum targets, labels on every interactive element.
// Team/sport colour arrives here ONLY as a TeamTheme (never raw hex).

import { LinearGradient } from 'expo-linear-gradient';
import { ReactNode, useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Animated,
  Image,
  Pressable,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';
import { SportPattern } from './sportPattern';
import { motion, radius as radiusTokens, spacing, type, useTheme } from './tokens';
const radius = radiusTokens;
import { TeamTheme } from './teamTheme';
import { countdownLabel, isDateOnly, timeLabel, whenLabel } from './when';

// ---------------------------------------------------------------------------
// Identity atoms

// RN Image cannot rasterise SVG; skip those (photo URLs may carry
// query strings — strip before testing the extension).
export const usableImage = (url: string | undefined): string | undefined =>
  url && !url.toLowerCase().split('?')[0].endsWith('.svg') ? url : undefined;

// A typographic monogram: the entity's initials, the generated
// identity mark that replaced crests (Prompt 9b — badges are the
// clubs' trademarks; type and palette are ours). Two significant
// words → two initials; one word → its first two letters.
export function monogramOf(label: string): string {
  const words = label.trim().split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w));
  if (words.length === 0) return '·';
  const letterOf = (w: string) =>
    [...w].find((c) => /[\p{L}\p{N}]/u.test(c)) ?? '';
  if (words.length === 1) {
    const w = [...words[0]].filter((c) => /[\p{L}\p{N}]/u.test(c));
    return (w[0] ?? '·').toUpperCase() + (w[1] ?? '').toUpperCase();
  }
  return (letterOf(words[0]) + letterOf(words[1])).toUpperCase();
}

// Rounded-square entity mark: quiet container tint + a licensed photo
// where one exists (athlete portraits), a MONOGRAM for entities, the
// sport glyph only where the mark stands for the SPORT itself — the
// emoji stopped being an entity fallback in Prompt 9b.
export function GlyphTile(props: {
  glyph: string;
  theme: TeamTheme;
  // Entity initials — when present, the tile renders these rather than
  // the glyph. The glyph remains the mark for SPORT rows only.
  monogram?: string;
  // Artwork for this entity: a club crest, a competition logo (both
  // RESTORED in Prompt 13), or a licence-gated athlete photo. Whatever
  // it is, it sits ABOVE the generated treatment in the chain and the
  // treatment still renders underneath — so a broken or absent image
  // degrades to the monogram, never to a blank tile.
  imageUrl?: string;
  size?: number;
  // Circular: reserved for marks that stand for a TEAM OR PERSON rather
  // than an event, so the two never read as the same kind of thing.
  round?: boolean;
  // A small mark in the corner — today, an athlete's flag (Prompt 16 B).
  // It sits ON the tile rather than in the caption because within a
  // weight class every fighter now shares one division tone, and the
  // flag is what distinguishes them.
  badge?: string;
}) {
  const size = props.size ?? 40;
  const [imageFailed, setImageFailed] = useState(false);
  const image = imageFailed ? undefined : usableImage(props.imageUrl);
  return (
    <View
      accessible={false}
      style={{
        width: size,
        height: size,
        borderRadius: props.round ? size / 2 : size * 0.3,
        backgroundColor: props.theme.container,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {image ? (
        <Image
          source={{ uri: image }}
          resizeMode="contain"
          onError={() => setImageFailed(true)} // broken art → mark, never a blank tile
          style={{ width: size * 0.72, height: size * 0.72 }}
          accessible={false}
        />
      ) : props.monogram ? (
        <Text
          style={{
            fontSize: size * 0.34,
            fontWeight: '700',
            letterSpacing: 0.5,
            color: props.theme.onContainer,
          }}
          accessible={false}
        >
          {props.monogram}
        </Text>
      ) : (
        <Text style={{ fontSize: size * 0.5 }} accessible={false}>
          {props.glyph}
        </Text>
      )}
      {props.badge ? (
        <Text
          accessible={false}
          style={{
            position: 'absolute',
            right: -2,
            bottom: -2,
            fontSize: size * 0.36,
          }}
        >
          {props.badge}
        </Text>
      ) : null}
    </View>
  );
}

// Who you follow, as a rail. Home's carousel answers a TIME question —
// when is the next thing? — and this answers an IDENTITY one: whose
// schedule can I open? Asking both is what stops the second section
// being a smaller copy of the first, which is exactly what "Next up"
// was (slice(0,n) and slice(n,n+3) of one array).
//
// Circular marks, deliberately: two horizontal strips of the same shape
// are indistinguishable mid-swipe, and the user cannot tell which one
// moved. Round reads as people and teams; square reads as events.
export interface FollowRailItem {
  key: string;
  label: string;
  caption: string;
  glyph: string;
  theme: TeamTheme;
  // Crest / competition logo, when the follow captured one. The rail
  // had no field for it at all, which is why the same NBA team showed
  // its crest on its own page and a bare monogram here (Prompt 16 C).
  imageUrl?: string;
  // An athlete's flag. A team has a crest; a boxer has a country, and
  // without it five followed fighters are five identical tokens.
  badge?: string;
}

export function FollowRail(props: {
  items: FollowRailItem[];
  onPress: (key: string) => void;
}) {
  const t = useTheme();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      // Under four it already fits: bouncing a strip that cannot scroll
      // reads as broken rather than playful.
      bounces={props.items.length > 3}
      contentContainerStyle={styles.rail}
    >
      {props.items.map((item) => (
        <Pressable
          key={item.key}
          accessibilityRole="button"
          accessibilityLabel={`${item.label}, ${item.caption}. See their fixtures`}
          onPress={() => props.onPress(item.key)}
          style={({ pressed }) => [styles.railItem, pressed && { opacity: 0.6 }]}
        >
          <GlyphTile
            glyph={item.glyph}
            theme={item.theme}
            monogram={monogramOf(item.label)}
            {...(item.imageUrl ? { imageUrl: item.imageUrl } : {})}
            {...(item.badge ? { badge: item.badge } : {})}
            size={64}
            round
          />
          <Text
            numberOfLines={2}
            style={[
              type.caption,
              { color: t.textPrimary, fontWeight: '600', textAlign: 'center' },
            ]}
          >
            {item.label}
          </Text>
          <Text
            numberOfLines={1}
            style={[
              type.caption,
              { color: t.textSecondary, textAlign: 'center' },
            ]}
          >
            {item.caption}
          </Text>
        </Pressable>
      ))}
    </ScrollView>
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

// THE PAINTED SURFACE, on its own. Extracted in Prompt 16b because the
// collapsed card and the expanded card are ONE OBJECT: the same
// photograph, gradient, sport geometry and watermark, painted across
// whatever frame the object currently occupies. A card that grew into a
// second component would be a cross-fade, and a user can see a seam.
export function PosterSurface(props: {
  theme: TeamTheme;
  sportKey?: string;
  monogram?: string;
  crestUrl?: string;
  photoUrl?: string;
  radius?: number;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
}) {
  const th = props.theme;
  const [photoFailed, setPhotoFailed] = useState(false);
  const photo = photoFailed ? undefined : props.photoUrl;
  const radius = props.radius ?? radiusTokens.hero;
  return (
    <View style={[{ borderRadius: radius, overflow: 'hidden' }, props.style]}>
      {photo ? (
        <Image
          source={{ uri: photo }}
          resizeMode="cover"
          onError={() => setPhotoFailed(true)}
          style={[styles.heroPhoto, { borderRadius: radius }]}
          accessible={false}
        />
      ) : null}
      <LinearGradient
        colors={th.gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        // Scrim is a SIBLING layer: opacity on a parent would dim the
        // type as well. Full-strength poster when there is no photo.
        style={[styles.heroFill, { borderRadius: radius }, photo ? styles.heroScrim : null]}
      />
      {/* Generated identity layer: sport geometry + type. Suppressed
          over a photo — a photo needs no texture, and the pattern over
          photography reads as damage. */}
      {!photo && props.sportKey ? (
        <SportPattern sportKey={props.sportKey} color={th.onGradient} />
      ) : null}
      {props.children}
    </View>
  );
}

// The poster's TYPE BLOCK — competition, countdown, title, when. Shared
// for the same reason as the surface: in the expanded state this exact
// block sits at the top of the taller object, at the same size and the
// same width, so nothing about it reflows while the card is moving.
export function PosterFace(props: {
  title: string;
  competition: string;
  startUtc: string;
  status: string;
  timePrecision?: 'exact' | 'nominal' | 'date_only';
  theme: TeamTheme;
  photoCredit?: string;
  // The watermark rides with the TYPE BLOCK, not with the surface: on an
  // expanded card the surface is three times taller, and a mark pinned
  // to its bottom-right ends up sitting behind the controls.
  monogram?: string;
  crestUrl?: string;
  hasPhoto?: boolean;
  // One line answering "why does this say Time TBC" — on the card,
  // where the question is asked (Prompt 16b).
  timingNote?: string | null;
  minHeight?: number;
}) {
  const th = props.theme;
  const dateOnly = isDateOnly(props.status, props.timePrecision);
  const when = `${whenLabel(props.startUtc, dateOnly)} · ${timeLabel(props.startUtc, props.status, props.timePrecision)}`;
  const mark = props.hasPhoto ? null : usableImage(props.crestUrl);
  return (
    <View style={[styles.hero, props.minHeight ? { minHeight: props.minHeight } : null]}>
      {mark ? (
        <Image
          accessible={false}
          source={{ uri: mark }}
          style={styles.heroWatermarkCrest}
          resizeMode="contain"
        />
      ) : null}
      {!props.hasPhoto && !mark && props.monogram ? (
        <Text style={styles.heroWatermark} accessible={false}>
          {props.monogram}
        </Text>
      ) : null}
      <View style={styles.heroTop}>
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
      {props.timingNote ? (
        <Text
          style={[type.caption, { color: th.onGradient, opacity: 0.62, marginTop: 2 }]}
          numberOfLines={2}
        >
          {props.timingNote}
        </Text>
      ) : null}
      {props.photoCredit ? (
        <Text
          style={[type.caption, styles.heroCredit, { color: th.onGradient }]}
          numberOfLines={1}
        >
          {props.photoCredit}
        </Text>
      ) : null}
    </View>
  );
}

export function HeroCard(props: {
  title: string;
  competition: string;
  startUtc: string;
  status: string;
  sportKey?: string;
  monogram?: string;
  crestUrl?: string;
  timePrecision?: 'exact' | 'nominal' | 'date_only';
  theme: TeamTheme;
  photoUrl?: string;
  photoCredit?: string;
  timingNote?: string | null;
  onPress?: () => void;
  standalone?: boolean;
  style?: StyleProp<ViewStyle>; // carousel overrides width/margins
  // Hidden while its own expansion is in flight: the object the user is
  // watching IS this card, lifted into the overlay, so the original must
  // not sit underneath it as a second copy.
  hidden?: boolean;
  innerRef?: React.Ref<View>;
}) {
  const th = props.theme;
  const dateOnly = isDateOnly(props.status, props.timePrecision);
  const when = `${whenLabel(props.startUtc, dateOnly)} · ${timeLabel(props.startUtc, props.status, props.timePrecision)}`;
  const label = props.standalone
    ? `${props.title}, ${when}`
    : `Next up: ${props.title}, ${when}`;
  const Container = (props.onPress ? Pressable : View) as typeof Pressable;
  return (
    <Container
      ref={props.innerRef as never}
      accessible
      {...(props.onPress
        ? {
            accessibilityRole: 'button' as const,
            accessibilityLabel: `${label}. Open event`,
            onPress: props.onPress,
          }
        : { accessibilityLabel: label })}
      style={[
        styles.heroShadow,
        props.style,
        props.hidden ? { opacity: 0 } : null,
      ]}
    >
      <PosterSurface
        theme={th}
        {...(props.sportKey ? { sportKey: props.sportKey } : {})}
        {...(props.monogram ? { monogram: props.monogram } : {})}
        {...(props.crestUrl ? { crestUrl: props.crestUrl } : {})}
        {...(props.photoUrl ? { photoUrl: props.photoUrl } : {})}
      >
        <PosterFace
          title={props.title}
          competition={props.competition}
          startUtc={props.startUtc}
          status={props.status}
          {...(props.timePrecision ? { timePrecision: props.timePrecision } : {})}
          theme={th}
          {...(props.monogram ? { monogram: props.monogram } : {})}
          {...(props.crestUrl ? { crestUrl: props.crestUrl } : {})}
          {...(props.photoUrl ? { hasPhoto: true } : {})}
          {...(props.photoUrl && props.photoCredit
            ? { photoCredit: props.photoCredit }
            : {})}
          {...(props.timingNote ? { timingNote: props.timingNote } : {})}
          minHeight={HERO_MIN_HEIGHT}
        />
      </PosterSurface>
    </Container>
  );
}

// The collapsed card's height floor — exported because the expansion
// animates FROM it and must know it without measuring twice.
export const HERO_MIN_HEIGHT = 180;

// ---------------------------------------------------------------------------
// Rows

export function EventRow(props: {
  title: string;
  caption: string;
  timeText: string;
  glyph: string;
  theme: TeamTheme;
  // Entity initials for the tile — the generated mark (Prompt 9b).
  monogram?: string;
  tbc?: boolean;
  // Per-event opt-out: greyed-but-visible with a restore affordance —
  // a removed event must never just vanish (owner ruling).
  excluded?: boolean;
  onToggleExcluded?: () => void;
  // Per-event opt-IN: add ONE fixture without following anything.
  pinned?: boolean;
  onTogglePinned?: () => void;
  // The row's mark: a licence-gated photo of a participant NAMED in
  // this fixture (combat sports — it identifies who is fighting, is
  // credited on the Photo credits screen, and is never decoration), or
  // the owning follow's crest. Whatever it is, it degrades to the
  // monogram, never to a blank tile.
  imageUrl?: string;
  // Opens the expanded card. The row's own +/× controls sit OUTSIDE
  // this press target so a mis-tap can never toggle the calendar.
  onPress?: () => void;
  // Marks the headline of a card ("Main event"), where the data says so.
  badge?: string;
  // Corner mark on the tile — an athlete's flag.
  tileBadge?: string;
  // A row is not a card, but it IS where the card comes from on the
  // list surfaces, so it has to be measurable and it has to be able to
  // hide itself while its card is lifted (Prompt 16b).
  innerRef?: React.Ref<View>;
  hidden?: boolean;
}) {
  const t = useTheme();
  const dimmed = props.excluded === true;
  // A View cannot take a function style, so the two cases are built
  // separately rather than casting one component into the other.
  const contentStyle: StyleProp<ViewStyle>[] = [
    {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.m,
      flex: 1,
      // The row is 60pt but its content is only as tall as the 40pt
      // tile; a press target has to clear 44 on its own, with no dead
      // band above and below it.
      minHeight: 44,
    },
    dimmed ? { opacity: 0.4 } : null,
  ];
  const label = `${props.title}, ${props.caption}, ${
    dimmed ? 'removed from calendar' : props.timeText
  }${props.onPress ? '. Open event' : ''}`;
  const content = (
    <>
      <GlyphTile
        glyph={props.glyph}
        theme={props.theme}
        monogram={props.monogram}
        imageUrl={props.imageUrl}
        {...(props.tileBadge ? { badge: props.tileBadge } : {})}
      />
      <View style={{ flex: 1, minWidth: 0 }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.s,
          }}
        >
          <Text
            style={[
              type.body,
              { color: t.textPrimary, fontWeight: '600', flexShrink: 1 },
            ]}
            numberOfLines={1}
          >
            {props.title}
          </Text>
          {props.badge ? (
            <Text
              numberOfLines={1}
              style={[
                type.caption,
                styles.rowBadge,
                {
                  color: props.theme.onContainer,
                  backgroundColor: props.theme.container,
                  // Never squeezed and never overlapping the time: the
                  // title shrinks, the badge keeps its size.
                  flexShrink: 0,
                },
              ]}
              accessible={false}
            >
              {props.badge}
            </Text>
          ) : null}
        </View>
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
    </>
  );
  return (
    <View
      ref={props.innerRef}
      style={[
        styles.eventRow,
        { borderColor: t.border },
        props.hidden ? { opacity: 0 } : null,
      ]}
    >
      {props.onPress ? (
        <Pressable
          accessible
          accessibilityRole="button"
          accessibilityLabel={label}
          onPress={props.onPress}
          style={({ pressed }) => [
            ...contentStyle,
            pressed ? { opacity: 0.6 } : null,
          ]}
        >
          {content}
        </Pressable>
      ) : (
        <View accessible accessibilityLabel={label} style={contentStyle}>
          {content}
        </View>
      )}
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

// PRESS FEEDBACK, IN ONE PLACE. `ListRow` and `SportCard` each grew
// their own copy of this, and they had already drifted: the row honoured
// `isReduceMotionEnabled` and the tile did not. That was survivable while
// the tile was a two-per-row grid on Home. It is not survivable now that
// the tile is the press surface on EVERY browse screen (22b) — rolling it
// out would have quietly removed reduced-motion handling from the whole
// of browse, with nothing failing and nothing to see in a diff.
//
// The tint arrives INSTANTLY on touch-down and decays over motion.fast:
// a brief stronger tint reads as responsive where a sustained one makes
// the resting list busier. Reduced motion removes the FADE, never the
// feedback — the tint still appears and disappears, it just does not
// animate out.
//
// Opacity on an overlay rather than an animated backgroundColor, so it
// runs on the native driver and a 500-row list does not drop frames
// repainting a colour on the JS thread.
function usePressFade(): {
  press: Animated.Value;
  setPress: (down: boolean) => void;
} {
  const press = useRef(new Animated.Value(0)).current;
  const [reduceMotion, setReduceMotion] = useState(false);
  useEffect(() => {
    let live = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((on) => {
      if (live) setReduceMotion(on);
    });
    const sub = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setReduceMotion,
    );
    return () => {
      live = false;
      sub.remove();
    };
  }, []);
  return {
    press,
    setPress: (down: boolean) =>
      Animated.timing(press, {
        toValue: down ? 1 : 0,
        duration: down || reduceMotion ? 0 : motion.fast,
        useNativeDriver: true,
      }).start(),
  };
}

export function ListRow(props: {
  title: string;
  caption?: string;
  glyph?: string;
  tileTheme?: TeamTheme; // when present the glyph renders in a GlyphTile
  // Entity initials — the generated mark; rendered instead of the glyph.
  monogram?: string;
  // Crest / competition logo / athlete photo. Top of the identity
  // chain: image → generated treatment (Prompt 13).
  imageUrl?: string;
  // Corner mark on the tile — an athlete's flag (Prompt 16 B).
  tileBadge?: string;
  right?: ReactNode;
  onPress?: () => void;
  accessibilityLabel: string;
  disabled?: boolean;
}) {
  const t = useTheme();
  // THE BUTTON AND THE ROW ARE SIBLINGS, NOT NESTED (Prompt 21).
  //
  // The row used to be ONE Pressable with the trailing button inside
  // it, so a press anywhere — including on the Follow button — lit the
  // row's own press state. Tapping the button looked exactly like
  // tapping the row, which is precisely the confusion the chevron was
  // being asked to resolve and could not.
  //
  // Now the tappable BODY (tile + title + caption) is its own
  // Pressable and the trailing control sits beside it. A press on the
  // button cannot reach the row's state by construction rather than by
  // luck, and the row's highlight still spans the FULL width, because
  // the thing responding is the row even though the thing pressed is
  // the body.
  //
  // THIS REPLACES THE CHEVRON. A `›` on some rows and not others said
  // nothing about which rows opened — every row in browse opens — so
  // it was decoration that actively misled. The affordance is now the
  // press itself, which is the same on every surface that uses this
  // component.
  // A PRESS STATE YOU CANNOT PERCEIVE IS FUNCTIONALLY ABSENT. The first
  // cut washed the row in `surface`, which on the light shell is
  // #F3F2EF against a #FBFAF8 background — a 2% step, invisible in
  // daylight. Rule 1 protects the shell AT REST; a press is not rest,
  // and interaction feedback answers to different rules from resting
  // decoration.
  //
  // So: the next tone already on the ramp (`border`), not a new colour
  // and not a tint of the brand — tonal, so nothing about the row's
  // meaning changes, only its state. It arrives INSTANTLY on touch-down
  // and decays over motion.fast, because a brief stronger tint reads as
  // responsive where a sustained one would make the resting list busier.
  //
  // Now that button-versus-row is structural, this only has to say
  // "something is happening", not "which thing" — which is why it can
  // be quick and quiet rather than loud.
  //
  const { press, setPress } = usePressFade();
  const openable = props.onPress !== undefined && props.disabled !== true;
  const body = (
    <>
      {props.glyph ? (
        props.tileTheme ? (
          <GlyphTile
            glyph={props.glyph}
            theme={props.tileTheme}
            monogram={props.monogram}
            imageUrl={props.imageUrl}
            {...(props.tileBadge ? { badge: props.tileBadge } : {})}
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
    </>
  );
  return (
    <View
      style={[
        styles.row,
        { borderColor: t.border, opacity: props.disabled ? 0.45 : 1 },
      ]}
    >
      {/* Under the content, across the FULL row: the thing responding
          is the row, even though the thing pressed is the body. */}
      <Animated.View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: t.border, opacity: press },
        ]}
      />
      {openable ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={props.accessibilityLabel}
          onPress={props.onPress}
          onPressIn={() => setPress(true)}
          onPressOut={() => setPress(false)}
          style={styles.rowBody}
        >
          {body}
        </Pressable>
      ) : (
        // A row without onPress is a passive container, NOT a disabled
        // control — marking it disabled makes VoiceOver skip the Follow
        // button inside it.
        <View style={styles.rowBody}>{body}</View>
      )}
      {props.right}
    </View>
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
  // OPTIONAL, and omitted rather than empty. A club in a league you
  // just opened has no second line worth spending on — every team on
  // the screen shares it — and `caption=""` would still render a Text
  // and still cost its line height on every row.
  caption?: string;
  captionAccent?: boolean;
  onPress: () => void;
  accessibilityLabel: string;
  // Identity artwork, where the entity has any: a crest, a competition
  // logo, an athlete's generated monogram and flag. The tile is now the
  // pattern for EVERY navigating thing (Prompt 22), not only sports, so
  // it has to carry what an entity row carried.
  monogram?: string;
  imageUrl?: string;
  tileBadge?: string;
  // DENSITY. A 500-name athlete directory pays for every point of tile
  // height, so a list can ask for the tighter geometry: a smaller mark,
  // one line of label, less padding. Same component, same edge, same
  // press — extended rather than forked, so the two cannot drift.
  compact?: boolean;
  // Full width in a LIST; the Home grid still wants two per row.
  fullWidth?: boolean;
  // A tile that is NOT yet openable — a "Coming soon" sport. The row
  // version carried this and the tile has to as well, or the sport
  // picker would have to keep one row type for eleven sports and
  // another for the rest. Dimmed and inert, never hidden: the sport
  // being listed at all is the point.
  disabled?: boolean;
}) {
  const t = useTheme();
  const { press, setPress } = usePressFade();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={props.accessibilityLabel}
      accessibilityState={props.disabled ? { disabled: true } : {}}
      disabled={props.disabled === true}
      onPress={props.onPress}
      onPressIn={() => setPress(true)}
      onPressOut={() => setPress(false)}
      style={[
        styles.sportCard,
        props.compact && styles.sportCardCompact,
        props.disabled === true && { opacity: 0.45 },
        props.fullWidth && {
          flexBasis: 0,
          flexGrow: 1,
          flexShrink: 1,
          // Without this a long label sets the tile's minimum width and
          // the control is pushed off the screen edge — measured, on
          // "Other tournaments" beside a Follow all.
          minWidth: 0,
        },
        { backgroundColor: t.surfaceRaised, borderColor: t.border },
      ]}
    >
      {/* The same tonal, brief press the rows use — the tile's edge says
          "pressable", the wash says "pressed". */}
      <Animated.View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: t.border, opacity: press, borderRadius: radiusTokens.card },
        ]}
      />
      <GlyphTile
        glyph={props.glyph}
        theme={props.theme}
        size={props.compact ? 28 : 36}
        {...(props.monogram ? { monogram: props.monogram } : {})}
        {...(props.imageUrl ? { imageUrl: props.imageUrl } : {})}
        {...(props.tileBadge ? { badge: props.tileBadge } : {})}
      />
      <View style={{ flex: 1 }}>
        {/* TWO LINES, not one. A sport name is content, not chrome —
            "American football" truncated to "American f…" long before
            regional terminology existed, and "Track and field" made it
            visible. The grid's cards already stretch to the tallest in
            their wrapped row (alignItems defaults to stretch), so a
            wrapping label costs a slightly taller row, never a ragged
            one. */}
        <Text
          style={[type.secondary, { color: t.textPrimary, fontWeight: '600' }]}
          numberOfLines={props.compact ? 1 : 2}
        >
          {props.label}
        </Text>
        {props.caption ? (
          <Text
            style={[
              type.caption,
              { color: props.captionAccent ? t.accent : t.textSecondary },
            ]}
            // TWO LINES ON A FULL TILE, one when compact — the same cut
            // the label makes, for the same reason. The rows these tiles
            // replaced wrapped their caption freely, so a single line
            // clipped "American football · no upcoming fixtures yet"
            // mid-word on the Following list. Compact stays at one line:
            // that geometry exists to hold a 500-name directory to a
            // fixed height, and a caption there is a rank and a country.
            numberOfLines={props.compact ? 1 : 2}
          >
            {props.caption}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

// A TILE AND ITS CONTROL, SIDE BY SIDE (Prompt 22).
//
// The tile is the thing you open; the button is the thing you press to
// follow. They are SIBLINGS — nesting the button inside the pressable is
// exactly the bug that made pressing Follow light the whole row, and no
// amount of styling fixes a structure that routes both to one handler.
//
// WIDTH IS SOLVED BY SHORTER WORDS, NOT BY A SMALLER BUTTON (22b). The
// first cut let the control collapse to a bare `+` / `✓` glyph when the
// row got tight. That traded one legibility problem for a worse one: a
// square `+` beside a tile does not say what it follows, and `✓` reads
// as "selected" at least as readily as "following" — ambiguous in a way
// the word never is. The width it was buying back came from "Follow
// all", a label that only ever meant the same thing as "Follow".
//
// So the control is ALWAYS text now, and the tile yields instead: it
// carries `flexShrink: 1, minWidth: 0` and wraps its label to two lines
// (one when `compact`). Nothing stacks, because a list whose rows change
// height as you scroll is worse than a wrapped label.
export function TileRow(props: {
  children: ReactNode; // the tile
  right?: ReactNode; // its control, if any
  compact?: boolean;
}) {
  return (
    <View style={[styles.tileRow, props.compact && styles.tileRowCompact]}>
      {props.children}
      {props.right}
    </View>
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
  // NO `label` AND NO `iconOnly` (22b). Both existed to solve width and
  // both cost meaning. "Follow all" said nothing "Follow" did not — the
  // action is identical whether it covers one competition or four
  // majors, and the extra word was the reason the button ran out of
  // room in the first place. The glyph fallback was worse still: `+`
  // beside a tile names nothing, and `✓` is the mark this app already
  // uses for "chosen" on the calendar picker.
  //
  // Two words, always, everywhere: Follow, or Following.
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
          numberOfLines={1}
          // A BOUND ON THE CONTROL SO THE TILE KEEPS ROOM. The button
          // no longer shrinks (`flexShrink: 0`, so "Following" cannot
          // be clipped), which means at large system text sizes it
          // would grow without limit and squeeze the tile — the tile
          // being the only way to OPEN anything now. 1.8x is still a
          // 25pt label; past that the word stops growing rather than
          // taking the row with it.
          maxFontSizeMultiplier={1.8}
        >
          {props.following ? 'Following' : 'Follow'}
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

// Past this, "your calendar synced" stops being the whole truth — the
// SOURCE side has been quiet too long to keep saying up to date.
export const DATA_STALE_HOURS = 48;

export function SyncStatusChip(props: {
  running: boolean;
  lastAt: string | null;
  changed: number; // created + updated + deleted on the last run
  error?: string | null;
  calendarOff?: boolean; // fixtures fresh, calendar not opted in
  // Hours since the oldest followed SOURCE last succeeded upstream —
  // device sync age and data age are different facts, and a device
  // syncing perfectly against a dead source must not show green.
  dataStaleHours?: number | null;
}) {
  const t = useTheme();
  const dataStale =
    props.dataStaleHours != null && props.dataStaleHours > DATA_STALE_HOURS;
  let text: string;
  if (props.running)
    text = props.calendarOff ? 'Checking for fixtures…' : 'Updating your calendar…';
  else if (props.error) text = props.error;
  else if (dataStale)
    text = `Fixture sources quiet for ${Math.round(props.dataStaleHours! / 24)}d — data may be behind`;
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
            {
              color: props.error || dataStale ? t.danger : t.accent,
              fontWeight: '700',
            },
          ]}
          accessible={false}
        >
          {props.error || dataStale ? '!' : '✓'}
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

// WHAT THIS SPORT'S DATA HONESTLY IS — on demand, not as a wall.
//
// The note itself is load-bearing (a user should read that men's tennis
// has no draw source, not discover it), but nine lines of prose above
// the rows pushed the actual content off the screen, and prose in a UI
// is a sign the design is compensating (AGENTS.md rule 11). It keeps
// its place; it stops being the first thing you meet.
export function CoverageNote(props: { note: string }) {
  const t = useTheme();
  const [open, setOpen] = useState(false);
  return (
    <View style={styles.coverage}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={
          open ? 'Hide what this covers' : 'What this covers'
        }
        onPress={() => setOpen((v) => !v)}
        hitSlop={8}
        style={styles.coverageToggle}
      >
        <Text style={[type.caption, { color: t.textSecondary }]}>
          {open ? 'ⓘ  What this covers ▲' : 'ⓘ  What this covers'}
        </Text>
      </Pressable>
      {open ? (
        <Text style={[type.caption, { color: t.textSecondary }]}>
          {props.note}
        </Text>
      ) : null}
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
  // The poster's type block. No radius or clipping of its own any more:
  // the SURFACE owns the shape, so the same block can sit at the top of
  // a card or at the top of the same card expanded.
  hero: {
    padding: spacing.l,
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
  // The CREST watermark (restored, Prompt 13). Inset rather than bled
  // off the edge: a crest cropped in half reads as a rendering fault
  // where a cropped letterform reads as design. Same quiet opacity as
  // the monogram it sits in front of — texture, not content.
  heroWatermarkCrest: {
    position: 'absolute',
    right: spacing.l,
    bottom: spacing.l,
    width: 96,
    height: 96,
    opacity: 0.22,
  },
  // The typographic watermark: the entity's monogram set huge and
  // quiet — the generated identity, still the fallback whenever there
  // is no crest. Colour comes from the text's own default; opacity
  // keeps it texture, not content.
  heroWatermark: {
    position: 'absolute',
    right: -10,
    bottom: -30,
    fontSize: 150,
    fontWeight: '800',
    letterSpacing: -4,
    opacity: 0.14,
    color: '#FFFFFF',
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
    paddingHorizontal: spacing.l,
    borderBottomWidth: StyleSheet.hairlineWidth,
    minHeight: 56,
    gap: spacing.m,
  },
  // The row's TAP TARGET: everything except the trailing control. It
  // carries the row's vertical padding so the touch area is the full
  // height of the row, not just the text — a 56pt row whose target was
  // only the label would fail the 44pt rule at the top and bottom edge.
  rowBody: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.m,
    paddingVertical: spacing.m,
    minHeight: 44,
  },
  glyph: { width: 32, textAlign: 'center' },
  // "Main event" beside a bout's name — a quiet chip in the entity's own
  // container tone, never a colour of its own.
  rowBadge: {
    paddingHorizontal: spacing.s,
    paddingVertical: 1,
    borderRadius: radius.chip,
    overflow: 'hidden',
    fontWeight: '700',
  },
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
    paddingHorizontal: spacing.m,
    borderRadius: radius.button,
    borderWidth: 1,
    minHeight: 44,
    // ONE WIDTH FOR BOTH STATES, so a row does not reflow the instant
    // you press it: "Following" is the longer word, and pinning the
    // button to its width means Follow -> Following moves nothing.
    //
    // 90, MEASURED, NOT PICKED. CoreText puts "Following" at 64.17pt in
    // the system font at 14pt semibold, so the button's content width is
    // 88.17 — 90 pins both states without a point of slack. The first
    // cut used 96, and those six points came straight out of the tile's
    // label on the one row that carries two controls: at 390pt (iPhone
    // 12/13/14) "UEFA Champions" needs 115.53pt and had 114.21. Six
    // points of nothing were the whole defect on that width class.
    minWidth: 90,
    // The control never yields (22b) — without this a flex parent
    // happily squeezes it to fit an over-long tile label.
    flexShrink: 0,
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
  rail: {
    paddingHorizontal: spacing.l,
    paddingTop: spacing.s,
    paddingBottom: spacing.m,
    gap: spacing.l,
  },
  railItem: { width: 76, alignItems: 'center', gap: 4 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  tileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s,
    paddingHorizontal: spacing.l,
    paddingVertical: spacing.xs,
  },
  tileRowCompact: { paddingVertical: 3 },
  sportCardCompact: {
    minHeight: 48,
    paddingVertical: spacing.s,
    gap: spacing.s,
  },
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
    overflow: 'hidden',
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
  coverage: {
    paddingHorizontal: spacing.l,
    paddingBottom: spacing.s,
    gap: spacing.xs,
  },
  coverageToggle: { minHeight: 32, justifyContent: 'center' },
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
