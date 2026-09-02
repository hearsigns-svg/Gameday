// Storage is in-memory; the key name is pinned because the Preferences
// wipe and any future migration address it by string.

const mockStore = new Map<string, string>();
jest.mock('../../../../core/storage', () => ({
  readJson: (key: string, fallback: unknown) => {
    const raw = mockStore.get(key);
    return raw === undefined ? fallback : JSON.parse(raw);
  },
  writeJson: (key: string, value: unknown) => {
    mockStore.set(key, JSON.stringify(value));
  },
  removeKey: (key: string) => {
    mockStore.delete(key);
  },
}));

import { reminderChoice, setReminderChoice } from '../reminderChoice';

beforeEach(() => mockStore.clear());

test('a fresh install is unset', () => {
  expect(reminderChoice()).toBe('unset');
});

test('each choice round-trips under the versioned key', () => {
  for (const c of ['deferred', 'enabled', 'unset'] as const) {
    setReminderChoice(c);
    expect(reminderChoice()).toBe(c);
    expect(mockStore.get('reminders.choice.v1')).toBe(JSON.stringify(c));
  }
});

test('a stray value in storage reads as unset, never as a fourth state', () => {
  mockStore.set('reminders.choice.v1', JSON.stringify('banana'));
  expect(reminderChoice()).toBe('unset');
  mockStore.set('reminders.choice.v1', JSON.stringify({ enabled: true }));
  expect(reminderChoice()).toBe('unset');
});
