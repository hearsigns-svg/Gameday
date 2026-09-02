// parseFlags is pure; the module's Firestore reader is not exercised here.
jest.mock('firebase/firestore', () => ({ doc: jest.fn(), getDocFromServer: jest.fn() }));
jest.mock('../firebase', () => ({ db: {} }));
// storage is MMKV-backed (native); parseFlags never touches it.
jest.mock('../storage', () => ({ readJson: jest.fn(() => null), writeJson: jest.fn() }));

import { DEFAULT_FLAGS, parseFlags } from '../flags';

describe('parseFlags — fail-safe defaults (Round 5 ruling 5)', () => {
  it('absent, null and garbage all yield the launch defaults', () => {
    expect(parseFlags(undefined)).toEqual(DEFAULT_FLAGS);
    expect(parseFlags(null)).toEqual(DEFAULT_FLAGS);
    expect(parseFlags('nope')).toEqual(DEFAULT_FLAGS);
    expect(parseFlags(42)).toEqual(DEFAULT_FLAGS);
  });

  it('the defaults ARE the launch state: ads off, paywall dismissible, sync gate open', () => {
    expect(DEFAULT_FLAGS.adsEnabled).toBe(false);
    expect(DEFAULT_FLAGS.paywallDismissible).toBe(true);
    expect(DEFAULT_FLAGS.syncGate).toBe('open');
  });

  it('valid fields are taken, unknown fields dropped', () => {
    const f = parseFlags({ syncGate: 'entitled', adsEnabled: true, mystery: 1 });
    expect(f).toEqual({ ...DEFAULT_FLAGS, syncGate: 'entitled', adsEnabled: true });
    expect('mystery' in f).toBe(false);
  });

  it('a wrong-typed field falls back INDIVIDUALLY, never poisoning its neighbours', () => {
    const f = parseFlags({ syncGate: 'closed', adsEnabled: 'yes', paywallDismissible: false });
    expect(f.syncGate).toBe('open');
    expect(f.adsEnabled).toBe(false);
    expect(f.paywallDismissible).toBe(false);
  });
});
