// The poster for one fixture — Home's carousel card and the expanded
// card's header are the SAME component, deliberately.
//
// Tapping a hero opens "more of the same thing", so the thing itself
// must not change: identical layers (photo → scrim → sport geometry →
// crest or monogram watermark → type), identical identity resolution,
// identical credit line. Only the geometry and the press behaviour
// differ between the two places it renders.
//
// Extracted from HomeScreen in Prompt 16; the resolution rules and their
// reasons are unchanged, and are commented where they were.

import { StyleProp, View, ViewStyle } from 'react-native';
import { HeroCard, monogramOf } from '../../core/components';
import { t } from '../../core/i18n';
import { teamTheme } from '../../core/teamTheme';
import { useColorSchemeMode } from '../../core/useColorSchemeMode';
import { Followable } from './data/followStore';
import { identityFollow } from './domain/followIdentity';
import { sportByKey } from './domain/sportsConfig';
import {
  useTournamentVenuePhoto,
  useVenuePhoto,
  useVenuePlacePhoto,
} from './useEntityPhoto';

// Structural, so this file does not depend on the calendar-sync feature
// for a shape that is really just "a fixture as the app displays it".
export interface HeroFixture {
  id: string;
  title: string;
  competition: string;
  startUtc: string;
  status: string;
  timePrecision?: 'exact' | 'nominal' | 'date_only';
  sport: string;
  followKeys: string[];
  homeTeam?: string;
  venue?: string;
  venueCity?: string;
  participantCountries?: string[];
  // Both sides' crests, stamped on the fixture itself (Stage 4B) — the
  // composite renders them whichever follow owns the card.
  homeCrestUrl?: string;
  awayCrestUrl?: string;
}

export function FixtureHero(props: {
  item: HeroFixture;
  follows: readonly Followable[];
  onPress?: () => void;
  standalone?: boolean;
  style?: StyleProp<ViewStyle>;
  // Set while this card is the one lifted into the expansion overlay:
  // the object on screen is this card, so the original must not sit
  // underneath as a second copy.
  hidden?: boolean;
  innerRef?: React.Ref<View>;
}) {
  const { item } = props;
  const mode = useColorSchemeMode();
  const sport = sportByKey(item.sport);
  const owner = identityFollow(item.followKeys, props.follows);
  // The photograph is of the ground the match is PLAYED at, so it
  // follows the home team — not the team you happen to follow.
  const homeTeam = item.homeTeam ?? (owner?.type === 'team' ? owner.label : null);
  // Venue NAME beats home-team lookup where a provider publishes one:
  // the photo is of the place, and a place resolves DIRECTLY (entity →
  // P18) where the team resolver's P115 hop never could.
  const placeArt = useVenuePlacePhoto(item.venue, item.venueCity);
  // Tennis tournament PARENTS only: no venue name, no home team. An
  // appearance rides an -appearances key and must never feed its MATCH
  // title into the tournament lookup.
  const isTennisParent =
    item.sport === 'tennis' &&
    !item.venue &&
    !item.followKeys.some((k) => k.endsWith('-appearances'));
  const tournamentArt = useTournamentVenuePhoto(
    isTennisParent ? item.title : null,
    item.venueCity,
  );
  const teamArt = useVenuePhoto(item.venue || isTennisParent ? null : homeTeam);
  const art = placeArt ?? tournamentArt ?? teamArt;
  return (
    <HeroCard
      title={item.title}
      competition={item.competition}
      startUtc={item.startUtc}
      status={item.status}
      {...(item.timePrecision ? { timePrecision: item.timePrecision } : {})}
      sportKey={item.sport}
      monogram={monogramOf(owner?.label ?? item.homeTeam ?? item.competition)}
      {...(owner?.crestUrl ? { crestUrl: owner.crestUrl } : {})}
      photoUrl={art?.url}
      {...(item.participantCountries?.length
        ? { participantCountries: item.participantCountries }
        : {})}
      {...(item.homeCrestUrl ? { homeCrestUrl: item.homeCrestUrl } : {})}
      {...(item.awayCrestUrl ? { awayCrestUrl: item.awayCrestUrl } : {})}
      photoCredit={
        art
          ? [
              // A host-city photo says WHICH PLACE it shows (Round 3
              // B5): city imagery is not "the ground", and the credit
              // is where that honesty lives.
              art.subject ?? null,
              art.artist
                ? t('follows.hero.photoBy', { artist: art.artist })
                : t('follows.hero.photoCommons'),
              art.licence,
            ]
              .filter(Boolean)
              .join(' · ')
          : undefined
      }
      theme={teamTheme(owner?.brandColour ?? sport?.accent ?? null, mode)}
      {...(props.onPress ? { onPress: props.onPress } : {})}
      {...(props.standalone ? { standalone: true } : {})}
      {...(props.hidden ? { hidden: true } : {})}
      {...(props.innerRef ? { innerRef: props.innerRef } : {})}
      style={props.style}
    />
  );
}
