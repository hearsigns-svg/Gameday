// The user's chosen calendar colour — how KickOffCal appears in the
// phone's calendar app. Stored even before any calendar exists:
// creation and later changes both read it, on BOTH write paths (the
// provider driver's create/conform and the REST driver's calendarList
// patch). One store, imported by both, so the two paths can never hold
// different ideas of "the colour". Pure data underneath (palette.ts),
// no react-native — the REST driver's tests import this.

import { palette } from '../../../core/palette';
import { readJson, writeJson } from '../../../core/storage';

const CAL_COLOUR_KEY = 'calendarColour.v1';

export function calendarColour(): string {
  return readJson<string>(CAL_COLOUR_KEY, palette.light.primary);
}

export function saveCalendarColour(hex: string): void {
  writeJson(CAL_COLOUR_KEY, hex);
}
