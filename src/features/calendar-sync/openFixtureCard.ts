// Opening the card, from wherever it sits.
//
// A surface hands over three things: the view the user tapped (so its
// frame can be measured), the fixture, and a way to re-measure later —
// because the card must shrink back to where that view IS at dismiss,
// not where it was when the card opened.

import { RefObject } from 'react';
import { View } from 'react-native';
import {
  CardFrame,
  expandedFrame,
  ExpansionRequest,
  measureFrame,
} from '../../core/cardExpansion';
import { FixtureCardPayload } from './screens/FixtureCard';

export async function fixtureCardRequest(
  ref: RefObject<View | null>,
  fixtureId: string,
): Promise<ExpansionRequest<FixtureCardPayload> | null> {
  const measured: CardFrame | null = await measureFrame(ref as never);
  // NO FRAME, NO FLIGHT. A surface that cannot say where its card is
  // does not get to fake the motion from an invented position.
  if (!measured) return null;
  return {
    key: fixtureId,
    frame: inColumn(measured),
    payload: { fixtureId },
    remeasure: async () => {
      const now = await measureFrame(ref as never);
      return now ? inColumn(now) : null;
    },
  };
}

// THE CARD'S COLUMN, always. A hero card already lives at the screen
// gutter, so its expansion is purely vertical; a ROW is full-bleed, and
// letting its width interpolate would re-break the title's lines while
// the card was moving. Taking x and width from the destination makes
// every origin vertical-only — and a row's visible content starts at
// that same gutter anyway, so it also looks right.
function inColumn(frame: CardFrame): CardFrame {
  const column = expandedFrame();
  return { x: column.x, width: column.width, y: frame.y, height: frame.height };
}
