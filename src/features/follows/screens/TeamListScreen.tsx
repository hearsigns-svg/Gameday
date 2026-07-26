// Team browse level with search. Following a team yields ALL its
// fixtures across competitions (docs/PRODUCT.md).

import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { FollowButton, ListRow } from '../../../core/components';
import { RootStackParamList } from '../../../core/navigation';
import { messageOf } from '../../../core/result';
import { radius, spacing, type, useTheme } from '../../../core/tokens';
import { follow, unfollow } from '../followActions';
import { DirectoryTeam, fetchTeams } from '../data/directoryRepo';
import { isFollowed } from '../data/followStore';

type Props = NativeStackScreenProps<RootStackParamList, 'TeamList'>;

export default function TeamListScreen({ route }: Props) {
  const t = useTheme();
  const [teams, setTeams] = useState<DirectoryTeam[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [queryText, setQueryText] = useState('');
  const [, forceRender] = useState(0);

  useEffect(() => {
    void (async () => {
      const r = await fetchTeams(route.params.leagueId);
      if (r.ok) setTeams(r.value);
      else setError(messageOf(r.error));
    })();
  }, [route.params.leagueId]);

  const visible = useMemo(() => {
    if (!teams) return null;
    const q = queryText.trim().toLowerCase();
    return q ? teams.filter((tm) => tm.name.toLowerCase().includes(q)) : teams;
  }, [teams, queryText]);

  const toggle = useCallback(async (team: DirectoryTeam) => {
    const item = {
      key: team.key,
      label: team.name,
      sportKey: 'soccer',
      type: 'team' as const,
    };
    setBusyKey(team.key);
    const r = isFollowed(team.key) ? await unfollow(item) : await follow(item);
    if (!r.ok && r.error.kind !== 'sync-in-progress') {
      setError(messageOf(r.error));
    } else {
      setError(null);
    }
    setBusyKey(null);
    forceRender((n) => n + 1);
  }, []);

  if (error && !teams) {
    return (
      <View style={[styles.center, { backgroundColor: t.bg }]}>
        <Text style={[type.body, { color: t.danger }]}>{error}</Text>
      </View>
    );
  }
  if (!visible) {
    return (
      <View style={[styles.center, { backgroundColor: t.bg }]}>
        <ActivityIndicator color={t.primary} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <TextInput
        accessibilityLabel={`Search teams in ${route.params.leagueName}`}
        placeholder="Search teams"
        placeholderTextColor={t.textSecondary}
        value={queryText}
        onChangeText={setQueryText}
        autoCorrect={false}
        style={[
          styles.search,
          {
            backgroundColor: t.surface,
            color: t.textPrimary,
            borderColor: t.border,
          },
        ]}
      />
      {error ? (
        <Text style={[type.secondary, { color: t.danger, padding: spacing.l }]}>
          {error}
        </Text>
      ) : null}
      <FlatList
        data={visible}
        keyExtractor={(tm) => tm.key}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => (
          <ListRow
            title={item.name}
            accessibilityLabel={item.name}
            right={
              <FollowButton
                following={isFollowed(item.key)}
                subject={item.name}
                busy={busyKey === item.key}
                onPress={() => void toggle(item)}
              />
            }
          />
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  search: {
    margin: spacing.l,
    paddingHorizontal: spacing.l,
    minHeight: 44,
    borderRadius: radius.button,
    borderWidth: StyleSheet.hairlineWidth,
    fontSize: 16,
  },
});
