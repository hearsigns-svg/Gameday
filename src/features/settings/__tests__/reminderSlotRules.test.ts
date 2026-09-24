// The locked reminder slots in Settings (owner ruling 2026-09-24): a free
// tap goes through the shared "offer Premium" routine — the offer before
// any decline, the Premium line after one, never nothing; slot one stays
// fixed; trial and Premium unchanged. Driven through the REAL routine and
// paywall seam (only the toast is stubbed), tapping the way the slot row
// does.
jest.mock('../../../core/toast', () => ({ showToast: jest.fn() }));

import { t } from '../../../core/i18n';
import {
  __resetPaywallForTests,
  notePaywallDeclined,
  setPaywallPresenter,
} from '../../../core/paywall';
import { showToast } from '../../../core/toast';
import { reminderSlotLocks, SlotLocks, slotTap } from '../reminderSlotRules';

const toasts = () => (showToast as jest.Mock).mock.calls.map((c) => c[0].message);
const PREMIUM_LINE = t('premium.syncRow');

// One tap, exactly as ReminderSlotsRow handles it.
function tap(slot: number, locks: Partial<SlotLocks>) {
  const step = slotTap(slot, locks.fixedSlots ?? new Set(), locks.lockedSlots ?? new Set());
  if (step === 'offer') locks.onLockedPress?.();
  return step;
}

let offered: string[];
beforeEach(() => {
  offered = [];
  // Billing configured: the paywall can be shown.
  setPaywallPresenter((entry) => offered.push(entry));
});
afterEach(() => {
  __resetPaywallForTests();
  (showToast as jest.Mock).mockClear();
});

describe('free', () => {
  const locks = () => reminderSlotLocks(true);

  test('before any decline, a locked slot opens the offer', () => {
    expect(tap(1, locks())).toBe('offer');
    expect(tap(2, locks())).toBe('offer');
    expect(offered).toEqual(['on_demand', 'on_demand']);
    expect(toasts()).toEqual([]);
  });

  test('after a decline this session, a locked slot shows the Premium line — not nothing', () => {
    notePaywallDeclined();
    expect(tap(1, locks())).toBe('offer');
    expect(offered).toEqual([]);
    expect(toasts()).toEqual([PREMIUM_LINE]);
    tap(2, locks());
    expect(toasts()).toEqual([PREMIUM_LINE, PREMIUM_LINE]);
  });

  test('slot one is fixed at the default: a tap does nothing, and offers nothing', () => {
    expect(tap(0, locks())).toBe('none');
    expect(offered).toEqual([]);
    expect(toasts()).toEqual([]);
  });
});

describe('trial or Premium, unchanged', () => {
  test('no slot is fixed or locked; a tap opens it, to set its value', () => {
    const locks = reminderSlotLocks(false);
    expect(locks).toEqual({});
    for (const slot of [0, 1, 2]) expect(tap(slot, locks)).toBe('toggle');
    expect(offered).toEqual([]);
    expect(toasts()).toEqual([]);
  });
});
