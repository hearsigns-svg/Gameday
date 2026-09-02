import {
  FIRE_AT_DATA_KEY,
  fireAtMsOfRequest,
  fireAtMsOfTrigger,
  fixtureIdOfResponse,
  IOS_AUTHORIZATION_EPHEMERAL,
  IOS_AUTHORIZATION_PROVISIONAL,
  permissionStateOf,
  responseKey,
  UNREADABLE_PERMISSION,
} from '../notificationMapping';

const T = Date.UTC(2026, 8, 10, 18);

describe('permissionStateOf', () => {
  test('granted / denied / undetermined pass through with canAskAgain', () => {
    expect(permissionStateOf({ status: 'granted', granted: true, canAskAgain: true })).toEqual({
      status: 'granted',
      canAskAgain: true,
    });
    expect(permissionStateOf({ status: 'denied', granted: false, canAskAgain: false })).toEqual({
      status: 'denied',
      canAskAgain: false,
    });
    expect(permissionStateOf({ status: 'undetermined', granted: false, canAskAgain: true })).toEqual({
      status: 'undetermined',
      canAskAgain: true,
    });
  });

  test('iOS provisional and ephemeral arrive as undetermined and count as granted', () => {
    // This is what expo-notifications' iOS requester actually emits for
    // .provisional: only .authorized maps to 'granted' natively.
    expect(
      permissionStateOf({
        status: 'undetermined',
        granted: false,
        canAskAgain: true,
        ios: { status: IOS_AUTHORIZATION_PROVISIONAL },
      }).status,
    ).toBe('granted');
    expect(
      permissionStateOf({
        status: 'undetermined',
        granted: false,
        canAskAgain: true,
        ios: { status: IOS_AUTHORIZATION_EPHEMERAL },
      }).status,
    ).toBe('granted');
  });

  test('iOS denied stays denied even with the raw status present', () => {
    expect(
      permissionStateOf({ status: 'denied', granted: false, canAskAgain: false, ios: { status: 1 } }),
    ).toEqual({ status: 'denied', canAskAgain: false });
  });

  test('an unknown status string is undetermined, and canAskAgain defaults to askable', () => {
    expect(permissionStateOf({ status: 'whatever' })).toEqual({
      status: 'undetermined',
      canAskAgain: true,
    });
  });

  test('the unreadable sentinel is a combination the OS never produces', () => {
    expect(UNREADABLE_PERMISSION).toEqual({ status: 'undetermined', canAskAgain: false });
  });
});

describe('fireAtMsOfTrigger', () => {
  test('Android read-back shape { type: date, value }', () => {
    expect(fireAtMsOfTrigger({ type: 'date', repeats: false, value: T, channelId: 'fixtures' })).toBe(T);
  });

  test('JS input shapes: date as Date or number, native timestamp', () => {
    expect(fireAtMsOfTrigger({ type: 'date', date: new Date(T) })).toBe(T);
    expect(fireAtMsOfTrigger({ type: 'date', date: T })).toBe(T);
    expect(fireAtMsOfTrigger({ type: 'date', timestamp: T })).toBe(T);
  });

  test('iOS read-back of a DATE trigger is a timeInterval with no absolute time → null', () => {
    expect(
      fireAtMsOfTrigger({
        class: 'UNTimeIntervalNotificationTrigger',
        type: 'timeInterval',
        repeats: false,
        seconds: 3600,
      }),
    ).toBeNull();
  });

  test('other or missing triggers → null', () => {
    expect(fireAtMsOfTrigger(null)).toBeNull();
    expect(fireAtMsOfTrigger(undefined)).toBeNull();
    expect(fireAtMsOfTrigger({ type: 'calendar', dateComponents: { hour: 9 } })).toBeNull();
    expect(fireAtMsOfTrigger({ type: 'push' })).toBeNull();
    expect(fireAtMsOfTrigger({ type: 'date', value: 'soon' })).toBeNull();
    expect(fireAtMsOfTrigger({ type: 'date', value: NaN })).toBeNull();
    expect(fireAtMsOfTrigger('date')).toBeNull();
  });
});

describe('fireAtMsOfRequest', () => {
  test('prefers the trigger when it carries a time', () => {
    expect(
      fireAtMsOfRequest({
        identifier: 'fixture:a',
        content: { data: { [FIRE_AT_DATA_KEY]: T + 1 } },
        trigger: { type: 'date', value: T },
      }),
    ).toBe(T);
  });

  test('falls back to the data stamp (the iOS path)', () => {
    expect(
      fireAtMsOfRequest({
        identifier: 'fixture:a',
        content: { data: { fixtureId: 'a', [FIRE_AT_DATA_KEY]: T } },
        trigger: { type: 'timeInterval', repeats: false, seconds: 60 },
      }),
    ).toBe(T);
  });

  test('null when neither is readable', () => {
    expect(fireAtMsOfRequest({ identifier: 'fixture:a' })).toBeNull();
    expect(fireAtMsOfRequest({ identifier: 'fixture:a', content: null, trigger: null })).toBeNull();
    expect(
      fireAtMsOfRequest({
        identifier: 'fixture:a',
        content: { data: { [FIRE_AT_DATA_KEY]: '1234' } },
        trigger: { type: 'timeInterval', seconds: 5 },
      }),
    ).toBeNull();
  });
});

describe('fixtureIdOfResponse', () => {
  const response = (identifier: string, data?: Record<string, unknown>) => ({
    actionIdentifier: 'expo.modules.notifications.actions.DEFAULT',
    notification: { date: 1_700_000_000, request: { identifier, content: { data } } },
  });

  test('reads the data stamp', () => {
    expect(fixtureIdOfResponse(response('fixture:a', { fixtureId: 'a' }))).toBe('a');
  });

  test('falls back to the identifier prefix when the stamp is missing', () => {
    expect(fixtureIdOfResponse(response('fixture:b'))).toBe('b');
    expect(fixtureIdOfResponse(response('fixture:b', { fixtureId: 42 }))).toBe('b');
  });

  test('null for foreign notifications and for no response', () => {
    expect(fixtureIdOfResponse(response('some-push'))).toBeNull();
    expect(fixtureIdOfResponse(null)).toBeNull();
    expect(fixtureIdOfResponse(undefined)).toBeNull();
    expect(fixtureIdOfResponse({ notification: null })).toBeNull();
  });
});

describe('responseKey', () => {
  test('same identifier and delivery instant → same key; different instant → different key', () => {
    const a = { notification: { date: 100, request: { identifier: 'fixture:a' } } };
    const b = { notification: { date: 100, request: { identifier: 'fixture:a' } } };
    const c = { notification: { date: 101, request: { identifier: 'fixture:a' } } };
    expect(responseKey(a)).toBe(responseKey(b));
    expect(responseKey(a)).not.toBe(responseKey(c));
  });

  test('survives a response with nothing in it', () => {
    expect(typeof responseKey({})).toBe('string');
  });
});
