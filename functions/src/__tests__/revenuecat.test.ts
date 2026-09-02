import { authorised, isEventForUs, mirrorFromEvent } from '../revenuecat';

const now = Date.parse('2026-10-01T12:00:00.000Z');
const later = now + 30 * 86_400_000;
const earlier = now - 86_400_000;

describe('mirrorFromEvent', () => {
  it('a purchase with a future expiry is premium; the mirror carries the receipt facts', () => {
    const r = mirrorFromEvent(
      {
        type: 'INITIAL_PURCHASE',
        app_user_id: 'uid-1',
        product_id: 'kickoffcal_annual',
        period_type: 'TRIAL',
        purchased_at_ms: now,
        expiration_at_ms: later,
        entitlement_ids: ['premium'],
        store: 'APP_STORE',
        environment: 'SANDBOX',
        id: 'evt-1',
      },
      now,
    );
    expect(r?.uid).toBe('uid-1');
    expect(r?.mirror.tier).toBe('premium');
    expect(r?.mirror.periodType).toBe('TRIAL');
    expect(r?.mirror.expiresAt).toBe(new Date(later).toISOString());
    expect(r?.mirror.lastEvent).toBe('INITIAL_PURCHASE');
    expect(r?.mirror.environment).toBe('SANDBOX');
  });

  it('EXPIRATION ends access whatever the expiry says', () => {
    const r = mirrorFromEvent(
      { type: 'EXPIRATION', app_user_id: 'u', expiration_at_ms: later },
      now,
    );
    expect(r?.mirror.tier).toBe('free');
  });

  it('CANCELLATION alone does NOT end access: the paid period stands until it expires', () => {
    expect(
      mirrorFromEvent({ type: 'CANCELLATION', app_user_id: 'u', expiration_at_ms: later }, now)
        ?.mirror.tier,
    ).toBe('premium');
    expect(
      mirrorFromEvent({ type: 'CANCELLATION', app_user_id: 'u', expiration_at_ms: earlier }, now)
        ?.mirror.tier,
    ).toBe('free');
  });

  it('a granting event whose period already ended is free (a late-delivered webhook)', () => {
    expect(
      mirrorFromEvent({ type: 'RENEWAL', app_user_id: 'u', expiration_at_ms: earlier }, now)?.mirror
        .tier,
    ).toBe('free');
  });

  it('no app_user_id → nothing to write', () => {
    expect(mirrorFromEvent({ type: 'RENEWAL' }, now)).toBeNull();
  });
});

describe('isEventForUs', () => {
  it('matches our entitlement id, an unscoped event, and TEST', () => {
    expect(isEventForUs({ type: 'RENEWAL', app_user_id: 'u', entitlement_ids: ['premium'] }, 'premium')).toBe(true);
    expect(isEventForUs({ type: 'RENEWAL', app_user_id: 'u', entitlement_ids: ['other'] }, 'premium')).toBe(false);
    expect(isEventForUs({ type: 'RENEWAL', app_user_id: 'u' }, 'premium')).toBe(true);
    expect(isEventForUs({ type: 'TEST', app_user_id: 'u', entitlement_ids: ['other'] }, 'premium')).toBe(true);
    expect(isEventForUs({ type: 'RENEWAL' }, 'premium')).toBe(false);
  });
});

describe('authorised — the shared secret guard, attacked', () => {
  it('accepts the exact secret, with or without the Bearer prefix', () => {
    expect(authorised('Bearer s3cret-value', 's3cret-value')).toBe(true);
    expect(authorised('s3cret-value', 's3cret-value')).toBe(true);
  });
  it('fails closed: no header, no configured secret, wrong value, prefix of the value', () => {
    expect(authorised(undefined, 's3cret-value')).toBe(false);
    expect(authorised('Bearer s3cret-value', undefined)).toBe(false);
    expect(authorised('Bearer s3cret-valuE', 's3cret-value')).toBe(false);
    expect(authorised('Bearer s3cret', 's3cret-value')).toBe(false);
    expect(authorised('', '')).toBe(false);
  });
});
