// The Premium controls in Settings (owner rulings 2026-09-24): the
// calendar-colour swatches and the per-sport switch are shown to
// everyone; in the free state a tap is the way into the offer and changes
// nothing; a trial or paid subscriber uses them as before; after a lapse
// they stay where the user left them, and changing them — in either
// direction — needs Premium again.
//
// Driven through the REAL entitlement model (what `premiumLocked()` asks),
// not a hand-set boolean, so the trial and lapse cases are the store's
// own shapes.
import {
  EntitlementState,
  FREE_STATE,
  PAID_RENEW_WINDOW_MS,
  planEntitlementFrom,
} from '../../../../core/entitlement';
import { colourPickStep } from '../calendarConnection';
import { layoutSwitchStep } from '../sportCalendars';

const NOW = Date.parse('2026-09-24T12:00:00.000Z');
const DAY = 86_400_000;
const iso = (ms: number) => new Date(ms).toISOString();

// premiumLocked() is exactly this, with the flag gate read from flags().
const locked = (state: EntitlementState, gateOpen = false) =>
  planEntitlementFrom(state, NOW, gateOpen).tier === 'free';

const STATES: Record<string, { state: EntitlementState; locked: boolean }> = {
  'never subscribed': { state: FREE_STATE, locked: true },
  'on a trial': {
    state: {
      tier: 'premium',
      source: 'store',
      trialStartedAt: iso(NOW - 3 * DAY),
      premiumUntil: iso(NOW + 11 * DAY),
      observedAt: iso(NOW),
    },
    locked: false,
  },
  'paying': {
    state: {
      tier: 'premium',
      source: 'store',
      premiumUntil: iso(NOW + 200 * DAY),
      observedAt: iso(NOW),
    },
    locked: false,
  },
  'trial lapsed': {
    state: {
      tier: 'free',
      source: 'store',
      trialStartedAt: iso(NOW - 20 * DAY),
      endedAt: iso(NOW - 6 * DAY),
      lapseKind: 'trial',
      observedAt: iso(NOW),
    },
    locked: true,
  },
  'paid lapsed, inside the renew window': {
    state: {
      tier: 'free',
      source: 'store',
      endedAt: iso(NOW - PAID_RENEW_WINDOW_MS / 2),
      lapseKind: 'paid',
      observedAt: iso(NOW),
    },
    locked: true,
  },
  'paid lapsed, past the renew window': {
    state: {
      tier: 'free',
      source: 'store',
      endedAt: iso(NOW - 10 * DAY),
      lapseKind: 'paid',
      observedAt: iso(NOW),
    },
    locked: true,
  },
};

describe.each(Object.entries(STATES))('%s', (_name, { state, locked: isLocked }) => {
  test('the model agrees on whether Premium controls are locked', () => {
    expect(locked(state)).toBe(isLocked);
  });

  test('a colour swatch: the offer when locked, the colour otherwise', () => {
    expect(colourPickStep(locked(state))).toBe(isLocked ? 'offer' : 'apply');
  });

  test('the per-sport switch, either direction: the offer when locked, as before otherwise', () => {
    // Whatever position it was left in, with games in the calendar or not.
    for (const games of [0, 1624]) {
      expect(layoutSwitchStep(locked(state), games)).toBe(
        isLocked ? 'offer' : games > 0 ? 'confirm' : 'switch',
      );
    }
  });
});

test('while the sync gate is open everyone is Premium — nothing is locked', () => {
  for (const { state } of Object.values(STATES)) {
    expect(locked(state, true)).toBe(false);
    expect(colourPickStep(locked(state, true))).toBe('apply');
  }
});
