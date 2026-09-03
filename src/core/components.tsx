// Canonical shared components (see DESIGN_SYSTEM.md). Tokens only —
// no raw hex, 44pt minimum targets, labels on every interactive element.
// Team/sport colour arrives here ONLY as a TeamTheme (never raw hex).

import { LinearGradient } from 'expo-linear-gradient';
import { ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Animated,
  Easing,
  Image,
  Pressable,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';
import { burstPalette, celebrateGrand, FollowBurst } from './celebration';
import { t as tr, tn } from './i18n';
import { flagEmojiOf } from './nationality';
import { SportPattern } from './sportPattern';
import { useReduceMotion } from './useReduceMotion';
import { motion, radius as radiusTokens, spacing, type, useTheme } from './tokens';
const radius = radiusTokens;
import { TeamTheme } from './teamTheme';
import { countdownLabel, isDateOnly, timeLabel, whenLabel } from './when';

// ---------------------------------------------------------------------------
// Identity atoms

// RN Image cannot rasterise SVG; skip those (photo URLs may carry
// query strings — strip before testing the extension).
// The follow control's pinned width (90: 'Following' measures 88.17 at
// 14pt semibold — see followButton below). Shared with TileRow's
// reserved column so tile right-edges cannot drift from button rows.
const FOLLOW_HIT_MIN_WIDTH = 90;

// Every image request carries a descriptive User-Agent (Round 4 B6).
// Wikimedia serves HTTP 403 to the default `okhttp/x.y` agent Android's
// image loader sends — so every Commons-hosted venue, host-city and
// pool photo failed on Android while crests (other hosts) loaded, and
// the hero read as crests-only. iOS's CFNetwork agent passed, which is
// why parity broke silently. One header, both platforms, all hosts.
export const IMAGE_USER_AGENT = 'KickOffCal/1.0 (fixtures calendar app)';
export const imageSource = (uri: string) => ({
  uri,
  headers: { 'User-Agent': IMAGE_USER_AGENT },
});

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
  // Per-mark tile fill (Round 6 tile prep, server-chosen): an adopted
  // baked background or a contrast-picked neutral. Applies only while
  // the IMAGE is actually showing — a failed image falls back to the
  // monogram on the theme container, exactly as before.
  fillColour?: string;
  // Round 7 item 6: a group node that is OPEN reads as spent — its mark
  // dims and a minus sits through its middle (the collapse control);
  // closed, the corner badge is the plus.
  dimmed?: boolean;
  overlay?: string;
}) {
  const size = props.size ?? 40;
  const [imageFailed, setImageFailed] = useState(false);
  const image = imageFailed ? undefined : usableImage(props.imageUrl);
  const markOpacity = props.dimmed ? 0.4 : 1;
  return (
    <View
      accessible={false}
      style={{
        width: size,
        height: size,
        borderRadius: props.round ? size / 2 : size * 0.3,
        backgroundColor:
          image && props.fillColour ? props.fillColour : props.theme.container,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {image ? (
        <Image
          source={imageSource(image)}
          resizeMode="contain"
          onError={() => setImageFailed(true)} // broken art → mark, never a blank tile
          style={{ width: size * 0.72, height: size * 0.72, opacity: markOpacity }}
          accessible={false}
        />
      ) : props.monogram ? (
        <Text
          style={{
            fontSize: size * 0.34,
            fontWeight: '700',
            letterSpacing: 0.5,
            color: props.theme.onContainer,
            opacity: markOpacity,
          }}
          accessible={false}
        >
          {props.monogram}
        </Text>
      ) : (
        <Text style={{ fontSize: size * 0.5, opacity: markOpacity }} accessible={false}>
          {props.glyph}
        </Text>
      )}
      {props.overlay ? (
        <Text
          accessible={false}
          style={{
            position: 'absolute',
            fontSize: size * 0.62,
            fontWeight: '800',
            lineHeight: size * 0.72,
            color: props.theme.onContainer,
          }}
        >
          {props.overlay}
        </Text>
      ) : null}
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
  // Per-mark tile fill behind imageUrl (Round 6 tile prep).
  tileFill?: string;
  // Round 6 item 6: an EMOJI-STYLE tile — the glyph itself is the icon,
  // no monogram (the Olympic group node's medal, its sports' emoji).
  emoji?: boolean;
  // Round 7 item 6: a GROUP NODE — the tile that opens into its members.
  // Closed it wears a plus; open it dims with a minus through it, and
  // the strip has first swung it to the left edge so the members it
  // spreads out have room to be seen.
  group?: { expanded: boolean };
  // A MEMBER of an open node: it emerges from under the node, sliding
  // into its slot — the coin-stack spread. `spreadIndex` is its slot
  // among the node's members, 0 nearest the node.
  spreadFrom?: string;
  spreadIndex?: number;
}

const RAIL_ITEM_W = 76; // styles.railItem width — the slot a tile occupies
const RAIL_PAD = spacing.l; // styles.rail paddingHorizontal
const SPREAD_MS = 320;
const SPREAD_STAGGER_MS = 45;
const FOCUS_SCROLL_MS = 280;

// LOOPING DRIFT (Round 2 items 5/6; rebuilt native in Round 3; touch
// contract per Round 3 B1). When the strip overflows its viewport it
// renders the items enough times that HALF the copies are fling runway
// on each side, and the drift is ONE continuous native-driver
// translateX across one copy's width — duration derived from px/s,
// zero per-frame JS. Each traversal resets the value to an identical
// frame, so the drift's own wrap is invisible; the only JS is one
// callback per traversal and the touch events.
//
// Touch (B1): a finger stops the animation exactly where it is
// (position preserved natively) and the drift resumes THE MOMENT the
// interaction ends — on release for a tap or a settled drag, on
// momentum end for a fling; there is no idle wait. The only timer left
// is a race guard: end-drag reports its velocity before momentum
// begins, and when the platform omits it a deferred resume is
// scheduled and momentum-begin cancels it.
//
// Wrap at fling velocity (B1): user flings ride the ScrollView, and
// mid-fling corrections are the one thing that CAN'T be made invisible
// (a programmatic jump kills iOS momentum dead), so the runway copies
// exist to make them unnecessary — sized so the hardest realistic
// fling (~2,500px at UIScrollView's normal deceleration) settles
// before an edge, and re-centred by EXACT single-copy multiples at
// every settle, which lands on an identical frame. A scroll watchdog
// remains as the last net for pathological chained flings: escaping
// the runway band teleports back by copy multiples (still an identical
// frame — no end-stop, no jitter; at worst that fling's remaining
// momentum is spent). Everything stands down when the content fits the
// viewport and under reduced motion.
const RAIL_DRIFT_PX_PER_S = 27; // one tunable; owner-tuned on device (90% of the original 30, ruling 2026-09-01)
const RAIL_FLING_RUNWAY_PX = 2600; // per side; ≥ a violent fling's travel
const RAIL_MAX_COPIES = 13; // small strips stay bounded in tile count
const RAIL_MOMENTUM_GUARD_MS = 80; // endDrag→momentumBegin handoff race

export function FollowRail(props: {
  items: FollowRailItem[];
  onPress: (key: string) => void;
}) {
  const t = useTheme();
  const reduceMotion = useReduceMotion();
  const scrollRef = useRef<ScrollView>(null);
  const [viewportW, setViewportW] = useState(0);
  // The width of ONE copy — measured from the untripled render, which
  // is why tripling waits for the measurement.
  const [singleW, setSingleW] = useState(0);
  const itemsKey = props.items.map((i) => i.key).join('|');
  useEffect(() => {
    setSingleW(0); // strip changed: re-measure before looping again
  }, [itemsKey]);
  const looping =
    !reduceMotion && singleW > 0 && viewportW > 0 && singleW > viewportW;
  // Odd copy count, middle copy is home; enough copies that the runway
  // on EACH side absorbs a violent fling without reaching an edge.
  const copies = looping
    ? Math.min(
        RAIL_MAX_COPIES,
        1 + 2 * Math.max(1, Math.ceil(RAIL_FLING_RUNWAY_PX / singleW)),
      )
    : 1;
  const midStart = ((copies - 1) / 2) * singleW;
  const drift = useRef(new Animated.Value(0)).current;
  const driftAt = useRef(0); // last KNOWN value — updated at events only
  const driftRunning = useRef(false);
  const dragging = useRef(false);
  const guardTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearGuard = () => {
    if (guardTimer.current !== null) clearTimeout(guardTimer.current);
    guardTimer.current = null;
  };
  // The steady state is a NATIVELY-looping full leg: with the native
  // driver, Animated.loop's iterations restart on the UI thread with no
  // JS round-trip. The first cut ran leg-by-leg with a JS completion
  // callback doing reset-and-restart — native finishes the leg, then
  // the strip FREEZES until the JS thread gets around to the callback
  // (a frame when idle, several under a sync tick), then snaps onward:
  // a visible hitch once per leg (~30s at 27px/s over a nine-item
  // strip — the owner's "jitter every minute or so", 2026-09-01). A
  // JS boundary now exists only on resume-after-touch, where the hand
  // was just on the strip anyway.
  const startLoop = () => {
    driftRunning.current = true;
    drift.setValue(0);
    driftAt.current = 0;
    Animated.loop(
      Animated.timing(drift, {
        // POSITIVE: the strip drifts rightward (ruling 2026-09-01).
        // The wrap is invisible either way — one copy width in either
        // direction is an identical frame.
        toValue: singleW,
        duration: Math.max(1, (singleW / RAIL_DRIFT_PX_PER_S) * 1000),
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    ).start();
  };
  const runLeg = (from: number) => {
    if (from === 0) {
      startLoop();
      return;
    }
    // Resume mid-copy: finish the current leg, then hand over to the
    // native loop at the identical frame.
    driftRunning.current = true;
    const remaining = singleW - Math.abs(from);
    Animated.timing(drift, {
      toValue: singleW,
      duration: Math.max(1, (remaining / RAIL_DRIFT_PX_PER_S) * 1000),
      easing: Easing.linear,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (!finished) return;
      startLoop();
    });
  };
  const pause = () => {
    clearGuard();
    driftRunning.current = false;
    drift.stopAnimation((v) => {
      driftAt.current = v; // preserved exactly where the finger landed
    });
  };
  // Idempotent — settle events can double-fire (watchdog + momentum
  // end); the second call must not restart a running leg mid-frame.
  const resume = () => {
    clearGuard();
    if (driftRunning.current) return;
    runLeg(driftAt.current);
  };
  // The endDrag→momentumBegin gap: resume after a beat unless momentum
  // announces itself first. This is a race guard, not an idle wait.
  const resumeUnlessMomentum = () => {
    clearGuard();
    guardTimer.current = setTimeout(resume, RAIL_MOMENTUM_GUARD_MS);
  };
  // Jump by EXACT copy multiples — an identical frame, invisible even
  // mid-gesture — putting the offset back inside the middle copy.
  const recentre = (x: number) => {
    const centred = midStart + (((x % singleW) + singleW) % singleW);
    if (Math.abs(centred - x) > 0.5) {
      scrollRef.current?.scrollTo({ x: centred, animated: false });
    }
  };
  useEffect(() => {
    if (!looping) return;
    // Start at the MIDDLE copy so user flings have runway both ways.
    scrollRef.current?.scrollTo({ x: midStart, animated: false });
    drift.setValue(0);
    driftAt.current = 0;
    runLeg(0);
    return () => {
      clearGuard();
      driftRunning.current = false;
      drift.stopAnimation();
      drift.setValue(0);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [looping, singleW, copies]);
  // ── The coin-stack spread (Round 7 item 6) ──────────────────────────
  //
  // Members of an open node are drawn from the strip's items like any
  // tile, but they ARRIVE: each starts stacked under its node
  // (translated back by its slot count), then slides into place with a
  // stagger, nearest first — a stack of coins spread across the table.
  // Collapse runs the same motion backwards: the members leaving the
  // props are kept on screen (`exiting`) until they have slid back
  // under the node. One progress value per member key drives every
  // copy of it, so the copies move as one. Reduced motion: no motion —
  // members appear and vanish in place.
  const spread = useRef(new Map<string, Animated.Value>()).current;
  const progressOf = (key: string): Animated.Value => {
    let v = spread.get(key);
    if (!v) {
      v = new Animated.Value(1);
      spread.set(key, v);
    }
    return v;
  };
  const [exiting, setExiting] = useState<FollowRailItem[]>([]);
  const prevItems = useRef<FollowRailItem[]>([]);
  useEffect(() => {
    const before = prevItems.current;
    const now = new Set(props.items.map((i) => i.key));
    const wasThere = new Set(before.map((i) => i.key));
    const arriving = props.items.filter((i) => i.spreadFrom && !wasThere.has(i.key));
    const leaving = before.filter((i) => i.spreadFrom && !now.has(i.key));
    prevItems.current = props.items;
    if (reduceMotion) {
      for (const m of arriving) progressOf(m.key).setValue(1);
      setExiting([]);
      return;
    }
    for (const m of arriving) {
      const v = progressOf(m.key);
      v.setValue(0);
      Animated.timing(v, {
        toValue: 1,
        duration: SPREAD_MS,
        delay: (m.spreadIndex ?? 0) * SPREAD_STAGGER_MS,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    }
    if (leaving.length === 0) return;
    setExiting(leaving);
    const last = Math.max(...leaving.map((m) => m.spreadIndex ?? 0));
    for (const m of leaving) {
      Animated.timing(progressOf(m.key), {
        toValue: 0,
        duration: SPREAD_MS,
        // Farthest first on the way back, so the stack re-forms in order.
        delay: (last - (m.spreadIndex ?? 0)) * SPREAD_STAGGER_MS,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }).start();
    }
    const timer = setTimeout(() => setExiting([]), SPREAD_MS + last * SPREAD_STAGGER_MS + 30);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemsKey, reduceMotion]);
  // What the strip actually draws: the items, plus any members still
  // sliding home after their node closed — each re-inserted right after
  // its node so the motion ends where it started.
  const displayed = useMemo(() => {
    if (exiting.length === 0) return props.items;
    const out = [...props.items];
    for (const m of exiting) {
      if (out.some((i) => i.key === m.key)) continue;
      const nodeAt = out.findIndex((i) => i.key === m.spreadFrom);
      if (nodeAt < 0) continue;
      let at = nodeAt + 1;
      while (at < out.length && out[at].spreadFrom === m.spreadFrom) at++;
      out.splice(at, 0, m);
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemsKey, exiting]);
  // OPENING A NODE swings it to the left edge FIRST (owner ruling): the
  // spread runs rightward from the node, and a node sitting near the
  // right edge would spread its members off the strip. The drift pauses
  // for the swing and the spread, then resumes where it was.
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const focusThenPress = (renderIndex: number, item: FollowRailItem) => {
    const members = props.items.filter((i) => i.spreadFrom === item.key).length;
    const settle = (driftNow: number) => {
      // Tiles are laid out contiguously across every copy — the tile at
      // render index i sits at PAD + i·RAIL_ITEM_W, shifted right by the
      // drift — so a scroll offset of i·RAIL_ITEM_W + drift puts its left
      // edge exactly one padding in from the viewport's left. (The
      // measured copy width includes the strip's padding ONCE and is not
      // the per-copy stride.)
      const x = Math.max(0, renderIndex * RAIL_ITEM_W + driftNow);
      scrollRef.current?.scrollTo({ x, animated: !reduceMotion });
      const swing = reduceMotion ? 0 : FOCUS_SCROLL_MS;
      setTimeout(() => props.onPress(item.key), swing);
      if (holdTimer.current !== null) clearTimeout(holdTimer.current);
      holdTimer.current = setTimeout(
        resume,
        swing + (reduceMotion ? 0 : SPREAD_MS + Math.max(1, members) * SPREAD_STAGGER_MS) + 120,
      );
    };
    if (!looping) {
      settle(0);
      return;
    }
    clearGuard();
    driftRunning.current = false;
    drift.stopAnimation((v) => {
      driftAt.current = v;
      settle(v);
    });
  };
  const rendered = useMemo(
    () =>
      copies === 1
        ? displayed
        : Array.from({ length: copies }, () => displayed).flat(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [displayed, copies],
  );
  return (
    <ScrollView
      ref={scrollRef}
      horizontal
      showsHorizontalScrollIndicator={false}
      // Under four it already fits: bouncing a strip that cannot scroll
      // reads as broken rather than playful. A looping strip never
      // bounces — there is no edge to bounce off.
      bounces={!looping && props.items.length > 3}
      onLayout={(e) => setViewportW(e.nativeEvent.layout.width)}
      onContentSizeChange={(w) => {
        if (!looping) setSingleW(w);
      }}
      onTouchStart={pause}
      onTouchEnd={() => {
        // A tap (no drag ever began): the interaction is over the
        // moment the finger lifts — resume NOW (B1). A drag's release
        // is handled by endDrag/momentum below.
        if (!dragging.current) resume();
      }}
      onScrollBeginDrag={() => {
        dragging.current = true;
      }}
      onScrollEndDrag={(e) => {
        dragging.current = false;
        if (looping) recentre(e.nativeEvent.contentOffset.x);
        // velocity says whether momentum follows: none → settled →
        // resume now; some → momentum end resumes. Platforms that omit
        // it get the guarded deferral instead.
        const vx = e.nativeEvent.velocity?.x;
        if (vx === undefined) resumeUnlessMomentum();
        else if (Math.abs(vx) < 0.05) resume();
      }}
      onMomentumScrollBegin={clearGuard}
      onMomentumScrollEnd={(e) => {
        // Re-centre into the middle copy so the user can fling forever
        // in either direction — identical frame, invisible jump — and
        // resume immediately: the interaction is over (B1).
        if (looping) recentre(e.nativeEvent.contentOffset.x);
        resume();
      }}
      onScroll={(e) => {
        // Last-net watchdog: a pathological chain of flings that
        // escapes the runway band teleports back by copy multiples —
        // an identical frame, never an end-stop. scrollTo can spend
        // that fling's remaining momentum, so the band is generous and
        // ordinary flings never trip it.
        if (!looping) return;
        const x = e.nativeEvent.contentOffset.x;
        if (x < singleW || x > (copies - 1) * singleW - viewportW) {
          recentre(x);
          if (!dragging.current) resumeUnlessMomentum();
        }
      }}
      scrollEventThrottle={48}
      contentContainerStyle={styles.rail}
    >
     <Animated.View
        style={[
          styles.railInner,
          looping ? { transform: [{ translateX: drift }] } : null,
        ]}
      >
      {rendered.map((item, i) => {
        const node = item.group;
        const member = item.spreadFrom !== undefined;
        const progress = member ? progressOf(item.key) : null;
        const slotBack = -((item.spreadIndex ?? 0) + 1) * RAIL_ITEM_W;
        const tile = (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={tr('core.rail.openA11y', {
              label: item.label,
              caption: item.caption,
            })}
            {...(node ? { accessibilityState: { expanded: node.expanded } } : {})}
            // The second copy is a visual continuation, not more content.
            accessibilityElementsHidden={i >= displayed.length}
            onPress={() =>
              node && !node.expanded ? focusThenPress(i, item) : props.onPress(item.key)
            }
            style={({ pressed }) => [styles.railItem, pressed && { opacity: 0.6 }]}
          >
            <GlyphTile
              glyph={item.glyph}
              theme={item.theme}
              {...(item.emoji ? {} : { monogram: monogramOf(item.label) })}
              {...(item.imageUrl ? { imageUrl: item.imageUrl } : {})}
              {...(node ? (node.expanded ? { dimmed: true, overlay: '−' } : { badge: '+' }) : {})}
              {...(!node && item.badge ? { badge: item.badge } : {})}
              {...(item.tileFill ? { fillColour: item.tileFill } : {})}
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
        );
        const key = `${item.key}-${Math.floor(i / Math.max(1, displayed.length))}`;
        if (!progress) return <View key={key}>{tile}</View>;
        return (
          <Animated.View
            key={key}
            style={{
              opacity: progress,
              transform: [
                {
                  translateX: progress.interpolate({
                    inputRange: [0, 1],
                    outputRange: [slotBack, 0],
                  }),
                },
                {
                  scale: progress.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.82, 1],
                  }),
                },
              ],
            }}
          >
            {tile}
          </Animated.View>
        );
      })}
      </Animated.View>
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
  // The combat identity layer (Prompt 24 C2): both fighters' flags,
  // rendered large where a team fixture would show its ground. Comes
  // from the fixture's own participantCountries — stamped server-side
  // only when EVERY participant resolved with a country, so a pair is
  // always a pair. Photography still wins where it exists; flags beat
  // the bare generated treatment.
  participantCountries?: string[];
  // The composite's identity layer (Stage 4B): both sides' crests,
  // stamped on the fixture itself — rendered over the venue photo AND
  // over the generated treatment, whichever is underneath. Partial is
  // fine: whichever crest resolves renders; a broken one drops out.
  homeCrestUrl?: string;
  awayCrestUrl?: string;
  radius?: number;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
}) {
  const th = props.theme;
  const [photoFailed, setPhotoFailed] = useState(false);
  // PAINT-GATED SUPPRESSION (Stage 4B): the generated layers yield to a
  // photo only once one has actually PAINTED. A URL that is still
  // loading — or hangs forever without erroring — used to suppress the
  // sport geometry and the flags anyway, which is the one path that
  // could put a bare gradient on screen.
  const [photoPainted, setPhotoPainted] = useState(false);
  // A surface can be repointed at a different fixture (the expanded
  // pager) — paint state belongs to the URL, not the instance.
  const paintedFor = useRef(props.photoUrl);
  useEffect(() => {
    if (paintedFor.current === props.photoUrl) return;
    paintedFor.current = props.photoUrl;
    setPhotoFailed(false);
    setPhotoPainted(false);
  }, [props.photoUrl]);
  const photo = photoFailed ? undefined : props.photoUrl;
  const photoShown = photo !== undefined && photoPainted;
  const radius = props.radius ?? radiusTokens.hero;
  const crestPair = [props.homeCrestUrl, props.awayCrestUrl]
    .map(usableImage)
    .filter((u): u is string => u !== undefined);
  return (
    <View style={[{ borderRadius: radius, overflow: 'hidden' }, props.style]}>
      {photo ? (
        <Image
          source={imageSource(photo)}
          resizeMode="cover"
          onError={() => setPhotoFailed(true)}
          onLoad={() => setPhotoPainted(true)}
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
        style={[styles.heroFill, { borderRadius: radius }, photoShown ? styles.heroScrim : null]}
      />
      {/* Generated identity layer: sport geometry + type. Suppressed
          over a PAINTED photo — a photo needs no texture, and the
          pattern over photography reads as damage. */}
      {!photoShown && props.sportKey ? (
        <SportPattern sportKey={props.sportKey} color={th.onGradient} />
      ) : null}
      {!photoShown && props.participantCountries?.length ? (
        // Two big flags, meeting at the centre the way the names do in
        // the title. Emoji flags: freely usable, sharp at any size, and
        // they render in every locale the app ships in.
        <View style={styles.heroFlags} accessible={false}>
          {props.participantCountries.map((cc, i) => (
            <Text key={`${cc}-${i}`} style={styles.heroFlag}>
              {flagEmojiOf(cc) ?? ''}
            </Text>
          ))}
        </View>
      ) : null}
      {crestPair.length > 0 ? (
        <View style={styles.heroCrestPair} accessible={false}>
          {crestPair.map((url, i) => (
            <PairCrest key={`${url}-${i}`} url={url} />
          ))}
        </View>
      ) : null}
      {props.children}
    </View>
  );
}

// One crest of the pair, dropping itself on a broken image so a failed
// side degrades the composite to partial instead of leaving a hole.
function PairCrest(props: { url: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return (
    <Image
      source={imageSource(props.url)}
      resizeMode="contain"
      onError={() => setFailed(true)}
      style={styles.heroCrest}
      accessible={false}
    />
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
  // The surface is already carrying both sides' crests (Stage 4B) —
  // a third mark under them is clutter, so the watermark stands down.
  hasCrestPair?: boolean;
  // One line answering "why does this say Time TBC" — on the card,
  // where the question is asked (Prompt 16b).
  timingNote?: string | null;
  minHeight?: number;
  // Round 7 item 5: an Olympic fixture's SPORT emoji as the watermark —
  // the sport's own mark where a badge would be (no Olympic emblem may
  // be drawn), in place of the monogram.
  emojiMark?: string;
}) {
  const th = props.theme;
  const dateOnly = isDateOnly(props.status, props.timePrecision);
  const when = `${whenLabel(props.startUtc, dateOnly)} · ${timeLabel(props.startUtc, props.status, props.timePrecision)}`;
  // The badge watermark PERSISTS over photography (Round 3 B5 ruling —
  // "the F1 logo… should probably be kept"): a badge over a soft scrim
  // patch, full strength, because 0.22 texture-opacity disappears into
  // a photo. It still stands down for a crest pair (two crests plus a
  // third mark is clutter). The MONOGRAM watermark never rides a photo
  // — 150pt letterforms over photography read as damage, and the
  // ruling was about badges.
  const mark = props.hasCrestPair ? null : usableImage(props.crestUrl);
  return (
    <View style={[styles.hero, props.minHeight ? { minHeight: props.minHeight } : null]}>
      {mark ? (
        <View
          style={[
            styles.heroWatermarkCrestWrap,
            props.hasPhoto ? styles.heroWatermarkOverPhoto : null,
          ]}
          accessible={false}
        >
          <Image
            accessible={false}
            source={imageSource(mark)}
            style={[
              styles.heroWatermarkCrest,
              props.hasPhoto ? styles.heroWatermarkCrestOnPhoto : null,
            ]}
            resizeMode="contain"
          />
        </View>
      ) : null}
      {!props.hasPhoto && !props.hasCrestPair && !mark && props.emojiMark ? (
        <Text style={styles.heroWatermark} accessible={false}>
          {props.emojiMark}
        </Text>
      ) : !props.hasPhoto && !props.hasCrestPair && !mark && props.monogram ? (
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
  participantCountries?: string[];
  homeCrestUrl?: string;
  awayCrestUrl?: string;
  timingNote?: string | null;
  emojiMark?: string; // Round 7 item 5 — see PosterFace
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
    : tr('core.hero.nextUpA11y', { title: props.title, when });
  const hasCrestPair =
    usableImage(props.homeCrestUrl) !== undefined ||
    usableImage(props.awayCrestUrl) !== undefined;
  const Container = (props.onPress ? Pressable : View) as typeof Pressable;
  return (
    <Container
      ref={props.innerRef as never}
      accessible
      {...(props.onPress
        ? {
            accessibilityRole: 'button' as const,
            accessibilityLabel: tr('core.a11y.openEvent', { label }),
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
        {...(props.participantCountries
          ? { participantCountries: props.participantCountries }
          : {})}
        {...(props.homeCrestUrl ? { homeCrestUrl: props.homeCrestUrl } : {})}
        {...(props.awayCrestUrl ? { awayCrestUrl: props.awayCrestUrl } : {})}
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
          {...(hasCrestPair ? { hasCrestPair: true } : {})}
          {...(props.photoUrl ? { hasPhoto: true } : {})}
          {...(props.photoUrl && props.photoCredit
            ? { photoCredit: props.photoCredit }
            : {})}
          {...(props.timingNote ? { timingNote: props.timingNote } : {})}
          {...(props.emojiMark ? { emojiMark: props.emojiMark } : {})}
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
  // Per-mark tile fill behind imageUrl (Round 6 tile prep).
  tileFill?: string;
  // Opens the expanded card. The row's own +/× controls sit OUTSIDE
  // this press target so a mis-tap can never toggle the calendar.
  onPress?: () => void;
  // Marks the headline of a card ("Main event"), where the data says so.
  badge?: string;
  // Spoken form of the badge for screen readers (a glyph says nothing).
  badgeA11y?: string;
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
  const bareLabel = `${props.title}, ${props.caption}, ${
    dimmed ? tr('core.row.removedFromCalendar') : props.timeText
  }${props.badgeA11y ? `, ${props.badgeA11y}` : ''}`;
  const label = props.onPress
    ? tr('core.a11y.openEvent', { label: bareLabel })
    : bareLabel;
  const content = (
    <>
      <GlyphTile
        glyph={props.glyph}
        theme={props.theme}
        monogram={props.monogram}
        imageUrl={props.imageUrl}
        {...(props.tileBadge ? { badge: props.tileBadge } : {})}
        {...(props.tileFill ? { fillColour: props.tileFill } : {})}
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
          {dimmed ? tr('core.row.removedCaption') : props.caption}
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
              ? tr('core.row.removeFromCalendarA11y', { title: props.title })
              : tr('core.row.addToCalendarA11y', { title: props.title })
          }
          onPress={props.onTogglePinned}
          hitSlop={8}
          style={styles.excludeButton}
        >
          {/* The word, not the glyph (27C): "+" beside a row names
              nothing — the same ruling FollowButton already carries.
              Add and Added both fit inside the control's existing
              44pt minimum, so the toggle reflows nothing. */}
          <Text
            style={[
              type.secondary,
              styles.pinWord,
              { color: props.pinned ? t.accent : t.primary },
            ]}
            accessible={false}
            numberOfLines={1}
            maxFontSizeMultiplier={1.8}
          >
            {props.pinned ? tr('core.actions.added') : tr('core.actions.add')}
          </Text>
        </Pressable>
      ) : null}
      {props.onToggleExcluded ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            dimmed
              ? tr('core.row.restoreToCalendarA11y', { title: props.title })
              : tr('core.row.removeFromCalendarA11y', { title: props.title })
          }
          onPress={props.onToggleExcluded}
          hitSlop={8}
          style={[styles.excludeButton, styles.excludeWord]}
        >
          {/* Same ruling as the pin control: "×" named nothing. The
              wider minWidth pins the box to the longer word so
              Remove ↔ Removed reflows nothing. */}
          <Text
            style={[
              type.secondary,
              styles.pinWord,
              { color: dimmed ? t.accent : t.textSecondary },
            ]}
            accessible={false}
            numberOfLines={1}
            maxFontSizeMultiplier={1.8}
          >
            {dimmed ? tr('core.actions.removed') : tr('core.actions.remove')}
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
  // Per-mark tile fill behind imageUrl (Round 6 tile prep).
  tileFill?: string;
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
            {...(props.tileFill ? { fillColour: props.tileFill } : {})}
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

// The app's name, set as an identity rather than left as navigation
// default text (Prompt 24 C3). Brand accent + heavy weight + tightened
// tracking — the same voice as the icon, which is a white mark on
// KickOffCal blue. Two weights inside one word carry the "Kick·Off·Cal"
// rhythm without resorting to two colours, which read as a typo in the
// header's small size.
export function Wordmark(props: { size?: number }) {
  const t = useTheme();
  const size = props.size ?? 20;
  return (
    <Text
      accessibilityRole="header"
      style={{
        fontSize: size,
        letterSpacing: -0.5,
        color: t.primary,
        fontWeight: '800',
      }}
    >
      KickOff
      <Text style={{ fontWeight: '400', color: t.primary }}>Cal</Text>
    </Text>
  );
}

// A section screen's title in the same voice as the wordmark: brand
// blue, heavy weight, tightened tracking. One weight throughout — the
// two-weight rhythm belongs to the word "KickOffCal" itself, not to
// ordinary titles.
export function BrandTitle(props: { children: string }) {
  const t = useTheme();
  return (
    <Text
      accessibilityRole="header"
      numberOfLines={1}
      style={{
        fontSize: 20,
        letterSpacing: -0.5,
        color: t.primary,
        fontWeight: '800',
      }}
    >
      {props.children}
    </Text>
  );
}

// Sport entry card (2-per-row grid on Home). Every card NAVIGATES —
// following always happens on a visible Follow button inside, never as
// a hidden tap side-effect (owner ruling: no invisible affordances).
// One height for every row on a Competitions screen (Round 6 item 2).
export const COMPETITION_ROW_HEIGHT = 76;

export function SportCard(props: {
  label: string;
  glyph: string;
  theme: TeamTheme;
  // OPTIONAL, and omitted rather than empty. A club in a league you
  // just opened has no second line worth spending on — every team on
  // the screen shares it — and `caption=""` would still render a Text
  // and still cost its line height on every row.
  caption?: string;
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
  // Per-mark tile fill behind imageUrl (Round 6 tile prep).
  tileFill?: string;
  // Full width in a LIST; the Home grid still wants two per row.
  fullWidth?: boolean;
  // Round 6 item 2: a fixed row height for list rows (every row on a
  // Competitions screen shares it); label and caption fall to one line,
  // ellipsised, so no row grows past its neighbours.
  rowHeight?: number;
  // A tile that is NOT yet openable — a "Coming soon" sport. The row
  // version carried this and the tile has to as well, or the sport
  // picker would have to keep one row type for eleven sports and
  // another for the rest. Dimmed and inert, never hidden: the sport
  // being listed at all is the point.
  disabled?: boolean;
  // Content that grows OUT of the card, inside its border, below the
  // tile row (Stage 6): the expanded competition card's destination
  // buttons. The card's resting geometry is untouched — the shell
  // keeps the border and the row keeps every padding it had.
  expansion?: ReactNode;
  // Read by assistive tech when the tile expands rather than navigates.
  accessibilityExpanded?: boolean;
}) {
  const t = useTheme();
  const { press, setPress } = usePressFade();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={props.accessibilityLabel}
      accessibilityState={{
        ...(props.disabled ? { disabled: true } : {}),
        ...(props.accessibilityExpanded !== undefined
          ? { expanded: props.accessibilityExpanded }
          : {}),
      }}
      disabled={props.disabled === true}
      onPress={props.onPress}
      onPressIn={() => setPress(true)}
      onPressOut={() => setPress(false)}
      style={[
        styles.sportCard,
        // An ODD grid used to hand the last sport a full-width tile —
        // the "double" Olympics tile was this layout accident, no
        // recorded reason behind it (Round 3 A5/B6). Capped to the
        // two-across geometry; the picker's fullWidth tiles opt out.
        !props.fullWidth && styles.sportCardGridCap,
        props.disabled === true && { opacity: 0.45 },
        // Uniform collapsed height; an EXPANSION grows the card below the
        // row (the height rides on the row, never on the card — a fixed
        // card height clipped the [Fixtures | Teams] strip to a sliver).
        props.rowHeight !== undefined && { minHeight: props.rowHeight },
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
      <View
        style={[
          styles.sportCardRow,
          props.compact && styles.sportCardRowCompact,
          props.rowHeight !== undefined && { height: props.rowHeight },
        ]}
      >
      <GlyphTile
        glyph={props.glyph}
        theme={props.theme}
        size={props.compact ? 28 : 36}
        {...(props.monogram ? { monogram: props.monogram } : {})}
        {...(props.imageUrl ? { imageUrl: props.imageUrl } : {})}
        {...(props.tileBadge ? { badge: props.tileBadge } : {})}
        {...(props.tileFill ? { fillColour: props.tileFill } : {})}
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
          numberOfLines={props.compact || props.rowHeight !== undefined ? 1 : 2}
        >
          {props.label}
        </Text>
        {props.caption ? (
          <Text
            style={[type.caption, { color: t.textSecondary }]}
            // TWO LINES ON A FULL TILE, one when compact — the same cut
            // the label makes, for the same reason. The rows these tiles
            // replaced wrapped their caption freely, so a single line
            // clipped "American football · no upcoming fixtures yet"
            // mid-word on the Following list. Compact stays at one line:
            // that geometry exists to hold a 500-name directory to a
            // fixed height, and a caption there is a rank and a country.
            numberOfLines={props.compact || props.rowHeight !== undefined ? 1 : 2}
            ellipsizeMode="tail"
          >
            {props.caption}
          </Text>
        ) : null}
      </View>
      </View>
      {props.expansion}
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
  // Full-bleed variant for screens where NO row carries a control (the
  // sport picker): reserving an empty column there is dead space, not
  // alignment.
  flush?: boolean;
}) {
  return (
    <View style={[styles.tileRow, props.compact && styles.tileRowCompact]}>
      {props.children}
      {/* A controless row reserves the control column (owner ruling
          2026-09-01): every tile in a MIXED list shares one right edge
          — "Players" beside "ATP Tour" used to run the full width and
          the list read as two card systems. The spacer is exactly the
          follow control's pinned hit width, so the edges cannot
          drift apart. */}
      {props.right ??
        (props.flush ? null : <View style={styles.tileRowSpacer} />)}
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

// The device's one first-follow, celebrated at screen scale exactly
// once (Round 3 item 4). The control owns the flag; the host renders it.
const FIRST_FOLLOW_FLAG = 'firstFollowCelebrated.v1';

export function FollowButton(props: {
  following: boolean;
  subject: string;
  onPress: () => void;
  busy?: boolean;
  // The entity's generated-treatment palette, for the follow burst
  // (Round 3): team-specific by construction, no new assets. Absent →
  // the shell's brand colour, so markless followables still celebrate.
  theme?: TeamTheme;
  // The crest's extracted dominant pair (Round 3 colour ruling), where
  // the directory carries one — at most two flat full-saturation
  // colours; the sparkle white is mixed in by the burst itself.
  burstColours?: readonly string[];
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
  const reduceMotion = useReduceMotion();
  // ── The follow celebration (Round 3), on the SHARED control so every
  // site gets it identically. Fire-and-forget on the false→true flip:
  // the state change, the sync and any navigation happened upstream and
  // are never delayed. Unfollow is silent. Transform/opacity on the
  // native driver only; under reduced motion the flip and the haptic
  // are the whole celebration.
  const pop = useRef(new Animated.Value(1)).current;
  const prevFollowing = useRef(props.following);
  const [burstNonce, setBurstNonce] = useState(0);
  useEffect(() => {
    const was = prevFollowing.current;
    prevFollowing.current = props.following;
    if (was || !props.following) return; // only the follow moment
    // Required LAZILY: native bindings at module scope drag MMKV and
    // haptics into every jest suite that imports a shared component —
    // the exact failure the appearance store already taught this
    // codebase (and googleCalendarAuth repeats the pattern).
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Haptics = require('expo-haptics') as typeof import('expo-haptics');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const storage = require('./storage') as typeof import('./storage');
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(
      () => undefined,
    );
    if (reduceMotion) return;
    pop.setValue(1);
    Animated.sequence([
      Animated.timing(pop, { toValue: 1.12, duration: 90, useNativeDriver: true }),
      Animated.spring(pop, { toValue: 1, friction: 4, useNativeDriver: true }),
    ]).start();
    if (!storage.readJson<boolean>(FIRST_FOLLOW_FLAG, false)) {
      // The very first follow this device has ever made: the grand,
      // screen-scale version, once per lifetime.
      storage.writeJson(FIRST_FOLLOW_FLAG, true);
      celebrateGrand(burstPalette({ colours: props.burstColours, theme: props.theme }, t));
    } else {
      setBurstNonce((n) => n + 1); // re-taps RESTART the burst, never stack
    }
  }, [props.following, reduceMotion, pop, props.theme, props.burstColours, t]);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        props.following
          ? tr('core.follow.unfollowA11y', { subject: props.subject })
          : tr('core.follow.followA11y', { subject: props.subject })
      }
      onPress={props.onPress}
      disabled={props.busy}
      style={styles.followButtonHit}
    >
      {/* The visual box is what pops — the hit target above never
          moves, so a rapid second tap lands where the first did. */}
      <Animated.View
        style={[
          styles.followButton,
          props.following
            ? { backgroundColor: 'transparent', borderColor: t.border }
            : { backgroundColor: t.primary, borderColor: t.primary },
          { transform: [{ scale: pop }] },
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
            {props.following
              ? tr('core.follow.following')
              : tr('core.follow.follow')}
          </Text>
        )}
      </Animated.View>
      <FollowBurst nonce={burstNonce} palette={burstPalette({ colours: props.burstColours, theme: props.theme }, t)} />
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Status: one chip that speaks like a person, not a diff.

function relative(atIso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(atIso).getTime()) / 60_000));
  if (mins < 1) return tr('core.status.justNow');
  if (mins < 60) return tr('core.status.minsAgo', { n: mins });
  const hours = Math.round(mins / 60);
  if (hours < 24) return tn('core.status.hoursAgo', hours);
  const days = Math.round(hours / 24);
  return tn('core.status.daysAgo', days);
}

// Past this, "your calendar synced" stops being the whole truth — the
// SOURCE side has been quiet too long to keep saying up to date.
export const DATA_STALE_HOURS = 48;

// The happy-path sync sentence, single-sourced: Schedule's once-per-
// session toast and the status chip say it with the same words.
export function lastSyncLine(atIso: string, changed: number): string {
  return changed > 0
    ? tr('core.status.updated', {
        changes: tn('core.status.changes', changed),
        when: relative(atIso),
      })
    : tr('core.status.upToDate', { when: relative(atIso) });
}

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
  // One optional action beside the text — the Settings deep-link when
  // the error is a permission the OS will no longer ask about.
  action?: { label: string; onPress: () => void } | null;
}) {
  const t = useTheme();
  const dataStale =
    props.dataStaleHours != null && props.dataStaleHours > DATA_STALE_HOURS;
  let text: string;
  if (props.running)
    text = props.calendarOff
      ? tr('core.status.checking')
      : tr('core.status.updating');
  else if (props.error) text = props.error;
  else if (dataStale)
    text = tr('core.status.sourcesQuiet', {
      n: Math.round(props.dataStaleHours! / 24),
    });
  else if (props.calendarOff)
    text =
      props.lastAt === null
        ? tr('core.status.calendarOff')
        : tr('core.status.upToDateCalendarOff');
  else if (props.lastAt === null) text = tr('core.status.notSynced');
  else text = lastSyncLine(props.lastAt, props.changed);
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
      {props.action && !props.running ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={props.action.label}
          onPress={props.action.onPress}
          hitSlop={8}
          style={{ marginLeft: spacing.s }}
        >
          <Text style={[type.caption, { color: t.primary, fontWeight: '700' }]}>
            {props.action.label}
          </Text>
        </Pressable>
      ) : null}
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
          {tr('core.status.calendarOff')}
        </Text>
        <Text style={[type.caption, { color: t.textSecondary, marginTop: 2 }]}>
          {props.fixtureCount > 0
            ? tn('core.banner.fixturesReady', props.fixtureCount)
            : tr('core.banner.fixturesWhenConnected')}
        </Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={tr('core.banner.addA11y')}
        onPress={props.onEnable}
        style={[styles.bannerCta, { backgroundColor: t.primary }]}
      >
        <Text style={[type.secondary, { color: t.onPrimary, fontWeight: '600' }]}>
          {tr('core.actions.add')}
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
          open ? tr('core.coverage.hideA11y') : tr('core.coverage.showA11y')
        }
        onPress={() => setOpen((v) => !v)}
        hitSlop={8}
        style={styles.coverageToggle}
      >
        <Text style={[type.caption, { color: t.textSecondary }]}>
          {open
            ? tr('core.coverage.openLabel')
            : tr('core.coverage.closedLabel')}
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
  // Centred pair, oversized and slightly translucent so the type block
  // stays the loudest thing on the card — imagery, not decoration war.
  heroFlags: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.l,
    opacity: 0.9,
  },
  heroFlag: { fontSize: 72 },
  // The composite's crest pair: centred like the flags, sized to read
  // as identity rather than decoration, quiet enough that the type
  // block stays the loudest thing on the card.
  heroCrestPair: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xl,
    opacity: 0.92,
  },
  heroCrest: { width: 72, height: 72 },
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
  // Positioning lives on the wrap so the badge can carry a scrim patch
  // over photography (Round 3 B5) without moving.
  heroWatermarkCrestWrap: {
    position: 'absolute',
    right: spacing.l,
    bottom: spacing.l,
  },
  heroWatermarkCrest: {
    width: 96,
    height: 96,
    opacity: 0.22,
  },
  // Over a photo the badge is content, not texture: full strength on a
  // soft dark patch that keeps it legible against any photograph.
  heroWatermarkOverPhoto: {
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderRadius: radiusTokens.card,
    padding: spacing.s,
  },
  heroWatermarkCrestOnPhoto: {
    width: 64,
    height: 64,
    opacity: 0.9,
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
  // The Follow control's HIT target: fixed geometry that never moves,
  // even while the visual box inside it pops (Round 3).
  followButtonHit: {
    minWidth: FOLLOW_HIT_MIN_WIDTH,
    minHeight: 44,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // The controless row's reserved column (TileRow) — the SAME constant
  // as the hit target above, by construction.
  tileRowSpacer: {
    width: FOLLOW_HIT_MIN_WIDTH,
    flexShrink: 0,
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
  pinWord: { fontWeight: '600' },
  excludeWord: { minWidth: 66 },
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
  },
  // The translated surface the drift rides — the gap lives here so the
  // whole strip, spacing included, moves as one piece.
  railInner: { flexDirection: 'row', gap: spacing.l },
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
  // SHELL and ROW split (Stage 6): the shell keeps the border and the
  // grid geometry, the row keeps every spacing the one-piece card had —
  // so a card with an `expansion` grows inside its own border and a
  // card without one is pixel-identical to what it was.
  sportCard: {
    flexBasis: '46%',
    flexGrow: 1,
    borderRadius: radius.card,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  // Two-across ceiling: flexGrow may top a row's tiles up, never let a
  // lone last tile swallow the whole row (48.5% + 48.5% + the grid's
  // gap fits; a third won't).
  sportCardGridCap: { maxWidth: '48.5%' },
  sportCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.m,
    minHeight: 64,
    paddingHorizontal: spacing.m,
    paddingVertical: spacing.m,
    // The grid stretches cards to the tallest in their wrapped row; the
    // row must grow with the shell or a stretched card leaves its
    // content pinned to the top with dead space below.
    flexGrow: 1,
  },
  sportCardRowCompact: {
    minHeight: 48,
    paddingVertical: spacing.s,
    gap: spacing.s,
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
