// App-root toast: the follow moment ("Added 38 fixtures · Undo") and
// other transient confirmations. One host, mounted once in App.tsx;
// anything may call showToast(). Motion uses the standard token and
// collapses to instant show/hide under reduced motion.

import { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
} from 'react-native';
import { motion, radius, spacing, type, useTheme } from './tokens';

export interface ToastSpec {
  message: string;
  action?: { label: string; onPress: () => void };
}

const PLAIN_MS = 2_500;
const ACTION_MS = 6_000; // long enough to actually hit Undo

type Listener = (t: ToastSpec) => void;

// A STACK, not a single listener. The expanded card is a native modal
// window, and anything rendered in the root window — including the
// toast — is BELOW it: an Undo fired from inside the card was invisible,
// which is the same as not existing. So the card mounts its own host,
// and the top-most host wins. Popping restores the one underneath, so
// the root host is never left orphaned.
const listeners: Listener[] = [];

export function showToast(t: ToastSpec): void {
  listeners[listeners.length - 1]?.(t);
}

export function ToastHost() {
  const t = useTheme();
  const [toast, setToast] = useState<ToastSpec | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const reduceMotion = useRef(false);

  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then((v) => {
      reduceMotion.current = v;
    });
    listeners.push(setToast);
    return () => {
      const i = listeners.indexOf(setToast);
      if (i >= 0) listeners.splice(i, 1);
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    if (reduceMotion.current) {
      opacity.setValue(1);
    } else {
      Animated.timing(opacity, {
        toValue: 1,
        duration: motion.standard,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start();
    }
    const timer = setTimeout(
      () => setToast(null),
      toast.action ? ACTION_MS : PLAIN_MS,
    );
    return () => clearTimeout(timer);
  }, [toast, opacity]);

  useEffect(() => {
    if (toast) return;
    opacity.setValue(0);
  }, [toast, opacity]);

  if (!toast) return null;
  return (
    <Animated.View
      accessibilityLiveRegion="polite"
      accessibilityRole="alert"
      style={[
        styles.toast,
        { backgroundColor: t.textPrimary, opacity },
      ]}
    >
      <Text
        style={[type.secondary, { color: t.bg, flexShrink: 1 }]}
        numberOfLines={2}
      >
        {toast.message}
      </Text>
      {toast.action ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={toast.action.label}
          hitSlop={12}
          onPress={() => {
            const a = toast.action;
            setToast(null);
            a?.onPress();
          }}
        >
          <Text style={[type.secondary, { color: t.bg, fontWeight: '700' }]}>
            {toast.action.label}
          </Text>
        </Pressable>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  toast: {
    position: 'absolute',
    left: spacing.l,
    right: spacing.l,
    bottom: 100, // clears the tab bar
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.l,
    minHeight: 48,
    paddingHorizontal: spacing.l,
    paddingVertical: spacing.m,
    borderRadius: radius.card,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
});
