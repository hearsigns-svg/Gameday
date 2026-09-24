// The fixture card's per-event colour row (Android, Google Calendar) —
// PREMIUM (owner ruling 2026-09-24). This is the exact handler the row's
// swatches call: free → the offer, nothing saved, no pass; trial and
// Premium → saved and the calendar updated, as before. (Which entitlement
// states count as free is pinned in domain/__tests__/premiumControls.)
jest.mock('../../../core/entitlementStore', () => ({ premiumLocked: jest.fn() }));
jest.mock('../../../core/premiumOffer', () => ({ offerPremium: jest.fn() }));
jest.mock('../data/eventSettingsStore', () => ({ setEventColour: jest.fn() }));
jest.mock('../syncEngine', () => ({ runSync: jest.fn(async () => ({ ok: true })) }));

import { premiumLocked } from '../../../core/entitlementStore';
import { offerPremium } from '../../../core/premiumOffer';
import { setEventColour } from '../data/eventSettingsStore';
import { pickEventColour } from '../eventColourPick';
import { runSync } from '../syncEngine';

beforeEach(() => jest.clearAllMocks());

describe('free', () => {
  beforeEach(() => (premiumLocked as jest.Mock).mockReturnValue(true));

  test('a swatch opens the offer, and no colour is saved', () => {
    expect(pickEventColour('fd-1', '#C22A2A')).toBe('offered');
    expect(offerPremium).toHaveBeenCalledTimes(1);
    expect(setEventColour).not.toHaveBeenCalled();
    expect(runSync).not.toHaveBeenCalled();
  });

  test('clearing the chosen colour is the offer too — changing it either way needs Premium', () => {
    expect(pickEventColour('fd-1', undefined)).toBe('offered');
    expect(setEventColour).not.toHaveBeenCalled();
    expect(runSync).not.toHaveBeenCalled();
  });
});

describe('trial or Premium, unchanged', () => {
  beforeEach(() => (premiumLocked as jest.Mock).mockReturnValue(false));

  test('a swatch saves the colour and updates the calendar', () => {
    expect(pickEventColour('fd-1', '#C22A2A')).toBe('saved');
    expect(setEventColour).toHaveBeenCalledWith('fd-1', '#C22A2A');
    expect(runSync).toHaveBeenCalledTimes(1);
    expect(offerPremium).not.toHaveBeenCalled();
  });

  test('tapping the chosen swatch clears it', () => {
    expect(pickEventColour('fd-1', undefined)).toBe('saved');
    expect(setEventColour).toHaveBeenCalledWith('fd-1', undefined);
    expect(runSync).toHaveBeenCalledTimes(1);
  });
});
