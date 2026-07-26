// Canonical shared components (see DESIGN_SYSTEM.md). Tokens only —
// no raw hex, 44pt minimum targets, labels on every interactive element.

import { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { radius, spacing, type, useTheme } from './tokens';

export function ListRow(props: {
  title: string;
  caption?: string;
  glyph?: string;
  right?: ReactNode;
  onPress?: () => void;
  accessibilityLabel: string;
  disabled?: boolean;
}) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole={props.onPress ? 'button' : undefined}
      accessibilityLabel={props.accessibilityLabel}
      onPress={props.onPress}
      disabled={props.disabled || !props.onPress}
      style={({ pressed }) => [
        styles.row,
        { borderColor: t.border, opacity: props.disabled ? 0.45 : 1 },
        pressed && { backgroundColor: t.surface },
      ]}
    >
      {props.glyph ? (
        <Text style={[type.heading, styles.glyph]} accessible={false}>
          {props.glyph}
        </Text>
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

export function FollowButton(props: {
  following: boolean;
  subject: string;
  onPress: () => void;
  busy?: boolean;
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
          {props.following ? 'Following' : 'Follow'}
        </Text>
      )}
    </Pressable>
  );
}

export function StatusPill(props: { running: boolean; summary: string | null }) {
  const t = useTheme();
  if (!props.running && !props.summary) return null;
  return (
    <View
      accessibilityLiveRegion="polite"
      style={[styles.pill, { backgroundColor: t.surface, borderColor: t.border }]}
    >
      {props.running ? (
        <ActivityIndicator size="small" color={t.primary} />
      ) : null}
      <Text style={[type.caption, { color: t.textSecondary }]}>
        {props.running ? 'Syncing calendar…' : props.summary}
      </Text>
    </View>
  );
}

export function EmptyState(props: {
  headline: string;
  body: string;
  actionLabel: string;
  onAction: () => void;
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
    </View>
  );
}

const styles = StyleSheet.create({
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
  followButton: {
    paddingHorizontal: spacing.l,
    borderRadius: radius.button,
    borderWidth: 1,
    minHeight: 44,
    minWidth: 104,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s,
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.m,
    paddingVertical: spacing.s,
    borderRadius: radius.chip,
    borderWidth: StyleSheet.hairlineWidth,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
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
