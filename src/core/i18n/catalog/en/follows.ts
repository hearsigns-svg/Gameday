// English strings — follows. Values are the app's previous literals,
// byte-for-byte (tests assert copy; en must be provably unchanged).
//
// Keys follow the catalog convention (core.ts): dotted
// `area.context.name`, params in braces, plural pairs `_one`/`_other`.
// Provider names (teams, athletes, competitions, fixtures) NEVER pass
// through here — they arrive as params.

export const followsStrings = {
  // ── Search entry (Home's bar + the Search screen share these) ─────
  'follows.search.a11y': 'Search teams, athletes, competitions and sports',
  'follows.search.placeholder': 'Team, athlete, competition or sport',

  // ── Home ──────────────────────────────────────────────────────────
  'follows.home.emptyHeadline': 'Nothing scheduled yet',
  'follows.home.emptyBody':
    'Fixtures land here — and in your calendar — as soon as schedules are announced.',
  'follows.home.welcomeHeadline': 'Never miss a game',
  'follows.home.welcomeBody':
    'Follow teams, competitions and series. Their fixtures appear in your calendar and stay correct on their own.',
  'follows.home.nothingScheduled': 'Nothing scheduled',
  'follows.home.addSports': 'Add sports',
  'follows.home.chooseSport': 'Choose a sport',
  'follows.home.browse': 'Browse',
  // The word: Home's section header, Home's sport-card caption and the
  // sport picker's caption (one key — same string on every surface).
  'follows.following': 'Following',
  'follows.sports.a11yComingSoon': '{name}, coming soon',

  // ── Sport picker ──────────────────────────────────────────────────
  'follows.sportPicker.comingSoon': 'Coming soon',
  'follows.scope.tennisKeyNote':
    'Finals, semi-finals and quarter-finals, where the data names rounds. The WTA draw names them; most men\u2019s matches carry no round marker yet, so a men-only tournament may deliver just its start and end notes.',

  // ── Following (manage) ────────────────────────────────────────────
  'follows.following.captionNoUpcoming': '{sport} · no upcoming fixtures yet',
  'follows.following.captionUpcoming_one': '{sport} · {n} upcoming',
  'follows.following.captionUpcoming_other': '{sport} · {n} upcoming',
  'follows.following.a11yUndo': 'Undo unfollowing {name}',
  'follows.following.emptyHeadline': 'Not following anything yet',
  'follows.following.emptyBody': 'Pick a sport on Home, or browse everything here.',
  'follows.following.browseSports': 'Browse sports',
  'follows.following.a11yRow': '{name}, followed {type}. See their fixtures',
  'follows.following.a11yAddMore': 'Add more sports',
  'follows.following.addMore': '+ Add more',
  'follows.undo': 'Undo',

  // ── Cards (CompetitionCard + tile rows across browse/search) ──────
  'follows.card.a11ySummary': '{name}, {caption}',
  'follows.card.a11yViewFixtures': '{name}, view fixtures',
  'follows.card.a11yDestination': '{name} {label}',

  // ── Competition browse (LeagueList) ───────────────────────────────
  'follows.league.teamCount_one': '{country} · {n} team',
  'follows.league.teamCount_other': '{country} · {n} teams',
  'follows.league.tapTournaments': 'Tap to follow tournaments',
  'follows.league.tapTournamentsCount': 'Tap to follow tournaments ({count})',
  'follows.league.tapTeams': '{country} · Tap to follow teams · {fixtures}',
  'follows.league.tapTeamsCount':
    '{country} · Tap to follow teams ({count}) · {fixtures}',
  'follows.league.searchCompsTeams': 'Search competitions and teams',
  'follows.league.searchComps': 'Search competitions',
  'follows.league.noMatches': 'Nothing here matches “{query}”.',
  'follows.league.allEvents': 'All events',
  'follows.league.everyEventOnTour': 'Every event on the tour',
  'follows.tournaments.navTitle': '{tour} tournaments',

  // ── Athlete browse ────────────────────────────────────────────────
  'follows.athletes.fighters': 'Fighters',
  'follows.athletes.players': 'Players',
  'follows.athletes.drivers': 'Drivers',
  'follows.athletes.athletes': 'Athletes',
  'follows.athletes.caption': "Rankings, champions, who's competing",
  'follows.athletes.a11yBrowse': 'Browse {athletes}',
  'follows.athletes.a11yBrowseTourPlayers': 'Browse {tour} players',
  'follows.athletes.champion': 'Champion · {orgs}',
  'follows.athletes.rank': '#{rank}',
  'follows.athletes.competes': 'Competes {date}',
  'follows.athletes.competingSoon': 'Competing soon',
  'follows.athletes.mens': 'Men’s',
  'follows.athletes.womens': 'Women’s',
  'follows.boxing.sectionMens': 'Boxing — Men’s',
  'follows.boxing.sectionWomens': 'Boxing — Women’s',
  'follows.boxing.mensTitle': 'Men’s boxing',
  'follows.boxing.womensTitle': 'Women’s boxing',
  'follows.athletes.searchPlaceholder': 'Search {sport} athletes',
  'follows.athletes.noneMatch': 'No athletes match that name.',
  'follows.athletes.noneYet':
    'No athletes here yet — they arrive as rankings and entries are published.',
  'follows.athletes.a11yShowFewer': 'Show fewer in {section}',
  'follows.athletes.a11yShowAll': 'Show all {n} in {section}',
  'follows.athletes.showFewer': 'Show fewer',
  'follows.athletes.showAll': 'Show all {n}',
  'follows.athletes.a11yOpenPage': '{name}, open athlete page',

  // ── Tennis browse (domain/tennisBrowse.ts + LeagueList sections) ──
  'follows.tennis.atpTitle': 'ATP — Men’s',
  'follows.tennis.wtaTitle': 'WTA — Women’s',
  'follows.tennis.noteAtp':
    'Tournament dates from the tour calendar, and match times once a ' +
    'draw is published — assembled from a ranked feed and reviewed by ' +
    'hand, so an occasional match arrives late rather than wrong. The ' +
    'top 50 are listed by rank, the rest A-Z; 500 are searchable.',
  'follows.tennis.noteWta':
    'The fullest coverage we have: tournaments, draws and order of ' +
    'play from the WTA’s own feed, so a match appears with her ' +
    'opponent as soon as the draw is made and sharpens to an exact ' +
    'time when the schedule is published.',
  'follows.tennis.allFourMajors': 'All four majors',
  // Mid-sentence form (the Follow control's subject) — its own key, not
  // a code-side lowercase: case rules differ per language.
  'follows.tennis.allFourMajorsSubject': 'all four majors',
  'follows.tennis.otherTournaments': 'Other tournaments',
  'follows.tennis.tournamentCount_one': '{n} tournament',
  'follows.tennis.tournamentCount_other': '{n} tournaments',
  'follows.tennis.dateRange': '{start} – {end}',

  // ── Olympics browse ───────────────────────────────────────────────
  'follows.olympics.summer': 'Summer',
  'follows.olympics.winter': 'Winter',
  'follows.olympics.seasonOlympics': '{season} Olympics',
  'follows.olympics.tapForSports': '{edition} · Tap for sports · games',
  'follows.olympics.seasonSports': '{season} sports',
  'follows.olympics.seasonGames': '{season} Games',
  'follows.olympics.games': 'Games',
  // 'Sports' as a standalone label: the Olympics card's destination and
  // the Search screen's section header (one key — same string).
  'follows.browse.sports': 'Sports',

  // ── Search screen ─────────────────────────────────────────────────
  'follows.search.sport': 'Sport',
  'follows.search.athlete': 'Athlete',
  'follows.search.captionCompetition': '{country} · {sport}',
  'follows.search.captionTeam': '{league} · {sport}',
  'follows.search.captionTournament': 'Tournament · {sport}',
  'follows.search.noMatches':
    'Nothing followable matches “{query}” — search covers the sports and leagues KickOffCal serves today.',
  'follows.search.searching': 'Searching…',
  'follows.search.results': 'Results',
  'follows.search.competitions': 'Competitions',

  // ── Team browse (TeamList) ────────────────────────────────────────
  'follows.teams.a11ySearchIn': 'Search teams in {league}',
  'follows.teams.searchPlaceholder': 'Search teams',

  // ── Entity page (TeamScreen) ──────────────────────────────────────
  'follows.team.upcoming_one': '{n} upcoming',
  'follows.team.upcoming_other': '{n} upcoming',
  'follows.team.calendarEvents': 'CALENDAR EVENTS',
  'follows.team.a11ySelected': '{label}, selected',
  'follows.team.athleteEmpty':
    "No scheduled events. We'll add them when announced — follow now and they'll reach your calendar.",
  'follows.team.teamEmpty':
    'No upcoming fixtures yet — schedules land here as soon as they are announced.',
  'follows.team.removed': 'Removed from your calendar',
  'follows.team.added': 'Added {title} to your calendar',
  'follows.team.restored': 'Restored to your calendar',
  'follows.team.upcomingHeader': 'Upcoming',
  'follows.team.footer':
    'Tap Add for a single match, or Follow for all of them — you can remove individual matches afterwards.',
  'follows.team.whenCompetition': '{when} · {competition}',

  // ── Fixture hero (photo credit) ───────────────────────────────────
  'follows.hero.photoBy': 'Photo: {artist}',
  'follows.hero.photoCommons': 'Photo: Wikimedia Commons',

  // ── Follow feedback (toasts) ──────────────────────────────────────
  'follows.feedback.followingUpdating': 'Following {name} — updating…',
  'follows.feedback.unfollowedUpdating': 'Unfollowed {name} — updating…',
  'follows.feedback.unfollowed': 'Unfollowed {name}',
  'follows.feedback.calendarOff': 'Following {name} — calendar is off',
  'follows.feedback.enable': 'Enable',
  'follows.feedback.added_one': 'Added {n} fixture to your calendar',
  'follows.feedback.added_other': 'Added {n} fixtures to your calendar',
  'follows.feedback.noUpcoming': 'Following {name} — no upcoming fixtures yet',

  // ── Coverage notes (verbatim from sportsConfig; read via
  //    domain/coverageNotes.ts — the config field is no longer read by
  //    the follows screens) ───────────────────────────────────────────
  'follows.coverage.cricket':
    'White-ball internationals and leading leagues; Test series beyond the County Championship are not covered.',
  'follows.coverage.tennis':
    'Men’s rankings and players come from a live third-party feed, and men’s match times arrive tournament by tournament as each is played. Women’s rankings, draws and order of play come from the WTA’s own API. Coverage varies — where we do not have the matches yet, we hold the tournament’s dates.',
  'follows.coverage.athletics':
    'Meeting-level coverage. Individual athletes are not followable yet — World Athletics publishes rankings only as web pages, and start lists arrive when federations publish them.',
  'follows.coverage.golf': 'Round-level events; tee times are not tracked.',
  'follows.coverage.boxing':
    'Card times are the broadcast start, not ringwalks. The fighter directory covers world champions and IBF-rated contenders, plus fighters on announced cards.',
  'follows.coverage.ufc':
    'Card-level times. The fighter directory is the UFC roster by division, refreshed quarterly, plus fighters on announced cards across the other promotions.',
  'follows.coverage.olympics':
    'The next Games are Los Angeles 2028 (14–30 July) and the Milano-Cortina winter Games in 2030. Every discipline is listed and followable now, but no schedule has been published yet — the IOC releases session times closer to the Games, so a follow made today delivers its events the moment they exist. No Olympic emblems are shown: the marks are protected by dedicated legislation, so the app names the events and generates its own artwork.',

  // ── Round 6 item 2: people rows advertise the tap ──
  'follows.athletes.tapToFollow': 'Tap to follow {people} ({n})',
  'follows.athletes.tapToFollowNoCount': 'Tap to follow {people}',

  // ── Round 6 item 6: Olympic group nodes in the Following strip ──
  'follows.rail.summerOlympics': 'Summer Olympics',
  'follows.rail.winterOlympics': 'Winter Olympics',
  // The Motorsport tile's Formula run header (Round 7 item 3); the other
  // run reads core.sport.motorsport.
  'follows.motorsport.formula': 'Formula',
} as const;
