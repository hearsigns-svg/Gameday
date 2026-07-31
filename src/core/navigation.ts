// Route params: three tabs with three jobs (Home / Following /
// Schedule); browse and preferences push over the tabs in a root stack.

import { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { CompositeScreenProps, NavigatorScreenParams } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';

export type TabParamList = {
  Home: undefined;
  Following: undefined;
  Schedule: undefined;
};

export type RootStackParamList = {
  Welcome: undefined; // first run only
  // Primed explainer before the OS dialog. `onboarding` makes it a STEP
  // in the first run (welcome → calendar → pick teams) rather than the
  // in-context modal; it is still skippable either way.
  CalendarPriming: { onboarding?: boolean } | undefined;
  Tabs: NavigatorScreenParams<TabParamList>;
  Search: undefined;
  SportPicker: undefined;
  LeagueList: { sportKey: string };
  TeamList: {
    sportKey: string;
    leagueId: number | string;
    leagueName: string;
    teamPollPath?: string;
  };
  Team: {
    teamKey: string;
    name: string;
    sportKey: string;
    pollPath?: string;
    crestUrl?: string;
    colours?: string;
  };
  Preferences: undefined;
  CalendarTarget: undefined; // which calendar fixtures are written to
  Credits: undefined;
  ThemeGallery: undefined; // dev-only design QA screen
};

export type RootScreenProps<T extends keyof RootStackParamList> =
  NativeStackScreenProps<RootStackParamList, T>;

export type TabScreenProps<T extends keyof TabParamList> =
  CompositeScreenProps<
    BottomTabScreenProps<TabParamList, T>,
    NativeStackScreenProps<RootStackParamList>
  >;
