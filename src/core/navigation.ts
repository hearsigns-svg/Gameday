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
  // Individual-sport athlete browse (Prompt 8): search-first over the
  // canonical directory, curated entry points, competing-soon.
  // `tour` narrows an individual sport's directory to one population —
  // tennis browses ATP and WTA as separate sections, each with its own
  // way in, rather than one shared list with a split inside it.
  AthleteList: { sportKey: string; tour?: 'atp' | 'wta' };
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
    colours?: string;
    // Mirrors FollowableType (features/follows/domain/sportsConfig) —
    // inlined because core must not import from a feature. Reached from
    // browse it is always a team; reached from the Following rail it can
    // be a competition or series, and re-following from here would
    // otherwise silently rewrite its type.
    followType?: 'team' | 'competition' | 'athlete' | 'series';
    // Crest / competition logo, carried from whichever list opened this
    // page so the header has one BEFORE a follow exists — and so
    // following from here captures it instead of storing a crest-less
    // follow (Prompt 16 C).
    crestUrl?: string;
    // Recorded retirement, carried from browse/search so the page can
    // say something truthful before any follow exists. Mirrors
    // CareerStatusFields (features/follows/domain/careerStatus) —
    // inlined because core must not import from a feature.
    careerStatus?: 'retired';
    careerEndYear?: number;
    // Nationality (Prompt 16 B) — an athlete's identity mark, carried
    // from the list that opened the page so the header can show it
    // before any follow exists.
    countryCode?: string;
    // Which population this athlete browses under ("ATP Tour — Men").
    // The page needs it to know whether a follow can actually deliver
    // anything (features/follows/domain/athleteDelivery.ts).
    grouping?: string;
  };
  // One tour's tournaments, behind their own entry rather than inline
  // under the tour heading (Prompt 19 A).
  TournamentList: {
    tour: 'atp' | 'wta';
    kind: 'slams' | 'others';
    title: string;
  };
  Preferences: undefined;
  Region: undefined;
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
