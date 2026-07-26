import { entriesFromRecoveredEvents, orphanEventIds, RecoveredEvent } from '../recovery';

function event(overrides: Partial<RecoveredEvent> = {}): RecoveredEvent {
  return {
    fixtureId: 'apisports-1',
    eventId: 'evt-1',
    title: 'Liverpool v Everton',
    startUtc: '2023-10-21T11:30:00.000Z',
    endUtc: '2023-10-21T13:30:00.000Z',
    allDay: false,
    ...overrides,
  };
}

describe('entriesFromRecoveredEvents', () => {
  test('rebuilds one ledger entry per fixture with full fidelity', () => {
    const { ledger, surplusEventIds } = entriesFromRecoveredEvents(
      [
        event(),
        event({
          fixtureId: 'apisports-2',
          eventId: 'evt-2',
          title: 'Chelsea v Liverpool — postponed',
          startUtc: '2023-08-13T00:00:00.000Z',
          endUtc: '2023-08-14T00:00:00.000Z',
          allDay: true,
        }),
      ],
      'cal-1',
    );
    expect(surplusEventIds).toHaveLength(0);
    expect(ledger['apisports-1']).toEqual({
      eventId: 'evt-1',
      calendarId: 'cal-1',
      startUtc: '2023-10-21T11:30:00.000Z',
      endUtc: '2023-10-21T13:30:00.000Z',
      title: 'Liverpool v Everton',
      allDay: false,
    });
    expect(ledger['apisports-2'].allDay).toBe(true);
  });

  test('duplicate events for one fixture: first kept, rest surplus', () => {
    const { ledger, surplusEventIds } = entriesFromRecoveredEvents(
      [
        event(),
        event({ eventId: 'evt-dup-a' }),
        event({ eventId: 'evt-dup-b' }),
      ],
      'cal-1',
    );
    expect(Object.keys(ledger)).toHaveLength(1);
    expect(ledger['apisports-1'].eventId).toBe('evt-1');
    expect(surplusEventIds).toEqual(['evt-dup-a', 'evt-dup-b']);
  });

  test('empty scan rebuilds nothing', () => {
    const { ledger, surplusEventIds } = entriesFromRecoveredEvents([], 'cal-1');
    expect(Object.keys(ledger)).toHaveLength(0);
    expect(surplusEventIds).toHaveLength(0);
  });
});

describe('orphanEventIds', () => {
  test('events unreferenced by the ledger are orphans', () => {
    const { ledger } = entriesFromRecoveredEvents([event()], 'cal-1');
    const orphans = orphanEventIds(
      [event(), event({ eventId: 'evt-orphan', fixtureId: 'apisports-9' })],
      ledger,
    );
    expect(orphans).toEqual(['evt-orphan']);
  });

  test('fully ledgered calendar has no orphans', () => {
    const events = [event(), event({ eventId: 'evt-2', fixtureId: 'apisports-2' })];
    const { ledger } = entriesFromRecoveredEvents(events, 'cal-1');
    expect(orphanEventIds(events, ledger)).toHaveLength(0);
  });
});
