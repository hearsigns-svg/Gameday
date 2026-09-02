// The connection question, answered from this install's live state: the
// pure rule in domain/calendarConnection.ts fed with the stored choice,
// the sync route and the armed backend. The engine's gate, the
// calendar-off banners, the Connect row and the picker screen all ask
// THIS — never the stored choice on its own, which is what let a legacy
// Android install keep writing through the provider path after the
// REST-always architecture landed (Round 4 B4).

import {
  CalendarConnection,
  connectionState,
} from '../domain/calendarConnection';
import { activeBackend } from './calendarBackend';
import { calendarChoice } from './calendarChoice';
import { nativeSyncRoute } from './driver';
import { loadLedger } from './ledger';

export function calendarConnection(): CalendarConnection {
  return connectionState(calendarChoice(), nativeSyncRoute(), activeBackend());
}

export function calendarConnected(): boolean {
  return calendarConnection() === 'connected';
}

// True while an install is waiting to connect Google AND already holds
// ledgered events — a legacy provider-path install (events in the user's
// own Google calendar) or a disconnected REST one (events in the
// KickOffCal calendar). Either way those events stay exactly where they
// are: the REST scope cannot reach the former and does not need to move
// the latter. The Connect row says so instead of promising a move.
export function legacyCalendarEventsRemain(): boolean {
  return (
    calendarConnection() === 'needs-google-connect' &&
    Object.keys(loadLedger()).length > 0
  );
}
