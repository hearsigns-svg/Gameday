// The paywall seam's suppress-after-decline rule (Round 5 model): an
// on-demand Premium tap presents the offer — never in the same session
// as a decline — and the caller learns whether it did.
import {
  __resetPaywallForTests,
  notePaywallDeclined,
  requestPaywall,
  setPaywallPresenter,
} from '../paywall';

afterEach(() => __resetPaywallForTests());

test('no presenter (billing not configured) → not presented, and the caller is told', () => {
  expect(requestPaywall('on_demand')).toBe(false);
});

test('presented on demand until a decline; suppressed for the rest of the session after one', () => {
  const shown: string[] = [];
  setPaywallPresenter((entry) => shown.push(entry));
  expect(requestPaywall('on_demand')).toBe(true);
  notePaywallDeclined();
  expect(requestPaywall('on_demand')).toBe(false);
  expect(requestPaywall('on_demand')).toBe(false);
  expect(shown).toEqual(['on_demand']);
});

test('a decline does not suppress the proactive entry (its own once-only rule lives upstream)', () => {
  const shown: string[] = [];
  setPaywallPresenter((entry) => shown.push(entry));
  notePaywallDeclined();
  expect(requestPaywall('proactive')).toBe(true);
  expect(shown).toEqual(['proactive']);
});
