import { Ionicons } from '@expo/vector-icons';
import {
  DarkTheme,
  DefaultTheme,
  NavigationContainer,
  useNavigation,
} from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import {
  createNativeStackNavigator,
  NativeStackNavigationProp,
} from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { AppState, Pressable, View } from 'react-native';
// Side effect: defines background tasks at module scope (headless launches).
import { registerBackgroundSync } from './src/features/calendar-sync/backgroundSync';
import {
  runSync,
  shouldAutoSync,
} from './src/features/calendar-sync/syncEngine';
import { hasSeenWelcome } from './src/features/calendar-sync/data/calendarChoice';
import { activeBackend } from './src/features/calendar-sync/data/calendarBackend';
import { resumeGoogleCalendarAuth } from './src/features/calendar-sync/data/googleCalendarAuth';
import { loadFollowables } from './src/features/follows/data/followStore';
import { RootStackParamList, TabParamList } from './src/core/navigation';
import { CelebrationHost } from './src/core/celebration';
import { ToastHost } from './src/core/toast';
import { palette } from './src/core/tokens';
import { useColorSchemeMode } from './src/core/useColorSchemeMode';
import { BrandTitle, Wordmark } from './src/core/components';
import SearchScreen from './src/features/follows/screens/SearchScreen';
import WelcomeScreen from './src/features/onboarding/WelcomeScreen';
import CalendarPrimingScreen from './src/features/calendar-sync/screens/CalendarPrimingScreen';
import HomeScreen from './src/features/follows/screens/HomeScreen';
import FollowingScreen from './src/features/follows/screens/FollowingScreen';
import ScheduleScreen from './src/features/calendar-sync/screens/ScheduleScreen';
import { CardExpansionHost } from './src/core/cardExpansion';
import {
  FixtureCardBody,
  FixtureCardPayload,
} from './src/features/calendar-sync/screens/FixtureCard';
import { FixtureCardPager } from './src/features/calendar-sync/screens/FixtureCardPager';
import AthleteListScreen from './src/features/follows/screens/AthleteListScreen';
import TournamentListScreen from './src/features/follows/screens/TournamentListScreen';
import LeagueListScreen from './src/features/follows/screens/LeagueListScreen';
import SportPickerScreen from './src/features/follows/screens/SportPickerScreen';
import TeamListScreen from './src/features/follows/screens/TeamListScreen';
import TeamScreen from './src/features/follows/screens/TeamScreen';
import PreferencesScreen from './src/features/settings/PreferencesScreen';
import RegionScreen from './src/features/settings/RegionScreen';
import CalendarTargetScreen from './src/features/settings/CalendarTargetScreen';
import CreditsScreen from './src/features/settings/CreditsScreen';
import ThemeGalleryScreen from './src/features/settings/ThemeGalleryScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<TabParamList>();

const TAB_ICONS: Record<
  keyof TabParamList,
  { active: keyof typeof Ionicons.glyphMap; idle: keyof typeof Ionicons.glyphMap }
> = {
  Home: { active: 'home', idle: 'home-outline' },
  Following: { active: 'heart', idle: 'heart-outline' },
  Schedule: { active: 'calendar', idle: 'calendar-outline' },
};

function SettingsButton() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const mode = useColorSchemeMode();
  const t = mode === 'dark' ? palette.dark : palette.light;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Calendar preferences"
      onPress={() => navigation.navigate('Preferences')}
      hitSlop={12}
      style={{ paddingHorizontal: 8 }}
    >
      {({ pressed }) => (
        <Ionicons
          name="settings-outline"
          size={22}
          color={t.textPrimary}
          style={{ opacity: pressed ? 0.6 : 1 }}
        />
      )}
    </Pressable>
  );
}

function Tabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => (
          <Ionicons
            name={TAB_ICONS[route.name][focused ? 'active' : 'idle']}
            size={size}
            color={color}
          />
        ),
      })}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{
          title: 'KickOffCal',
          headerTitle: () => <Wordmark />,
          tabBarLabel: 'Home',
          headerRight: () => <SettingsButton />,
        }}
      />
      <Tab.Screen
        name="Following"
        component={FollowingScreen}
        options={{ headerTitle: () => <BrandTitle>Following</BrandTitle> }}
      />
      <Tab.Screen
        name="Schedule"
        component={ScheduleScreen}
        options={{ headerTitle: () => <BrandTitle>Schedule</BrandTitle> }}
      />
    </Tab.Navigator>
  );
}

