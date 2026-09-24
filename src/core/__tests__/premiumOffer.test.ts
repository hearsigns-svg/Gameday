// The one on-demand routine every locked Premium control calls (owner
// rulings 2026-09-24; AGENTS rule 19): the paywall when it can be shown,
// the inline Premium line otherwise — never a silent no-op.
jest.mock('../toast', () => ({ showToast: jest.fn() }));

import { t } from '../i18n';
import {
  __resetPaywallForTests,
  notePaywallDeclined,
  setPaywallPresenter,
} from '../paywall';
import { offerPremium } from '../premiumOffer';
import { showToast } from '../toast';

const toasts = () => (showToast as jest.Mock).mock.calls.map((c) => c[0].message);

afterEach(() => {
  __resetPaywallForTests();
  (showToast as jest.Mock).mockClear();
});

test('billing configured: the paywall opens, and nothing else is said', () => {
  const shown: string[] = [];
  setPaywallPresenter((entry) => shown.push(entry));
  offerPremium();
  expect(shown).toEqual(['on_demand']);
  expect(toasts()).toEqual([]);
});

test('declined earlier this session: the inline Premium line instead', () => {
  const shown: string[] = [];
  setPaywallPresenter((entry) => shown.push(entry));
  notePaywallDeclined();
  offerPremium();
  expect(shown).toEqual([]);
  expect(toasts()).toEqual([t('premium.syncRow')]);
});

test('billing not configured: the inline Premium line', () => {
  offerPremium();
  expect(toasts()).toEqual([t('premium.syncRow')]);
});
