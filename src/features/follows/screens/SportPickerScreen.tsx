// Sport picker: the launch sports; disabled ones say why. Every enabled
// row NAVIGATES — following always happens on a visible Follow button
// inside the sport (owner ruling: no hidden tap side-effects, no
// instant follow-all on a sport row).

import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useState } from 'react';
import { FlatList, View } from 'react-native';
import { SportCard, TileRow } from '../../../core/components';
// Namespace import: `t` is this component's theme binding.
import * as i18n from '../../../core/i18n';
import { RootStackParamList } from '../../../core/navigation';
import { useColorSchemeMode } from '../../../core/useColorSchemeMode';
import { teamTheme } from '../../../core/teamTheme';
import { useTheme } from '../../../core/tokens';
import { subscribeSync } from '../../calendar-sync/syncEngine';
import { byPriority, cachedPriorities, refreshPriorities } from '../data/browsePriority';
import { isFollowed } from '../data/followStore';
import { SPORTS } from '../domain/sportsConfig';
import { sportLabelFor } from '../domain/sportTerms';
import { activeRegion } from '../../../core/regionStore';

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
            // The same tile Home's grid uses, one per row instead of
            // two — this screen and Home are now literally the same
            // component, which is the point: the picker was the one
            // place a sport did not look like a sport (22b).
            <TileRow>
              <SportCard
                fullWidth
                // THE REGION'S WORD FOR THE SPORT, as Home, Following
                // and the team page already use. This screen kept the
                // raw config label, so a UK user saw "Football" on Home
                // and "Soccer" one tap away — survivable while the two
                // screens looked different, absurd now that they are
                // the same component (22b).
                label={sportLabelFor(item.key, item.label, activeRegion())}
                caption={
                  item.enabled
                    ? following
                      ? i18n.t('follows.following')
                      : item.seriesFollowable
                        ? i18n.t('follows.sportPicker.allEventsOneFollow')
                        : undefined
                    : i18n.t('follows.sportPicker.comingSoon')
                }
                glyph={item.glyph}
                theme={teamTheme(item.accent, mode)}
                disabled={!item.enabled}
                accessibilityLabel={
                  item.enabled
                    ? following
                      ? i18n.t('follows.sports.a11yFollowing', {
                          name: sportLabelFor(item.key, item.label, activeRegion()),
                        })
                      : sportLabelFor(item.key, item.label, activeRegion())
                    : i18n.t('follows.sports.a11yComingSoon', {
                        name: sportLabelFor(item.key, item.label, activeRegion()),
                      })
                }
                onPress={() =>
                  navigation.navigate('LeagueList', { sportKey: item.key })
                }
              />
            </TileRow>
          );
        }}
      />
    </View>
  );
}
