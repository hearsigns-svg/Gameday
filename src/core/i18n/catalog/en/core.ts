// English strings — core (shared components, toasts, navigation
// chrome). Values are the app's previous literals, byte-for-byte
// (tests assert copy; en must be provably unchanged).
//
// KEY CONVENTION (the whole catalog follows it): dotted
// `area.context.name`, params in braces (`{name}`), plural pairs as
// `key_one`/`key_other`. A key is added in the SAME change that makes
// a screen read it — no orphan keys, no hardcoded twins left behind.

export const coreStrings = {
  // ── Sport schedule vocabulary (sportTerms.fixturesWordFor +
  // CompetitionCard's expansion pair) ────────────────────────────────
  'core.fixtures': 'Fixtures',
  'core.teams': 'Teams',
  'core.fights': 'Fights',
  'core.matches': 'Matches',
  'core.tournaments': 'Tournaments',
  'core.events': 'Events',

  // ── Sport NAMES (Phase C language layer). English values are the
  // sportsConfig labels byte-for-byte; in English the REGIONAL table
  // in sportTerms.ts keeps the last word (Football/Soccer is a region
  // fact) — these keys serve the non-English languages, where a
  // sport's name is a translation, not a regional choice. ───────────
  'core.sport.soccer': 'Soccer',
  'core.sport.cricket': 'Cricket',
  'core.sport.ice-hockey': 'Ice hockey',
  'core.sport.tennis': 'Tennis',
  'core.sport.athletics': 'Athletics',
  'core.sport.basketball': 'Basketball',
  'core.sport.baseball': 'Baseball',
  'core.sport.nfl': 'American football',
  'core.sport.rugby': 'Rugby',
  'core.sport.golf': 'Golf',
  'core.sport.f1': 'Formula 1',
  'core.sport.boxing': 'Boxing',
  'core.sport.ufc': 'MMA',
  'core.sport.motorsport': 'Motorsport',
  'core.sport.olympics': 'Olympics',

  // ── Screen titles (App.tsx headers — the BrandTitle voice). The
  // brand name itself and the dev-only gallery stay literal. ─────────
  // ── Follow TYPES as display words (a11y): the Following rows used
  // to pass the raw internal enum into the sentence — untranslatable
  // from any catalog (the de translation pass caught it). ───────────
  'core.followType.team': 'team',
  'core.followType.competition': 'competition',
  'core.followType.athlete': 'athlete',
  'core.followType.series': 'series',

  'core.title.home': 'Home',
  'core.title.following': 'Following',
  'core.title.schedule': 'Schedule',
  'core.title.yourCalendar': 'Your calendar',
  'core.title.search': 'Search',
  'core.title.sports': 'Sports',
  'core.title.competitions': 'Competitions',
  'core.title.athletes': 'Athletes',
  'core.title.preferences': 'Preferences',
  'core.title.region': 'Region',
  'core.title.calendar': 'Calendar',
  'core.title.photoCredits': 'Photo credits',

  // ── when.ts: the hardcoded English words. Weekday/date forms stay
  // locale-driven (toLocaleDateString) and never pass through here. ──
  'core.when.today': 'Today',
  'core.when.tomorrow': 'Tomorrow',
  'core.when.todayHeading': 'Today · {date}',
  'core.when.tomorrowHeading': 'Tomorrow · {date}',
  'core.when.postponed': 'Postponed',
  'core.when.timeTbc': 'Time TBC',
  'core.when.spanDays_one': '{n} day',
  'core.when.spanDays_other': '{n} days',
  // The countdown chip is set in caps AS COPY (a translator decides
  // what urgency-caps look like in their language).
  'core.when.countdownToday': 'TODAY',
  'core.when.countdownTomorrow': 'TOMORROW',
  // n is 2..6 by construction (0→TODAY, 1→TOMORROW), so a plain
  // template is the honest form — every working-set language treats
  // 2..6 as `other`.
  'core.when.countdownInDays': 'IN {n} DAYS',

  // ── Shared components (components.tsx / cardExpansion.tsx) ────────
  'core.rail.openA11y': '{label}, {caption}. See their fixtures',
  // Wraps a composed description when the element also opens the event.
  'core.a11y.openEvent': '{label}. Open event',
  'core.hero.nextUpA11y': 'Next up: {title}, {when}',
  'core.row.removedFromCalendar': 'removed from calendar',
  'core.row.removedCaption': 'Removed — not in your calendar',
  'core.row.addToCalendarA11y': 'Add {title} to your calendar',
  'core.row.removeFromCalendarA11y': 'Remove {title} from your calendar',
  'core.row.restoreToCalendarA11y': 'Restore {title} to your calendar',
  'core.actions.add': 'Add',
  'core.actions.added': 'Added',
  'core.actions.remove': 'Remove',
  'core.actions.removed': 'Removed',
  'core.actions.cancel': 'Cancel',
  'core.follow.follow': 'Follow',
  'core.follow.following': 'Following',
  'core.follow.followA11y': 'Follow {subject}',
  'core.follow.unfollowA11y': 'Unfollow {subject}',
  'core.expansion.closeA11y': 'Close',

  // ── Sync status chip + its relative times ──────────────────────────
  'core.status.justNow': 'just now',
  // "min" is the abbreviation in every working-set language — no pair.
  'core.status.minsAgo': '{n} min ago',
  'core.status.hoursAgo_one': '1 hour ago',
  'core.status.hoursAgo_other': '{n} hours ago',
  'core.status.daysAgo_one': 'yesterday',
  'core.status.daysAgo_other': '{n} days ago',
  'core.status.checking': 'Checking for fixtures…',
  'core.status.updating': 'Updating your calendar…',
  'core.status.sourcesQuiet': 'Fixture sources quiet for {n}d — data may be behind',
  'core.status.calendarOff': 'Calendar sync is off',
  'core.status.upToDateCalendarOff': 'Fixtures up to date · calendar off',
  'core.status.notSynced': 'Not synced yet',
  'core.status.updated': 'Calendar updated · {changes} · {when}',
  'core.status.changes_one': '{n} change',
  'core.status.changes_other': '{n} changes',
  'core.status.upToDate': 'Calendar up to date · checked {when}',

  // ── Calendar-off banner ────────────────────────────────────────────
  'core.banner.fixturesReady_one': '{n} fixture ready to add',
  'core.banner.fixturesReady_other': '{n} fixtures ready to add',
  'core.banner.fixturesWhenConnected':
    'Fixtures will be added once you connect your calendar',
  'core.banner.addA11y': 'Add fixtures to my calendar',

  // ── Coverage note disclosure ───────────────────────────────────────
  'core.coverage.showA11y': 'What this covers',
  'core.coverage.hideA11y': 'Hide what this covers',
  'core.coverage.closedLabel': 'ⓘ  What this covers',
  'core.coverage.openLabel': 'ⓘ  What this covers ▲',
} as const;