export default function App() {
  // The appearance CHOICE, not the raw OS scheme — a pinned Dark must
  // flip the navigation chrome along with every screen (Prompt 24 B3).
  const mode = useColorSchemeMode();
  const t = mode === 'dark' ? palette.dark : palette.light;
  // Evaluated once at launch: first run (never welcomed, nothing
  // followed) opens on the welcome screen; everyone else on the tabs.
  const [initialRoute] = useState<keyof RootStackParamList>(() =>
    !hasSeenWelcome() && loadFollowables().length === 0 ? 'Welcome' : 'Tabs',
  );

  useEffect(() => {
    // BEFORE the first sync trigger: a REST-backed install must have
    // its token provider armed, or the run answers auth-expired for a
    // wiring reason instead of a real one.
    if (activeBackend() === 'rest') resumeGoogleCalendarAuth();
    void registerBackgroundSync();
    void import('./src/features/calendar-sync/data/deviceRegistry').then(
      (m) => m.registerDevice(),
    );
    // Propagation layer 3: always sync on foreground (never on a cold
    // first open — shouldAutoSync gates the permission prompt).
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && shouldAutoSync()) void runSync();
    });
    if (shouldAutoSync()) void runSync();
    return () => sub.remove();
  }, []);

  const navTheme = {
    ...(mode === 'dark' ? DarkTheme : DefaultTheme),
    colors: {
      ...(mode === 'dark' ? DarkTheme : DefaultTheme).colors,
      background: t.bg,
      card: t.bg,
      text: t.textPrimary,
      primary: t.primary,
      border: t.border,
    },
  };

  return (
    // The expansion host sits OUTSIDE the navigator, like the toast
    // host: the card that grows must be able to cover the tab bar and
    // the header, because it is no longer a screen — it is the card the
    // user tapped, at a bigger size.
    <CardExpansionHost
      renderExpanded={(payload, close, reveal, onContentHeight) => {
        const p = payload as unknown as FixtureCardPayload;
        // Siblings present → the expanded card pages laterally through
        // them; a lone fixture stays a single body.
        return p.pagerIds ? (
          <FixtureCardPager
            payload={p}
            close={close}
            reveal={reveal}
            onContentHeight={onContentHeight}
          />
        ) : (
          <FixtureCardBody
            payload={p}
            close={close}
            reveal={reveal}
            onContentHeight={onContentHeight}
          />
        );
      }}
    >
    <View style={{ flex: 1 }}>
      <NavigationContainer theme={navTheme}>
        <Stack.Navigator
          initialRouteName={initialRoute}
          screenOptions={{ headerBackButtonDisplayMode: 'minimal' }}
        >
        <Stack.Screen
          name="Welcome"
          component={WelcomeScreen}
          options={{ headerShown: false, gestureEnabled: false }}
        />
        {/* Two lives: a first-run STEP (pushed, not modal — Welcome
            REPLACES itself, so there is no back button and the screen's
            own "Not now" is the only exit), and the in-context modal
            reached later from a banner or a follow. The header stays on
            in both: nothing in this app carries its own safe-area
            inset, so removing it puts the title under the status bar. */}
        <Stack.Screen
          name="CalendarPriming"
          component={CalendarPrimingScreen}
          options={({ route }) =>
            route.params?.onboarding
              ? {
                  title: 'Your calendar',
                  headerTitle: () => <BrandTitle>Your calendar</BrandTitle>,
                  gestureEnabled: false,
                }
              : {
                  presentation: 'modal' as const,
                  title: 'Your calendar',
                  headerTitle: () => <BrandTitle>Your calendar</BrandTitle>,
                }
          }
        />
        <Stack.Screen
          name="Tabs"
          component={Tabs}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="Search"
          component={SearchScreen}
          options={{ title: 'Search', headerTitle: () => <BrandTitle>Search</BrandTitle> }}
        />
        <Stack.Screen
          name="SportPicker"
          component={SportPickerScreen}
          options={{ title: 'Sports', headerTitle: () => <BrandTitle>Sports</BrandTitle> }}
        />
        <Stack.Screen
          name="LeagueList"
          component={LeagueListScreen}
          options={({ route }) => ({
            title: route.params.title ?? 'Competitions',
            headerTitle: () => (
              <BrandTitle>{route.params.title ?? 'Competitions'}</BrandTitle>
            ),
          })}
        />
        <Stack.Screen
          name="AthleteList"
          component={AthleteListScreen}
          options={{ title: 'Athletes', headerTitle: () => <BrandTitle>Athletes</BrandTitle> }}
        />
        <Stack.Screen
          name="TournamentList"
          component={TournamentListScreen}
          options={({ route }) => ({
            title: route.params.title,
            headerTitle: () => <BrandTitle>{route.params.title}</BrandTitle>,
          })}
        />
        <Stack.Screen
          name="TeamList"
          component={TeamListScreen}
          options={({ route }) => ({
            title: route.params.leagueName,
            headerTitle: () => <BrandTitle>{route.params.leagueName}</BrandTitle>,
          })}
        />
        <Stack.Screen
          name="Team"
          component={TeamScreen}
          options={({ route }) => ({
            title: route.params.name,
            headerTitle: () => <BrandTitle>{route.params.name}</BrandTitle>,
          })}
        />
        <Stack.Screen
          name="Preferences"
          component={PreferencesScreen}
          options={{
            title: 'Preferences',
            headerTitle: () => <BrandTitle>Preferences</BrandTitle>,
          }}
        />
        <Stack.Screen
          name="Region"
          component={RegionScreen}
          options={{ title: 'Region', headerTitle: () => <BrandTitle>Region</BrandTitle> }}
        />
        <Stack.Screen
          name="CalendarTarget"
          component={CalendarTargetScreen}
          options={{ title: 'Calendar', headerTitle: () => <BrandTitle>Calendar</BrandTitle> }}
        />
        <Stack.Screen
          name="Credits"
          component={CreditsScreen}
          options={{ title: 'Photo credits', headerTitle: () => <BrandTitle>Photo credits</BrandTitle> }}
        />
        {__DEV__ ? (
          <Stack.Screen
            name="ThemeGallery"
            component={ThemeGalleryScreen}
            options={{ title: 'Theme gallery (dev)', headerTitle: () => <BrandTitle>Theme gallery (dev)</BrandTitle> }}
          />
        ) : null}
        </Stack.Navigator>
        <StatusBar style="auto" />
      </NavigationContainer>
      <ToastHost />
      <CelebrationHost />
    </View>
    </CardExpansionHost>
  );
}
