// A calendar for each sport: what a tap on the switch does (owner ruling
// 2026-09-24 — Premium only).
import { layoutOf, layoutSwitchStep } from '../sportCalendars';

describe('the switch in the free state', () => {
  test('is the way into the offer, and changes nothing — whatever is in the calendar', () => {
    expect(layoutSwitchStep(true, 0)).toBe('offer');
    expect(layoutSwitchStep(true, 1624)).toBe('offer');
  });
});

describe('the switch for a Premium user, unchanged', () => {
  test('asks first when games are already in a calendar — they will move', () => {
    expect(layoutSwitchStep(false, 1)).toBe('confirm');
    expect(layoutSwitchStep(false, 1624)).toBe('confirm');
  });

  test('switches straight away when there is nothing to move', () => {
    expect(layoutSwitchStep(false, 0)).toBe('switch');
  });
});

test('the preference names the layout', () => {
  expect(layoutOf({ separateSportCalendars: true })).toBe('per-sport');
  expect(layoutOf({ separateSportCalendars: false })).toBe('combined');
});
