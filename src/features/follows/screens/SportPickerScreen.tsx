// Sport picker: the launch sports; disabled ones say why. Every enabled
// row NAVIGATES — following always happens on a visible Follow button
// inside the sport (owner ruling: no hidden tap side-effects, no
// instant follow-all on a sport row).

import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useState } from 'react';
import { FlatList, Text, View } from 'react-native';
import { ListRow } from '../../../core/components';
import { RootStackParamList } from '../../../core/navigation';
import { useColorSchemeMode } from '../../../core/useColorSchemeMode';
import { teamTheme } from '../../../core/teamTheme';
import { type, useTheme } from '../../../core/tokens';
import { subscribeSync } from '../../calendar-sync/syncEngine';
import { byPriority, cachedPriorities, refreshPriorities } from '../data/browsePriority';
import { isFollowed } from '../data/followStore';
import { SPORTS } from '../domain/sportsConfig';

type Props = NativeStackScreenProps<RootStackParamList, 'SportPicker'>;

export default function SportPickerScreen({ navigation }: Props) {
  const t = useTheme();
  const mode = useColorSchemeMode();
  const [, forceRender] = useState(0);

  // Follows now happen on pushed screens — refresh the 'Following'
  // captions when a sync lands or this screen regains focus.
  useEffect(() => subscribeSync(() => forceRender((n) => n + 1)), []);
  useEffect(
    () => navigation.addListener('focus', () => forceRender((n) => n + 1)),
    [navigation],
  );
  useEffect(() => void refreshPriorities(), []);

  // Catalogue weight orders the sports (Prompt 11); disabled rows keep
  // config order among themselves at the tail.
  const ordered = byPriority(SPORTS, (s) => s.key, cachedPriorities().sportWeights);

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <FlatList
        data={ordered}
        keyExtractor={(s) => s.key}
        renderItem={({ item }) => {
          const following =
            item.seriesFollowable && isFollowed(item.seriesFollowable.key);
          return (
            <ListRow
              title={item.label}
              caption={
                item.enabled
                  ? following
                    ? 'Following'
                    : item.seriesFollowable
                      ? 'All events · one follow'
                      : undefined
                  : 'Coming soon'
              }
              glyph={item.glyph}
              tileTheme={teamTheme(item.accent, mode)}
              disabled={!item.enabled}
              accessibilityLabel={
                item.enabled
                  ? `${item.label}${following ? ', following' : ''}`
                  : `${item.label}, coming soon`
              }
              onPress={
                item.enabled
                  ? () =>
                      navigation.navigate('LeagueList', { sportKey: item.key })
                  : undefined
              }
              right={
                item.enabled ? (
                  <Text
                    style={[type.body, { color: t.textSecondary }]}
                    accessible={false}
                  >
                    ›
                  </Text>
                ) : undefined
              }
            />
          );
        }}
      />
    </View>
  );
}
