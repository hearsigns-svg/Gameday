// English strings — calendar. Values are the app's previous literals,
// byte-for-byte (tests assert copy; en must be provably unchanged).
//
// Covers the calendar-sync feature: the screens (FixtureCard, Schedule,
// MonthGrid, priming, onboarding welcome), the pure domain vocabulary
// (offset labels, reminder options, timing explanations, card sections)
// and the CALENDAR-WRITTEN strings (tournament bookend titles, the
// pointer/nominal notes, the all-day suffixes) — the language-rewrite
// mechanism depends on those flowing through here.

export const calendarStrings = {
  // The language-switch rewrite notice (Phase C ruling: the rewrite is
  // deliberate and announces itself in-UI when it runs).
  'calendar.language.rewrite': 'Updating your calendar events to {language}',
  // ── Offset vocabulary (prefs.ts — offsetLabel / short / picker) ────
  'calendar.offset.off': 'Off',
  'calendar.offset.minBefore': '{n} min before',
  'calendar.offset.daysBefore_one': '{n} day before',
  'calendar.offset.daysBefore_other': '{n} days before',
  'calendar.offset.hoursBefore_one': '{n} hour before',
  'calendar.offset.hoursBefore_other': '{n} hours before',
  'calendar.offset.shortMinutes': '{n}m',
  'calendar.offset.shortDays': '{n}d',
  'calendar.offset.shortHours': '{n}h',
  'calendar.offset.pickerMinutes': '{n} m',
  'calendar.offset.pickerDays_one': '{n} day',
  'calendar.offset.pickerDays_other': '{n} days',
  'calendar.offset.pickerHours_one': '{n} hr',
  'calendar.offset.pickerHours_other': '{n} hrs',

  // ── Reminder options (prefs.ts) ────────────────────────────────────
  'calendar.reminder.none': 'None',
  'calendar.allDayReminder.eveningBefore': 'Evening before, 6pm',
  'calendar.allDayReminder.eveningBeforeShort': 'Eve before',
  'calendar.allDayReminder.morningOf': 'Morning of, 9am',
  'calendar.allDayReminder.morningOfShort': 'Morning',

  // ── Written INTO calendar events (tournamentTiers.ts / syncPlan.ts) ─
  'calendar.tournament.begins': '{title} begins',
  'calendar.tournament.finalDay': '{title} — final day',
  'calendar.tournament.pointer':
    'Individual matches can be added from the tournament’s card in the app.',
  'calendar.event.timeTbc': 'time TBC',
  'calendar.event.postponed': 'postponed',
  'calendar.event.nominalTimeNote':
    'Start time is not confirmed yet — this will update automatically.',

  // ── Timing explanations (fixtures/domain/timingExplanation.ts) ─────
  'calendar.timing.momentsAgo': 'moments ago',
  'calendar.timing.minutesAgo': '{n} minutes ago',
  'calendar.timing.hoursAgo_one': '{n} hour ago',
  'calendar.timing.hoursAgo_other': '{n} hours ago',
  'calendar.timing.daysAgo_one': 'yesterday',
  'calendar.timing.daysAgo_other': '{n} days ago',
  'calendar.timing.confirmOrganiser':
    '{source} has not confirmed the final time yet.',
  'calendar.timing.confirmGeneric':
    'The final time has not been confirmed yet.',
  'calendar.timing.slotNotAnnounced':
    'The order of play has not been announced by {source} yet.',
  'calendar.timing.timeNotAnnounced':
    'A start time has not been announced by {source} yet.',
  'calendar.timing.slotNotPublished':
    'The order of play has not been published yet.',
  'calendar.timing.timeNotPublished':
    'A start time has not been published yet.',
  'calendar.timing.checked': 'Checked {ago}',
  'calendar.timing.cancelled': 'Cancelled — this is no longer taking place.',
  'calendar.timing.postponed': 'Postponed — no new date has been published.',
  'calendar.timing.runsOverDays':
    'Runs over {n} days, so it sits in your calendar as a {n}-day event.',
  'calendar.timing.exactTimeNotSet':
    "The exact time isn't set yet, so this covers the whole event — {n} days.",
  'calendar.timing.dayOnlyAppearance':
    'Only the day is known — this sits on the day until the order of play is published.',
  'calendar.timing.dayOnly':
    'Only the day is known, so this is an all-day entry rather than a time we made up.',
  'calendar.timing.nominal':
    'The time shown is the published start, but it is not the settled one yet.',
  'calendar.timing.provisional':
    'This time is confirmed for now, but it can still move.',
  'calendar.timing.willUpdate':
    'Your calendar updates on its own when it changes.',
  'calendar.timing.shortCancelled': 'Cancelled',
  'calendar.timing.shortPostponed': 'Postponed — no new date yet',
  'calendar.timing.runsDays': 'Runs {n} days',
  'calendar.timing.noOrderOfPlay': 'No order of play',
  'calendar.timing.noConfirmedTime': 'No confirmed time',
  'calendar.timing.noStartTime': 'No start time',
  'calendar.timing.subjectFromYet': '{subject} from {source} yet',
  'calendar.timing.subjectChecked': '{subject} published · checked {ago}',
  'calendar.timing.subjectPublishedYet': '{subject} published yet',
  'calendar.timing.shortProvisional': 'Confirmed for now, can still move',

  // ── The full card's vocabulary (fixtures/domain/card.ts) ───────────
  'calendar.cardList.fullCard': 'Full card',
  'calendar.cardList.matches': 'Matches',
  'calendar.cardList.events': 'Events',
  'calendar.cardList.alsoOn': 'Also on',
  'calendar.cardList.timeWithinEvent': 'Time within the event not published',

  // ── The expanded fixture card (FixtureCard.tsx) ────────────────────
  'calendar.card.loadFailed': 'Couldn’t load this event',
  'calendar.card.titleClose': '{title}. Close',
  'calendar.card.removeFromCalendar': 'Remove from calendar',
  'calendar.card.addToCalendar': 'Add to calendar',
  'calendar.card.removeTitleA11y': 'Remove {title} from your calendar',
  'calendar.card.addTitleA11y': 'Add {title} to your calendar',
  'calendar.card.alreadyInCalendar': '{title} is already in your calendar',
  'calendar.card.mens': 'Men’s',
  'calendar.card.womens': 'Women’s',
  'calendar.card.sexChipShown': '{label} matches, shown',
  'calendar.card.sexChipHidden': '{label} matches, hidden',
  'calendar.card.removeAllA11y': 'Remove all listed matches from your calendar',
  'calendar.card.addAllA11y': 'Add all listed matches to your calendar',
  'calendar.card.removeAll': 'Remove all',
  'calendar.card.addAll': 'Add all',
  'calendar.card.reminder': 'Reminder',
  'calendar.card.optionSelected': '{label}, selected',
  'calendar.card.useDefaultReminder': 'Use my default reminder',
  'calendar.card.colour': 'Colour',
  'calendar.card.colourValue': 'Colour {value}',
  'calendar.card.mainEvent': 'Main event',
  'calendar.card.added': 'Added',
  'calendar.card.add': 'Add',
  'calendar.card.close': 'Close',

  // ── Toasts (FixtureCard / ScheduleScreen) ──────────────────────────
  'calendar.toast.removed': 'Removed from your calendar',
  'calendar.toast.added': 'Added to your calendar',
  'calendar.toast.restored': 'Restored to your calendar',
  'calendar.toast.undo': 'Undo',

  // ── Schedule (ScheduleScreen.tsx) ──────────────────────────────────
  'calendar.schedule.emptyHeadline': 'Nothing on the schedule',
  'calendar.schedule.emptyNoFollows':
    'Follow a team or competition and its fixtures appear here — and in your calendar.',
  'calendar.schedule.emptyWaiting':
    'Fixtures appear here as soon as schedules are announced.',
  'calendar.schedule.hideCalendar': 'Hide the calendar',
  'calendar.schedule.showCalendar': 'Show the calendar',
  'calendar.schedule.footerOff':
    'These fixtures will be added to your phone calendar once you connect it.',
  'calendar.schedule.footerOn':
    'Everything here is in your phone calendar and updates on its own — times firm up, postponements move, cancellations disappear.',
  'calendar.schedule.showMore': 'Show more',

  // ── Month grid (MonthGrid.tsx) ─────────────────────────────────────
  'calendar.month.previous': 'Previous month',
  'calendar.month.next': 'Next month',
  'calendar.month.day': '{day} {month}',
  'calendar.month.dayFixtures_one': '{day} {month}, {n} fixture',
  'calendar.month.dayFixtures_other': '{day} {month}, {n} fixtures',
  'calendar.month.dayRemovedOnly': '{day} {month}, removed fixtures only',
  // Monday-start weekday initials, one key each — several languages
  // do not share English's duplicated T/S letters.
  'calendar.month.mon': 'M',
  'calendar.month.tue': 'T',
  'calendar.month.wed': 'W',
  'calendar.month.thu': 'T',
  'calendar.month.fri': 'F',
  'calendar.month.sat': 'S',
  'calendar.month.sun': 'S',

  // ── Calendar priming (CalendarPrimingScreen.tsx) ───────────────────
  'calendar.priming.title': 'Put your games in your calendar',
  'calendar.priming.ready_one': '{count} fixture ready to add.',
  'calendar.priming.ready_other': '{count} fixtures ready to add.',
  'calendar.priming.readyMonth_one':
    '{count} fixture ready to add — about {month} in the next month.',
  'calendar.priming.readyMonth_other':
    '{count} fixtures ready to add — about {month} in the next month.',
  'calendar.priming.explainTarget':
    'Fixtures go into a calendar you choose — we only ever touch events we added',
  'calendar.priming.explainUpdates':
    'Events update themselves when times change or games move',
  'calendar.priming.explainUnfollow':
    'Unfollow and its fixtures disappear again',
  'calendar.priming.denied':
    'Calendar access is turned off for KickOffCal. Allow it in Settings, then come back — your fixtures are waiting.',
  'calendar.priming.tryAgain': '{message} Try again in a moment.',
  'calendar.priming.googleNote':
    'Calendar sync needs a Google sign-in on Android. Without it, your fixtures live in the app.',
  'calendar.priming.openSettings': 'Open Settings',
  'calendar.priming.connecting': 'Connecting…',
  'calendar.priming.connectGoogle': 'Connect Google Calendar',
  'calendar.priming.addToMyCalendar': 'Add to my calendar',
  'calendar.priming.connectMyCalendar': 'Connect my calendar',
  'calendar.priming.notNow': 'Not now',
  'calendar.priming.addedFixtures_one': 'Added {n} fixture to your calendar',
  'calendar.priming.addedFixtures_other':
    'Added {n} fixtures to your calendar',
  'calendar.priming.connected': 'Calendar connected',
  'calendar.priming.connectedTitle': 'Your calendar is connected',
  'calendar.priming.connectedBody':
    'Follow a team and its fixtures appear there on their own — times firm up, postponements move, cancellations disappear. Nothing else to set up.',
  'calendar.priming.chooseSports': 'Choose your sports',
  'calendar.priming.differentCalendar': 'Use a different calendar',

  // ── First-run welcome (onboarding/WelcomeScreen.tsx) ───────────────
  'calendar.welcome.tagline': 'Never miss a game.',
  'calendar.welcome.promiseCalendar':
    'Fixtures land in your phone calendar, automatically',
  'calendar.welcome.promiseCorrect':
    'Times change, games move — your calendar stays correct',
  'calendar.welcome.promiseNoAccount': 'No account needed — just follow and go.',
  'calendar.welcome.getStarted': 'Get started',
} as const;
