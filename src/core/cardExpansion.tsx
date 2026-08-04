// The card literally expands.
//
// Not "a modal containing the card": the card the user tapped IS the
// modal. Its frame is measured where it sits, lifted into an overlay at
// exactly that frame, and its geometry animated out to the expanded
// frame — one element throughout, background and type continuous, no
// second copy cross-fading over the original.
//
// WHY MEASURE-AND-ANIMATE RATHER THAN A SHARED-ELEMENT TRANSITION:
// react-native-reanimated is not a dependency of this project, and its
// shared-element transitions were experimental in v3 and are not
// available in the v4 line Expo SDK 57 pairs with. Adding a native
// dependency and a prebuild for one transition — one we would then not
// control the interpolation of — buys less than 120 lines of measured
// geometry. This is that.
//
// THE ONE RULE THAT SHAPES EVERYTHING: the object keeps its WIDTH.
// Origin and destination are both the screen gutter inset, so nothing
// horizontal changes and the title's line breaking cannot reflow while
// the card is in flight. Only y and height interpolate, which is also
// what makes the motion read as the card growing rather than a sheet
// arriving.

import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  AccessibilityInfo,
  Animated,
  BackHandler,
  Dimensions,
  Easing,
  Modal,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { motion, radius, spacing } from './tokens';

export interface CardFrame {
  x: number;
  y: number;
  width: number;
  height: number;
}

// What the host needs to fly a card: where it is now, and how to draw it.
export interface ExpansionRequest<T = unknown> {
  key: string;
  frame: CardFrame;
  payload: T;
  // Re-measured at dismiss so the card shrinks back to where the row
  // ACTUALLY is now — the list may have scrolled while it was open.
  remeasure?: () => Promise<CardFrame | null>;
}

type Phase = 'opening' | 'open' | 'closing';

interface ExpansionState {
  request: ExpansionRequest | null;
  phase: Phase;
  open: (r: ExpansionRequest) => void;
  close: () => void;
  // The key currently lifted into the overlay — its origin must render
  // itself invisible so the user never sees two of the same card.
  liftedKey: string | null;
}

const Ctx = createContext<ExpansionState | null>(null);

export function useCardExpansion(): ExpansionState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useCardExpansion outside CardExpansionHost');
  return ctx;
}

// Measure a mounted view in window coordinates. Returns null when the
// view has gone — a virtualised row scrolled out of the list, say.
export function measureFrame(ref: {
  current: { measureInWindow?: (cb: (x: number, y: number, w: number, h: number) => void) => void } | null;
}): Promise<CardFrame | null> {
  return new Promise((resolve) => {
    const node = ref.current;
    if (!node || typeof node.measureInWindow !== 'function') {
      resolve(null);
      return;
    }
    // measureInWindow never calls back if the view is unmounted mid
    // flight; a short race keeps the interaction responsive instead of
    // hanging on a promise nothing will settle.
    let settled = false;
    const done = (f: CardFrame | null) => {
      if (settled) return;
      settled = true;
      resolve(f);
    };
    setTimeout(() => done(null), 120);
    node.measureInWindow((x, y, width, height) => {
      done(width > 0 && height > 0 ? { x, y, width, height } : null);
    });
  });
}

const GUTTER = spacing.l;
// Room above and below the expanded card. It is a card, not a sheet: it
// must not touch the edges, or it stops reading as an object.
const TOP_INSET = 72;
const BOTTOM_INSET = 40;

// The card's column, and the tallest it may ever be.
export function expandedFrame(win = Dimensions.get('window')): CardFrame {
  return {
    x: GUTTER,
    y: TOP_INSET,
    width: win.width - GUTTER * 2,
    height: win.height - TOP_INSET - BOTTOM_INSET,
  };
}

// A CARD IS AS TALL AS WHAT IS IN IT. Growing every fixture to the full
// screen left a hand's width of empty poster under the last control,
// which reads as a sheet that failed to fill rather than an object.
// The body measures itself, and the destination height follows it up to
// the cap; a fixture with a 12-bout undercard fills the screen, one with
// two controls does not.
function fittedFrame(contentHeight: number | null): CardFrame {
  const max = expandedFrame();
  if (contentHeight === null) return max;
  return { ...max, height: Math.min(contentHeight, max.height) };
}

