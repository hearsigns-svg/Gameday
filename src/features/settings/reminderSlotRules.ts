// The three reminder slots in Settings — their rules (Round 5; owner
// ruling 2026-09-24), and the one side effect a locked slot has.
//
// FREE: slot one is FIXED at the default (shown, not editable) and slots
// two and three are LOCKED. A tap on a locked slot goes through the shared
// "offer Premium" routine (AGENTS rule 19): the paywall — or, after a
// decline this session or with billing not configured, the Premium line,
// like every other locked control — and nothing changes. It used to call
// the paywall directly, so after a decline the tap did nothing at all.
// TRIAL / PREMIUM: no locks; a tap opens the slot's wheels, and the value
// picked there sets the slot.

import { offerPremium } from '../../core/premiumOffer';

export interface SlotLocks {
  fixedSlots: ReadonlySet<number>;
  lockedSlots: ReadonlySet<number>;
  onLockedPress: () => void;
}

export function reminderSlotLocks(
  premiumLocked: boolean,
): SlotLocks | Record<string, never> {
  if (!premiumLocked) return {};
  return {
    fixedSlots: new Set([0]),
    lockedSlots: new Set([1, 2]),
    onLockedPress: offerPremium,
  };
}

// What one tap on a slot does.
export type SlotTap = 'offer' | 'toggle' | 'none';

export function slotTap(
  slot: number,
  fixed: ReadonlySet<number>,
  locked: ReadonlySet<number>,
): SlotTap {
  if (locked.has(slot)) return 'offer';
  if (fixed.has(slot)) return 'none';
  return 'toggle';
}
