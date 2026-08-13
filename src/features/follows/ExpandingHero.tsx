// A hero card that grows into its own expanded state.
//
// The card measures itself on press, hands that frame to the expansion
// host, and hides itself for as long as it is lifted — so what the user
// watches is this card moving, not a copy of it appearing on top.

import { useRef } from 'react';
import { View } from 'react-native';
import { useCardExpansion } from '../../core/cardExpansion';
import { Followable } from './data/followStore';
import { fixtureCardRequest } from '../calendar-sync/openFixtureCard';
import { FixtureHero, HeroFixture } from './FixtureHero';

export function ExpandingHero(props: {
  item: HeroFixture;
  follows: readonly Followable[];
  width: number;
  // The ordered ids of every card in the rail this one sits in — the
  // expanded card pages laterally through them, same gesture both sizes.
  pagerIds?: readonly string[];
  // Removed from the calendar, but still on screen until you leave: the
  // card greys rather than disappearing under your finger.
  removed?: boolean;
}) {
  const ref = useRef<View | null>(null);
  const expansion = useCardExpansion();
  const lifted = expansion.liftedKey === props.item.id;
  return (
    <FixtureHero
      item={props.item}
      follows={props.follows}
      innerRef={ref}
      hidden={lifted}
      onPress={() => {
        void fixtureCardRequest(ref, props.item.id, props.pagerIds).then(
          expansion.open,
        );
      }}
      style={[
        { width: props.width, marginHorizontal: 0 },
        props.removed ? { opacity: 0.4 } : null,
      ]}
    />
  );
}
