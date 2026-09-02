// The connection rule (Round 4 B4). Every decision that used to be made
// by reading the stored choice alone is pinned here, and each guard
// ships with the defect it exists to stop pasted back in (rule 15).

import {
  choiceAfterNotNow,
  connectionState,
  grantMayLatch,
  ownsCalendarColour,
  restRowMode,
} from '../calendarConnection';

describe('connectionState — the engine gate', () => {
  it('iOS provider install, opted in: connected', () => {
    expect(connectionState('enabled', 'provider', 'provider')).toBe('connected');
  });

  it('Android connected to Google: connected', () => {
    expect(connectionState('enabled', 'google-connect', 'rest')).toBe('connected');
  });

  it('Android opted in but not connected (fresh, disconnected, OR legacy provider): needs-google-connect', () => {
    expect(connectionState('enabled', 'google-connect', 'provider')).toBe(
      'needs-google-connect',
    );
  });

  it('not opted in is off on every route and backend', () => {
    for (const choice of ['unset', 'deferred'] as const) {
      expect(connectionState(choice, 'provider', 'provider')).toBe('off');
      expect(connectionState(choice, 'google-connect', 'provider')).toBe('off');
      expect(connectionState(choice, 'google-connect', 'rest')).toBe('off');
    }
  });

  // RULE 15 — the defect, reproduced. syncEngine's gate before B4 was
  // `calendarChoice() !== 'enabled'` and nothing else: a legacy Android
  // install (choice latched 'enabled' by its ledger, backend still
  // 'provider') passed it and the provider path resumed writing into
  // the user's own "Social" calendar — after a disconnect, and on
  // installs that never saw the Connect flow at all.
  it('ATTACK: the old choice-only gate let the legacy Android install write; the rule refuses it', () => {
    const oldGate = (choice: 'unset' | 'deferred' | 'enabled') =>
      choice === 'enabled' ? 'write' : 'fixtures-only';
    // The old decision on that install — the bug:
    expect(oldGate('enabled')).toBe('write');
    // The rule's decision on the same install: no write path exists.
    const now = connectionState('enabled', 'google-connect', 'provider');
    expect(now).not.toBe('connected');
    expect(now).toBe('needs-google-connect');
  });
});

describe('grantMayLatch — reinstall healing', () => {
  it('a provider-route install with a fresh choice may latch from an OS grant', () => {
    expect(grantMayLatch('unset', 'provider', 'provider')).toBe(true);
  });

  it('a REST-backed install may latch — the stored connection is the evidence', () => {
    expect(grantMayLatch('unset', 'google-connect', 'rest')).toBe(true);
  });

  it('never latches over an answered choice', () => {
    expect(grantMayLatch('deferred', 'provider', 'provider')).toBe(false);
    expect(grantMayLatch('enabled', 'provider', 'provider')).toBe(false);
  });

  // RULE 15 — a reinstalled legacy Android phone still carries the OS
  // calendar grant. The old healing branch latched 'enabled' from it,
  // which under the new gate means fixtures-only with the calendar-off
  // banner HIDDEN (the choice says enabled) — writes lost silently.
  it('ATTACK: an Android install with an OS grant but no Google connection must NOT latch', () => {
    const oldHealing = (choice: string, grant: boolean) =>
      choice === 'unset' && grant;
    expect(oldHealing('unset', true)).toBe(true); // the defect
    expect(grantMayLatch('unset', 'google-connect', 'provider')).toBe(false);
  });
});

describe('ownsCalendarColour — backend-aware', () => {
  const social = { kind: 'user' as const };
  const ours = { kind: 'ours' as const };

  it('REST: ours by construction, whatever record the provider path left behind', () => {
    expect(ownsCalendarColour('rest', 'google-connect', social)).toBe(true);
    expect(ownsCalendarColour('rest', 'google-connect', null)).toBe(true);
  });

  it('Android waiting to connect: the calendar to come is ours — the stale record is dead', () => {
    expect(ownsCalendarColour('provider', 'google-connect', social)).toBe(true);
    expect(ownsCalendarColour('provider', 'google-connect', null)).toBe(true);
  });

  it('iOS provider: the persisted target decides, as before', () => {
    expect(ownsCalendarColour('provider', 'provider', null)).toBe(true);
    expect(ownsCalendarColour('provider', 'provider', ours)).toBe(true);
    expect(ownsCalendarColour('provider', 'provider', social)).toBe(false);
  });

  // RULE 15 — the Android remnant itself: Preferences derived
  // `target === null || target.kind === 'ours'` from the stale
  // pre-P28 record and showed "Your fixtures take the colour of Social"
  // beside a REST-created KickOffCal calendar.
  it('ATTACK: the record-only derivation called the REST calendar "Social"; the rule does not', () => {
    const oldDerivation = (stored: { kind: string } | null) =>
      stored === null || stored.kind === 'ours';
    expect(oldDerivation(social)).toBe(false); // the defect: "inherited colour"
    expect(ownsCalendarColour('rest', 'google-connect', social)).toBe(true);
  });
});

describe('choiceAfterNotNow — the latch is protected', () => {
  it('an unanswered or deferred ask records a deferral', () => {
    expect(choiceAfterNotNow('unset')).toBe('deferred');
    expect(choiceAfterNotNow('deferred')).toBe('deferred');
  });

  // RULE 15 — the priming screen's "Not now" wrote 'deferred'
  // unconditionally. On Android the REST path never persisted a target,
  // so the connected confirmation never replaced the ask; a user who had
  // just connected and then tapped "Not now" switched their calendar
  // back off.
  it('ATTACK: the old handler downgraded a latched enabled; the rule keeps it', () => {
    const oldHandler = (): 'deferred' => 'deferred';
    expect(oldHandler()).toBe('deferred'); // the defect
    expect(choiceAfterNotNow('enabled')).toBe('enabled');
  });
});

describe('restRowMode — reconnect only on a REAL expiry', () => {
  it('auth-expired asks for a reconnect', () => {
    expect(restRowMode('auth-expired')).toBe('reconnect');
  });

  it('no error, or an unrelated error, is the plain connected truth', () => {
    expect(restRowMode(null)).toBe('connected');
    expect(restRowMode('offline')).toBe('connected');
    expect(restRowMode('suspect-empty')).toBe('connected');
    expect(restRowMode('unknown')).toBe('connected');
  });
});