export function CardExpansionHost(props: {
  children: ReactNode;
  // Draws the expanded card. `reveal` runs 0 → 1 AFTER the geometry has
  // settled, so the body can stagger in behind the object rather than
  // arriving with it.
  renderExpanded: (
    payload: never,
    close: () => void,
    reveal: Animated.Value,
    // Called by the body once it knows its natural height, so the card
    // can settle to exactly that.
    onContentHeight: (h: number) => void,
  ) => ReactNode;
}) {
  const [request, setRequest] = useState<ExpansionRequest | null>(null);
  const [contentHeight, setContentHeight] = useState<number | null>(null);
  const [phase, setPhase] = useState<Phase>('open');
  const [reduceMotion, setReduceMotion] = useState(false);
  const progress = useRef(new Animated.Value(0)).current;
  const bodyIn = useRef(new Animated.Value(0)).current;
  const origin = useRef<CardFrame | null>(null);

  useEffect(() => {
    let alive = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((on) => {
      if (alive) setReduceMotion(on);
    });
    const sub = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setReduceMotion,
    );
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);

  const close = useCallback(() => {
    const req = request;
    if (!req) return;
    setPhase('closing');
    void (async () => {
      // WHERE IT ACTUALLY IS NOW, not where it was when it opened: the
      // list underneath may have scrolled, and shrinking to a stale
      // frame is the tell that this was never one object.
      const now = (await req.remeasure?.()) ?? null;
      if (now) origin.current = now;
      Animated.parallel([
        Animated.timing(bodyIn, {
          toValue: 0,
          duration: reduceMotion ? 0 : motion.fast,
          useNativeDriver: true,
        }),
        Animated.timing(progress, {
          toValue: 0,
          duration: reduceMotion ? 0 : motion.standard,
          easing: Easing.bezier(0.4, 0, 0.2, 1),
          useNativeDriver: false,
        }),
      ]).start(({ finished }) => {
        if (finished) {
          setRequest(null);
          setPhase('open');
        }
      });
    })();
  }, [request, progress, bodyIn, reduceMotion]);

  const open = useCallback(
    (r: ExpansionRequest) => {
      origin.current = r.frame;
      setRequest(r);
      setContentHeight(null);
      setPhase('opening');
      progress.setValue(0);
      bodyIn.setValue(0);
      Animated.sequence([
        Animated.timing(progress, {
          toValue: 1,
          duration: reduceMotion ? 0 : motion.slow,
          // Decelerating: the card arrives, it does not bounce.
          easing: Easing.bezier(0.2, 0.8, 0.2, 1),
          useNativeDriver: false,
        }),
        // A SHORT STAGGER, not simultaneous: the body appears once the
        // geometry has settled, so the eye follows one object and then
        // reads what is inside it.
        Animated.timing(bodyIn, {
          toValue: 1,
          duration: reduceMotion ? 0 : motion.standard,
          useNativeDriver: true,
        }),
      ]).start(({ finished }) => {
        if (finished) setPhase('open');
      });
    },
    [progress, bodyIn, reduceMotion],
  );

  // Android's back gesture closes the card, never the screen behind it.
  useEffect(() => {
    if (!request) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      close();
      return true;
    });
    return () => sub.remove();
  }, [request, close]);

  const value = useMemo<ExpansionState>(
    () => ({
      request,
      phase,
      open,
      close,
      liftedKey: request ? request.key : null,
    }),
    [request, phase, open, close],
  );

  const from = origin.current ?? request?.frame ?? null;
  const to = fittedFrame(contentHeight);
  const interp = (a: number, b: number) =>
    progress.interpolate({ inputRange: [0, 1], outputRange: [a, b] });

  return (
    <Ctx.Provider value={value}>
      {props.children}
      {/* A native MODAL WINDOW, not a sibling view: the navigation
          header is a platform view (react-native-screens) and draws
          above anything rendered beside it, so a JS overlay had the
          settings gear floating on top of the card. `animationType`
          stays 'none' — the card provides the motion, the window must
          not add its own. Window coordinates are unchanged, so the
          measured frames still line up exactly. */}
      <Modal
        visible={request !== null}
        transparent
        animationType="none"
        statusBarTranslucent
        onRequestClose={close}
      >
      {request && from ? (
        <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
          <Animated.View
            style={[
              StyleSheet.absoluteFill,
              styles.scrim,
              { opacity: interp(0, 1) },
            ]}
            pointerEvents={phase === 'closing' ? 'none' : 'auto'}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close"
              onPress={close}
              style={StyleSheet.absoluteFill}
            />
          </Animated.View>
          <Animated.View
            style={{
              position: 'absolute',
              left: interp(from.x, to.x),
              top: interp(from.y, to.y),
              width: interp(from.width, to.width),
              height: interp(from.height, to.height),
              borderRadius: radius.hero,
            }}
          >
            {props.renderExpanded(
              request.payload as never,
              close,
              bodyIn,
              (h) => setContentHeight((prev) => (prev === h ? prev : h)),
            )}
          </Animated.View>
        </View>
      ) : null}
      </Modal>
    </Ctx.Provider>
  );
}

const styles = StyleSheet.create({
  scrim: { backgroundColor: 'rgba(8,7,6,0.55)' },
});
