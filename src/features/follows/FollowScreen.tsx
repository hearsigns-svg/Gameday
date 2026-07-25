// Slice screen: one followable (Liverpool FC), one primary action.
// M3 replaces this with the config-driven browse hierarchy.

import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { messageOf } from '../../core/result';
import { radius, spacing, type, useTheme } from '../../core/tokens';
import { lastSync, runSync, SyncOutcome } from '../calendar-sync/syncEngine';
import { Fixture } from '../fixtures/domain/fixture';
import {
  fetchFixturesForFollows,
  requestPoll,
} from '../fixtures/data/fixturesRepo';
import { loadFollows, setFollowed } from './data/followStore';

// Slice followable. Season 2023: the API-Sports free tier serves 2022–24.
const LIVERPOOL = {
  key: 'apisports-team-40',
  label: 'Liverpool FC',
  sport: 'Soccer',
  teamId: 40,
  season: 2023,
};

type Status =
  | { kind: 'idle' }
  | { kind: 'working'; label: string }
  | { kind: 'error'; message: string }
  | { kind: 'synced'; outcome: SyncOutcome };

export default function FollowScreen() {
  const t = useTheme();
  const [followed, setFollowedState] = useState(
    () => loadFollows().includes(LIVERPOOL.key),
  );
  const [status, setStatus] = useState<Status>(() => {
    const last = lastSync();
    return last ? { kind: 'synced', outcome: last } : { kind: 'idle' };
  });
  const [fixtures, setFixtures] = useState<Fixture[]>([]);

  const refreshFixtureList = useCallback(async () => {
    const r = await fetchFixturesForFollows(loadFollows());
    if (r.ok) {
      setFixtures(
        [...r.value].sort((a, b) => a.startUtc.localeCompare(b.startUtc)),
      );
    }
  }, []);

  useEffect(() => {
    if (followed) void refreshFixtureList();
  }, [followed, refreshFixtureList]);

  const syncNow = useCallback(async () => {
    setStatus({ kind: 'working', label: 'Syncing calendar…' });
    const r = await runSync();
    if (r.ok) setStatus({ kind: 'synced', outcome: r.value });
    else setStatus({ kind: 'error', message: messageOf(r.error) });
    await refreshFixtureList();
  }, [refreshFixtureList]);

  const toggleFollow = useCallback(async () => {
    const next = !followed;
    setFollowedState(next);
    setFollowed(LIVERPOOL.key, next);
    if (next) {
      setStatus({ kind: 'working', label: 'Fetching fixtures…' });
      const poll = await requestPoll(LIVERPOOL.teamId, LIVERPOOL.season);
      if (!poll.ok) {
        setStatus({ kind: 'error', message: messageOf(poll.error) });
        return;
      }
    }
    await syncNow();
  }, [followed, syncNow]);

  return (
    <ScrollView
      style={{ backgroundColor: t.bg }}
      contentContainerStyle={styles.container}
    >
      <Text style={[type.display, { color: t.textPrimary }]}>Gameday</Text>
      <Text
        style={[type.secondary, { color: t.textSecondary, marginTop: spacing.xs }]}
      >
        Fixtures for the teams you follow, kept up to date in your calendar.
      </Text>

      <View
        style={[
          styles.card,
          { backgroundColor: t.surface, borderColor: t.border },
        ]}
      >
        <View style={{ flex: 1 }}>
          <Text style={[type.heading, { color: t.textPrimary }]}>
            {LIVERPOOL.label}
          </Text>
          <Text style={[type.caption, { color: t.textSecondary }]}>
            {LIVERPOOL.sport}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            followed ? `Unfollow ${LIVERPOOL.label}` : `Follow ${LIVERPOOL.label}`
          }
          onPress={toggleFollow}
          style={[
            styles.followButton,
            followed
              ? { backgroundColor: t.surfaceRaised, borderColor: t.border }
              : { backgroundColor: t.primary, borderColor: t.primary },
          ]}
        >
          <Text
            style={[
              type.body,
              { color: followed ? t.textPrimary : t.onPrimary, fontWeight: '600' },
            ]}
          >
            {followed ? 'Following' : 'Follow'}
          </Text>
        </Pressable>
      </View>

      {status.kind === 'working' && (
        <View style={styles.statusRow}>
          <ActivityIndicator color={t.primary} />
          <Text style={[type.secondary, { color: t.textSecondary }]}>
            {status.label}
          </Text>
        </View>
      )}
      {status.kind === 'error' && (
        <Text style={[type.secondary, { color: t.danger, marginTop: spacing.m }]}>
          {status.message}
        </Text>
      )}
      {status.kind === 'synced' && (
        <Text
          style={[type.secondary, { color: t.accent, marginTop: spacing.m }]}
          accessibilityLiveRegion="polite"
        >
          Calendar up to date · {status.outcome.created} added ·{' '}
          {status.outcome.updated} updated · {status.outcome.deleted} removed
        </Text>
      )}

      {followed && fixtures.length > 0 && (
        <View style={{ marginTop: spacing.xl }}>
          <Text style={[type.heading, { color: t.textPrimary }]}>
            In your calendar
          </Text>
          {fixtures.slice(0, 8).map((f) => (
            <View
              key={f.id}
              style={[styles.fixtureRow, { borderColor: t.border }]}
            >
              <Text style={[type.body, { color: t.textPrimary }]}>
                {f.homeTeam} v {f.awayTeam}
              </Text>
              <Text style={[type.caption, { color: t.textSecondary }]}>
                {new Date(f.startUtc).toLocaleString()} · {f.competition}
              </Text>
            </View>
          ))}
          <Text style={[type.caption, { color: t.textSecondary, marginTop: spacing.s }]}>
            {fixtures.length} fixtures synced
          </Text>
        </View>
      )}

      {followed && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Sync now"
          onPress={syncNow}
          style={[styles.syncButton, { borderColor: t.border }]}
        >
          <Text style={[type.secondary, { color: t.textSecondary }]}>
            Sync now
          </Text>
        </Pressable>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.l, paddingTop: spacing.xxl * 2 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.l,
    borderRadius: radius.card,
    borderWidth: StyleSheet.hairlineWidth,
    marginTop: spacing.xl,
  },
  followButton: {
    paddingHorizontal: spacing.l,
    paddingVertical: spacing.m,
    borderRadius: radius.button,
    borderWidth: 1,
    minHeight: 44,
    justifyContent: 'center',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s,
    marginTop: spacing.m,
  },
  fixtureRow: {
    paddingVertical: spacing.m,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  syncButton: {
    marginTop: spacing.xl,
    paddingVertical: spacing.m,
    alignItems: 'center',
    borderRadius: radius.button,
    borderWidth: 1,
    minHeight: 44,
  },
});
