// English strings — settings. Values are the app's previous literals,
// byte-for-byte (tests assert copy; en must be provably unchanged).
//
// Shared vocabulary rule: a word settings shares with core ('Cancel',
// 'Tournaments') lives ONCE, in core.ts — never duplicated here.

export const settingsStrings = {
  // ── PreferencesScreen: the accordion's section titles ──────────────
  'settings.sections.calendar': 'Calendar',
  'settings.sections.events': 'Events',
  'settings.sections.app': 'App',
  'settings.sections.pastGames': 'Past games',
  'settings.sections.dataPrivacy': 'Data & privacy',
  'settings.sections.a11y': '{title} settings',

  // ── Calendar section ───────────────────────────────────────────────
  'settings.calendar.googleReconnectCaption':
    'In your Google Calendar — tap to reconnect the sign-in',
  'settings.calendar.googleReconnectA11y':
    'KickOffCal in Google Calendar. Reconnect Google sign-in',
  'settings.calendar.googleReconnected': 'Google Calendar reconnected',
  // The connected row at rest (B4 item 2): a statement, no verb. The
  // reconnect caption above appears only on a real auth-expired sync.
  'settings.calendar.googleConnectedCaption': 'In your Google Calendar',
  'settings.calendar.googleConnectedA11y': 'KickOffCal in Google Calendar',
  'settings.calendar.disconnectGoogle': 'Disconnect Google Calendar',
  'settings.calendar.disconnectCaption':
    'Your calendar and its events are untouched',
  'settings.calendar.googleDisconnected': 'Google Calendar disconnected',
  'settings.calendar.connectGoogle': 'Connect Google Calendar',
  'settings.calendar.connectCaption': 'Fixtures live in the app until you do',
  // An install waiting to connect that already holds synced events —
  // the REST path cannot move what another path wrote (B4 item 7).
  'settings.calendar.connectLegacyCaption':
    'Fixtures already in your calendar stay where they are',
  'settings.calendar.choose': 'Choose a calendar',
  'settings.calendar.autoPickedCaption':
    'Picked automatically when your calendar connects',
  'settings.calendar.targetA11y':
    'Calendar: {label}. {account}. Change where fixtures are written',
  'settings.calendar.chooseA11y': 'Choose where fixtures are written',
  'settings.calendar.colour': 'Colour',
  'settings.calendar.colourA11y': 'Calendar colour {name}',
  'settings.calendar.colourCaption':
    "How KickOffCal events look inside your phone's calendar app.",
  'settings.calendar.inheritedColour':
    'Your fixtures take the colour of {calendar}, which is yours to set in your calendar app.',
  'settings.calendar.colourApplied': 'Calendar colour is now {colour}',
  'settings.calendar.colourSaved':
    'Colour saved — applies when your calendar connects',
  // Google answered 403/400 to the calendarList colour PATCH — the
  // honest state, toasted and captioned, never a silent success (B4
  // item 3).
  'settings.calendar.colourRefused':
    'Google Calendar didn’t accept the colour — you can set it in the Google Calendar app',
  // The calendar-name fallback when no target is stored yet.
  'settings.words.yourCalendar': 'your calendar',

  // Colour names — read out and toasted, so they are copy, not config.
  'settings.colours.kickoffcalBlue': 'KickOffCal blue',
  'settings.colours.red': 'Red',
  'settings.colours.orange': 'Orange',
  'settings.colours.green': 'Green',
  'settings.colours.teal': 'Teal',
  'settings.colours.purple': 'Purple',
  'settings.colours.pink': 'Pink',
  'settings.colours.graphite': 'Graphite',

  // ── Events section ─────────────────────────────────────────────────
  'settings.events.footnote':
    'Timed events run kick-off to full time. Changes apply to every synced fixture on the next sync.',
  'settings.events.style': 'Event style',
  'settings.events.timed': 'Timed',
  'settings.events.allDay': 'All-day',
  'settings.events.raceWeekends': 'Race weekends',
  'settings.events.allSessions': 'All sessions',
  'settings.events.raceOnly': 'Race only',
  'settings.events.block': 'Dates only',
  'settings.events.keyRounds': 'Key rounds',
  'settings.events.allMatches': 'All matches',

  // ── Reminders section ──────────────────────────────────────────────
  'settings.reminders.title': 'Reminders',
  'settings.reminders.footnote': 'Changes apply on the next sync.',
  'settings.reminders.daysWithoutDates': 'Days without dates',
  'settings.reminders.slotA11y': 'Reminder {n}, {value}',
  'settings.reminders.slotValueA11y': 'Reminder {n} value',
  'settings.reminders.slotUnitA11y': 'Reminder {n} unit',
  'settings.reminders.off': 'Off',
  'settings.reminders.on': 'On',
  'settings.reminders.minutes': 'Minutes',
  'settings.reminders.hours': 'Hours',

  // ── App section ────────────────────────────────────────────────────
  'settings.app.appearance': 'Appearance',
  'settings.app.auto': 'Auto',
  'settings.app.light': 'Light',
  'settings.app.dark': 'Dark',
  'settings.app.region': 'Region',
  'settings.app.regionA11y': 'Region: {value}. Change region',

  // ── Region (Preferences value row + RegionScreen) ──────────────────
  'settings.region.matchDevice': 'Match my device ({region})',
  'settings.region.default': 'Default',
  'settings.region.note':
    'Region changes the order sports and competitions appear in, and what a few of them are called — never what you can follow. No location is used.',

  // ── Past games section ─────────────────────────────────────────────
  'settings.past.footnote':
    'Only games KickOffCal added are ever removed, and only ones it still has a record of. Switching back stops further removals — it does not bring back anything already deleted.',
  'settings.past.keep': 'Keep past games in my calendar',
  'settings.past.remove': 'Remove them {days} days after they finish',

  // ── Data & privacy rows ────────────────────────────────────────────
  'settings.privacy.erase': 'Erase synced events',
  'settings.privacy.eraseOwnTarget':
    'Removes the events KickOffCal added to {calendar}, including past ones. Nothing else in it is touched.',
  'settings.privacy.eraseOurs':
    'Removes the KickOffCal calendar and every event in it — past ones included. Nothing else in your calendar is touched.',
  'settings.privacy.eraseResync':
    'If sync stays connected, future events are added again.',
  'settings.privacy.eraseAction': 'Erase',
  'settings.privacy.eraseFailed_one':
    '{n} event couldn’t be removed — try again',
  'settings.privacy.eraseFailed_other':
    '{n} events couldn’t be removed — try again',
  'settings.privacy.nothingToErase': 'Nothing synced to erase',
  'settings.privacy.erased': 'Synced events erased',
  'settings.privacy.deleteTitle': 'Delete my data & reset',
  'settings.privacy.deleteA11y': 'Delete my data and reset',
  'settings.privacy.deleteBody':
    'Removes everything this app holds about you — follows, settings and the server-side registration — and starts over.',
  'settings.privacy.alsoErase': 'Also erase synced events from my calendar',
  'settings.privacy.cantUndo': 'This can’t be undone.',
  'settings.privacy.deleteAction': 'Delete',
  'settings.privacy.deleteMyData': 'Delete my data',

  // ── Screen tail (Preferences) ──────────────────────────────────────
  'settings.tail.photoCredits': 'Photo credits',
  'settings.status.underHourAgo': 'under an hour ago',
  'settings.status.hoursAgo': '{n}h ago',
  'settings.status.daysAgo': '{n}d ago',
  'settings.status.deviceNotSynced': 'This device: not synced yet',
  'settings.status.deviceSynced': 'This device last synced {when}',
  'settings.status.nothingFollowed': 'Fixture sources: nothing followed yet',
  'settings.status.freshnessUnknown': 'Fixture sources: freshness unknown',
  'settings.status.sourcesConfirmed': 'Fixture sources last confirmed {when}',

  // ── CalendarTargetScreen ───────────────────────────────────────────
  'settings.target.connectFirst':
    'Connect your calendar first and KickOffCal will pick the best place for your fixtures automatically. You can change it here afterwards.',
  'settings.target.putGames': 'Put your games in your calendar',
  'settings.target.connectA11y': 'Connect your calendar',
  'settings.target.goTo': 'Fixtures go to',
  'settings.target.moving_one': 'Moving {n} fixture… {moved}/{n}',
  'settings.target.moving_other': 'Moving {n} fixtures… {moved}/{n}',
  'settings.target.reading': 'Reading your calendars…',
  'settings.target.ownCalendarHeader': 'Its own calendar',
  'settings.target.newInSource': 'New KickOffCal calendar in {source}',
  'settings.target.newOnDevice': 'New KickOffCal calendar on this device',
  'settings.target.keepsSeparate':
    'Keeps fixtures separate from your own events',
  'settings.target.writeToA11y': 'Write fixtures to {calendar}',
  'settings.target.moved_one': 'Moved {n} fixture to {calendar}',
  'settings.target.moved_other': 'Moved {n} fixtures to {calendar}',
  'settings.target.nowGoTo': 'Fixtures now go to {calendar}',
  // No "nothing is left behind" (B4 item 7): the promise held for a
  // switch between provider calendars and was false for the one switch
  // Android makes — provider path → REST, whose scope cannot reach the
  // events the old path wrote.
  'settings.target.scopePromise':
    'Whichever you pick, KickOffCal only ever adds, changes or removes the fixtures it put there. Switching between these calendars moves those fixtures across.',

  // ── CreditsScreen ──────────────────────────────────────────────────
  'settings.credits.intro':
    'Photographs come from Wikimedia Commons under licences that permit reuse. Each is credited to its photographer below.',
  'settings.credits.openSportsDbA11y': 'Open TheSportsDB',
  'settings.credits.sportsDb':
    'Event data for several sports comes from TheSportsDB (thesportsdb.com).',
  'settings.credits.none': 'No photographs loaded yet.',
  'settings.credits.openSourceA11y': 'Open source page for {subject}',
  'settings.credits.source': 'source',
  'settings.credits.openLicenceA11y':
    'Open Wikimedia Commons licence information',
  'settings.credits.aboutLicences': 'About these licences',

  // ── Round 5 Stage 2: premium states, notification reminders, registry notice ──
  'premium.syncRow': 'Part of Premium · Start 14 days free',
  'premium.lockA11y': 'Premium feature',
  'notifications.off': 'Notifications are off',
  'notifications.openSettings': 'Open Settings',
  'reminders.notify': 'Notify me before fixtures',
  'reminders.notification.body': 'Starts in {when}',
  'registry.ceiling': 'Background updates paused: too many follows',

  // ── Round 5 Stage 3: paywall, purchase outcomes, subscription state ──
  'paywall.headline': 'Sync to your calendar',
  'paywall.lockSync': 'Every fixture in your calendar, kept up to date',
  'paywall.lockReminders': 'Three reminder slots',
  'paywall.lockColour': 'Calendar colour',
  'paywall.trialBadge': '14 days free',
  'paywall.monthly': 'Monthly',
  'paywall.annual': 'Annual',
  'paywall.pricePerMonth': '{price} / month',
  'paywall.pricePerYear': '{price} / year',
  'paywall.annualSaving': 'Save {percent}%',
  'paywall.startTrial': 'Start free trial',
  'paywall.subscribe': 'Subscribe',
  'paywall.restore': 'Restore purchase',
  'paywall.notNow': 'Continue with Free',
  'paywall.renewal': 'Renews automatically. Cancel any time.',
  'paywall.trialRenewal': 'Free for 14 days, then {price} / year. Renews automatically. Cancel any time.',
  'paywall.terms': 'Terms',
  'paywall.privacy': 'Privacy',
  'paywall.unavailable': 'Store unavailable right now',
  'purchase.pending': 'Waiting for approval',
  'purchase.failed': 'Purchase didn\'t complete',
  'restore.found': 'Subscription restored',
  'restore.none': 'No subscription to restore',
  'entitlement.trialDaysLeft': '{n} days left',
  'entitlement.trialDaysLeft.one': '1 day left',
  'entitlement.manage': 'Manage subscription',
  'entitlement.premium': 'Premium',
  'deleteData.subscriptionNote': 'Deleting your data doesn\'t cancel a subscription.',
} as const;
