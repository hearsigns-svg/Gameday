// The app does not promise what it has no mechanism to deliver.
// Measured 2026-08-05: Djokovic, Alcaraz, Sinner and Zverev each had
// ZERO fixtures while `tennis-atp` held 78 future tournament rows — the
// men's tour has no match source, so "we'll add them when announced"
// announces nothing, ever.

import { deliveryGap } from '../athleteDelivery';

it("says so on a men's tennis page instead of promising", () => {
  const gap = deliveryGap('tennis', 'ATP Tour — Men');
  expect(gap).toBeTruthy();
  expect(gap).toMatch(/men's tour/);
});

it('covers the A–Z men too — search is the only route to them', () => {
  // 1,484 ATP players reach the page ONLY through search, under the
  // directory group, and their pages made the same false promise.
  expect(deliveryGap('tennis', 'More ATP players — A–Z')).toBeTruthy();
});

it('leaves the women alone — the WTA tour does deliver matches', () => {
  expect(deliveryGap('tennis', 'WTA Tour — Women')).toBeNull();
});

it('never speaks for a sport whose athletes DO get fixtures', () => {
  // A boxer between fights is the honest-empty-state case the promise
  // was written for: PBC and TSDB deliver bouts, so following works.
  expect(deliveryGap('boxing', 'Heavyweight')).toBeNull();
  expect(deliveryGap('f1', 'Drivers')).toBeNull();
});

it('says nothing when the population is unknown', () => {
  // A follow made before the grouping was captured, opened from the
  // Following rail. Unknown is not "no source" — the page falls back to
  // the ordinary empty state rather than inventing a limitation.
  expect(deliveryGap('tennis', undefined)).toBeNull();
});
