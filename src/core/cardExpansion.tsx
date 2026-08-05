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
import { ToastHost } from './toast';
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
  const [phase, setPhase] = useState<Phase>('open');
  const [reduceMotion, setReduceMotion] = useState(false);
  // Geometry animates as FOUR values rather than as one interpolated
  // progress. The card's content height is not known when it opens — a
  // fight card's bouts arrive from a query a moment later — and with a
  // single progress value the only way to use a late height is to swap
  // the interpolation's output range underneath it, which makes the
  // card JUMP. Its own value can simply animate to the new height.
  const left = useRef(new Animated.Value(0)).current;
  const top = useRef(new Animated.Value(0)).current;
  const width = useRef(new Animated.Value(0)).current;
  const height = useRef(new Animated.Value(0)).current;
  const progress = useRef(new Animated.Value(0)).current; // scrim only
  const bodyIn = useRef(new Animated.Value(0)).current;
  const origin = useRef<CardFrame | null>(null);
  const contentHeight = useRef<number | null>(null);
  // Read inside animation callbacks, where the state value would be the
  // one captured when the callback was created.
  const phaseRef = useRef<Phase>('open');

  const glide = useCallback(
    (frame: CardFrame, duration: number, easing: (v: number) => number) =>
      Animated.parallel(
        (
          [
            [left, frame.x],
            [top, frame.y],
            [width, frame.width],
            [height, frame.height],
          ] as const
        ).map(([value, target]) =>
          Animated.timing(value, {
            toValue: target,
            duration,
            easing,
            useNativeDriver: false,
          }),
        ),
        // NEVER stop together. The height is re-targeted the moment the
        // body measures itself, and a shared stop would cancel the other
        // three axes — and, when this sat inside a sequence, the body's
        // reveal with them. That is exactly how the first build of this
        // opened a full-height card with nothing in it.
        { stopTogether: false },
      ),
    [left, top, width, height],
  );

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

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  const close = useCallback(() => {
    const req = request;
    // A second tap on the scrim while the card is already shrinking must
    // not start a second animation racing the first.
    if (!req || phase === 'closing') return;
    setPhase('closing');
    if (flightTimer.current) {
      clearTimeout(flightTimer.current);
      flightTimer.current = null;
    }
    void (async () => {
      // WHERE IT ACTUALLY IS NOW, not where it was when it opened: the
      // list underneath may have scrolled, and shrinking to a stale
      // frame is the tell that this was never one object.
      const now = (await req.remeasure?.()) ?? null;
      if (now) origin.current = now;
      const back = origin.current ?? req.frame;
      Animated.parallel(
        [
          Animated.timing(bodyIn, {
            toValue: 0,
            duration: reduceMotion ? 0 : motion.fast,
            useNativeDriver: true,
          }),
          Animated.timing(progress, {
            toValue: 0,
            duration: reduceMotion ? 0 : motion.standard,
            useNativeDriver: false,
          }),
          glide(
            back,
            reduceMotion ? 0 : motion.standard,
            Easing.bezier(0.4, 0, 0.2, 1),
          ),
        ],
        { stopTogether: false },
      ).start(({ finished }) => {
        if (finished) {
          setRequest(null);
          setPhase('open');
        }
      });
    })();
  }, [request, progress, bodyIn, reduceMotion]);

  // THE GEOMETRY WAITS FOR THE TARGET.
  //
  // The body's height is not knowable until it has laid out, and the
  // card's width is already its final width from the first frame (every
  // origin is clamped to the card's column), so ONE layout pass at the
  // origin size yields the true content height. Starting the glide
  // before that meant aiming at the MAXIMUM and then hauling the card
  // back down — the "expands to the whole screen, then shrinks" the
  // owner saw. So the flight begins when the height arrives.
  const flightStarted = useRef(false);
  const flightTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const beginFlight = useCallback(
    (targetHeight: number | null) => {
      if (flightStarted.current) return;
      flightStarted.current = true;
      if (flightTimer.current) {
        clearTimeout(flightTimer.current);
        flightTimer.current = null;
      }
      Animated.parallel(
        [
          // Decelerating: the card arrives, it does not bounce.
          glide(
            fittedFrame(targetHeight),
            reduceMotion ? 0 : motion.slow,
            Easing.bezier(0.2, 0.8, 0.2, 1),
          ),
          // A SHORT STAGGER, not simultaneous: the body appears once the
          // geometry has settled. A DELAY rather than a sequence, so the
          // reveal cannot be cancelled by the height being re-targeted
          // underneath it.
          Animated.timing(bodyIn, {
            toValue: 1,
            duration: reduceMotion ? 0 : motion.standard,
            delay: reduceMotion ? 0 : motion.slow,
            useNativeDriver: true,
          }),
        ],
        { stopTogether: false },
      ).start(({ finished }) => {
        if (finished) setPhase('open');
      });
    },
    [glide, bodyIn, reduceMotion],
  );

  const open = useCallback(
    (r: ExpansionRequest) => {
      origin.current = r.frame;
      contentHeight.current = null;
      flightStarted.current = false;
      setRequest(r);
      setPhase('opening');
      progress.setValue(0);
      bodyIn.setValue(0);
      left.setValue(r.frame.x);
      top.setValue(r.frame.y);
      width.setValue(r.frame.width);
      height.setValue(r.frame.height);
      // The scrim dims from the moment the finger lifts — it waits on
      // nothing, and what it covers for one layout pass is the card
      // still sitting exactly where it was.
      Animated.timing(progress, {
        toValue: 1,
        duration: reduceMotion ? 0 : motion.slow,
        useNativeDriver: false,
      }).start();
      // A body that never reports a height must not leave the card
      // stuck at the size of the row it came from.
      if (flightTimer.current) clearTimeout(flightTimer.current);
      flightTimer.current = setTimeout(() => beginFlight(null), 150);
    },
    [progress, bodyIn, reduceMotion, left, top, width, height, beginFlight],
  );

  // The body has measured itself: the FIRST report is the flight's
  // target, and every later one — bouts arriving from a query after the
  // card has opened — is an animated settle rather than a jump.
  const settleTo = useCallback(
    (h: number) => {
      if (contentHeight.current === h) return;
      contentHeight.current = h;
      // While the card is shrinking back, its height belongs to the
      // dismissal — a body that finishes measuring mid-flight must not
      // pull it open again.
      if (phaseRef.current === 'closing') return;
      if (!flightStarted.current) {
        beginFlight(h);
        return;
      }
      Animated.timing(height, {
        toValue: fittedFrame(h).height,
        duration: reduceMotion ? 0 : motion.standard,
        easing: Easing.bezier(0.4, 0, 0.2, 1),
        useNativeDriver: false,
      }).start();
    },
    [height, reduceMotion, beginFlight],
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
      {request ? (
        <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
          <Animated.View
            style={[
              StyleSheet.absoluteFill,
              styles.scrim,
              { opacity: progress },
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
              left,
              top,
              width,
              height,
              borderRadius: radius.hero,
            }}
          >
            {props.renderExpanded(request.payload as never, close, bodyIn, settleTo)}
          </Animated.View>
          {/* The card's own toast host. A modal is a separate window,
              so the root one is underneath it — an Undo the user cannot
              see is an Undo they do not have. */}
          <ToastHost />
        </View>
      ) : null}
      </Modal>
    </Ctx.Provider>
  );
}

const styles = StyleSheet.create({
  scrim: { backgroundColor: 'rgba(8,7,6,0.55)' },
});
