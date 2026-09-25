// A sport's name as the calendar lists show it, and its calendar's title
// ("KickOffCal · Football") — the Following row's own word for the sport,
// in the user's region and language. One definition: the pass names the
// calendar it creates with it, and Settings lists the calendars by it.

import { activeRegion } from '../../core/regionStore';
import { sportByKey } from '../follows/domain/sportsConfig';
import { sportLabelFor } from '../follows/domain/sportTerms';
import { SPORT_CALENDAR_PREFIX } from './domain/sportCalendars';

export function sportGroupLabel(group: string): string {
  return sportLabelFor(group, sportByKey(group)?.label ?? group, activeRegion());
}

export function sportCalendarTitle(group: string): string {
  return `${SPORT_CALENDAR_PREFIX}${sportGroupLabel(group)}`;
}
