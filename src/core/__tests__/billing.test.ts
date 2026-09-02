jest.mock('react-native', () => ({ Platform: { OS: 'ios' } }));

import { offerFromOfferings } from '../billing';

const pkg = (identifier: string, productId: string, price: number, priceString: string) =>
  ({
    identifier,
    packageType: identifier.toUpperCase(),
    offeringIdentifier: 'default',
    presentedOfferingContext: { offeringIdentifier: 'default', placementIdentifier: null, targetingContext: null },
    product: {
      identifier: productId,
      description: '',
      title: '',
      price,
      priceString,
      pricePerWeek: null,
      pricePerMonth: null,
      pricePerYear: null,
      pricePerWeekString: null,
      pricePerMonthString: null,
      pricePerYearString: null,
      currencyCode: 'GBP',
      introPrice: null,
      discounts: null,
      productCategory: 'SUBSCRIPTION',
      productType: 'AUTO_RENEWABLE_SUBSCRIPTION',
      subscriptionPeriod: identifier === 'annual' ? 'P1Y' : 'P1M',
      defaultOption: null,
      subscriptionOptions: null,
      presentedOfferingIdentifier: null,
      presentedOfferingContext: null,
    },
  }) as unknown as import('react-native-purchases').PurchasesPackage;

describe('offerFromOfferings — the paywall shows the store, verbatim', () => {
  const offerings = {
    current: {
      identifier: 'default',
      serverDescription: '',
      metadata: {},
      availablePackages: [pkg('annual', 'kickoffcal_annual', 17.99, '£17.99'), pkg('monthly', 'kickoffcal_monthly', 1.99, '£1.99')],
      lifetime: null,
      annual: pkg('annual', 'kickoffcal_annual', 17.99, '£17.99'),
      sixMonth: null,
      threeMonth: null,
      twoMonth: null,
      monthly: pkg('monthly', 'kickoffcal_monthly', 1.99, '£1.99'),
      weekly: null,
    },
  } as unknown as import('react-native-purchases').PurchasesOfferings;

  it('maps both plans with the localised price STRINGS untouched', () => {
    const o = offerFromOfferings(offerings, true)!;
    expect(o.annual?.priceString).toBe('£17.99');
    expect(o.monthly?.priceString).toBe('£1.99');
    expect(o.annual?.id).toBe('annual');
    expect(o.trialEligible).toBe(true);
  });

  it('trial eligibility rides only on an annual plan that exists', () => {
    const noAnnual = { current: { ...offerings.current!, annual: null } } as unknown as import('react-native-purchases').PurchasesOfferings;
    expect(offerFromOfferings(noAnnual, true)?.trialEligible).toBe(false);
    expect(offerFromOfferings(offerings, false)?.trialEligible).toBe(false);
  });

  it('no current offering, or one with neither plan, is null (the sheet does not open)', () => {
    expect(offerFromOfferings(null, true)).toBeNull();
    expect(offerFromOfferings({ current: null }, true)).toBeNull();
    const empty = { current: { ...offerings.current!, annual: null, monthly: null } } as unknown as import('react-native-purchases').PurchasesOfferings;
    expect(offerFromOfferings(empty, true)).toBeNull();
  });
});
