// A tap on the fixture card's per-event colour row — shown only where
// events carry their own colour (Google Calendar, Android). PREMIUM
// (owner ruling 2026-09-24): in the free state the tap is the way into the
// offer and NOTHING is saved, whichever swatch — setting a colour or
// clearing the chosen one alike; a trial or Premium user's tap saves it
// and the next pass recolours the event, as before.

import { premiumLocked } from '../../core/entitlementStore';
import { offerPremium } from '../../core/premiumOffer';
import { setEventColour } from './data/eventSettingsStore';
import { colourPickStep } from './domain/calendarConnection';
import { runSync } from './syncEngine';

export function pickEventColour(
  fixtureId: string,
  hex: string | undefined,
): 'offered' | 'saved' {
  if (colourPickStep(premiumLocked()) === 'offer') {
    offerPremium();
    return 'offered';
  }
  setEventColour(fixtureId, hex);
  void runSync();
  return 'saved';
}
