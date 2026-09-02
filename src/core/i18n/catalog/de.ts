// The German catalog. Key set compile-enforced against the English
// catalog (Catalog = Record<CatalogKey, string>); placeholder parity is
// pinned by the i18n test. Register: modern consumer-app German, "du".
// Key order and section comments mirror the English modules.

import type { Catalog } from '../index';

export const de: Catalog = {
  // ══ core ═══════════════════════════════════════════════════════════

  // ── Sport schedule vocabulary (sportTerms.fixturesWordFor +
  // CompetitionCard's expansion pair) ────────────────────────────────
  'core.fixtures': 'Spiele',
  'core.teams': 'Teams',
  'core.fights': 'Kämpfe',
  'core.matches': 'Spiele',
  'core.tournaments': 'Turniere',
  'core.events': 'Events',

  // ── Sport NAMES ────────────────────────────────────────────────────
  'core.sport.soccer': 'Fußball',
  'core.sport.cricket': 'Cricket',
  'core.sport.ice-hockey': 'Eishockey',
  'core.sport.tennis': 'Tennis',
  'core.sport.athletics': 'Leichtathletik',
  'core.sport.basketball': 'Basketball',
  'core.sport.baseball': 'Baseball',
  'core.sport.nfl': 'American Football',
  'core.sport.rugby': 'Rugby',
  'core.sport.golf': 'Golf',
  'core.sport.f1': 'Formel 1',
  'core.sport.boxing': 'Boxen',
  'core.sport.ufc': 'MMA',
  'core.sport.motorsport': 'Motorsport',
  'core.sport.olympics': 'Olympische Spiele',

  // ── Screen titles (App.tsx headers — the BrandTitle voice) ─────────
  'core.followType.team': 'Team',
  'core.followType.competition': 'Wettbewerb',
  'core.followType.athlete': 'Athlet',
  'core.followType.series': 'Serie',
  'core.title.home': 'Home',
  'core.title.following': 'Du folgst',
  'core.title.schedule': 'Spielplan',
  'core.title.yourCalendar': 'Dein Kalender',
  'core.title.search': 'Suche',
  'core.title.sports': 'Sportarten',
  'core.title.competitions': 'Wettbewerbe',
  'core.title.athletes': 'Athleten',
  'core.title.preferences': 'Einstellungen',
  'core.title.region': 'Region',
  'core.title.calendar': 'Kalender',
  'core.title.photoCredits': 'Bildnachweise',

  // ── when.ts ────────────────────────────────────────────────────────
  'core.when.today': 'Heute',
  'core.when.tomorrow': 'Morgen',
  'core.when.todayHeading': 'Heute · {date}',
  'core.when.tomorrowHeading': 'Morgen · {date}',
  'core.when.postponed': 'Verschoben',
  'core.when.timeTbc': 'Uhrzeit offen',
  'core.when.countdownToday': 'HEUTE',
  'core.when.countdownTomorrow': 'MORGEN',
  'core.when.countdownInDays': 'IN {n} TAGEN',

  // ── Shared components (components.tsx / cardExpansion.tsx) ────────
  'core.rail.openA11y': '{label}, {caption}. Spiele ansehen',
  'core.a11y.openEvent': '{label}. Event öffnen',
  'core.hero.nextUpA11y': 'Als Nächstes: {title}, {when}',
  'core.row.removedFromCalendar': 'aus dem Kalender entfernt',
  'core.row.removedCaption': 'Entfernt — nicht in deinem Kalender',
  'core.row.addToCalendarA11y': '{title} zu deinem Kalender hinzufügen',
  'core.row.removeFromCalendarA11y': '{title} aus deinem Kalender entfernen',
  'core.row.restoreToCalendarA11y':
    '{title} in deinem Kalender wiederherstellen',
  'core.actions.add': 'Hinzufügen',
  'core.actions.added': 'Hinzugefügt',
  'core.actions.remove': 'Entfernen',
  'core.actions.removed': 'Entfernt',
  'core.actions.cancel': 'Abbrechen',
  'core.follow.follow': 'Folgen',
  'core.follow.following': 'Folge ich',
  'core.follow.followA11y': '{subject} folgen',
  'core.follow.unfollowA11y': '{subject} entfolgen',
  'core.expansion.closeA11y': 'Schließen',

  // ── Sync status chip + its relative times ──────────────────────────
  'core.status.justNow': 'gerade eben',
  'core.status.minsAgo': 'vor {n} Min.',
  'core.status.hoursAgo_one': 'vor 1 Stunde',
  'core.status.hoursAgo_other': 'vor {n} Stunden',
  'core.status.daysAgo_one': 'gestern',
  'core.status.daysAgo_other': 'vor {n} Tagen',
  'core.status.checking': 'Suche nach Spielen…',
  'core.status.updating': 'Dein Kalender wird aktualisiert…',
  'core.status.sourcesQuiet':
    'Spielplan-Quellen seit {n} Tagen still — Daten evtl. nicht aktuell',
  'core.status.calendarOff': 'Kalender-Sync ist aus',
  'core.status.upToDateCalendarOff': 'Spiele aktuell · Kalender aus',
  'core.status.notSynced': 'Noch nicht synchronisiert',
  'core.status.updated': 'Kalender aktualisiert · {changes} · {when}',
  'core.status.changes_one': '{n} Änderung',
  'core.status.changes_other': '{n} Änderungen',
  'core.status.upToDate': 'Kalender aktuell · geprüft {when}',

  // ── Calendar-off banner ────────────────────────────────────────────
  'core.banner.fixturesReady_one': '{n} Spiel bereit zum Hinzufügen',
  'core.banner.fixturesReady_other': '{n} Spiele bereit zum Hinzufügen',
  'core.banner.fixturesWhenConnected':
    'Spiele werden hinzugefügt, sobald du deinen Kalender verbindest',
  'core.banner.addA11y': 'Spiele zu meinem Kalender hinzufügen',

  // ── Coverage note disclosure ───────────────────────────────────────
  'core.coverage.showA11y': 'Was abgedeckt ist',
  'core.coverage.hideA11y': 'Abdeckung ausblenden',
  'core.coverage.closedLabel': 'ⓘ  Was abgedeckt ist',
  'core.coverage.openLabel': 'ⓘ  Was abgedeckt ist ▲',

  // ══ follows ════════════════════════════════════════════════════════

  // ── Search entry (Home's bar + the Search screen share these) ─────
  'follows.search.a11y': 'Teams, Athleten, Wettbewerbe und Sportarten suchen',
  'follows.search.placeholder': 'Team, Athlet, Wettbewerb oder Sportart',

  // ── Home ──────────────────────────────────────────────────────────
  'follows.home.emptyHeadline': 'Noch nichts angesetzt',
  'follows.home.emptyBody':
    'Sobald Spielpläne feststehen, landen die Spiele hier — und in deinem Kalender.',
  'follows.home.welcomeHeadline': 'Verpasse kein Spiel mehr',
  'follows.home.welcomeBody':
    'Folge Teams, Wettbewerben und Serien. Ihre Spiele erscheinen in deinem Kalender und bleiben von selbst aktuell.',
  'follows.home.nothingScheduled': 'Nichts angesetzt',
  'follows.home.addSports': 'Sportarten hinzufügen',
  'follows.home.chooseSport': 'Wähle eine Sportart',
  'follows.home.browse': 'Entdecken',
  'follows.following': 'Du folgst',
  'follows.sports.a11yComingSoon': '{name}, bald verfügbar',

  // ── Sport picker ──────────────────────────────────────────────────
  'follows.sportPicker.comingSoon': 'Bald verfügbar',
  'follows.scope.tennisKeyNote':
    'Finale, Halbfinale und Viertelfinale, sofern die Daten Runden benennen. Die WTA-Auslosung tut das; die meisten Herren-Matches tragen noch keine Rundenangabe, sodass ein reines Herrenturnier ggf. nur Start- und Endnotiz liefert.',

  // ── Following (manage) ────────────────────────────────────────────
  'follows.following.captionNoUpcoming':
    '{sport} · noch keine anstehenden Spiele',
  'follows.following.captionUpcoming_one': '{sport} · {n} anstehend',
  'follows.following.captionUpcoming_other': '{sport} · {n} anstehend',
  'follows.following.a11yUndo': 'Entfolgen von {name} rückgängig machen',
  'follows.following.emptyHeadline': 'Du folgst noch niemandem',
  'follows.following.emptyBody':
    'Wähle auf Home eine Sportart oder stöbere hier durch alles.',
  'follows.following.browseSports': 'Sportarten entdecken',
  'follows.following.a11yRow': '{name}, {type}, gefolgt. Spiele ansehen',
  'follows.following.a11yAddMore': 'Weitere Sportarten hinzufügen',
  'follows.following.addMore': '+ Mehr hinzufügen',
  'follows.undo': 'Rückgängig',

  // ── Cards (CompetitionCard + tile rows across browse/search) ──────
  'follows.card.a11ySummary': '{name}, {caption}',
  'follows.card.a11yViewFixtures': '{name}, Spiele ansehen',
  'follows.card.a11yDestination': '{name} {label}',

  // ── Competition browse (LeagueList) ───────────────────────────────
  'follows.league.teamCount_one': '{country} · {n} Team',
  'follows.league.teamCount_other': '{country} · {n} Teams',
  'follows.league.tapTournaments': 'Tippen, um Turnieren zu folgen',
  'follows.league.tapTournamentsCount':
    'Tippen, um Turnieren zu folgen ({count})',
  'follows.league.tapTeams':
    '{country} · Tippen, um Teams zu folgen · {fixtures}',
  'follows.league.tapTeamsCount':
    '{country} · Tippen, um Teams zu folgen ({count}) · {fixtures}',
  'follows.league.searchCompsTeams': 'Wettbewerbe und Teams suchen',
  'follows.league.searchComps': 'Wettbewerbe suchen',
  'follows.league.noMatches': 'Hier passt nichts zu “{query}”.',
  'follows.league.allEvents': 'Alle Events',
  'follows.league.everyEventOnTour': 'Jedes Event der Tour',
  'follows.tournaments.navTitle': '{tour}-Turniere',

  // ── Athlete browse ────────────────────────────────────────────────
  'follows.athletes.fighters': 'Kämpfer',
  'follows.athletes.players': 'Spieler',
  'follows.athletes.drivers': 'Fahrer',
  'follows.athletes.athletes': 'Athleten',
  'follows.athletes.caption': 'Rankings, Champions, wer antritt',
  'follows.athletes.a11yBrowse': '{athletes} entdecken',
  'follows.athletes.a11yBrowseTourPlayers': '{tour}-Spieler entdecken',
  'follows.athletes.champion': 'Champion · {orgs}',
  'follows.athletes.rank': '#{rank}',
  'follows.athletes.competes': 'Tritt am {date} an',
  'follows.athletes.competingSoon': 'Bald im Einsatz',
  'follows.athletes.mens': 'Herren',
  'follows.athletes.womens': 'Damen',
  'follows.boxing.sectionMens': 'Boxen — Männer',
  'follows.boxing.sectionWomens': 'Boxen — Frauen',
  'follows.boxing.mensTitle': 'Boxen — Männer',
  'follows.boxing.womensTitle': 'Boxen — Frauen',
  'follows.athletes.searchPlaceholder': '{sport}-Athleten suchen',
  'follows.athletes.noneMatch': 'Keine Athleten mit diesem Namen.',
  'follows.athletes.noneYet':
    'Hier sind noch keine Athleten — sie kommen, sobald Rankings und Meldelisten veröffentlicht werden.',
  'follows.athletes.a11yShowFewer': 'Weniger in {section} anzeigen',
  'follows.athletes.a11yShowAll': 'Alle {n} in {section} anzeigen',
  'follows.athletes.showFewer': 'Weniger anzeigen',
  'follows.athletes.showAll': 'Alle {n} anzeigen',
  'follows.athletes.a11yOpenPage': '{name}, Athletenseite öffnen',

  // ── Tennis browse (domain/tennisBrowse.ts + LeagueList sections) ──
  'follows.tennis.atpTitle': 'ATP — Herren',
  'follows.tennis.wtaTitle': 'WTA — Damen',
  'follows.tennis.noteAtp':
    'Turniertermine aus dem Tour-Kalender, Matchzeiten, sobald eine ' +
    'Auslosung veröffentlicht ist — aus einem Ranking-Feed ' +
    'zusammengestellt und von Hand geprüft, sodass ein Match ' +
    'gelegentlich eher spät kommt als falsch. Die Top 50 stehen nach ' +
    'Ranking, der Rest A-Z; 500 sind per Suche zu finden.',
  'follows.tennis.noteWta':
    'Unsere vollständigste Abdeckung: Turniere, Auslosungen und Order ' +
    'of Play direkt aus dem Feed der WTA — ein Match erscheint samt ' +
    'Gegnerin, sobald ausgelost ist, und bekommt eine exakte Uhrzeit, ' +
    'sobald der Zeitplan veröffentlicht wird.',
  'follows.tennis.allFourMajors': 'Alle vier Grand Slams',
  // Mid-sentence form (the Follow control's subject) — dative, because
  // it interpolates into "{subject} folgen" / "{subject} entfolgen".
  'follows.tennis.allFourMajorsSubject': 'allen vier Grand Slams',
  'follows.tennis.otherTournaments': 'Weitere Turniere',
  'follows.tennis.tournamentCount_one': '{n} Turnier',
  'follows.tennis.tournamentCount_other': '{n} Turniere',
  'follows.tennis.dateRange': '{start} – {end}',

  // ── Olympics browse ───────────────────────────────────────────────
  'follows.olympics.summer': 'Sommer',
  'follows.olympics.winter': 'Winter',
  'follows.olympics.seasonOlympics': 'Olympische {season}spiele',
  'follows.olympics.tapForSports': '{edition} · Tippen für Sportarten · Spiele',
  'follows.olympics.seasonSports': '{season}sportarten',
  'follows.olympics.seasonGames': '{season}spiele',
  'follows.olympics.games': 'Spiele',
  'follows.browse.sports': 'Sportarten',

  // ── Search screen ─────────────────────────────────────────────────
  'follows.search.sport': 'Sportart',
  'follows.search.athlete': 'Athlet',
  'follows.search.captionCompetition': '{country} · {sport}',
  'follows.search.captionTeam': '{league} · {sport}',
  'follows.search.captionTournament': 'Turnier · {sport}',
  'follows.search.noMatches':
    'Nichts zum Folgen passt zu “{query}” — die Suche umfasst die Sportarten und Ligen, die KickOffCal heute abdeckt.',
  'follows.search.searching': 'Suche…',
  'follows.search.results': 'Ergebnisse',
  'follows.search.competitions': 'Wettbewerbe',

  // ── Team browse (TeamList) ────────────────────────────────────────
  'follows.teams.a11ySearchIn': 'Teams der {league} suchen',
  'follows.teams.searchPlaceholder': 'Teams suchen',

  // ── Entity page (TeamScreen) ──────────────────────────────────────
  'follows.team.upcoming_one': '{n} anstehend',
  'follows.team.upcoming_other': '{n} anstehend',
  'follows.team.calendarEvents': 'KALENDEREINTRÄGE',
  'follows.team.a11ySelected': '{label}, ausgewählt',
  'follows.team.athleteEmpty':
    'Keine angesetzten Events. Wir ergänzen sie, sobald sie feststehen — folge jetzt, und sie landen in deinem Kalender.',
  'follows.team.teamEmpty':
    'Noch keine anstehenden Spiele — Spielpläne landen hier, sobald sie veröffentlicht sind.',
  'follows.team.removed': 'Aus deinem Kalender entfernt',
  'follows.team.added': '{title} zu deinem Kalender hinzugefügt',
  'follows.team.restored': 'Wieder in deinem Kalender',
  'follows.team.upcomingHeader': 'Anstehend',
  'follows.team.footer':
    'Tippe auf Hinzufügen für ein einzelnes Spiel oder auf Folgen für alle — einzelne Spiele kannst du hinterher wieder entfernen.',
  'follows.team.whenCompetition': '{when} · {competition}',

  // ── Fixture hero (photo credit) ───────────────────────────────────
  'follows.hero.photoBy': 'Foto: {artist}',
  'follows.hero.photoCommons': 'Foto: Wikimedia Commons',

  // ── Follow feedback (toasts) ──────────────────────────────────────
  'follows.feedback.followingUpdating':
    'Du folgst jetzt {name} — wird aktualisiert…',
  'follows.feedback.unfollowedUpdating':
    '{name} entfolgt — wird aktualisiert…',
  'follows.feedback.unfollowed': '{name} entfolgt',
  'follows.feedback.calendarOff': 'Du folgst jetzt {name} — Kalender ist aus',
  'follows.feedback.enable': 'Aktivieren',
  'follows.feedback.added_one': '{n} Spiel zu deinem Kalender hinzugefügt',
  'follows.feedback.added_other': '{n} Spiele zu deinem Kalender hinzugefügt',
  'follows.feedback.noUpcoming':
    'Du folgst jetzt {name} — noch keine anstehenden Spiele',

  // ── Coverage notes ────────────────────────────────────────────────
  'follows.coverage.cricket':
    'White-Ball-Länderspiele und führende Ligen; Test-Serien jenseits der County Championship sind nicht abgedeckt.',
  'follows.coverage.tennis':
    'Herren-Rankings und -Spieler kommen aus einem Live-Feed eines Drittanbieters, Matchzeiten der Herren Turnier für Turnier, während gespielt wird. Damen-Rankings, Auslosungen und Order of Play kommen aus der API der WTA selbst. Die Abdeckung variiert — wo wir die Matches noch nicht haben, halten wir die Turniertermine.',
  'follows.coverage.athletics':
    'Abdeckung auf Meeting-Ebene. Einzelnen Athleten kann man noch nicht folgen — World Athletics veröffentlicht Rankings nur als Webseiten, und Startlisten kommen erst, wenn die Verbände sie veröffentlichen.',
  'follows.coverage.golf':
    'Events auf Runden-Ebene; Tee-Times werden nicht erfasst.',
  'follows.coverage.boxing':
    'Die Zeiten der Fight Cards sind der Übertragungsstart, nicht die Ringwalks. Das Kämpfer-Verzeichnis umfasst Weltmeister und IBF-gerankte Herausforderer sowie Kämpfer auf angekündigten Cards.',
  'follows.coverage.ufc':
    'Abdeckung nur auf Card-Ebene. Einzelnen Kämpfern kann man nicht folgen: Kein MMA-Verband veröffentlicht ein brauchbares Roster — ein Kämpfer-Verzeichnis wäre Raterei, und wir sind lieber ehrlich als falsch.',
  'follows.coverage.olympics':
    'Die nächsten Spiele sind Los Angeles 2028 (14.–30. Juli) und die Milano-Cortina-Winterspiele 2030. Jede Disziplin ist schon jetzt gelistet und du kannst ihr folgen, aber ein Zeitplan ist noch nicht veröffentlicht — das IOC gibt Session-Zeiten erst näher an den Spielen frei, ein Follow von heute liefert seine Events also in dem Moment, in dem es sie gibt. Olympische Embleme werden nicht gezeigt: Die Marken sind durch eigene Gesetze geschützt, deshalb benennt die App die Events und erzeugt eigene Grafiken.',

  // ══ calendar ═══════════════════════════════════════════════════════

  'calendar.language.rewrite':
    'Deine Kalendereinträge werden auf {language} umgestellt',
  // ── Offset vocabulary (prefs.ts — offsetLabel / short / picker) ────
  'calendar.offset.off': 'Aus',
  'calendar.offset.minBefore': '{n} Min. vorher',
  'calendar.offset.daysBefore_one': '{n} Tag vorher',
  'calendar.offset.daysBefore_other': '{n} Tage vorher',
  'calendar.offset.hoursBefore_one': '{n} Stunde vorher',
  'calendar.offset.hoursBefore_other': '{n} Stunden vorher',
  'calendar.offset.shortMinutes': '{n}m',
  'calendar.offset.shortDays': '{n}d',
  'calendar.offset.shortHours': '{n}h',
  'calendar.offset.pickerMinutes': '{n} Min.',
  'calendar.offset.pickerDays_one': '{n} Tag',
  'calendar.offset.pickerDays_other': '{n} Tage',
  'calendar.offset.pickerHours_one': '{n} Std.',
  'calendar.offset.pickerHours_other': '{n} Std.',

  // ── Reminder options (prefs.ts) ────────────────────────────────────
  'calendar.reminder.none': 'Keine',
  'calendar.allDayReminder.eveningBefore': 'Abend davor, 18 Uhr',
  'calendar.allDayReminder.eveningBeforeShort': 'Abend davor',
  'calendar.allDayReminder.morningOf': 'Am Morgen, 9 Uhr',
  'calendar.allDayReminder.morningOfShort': 'Morgens',

  // ── Written INTO calendar events (tournamentTiers.ts / syncPlan.ts) ─
  'calendar.tournament.begins': '{title} beginnt',
  'calendar.tournament.finalDay': '{title} — letzter Tag',
  'calendar.tournament.pointer':
    'Einzelne Spiele lassen sich in der App über die Turnierkarte hinzufügen.',
  'calendar.event.timeTbc': 'Uhrzeit offen',
  'calendar.event.postponed': 'verschoben',
  'calendar.event.nominalTimeNote':
    'Die Startzeit ist noch nicht bestätigt — dieser Eintrag aktualisiert sich automatisch.',

  // ── Timing explanations (fixtures/domain/timingExplanation.ts) ─────
  'calendar.timing.momentsAgo': 'gerade eben',
  'calendar.timing.minutesAgo': 'vor {n} Minuten',
  'calendar.timing.hoursAgo_one': 'vor {n} Stunde',
  'calendar.timing.hoursAgo_other': 'vor {n} Stunden',
  'calendar.timing.daysAgo_one': 'gestern',
  'calendar.timing.daysAgo_other': 'vor {n} Tagen',
  'calendar.timing.confirmOrganiser':
    '{source} hat die endgültige Uhrzeit noch nicht bestätigt.',
  'calendar.timing.confirmGeneric':
    'Die endgültige Uhrzeit ist noch nicht bestätigt.',
  'calendar.timing.slotNotAnnounced':
    'Die Order of Play wurde von {source} noch nicht bekannt gegeben.',
  'calendar.timing.timeNotAnnounced':
    'Eine Startzeit wurde von {source} noch nicht bekannt gegeben.',
  'calendar.timing.slotNotPublished':
    'Die Order of Play ist noch nicht veröffentlicht.',
  'calendar.timing.timeNotPublished':
    'Eine Startzeit ist noch nicht veröffentlicht.',
  'calendar.timing.checked': 'Geprüft {ago}',
  'calendar.timing.cancelled': 'Abgesagt — findet nicht mehr statt.',
  'calendar.timing.postponed':
    'Verschoben — ein neuer Termin steht noch nicht fest.',
  'calendar.timing.runsOverDays':
    'Läuft über {n} Tage und steht deshalb als {n}-Tage-Event in deinem Kalender.',
  'calendar.timing.exactTimeNotSet':
    'Die genaue Uhrzeit steht noch nicht fest, deshalb deckt dieser Eintrag das ganze Event ab — {n} Tage.',
  'calendar.timing.dayOnlyAppearance':
    'Nur der Tag ist bekannt — der Eintrag bleibt auf dem Tag, bis die Order of Play veröffentlicht ist.',
  'calendar.timing.dayOnly':
    'Nur der Tag ist bekannt — deshalb ein ganztägiger Eintrag statt einer erfundenen Uhrzeit.',
  'calendar.timing.nominal':
    'Die angezeigte Zeit ist der veröffentlichte Start, aber noch nicht die endgültige.',
  'calendar.timing.provisional':
    'Diese Zeit ist vorerst bestätigt, kann sich aber noch ändern.',
  'calendar.timing.willUpdate':
    'Dein Kalender aktualisiert sich von selbst, wenn sich etwas ändert.',
  'calendar.timing.shortCancelled': 'Abgesagt',
  'calendar.timing.shortPostponed': 'Verschoben — noch kein neuer Termin',
  'calendar.timing.runsDays': 'Läuft {n} Tage',
  // The subjects fold "yet" into their own "Noch keine …", so the
  // composed forms below read as one sentence.
  'calendar.timing.noOrderOfPlay': 'Noch keine Order of Play',
  'calendar.timing.noConfirmedTime': 'Noch keine bestätigte Zeit',
  'calendar.timing.noStartTime': 'Noch keine Startzeit',
  'calendar.timing.subjectFromYet': '{subject} von {source}',
  'calendar.timing.subjectChecked': '{subject} veröffentlicht · geprüft {ago}',
  'calendar.timing.subjectPublishedYet': '{subject} veröffentlicht',
  'calendar.timing.shortProvisional': 'Vorerst bestätigt, kann sich noch ändern',

  // ── The full card's vocabulary (fixtures/domain/card.ts) ───────────
  'calendar.cardList.fullCard': 'Komplette Card',
  'calendar.cardList.matches': 'Spiele',
  'calendar.cardList.events': 'Events',
  'calendar.cardList.alsoOn': 'Außerdem',
  'calendar.cardList.timeWithinEvent':
    'Uhrzeit innerhalb des Events nicht veröffentlicht',

  // ── The expanded fixture card (FixtureCard.tsx) ────────────────────
  'calendar.card.loadFailed': 'Dieses Event konnte nicht geladen werden',
  'calendar.card.titleClose': '{title}. Schließen',
  'calendar.card.removeFromCalendar': 'Aus dem Kalender entfernen',
  'calendar.card.addToCalendar': 'Zum Kalender hinzufügen',
  'calendar.card.removeTitleA11y': '{title} aus deinem Kalender entfernen',
  'calendar.card.addTitleA11y': '{title} zu deinem Kalender hinzufügen',
  'calendar.card.alreadyInCalendar': '{title} ist schon in deinem Kalender',
  'calendar.card.mens': 'Herren',
  'calendar.card.womens': 'Damen',
  'calendar.card.sexChipShown': '{label}-Spiele, eingeblendet',
  'calendar.card.sexChipHidden': '{label}-Spiele, ausgeblendet',
  'calendar.card.removeAllA11y':
    'Alle aufgeführten Spiele aus deinem Kalender entfernen',
  'calendar.card.addAllA11y':
    'Alle aufgeführten Spiele zu deinem Kalender hinzufügen',
  'calendar.card.removeAll': 'Alle entfernen',
  'calendar.card.addAll': 'Alle hinzufügen',
  'calendar.card.reminder': 'Erinnerung',
  'calendar.card.optionSelected': '{label}, ausgewählt',
  'calendar.card.useDefaultReminder': 'Meine Standard-Erinnerung verwenden',
  'calendar.card.colour': 'Farbe',
  'calendar.card.colourValue': 'Farbe {value}',
  'calendar.card.mainEvent': 'Main Event',
  'calendar.card.added': 'Hinzugefügt',
  'calendar.card.add': 'Hinzufügen',
  'calendar.card.close': 'Schließen',

  // ── Toasts (FixtureCard / ScheduleScreen) ──────────────────────────
  'calendar.toast.removed': 'Aus deinem Kalender entfernt',
  'calendar.toast.added': 'Zu deinem Kalender hinzugefügt',
  'calendar.toast.restored': 'Wieder in deinem Kalender',
  'calendar.toast.undo': 'Rückgängig',

  // ── Schedule (ScheduleScreen.tsx) ──────────────────────────────────
  'calendar.schedule.emptyHeadline': 'Nichts im Spielplan',
  'calendar.schedule.emptyNoFollows':
    'Folge einem Team oder Wettbewerb und die Spiele erscheinen hier — und in deinem Kalender.',
  'calendar.schedule.emptyWaiting':
    'Spiele erscheinen hier, sobald die Spielpläne feststehen.',
  'calendar.schedule.hideCalendar': 'Kalender ausblenden',
  'calendar.schedule.showCalendar': 'Kalender einblenden',
  'calendar.schedule.footerOff':
    'Diese Spiele werden deinem Handy-Kalender hinzugefügt, sobald du ihn verbindest.',
  'calendar.schedule.footerOn':
    'Alles hier steht in deinem Handy-Kalender und aktualisiert sich von selbst — Zeiten werden fix, Verschiebungen wandern mit, Absagen verschwinden.',
  'calendar.schedule.showMore': 'Mehr anzeigen',

  // ── Month grid (MonthGrid.tsx) ─────────────────────────────────────
  'calendar.month.previous': 'Vorheriger Monat',
  'calendar.month.next': 'Nächster Monat',
  'calendar.month.day': '{day}. {month}',
  'calendar.month.dayFixtures_one': '{day}. {month}, {n} Spiel',
  'calendar.month.dayFixtures_other': '{day}. {month}, {n} Spiele',
  'calendar.month.dayRemovedOnly': '{day}. {month}, nur entfernte Spiele',
  // Monday-start weekday initials (Mo Di Mi Do Fr Sa So).
  'calendar.month.mon': 'M',
  'calendar.month.tue': 'D',
  'calendar.month.wed': 'M',
  'calendar.month.thu': 'D',
  'calendar.month.fri': 'F',
  'calendar.month.sat': 'S',
  'calendar.month.sun': 'S',

  // ── Calendar priming (CalendarPrimingScreen.tsx) ───────────────────
  'calendar.priming.title': 'Hol dir deine Spiele in den Kalender',
  'calendar.priming.ready_one': '{count} Spiel bereit zum Hinzufügen.',
  'calendar.priming.ready_other': '{count} Spiele bereit zum Hinzufügen.',
  'calendar.priming.readyMonth_one':
    '{count} Spiel bereit zum Hinzufügen — davon etwa {month} im nächsten Monat.',
  'calendar.priming.readyMonth_other':
    '{count} Spiele bereit zum Hinzufügen — davon etwa {month} im nächsten Monat.',
  'calendar.priming.explainTarget':
    'Spiele landen in einem Kalender deiner Wahl — wir fassen nur Einträge an, die wir selbst hinzugefügt haben',
  'calendar.priming.explainUpdates':
    'Einträge aktualisieren sich selbst, wenn Zeiten sich ändern oder Spiele verlegt werden',
  'calendar.priming.explainUnfollow':
    'Entfolge und die Spiele verschwinden wieder',
  'calendar.priming.denied':
    'Der Kalenderzugriff ist für KickOffCal deaktiviert. Erlaube ihn in den Einstellungen und komm dann zurück — deine Spiele warten.',
  'calendar.priming.tryAgain': '{message} Versuch es gleich noch einmal.',
  'calendar.priming.googleNote':
    'Kalender-Sync braucht auf Android eine Google-Anmeldung. Ohne sie bleiben deine Spiele in der App.',
  'calendar.priming.openSettings': 'Einstellungen öffnen',
  'calendar.priming.connecting': 'Verbinden…',
  'calendar.priming.connectGoogle': 'Google Kalender verbinden',
  'calendar.priming.addToMyCalendar': 'Zu meinem Kalender hinzufügen',
  'calendar.priming.connectMyCalendar': 'Meinen Kalender verbinden',
  'calendar.priming.notNow': 'Jetzt nicht',
  'calendar.priming.addedFixtures_one':
    '{n} Spiel zu deinem Kalender hinzugefügt',
  'calendar.priming.addedFixtures_other':
    '{n} Spiele zu deinem Kalender hinzugefügt',
  'calendar.priming.connected': 'Kalender verbunden',
  'calendar.priming.connectedTitle': 'Dein Kalender ist verbunden',
  'calendar.priming.connectedBody':
    'Folge einem Team und die Spiele erscheinen dort von selbst — Zeiten werden fix, Verschiebungen wandern mit, Absagen verschwinden. Mehr musst du nicht einrichten.',
  'calendar.priming.chooseSports': 'Wähle deine Sportarten',
  'calendar.priming.differentCalendar': 'Anderen Kalender verwenden',

  // ── First-run welcome (onboarding/WelcomeScreen.tsx) ───────────────
  'calendar.welcome.tagline': 'Verpasse kein Spiel mehr.',
  'calendar.welcome.promiseCalendar':
    'Spiele landen automatisch in deinem Handy-Kalender',
  'calendar.welcome.promiseCorrect':
    'Zeiten ändern sich, Spiele werden verlegt — dein Kalender bleibt korrekt',
  'calendar.welcome.promiseNoAccount':
    'Kein Konto nötig — einfach folgen, fertig.',
  'calendar.welcome.getStarted': 'Los geht’s',

  // ══ settings ═══════════════════════════════════════════════════════

  // ── PreferencesScreen: the accordion's section titles ──────────────
  'settings.sections.calendar': 'Kalender',
  'settings.sections.events': 'Einträge',
  'settings.sections.app': 'App',
  'settings.sections.pastGames': 'Vergangene Spiele',
  'settings.sections.dataPrivacy': 'Daten & Privatsphäre',
  'settings.sections.a11y': 'Einstellungen für {title}',

  // ── Calendar section ───────────────────────────────────────────────
  'settings.calendar.googleReconnectCaption':
    'In deinem Google Kalender — tippen, um die Anmeldung neu zu verbinden',
  'settings.calendar.googleReconnectA11y':
    'KickOffCal im Google Kalender. Google-Anmeldung neu verbinden',
  'settings.calendar.googleReconnected': 'Google Kalender neu verbunden',
  'settings.calendar.googleConnectedCaption': 'In deinem Google Kalender',
  'settings.calendar.googleConnectedA11y': 'KickOffCal im Google Kalender',
  'settings.calendar.disconnectGoogle': 'Google Kalender trennen',
  'settings.calendar.disconnectCaption':
    'Dein Kalender und seine Einträge bleiben unberührt',
  'settings.calendar.googleDisconnected': 'Google Kalender getrennt',
  'settings.calendar.connectGoogle': 'Google Kalender verbinden',
  'settings.calendar.connectCaption':
    'Bis dahin bleiben deine Spiele in der App',
  'settings.calendar.connectLegacyCaption':
    'Spiele, die schon in deinem Kalender stehen, bleiben, wo sie sind',
  'settings.calendar.choose': 'Kalender auswählen',
  'settings.calendar.autoPickedCaption':
    'Wird automatisch gewählt, sobald dein Kalender verbunden ist',
  'settings.calendar.targetA11y':
    'Kalender: {label}. {account}. Ändern, wohin Spiele geschrieben werden',
  'settings.calendar.chooseA11y': 'Wählen, wohin Spiele geschrieben werden',
  'settings.calendar.colour': 'Farbe',
  'settings.calendar.colourA11y': 'Kalenderfarbe {name}',
  'settings.calendar.colourCaption':
    'So sehen KickOffCal-Einträge in der Kalender-App deines Handys aus.',
  'settings.calendar.inheritedColour':
    'Deine Spiele übernehmen die Farbe von {calendar} — die stellst du in deiner Kalender-App ein.',
  'settings.calendar.colourApplied': 'Kalenderfarbe ist jetzt {colour}',
  'settings.calendar.colourSaved':
    'Farbe gespeichert — gilt, sobald dein Kalender verbunden ist',
  'settings.calendar.colourRefused':
    'Google Kalender hat die Farbe nicht übernommen — du kannst sie in der Google Kalender-App einstellen',
  // The calendar-name fallback when no target is stored yet — dative,
  // because every {calendar} slot reads "von/zu/in {calendar}".
  'settings.words.yourCalendar': 'deinem Kalender',

  // Colour names — read out and toasted, so they are copy, not config.
  'settings.colours.kickoffcalBlue': 'KickOffCal-Blau',
  'settings.colours.red': 'Rot',
  'settings.colours.orange': 'Orange',
  'settings.colours.green': 'Grün',
  'settings.colours.teal': 'Petrol',
  'settings.colours.purple': 'Lila',
  'settings.colours.pink': 'Pink',
  'settings.colours.graphite': 'Graphit',

  // ── Events section ─────────────────────────────────────────────────
  'settings.events.footnote':
    'Terminierte Einträge laufen von Anpfiff bis Abpfiff. Änderungen gelten bei der nächsten Synchronisierung für jedes synchronisierte Spiel.',
  'settings.events.style': 'Eintragsart',
  'settings.events.timed': 'Mit Uhrzeit',
  'settings.events.allDay': 'Ganztägig',
  'settings.events.raceWeekends': 'Rennwochenenden',
  'settings.events.allSessions': 'Alle Sessions',
  'settings.events.raceOnly': 'Nur Rennen',
  'settings.events.block': 'Nur Zeitraum',
  'settings.events.keyRounds': 'Wichtige Runden',
  'settings.events.allMatches': 'Alle Spiele',

  // ── Reminders section ──────────────────────────────────────────────
  'settings.reminders.title': 'Erinnerungen',
  'settings.reminders.footnote': 'Änderungen gelten ab der nächsten Synchronisierung.',
  'settings.reminders.daysWithoutDates': 'Tage ohne Uhrzeit',
  'settings.reminders.slotA11y': 'Erinnerung {n}, {value}',
  'settings.reminders.slotValueA11y': 'Wert für Erinnerung {n}',
  'settings.reminders.slotUnitA11y': 'Einheit für Erinnerung {n}',
  'settings.reminders.off': 'Aus',
  'settings.reminders.on': 'Ein',
  'settings.reminders.minutes': 'Minuten',
  'settings.reminders.hours': 'Stunden',

  // ── App section ────────────────────────────────────────────────────
  'settings.app.appearance': 'Erscheinungsbild',
  'settings.app.auto': 'Auto',
  'settings.app.light': 'Hell',
  'settings.app.dark': 'Dunkel',
  'settings.app.region': 'Region',
  'settings.app.regionA11y': 'Region: {value}. Region ändern',

  // ── Region (Preferences value row + RegionScreen) ──────────────────
  'settings.region.matchDevice': 'Wie mein Gerät ({region})',
  'settings.region.default': 'Standard',
  'settings.region.note':
    'Die Region ändert, in welcher Reihenfolge Sportarten und Wettbewerbe erscheinen und wie einige davon heißen — nie, wem du folgen kannst. Es wird kein Standort verwendet.',

  // ── Past games section ─────────────────────────────────────────────
  'settings.past.footnote':
    'Entfernt werden nur Spiele, die KickOffCal selbst hinzugefügt hat — und nur solche, zu denen es noch einen Eintrag hat. Zurückschalten stoppt weitere Löschungen, bringt aber nichts bereits Gelöschtes zurück.',
  'settings.past.keep': 'Vergangene Spiele im Kalender behalten',
  'settings.past.remove': '{days} Tage nach Ende entfernen',

  // ── Data & privacy rows ────────────────────────────────────────────
  'settings.privacy.erase': 'Synchronisierte Einträge löschen',
  'settings.privacy.eraseOwnTarget':
    'Entfernt die Einträge, die KickOffCal zu {calendar} hinzugefügt hat — auch vergangene. Alles andere darin bleibt unberührt.',
  'settings.privacy.eraseOurs':
    'Entfernt den KickOffCal-Kalender und alle Einträge darin — auch vergangene. Sonst wird in deinem Kalender nichts angetastet.',
  'settings.privacy.eraseResync':
    'Bleibt der Sync verbunden, werden künftige Einträge wieder hinzugefügt.',
  'settings.privacy.eraseAction': 'Löschen',
  'settings.privacy.eraseFailed_one':
    '{n} Eintrag konnte nicht entfernt werden — versuch es noch einmal',
  'settings.privacy.eraseFailed_other':
    '{n} Einträge konnten nicht entfernt werden — versuch es noch einmal',
  'settings.privacy.nothingToErase': 'Nichts Synchronisiertes zu löschen',
  'settings.privacy.erased': 'Synchronisierte Einträge gelöscht',
  'settings.privacy.deleteTitle': 'Meine Daten löschen & zurücksetzen',
  'settings.privacy.deleteA11y': 'Meine Daten löschen und zurücksetzen',
  'settings.privacy.deleteBody':
    'Entfernt alles, was diese App über dich speichert — Follows, Einstellungen und die Registrierung auf dem Server — und beginnt von vorn.',
  'settings.privacy.alsoErase':
    'Auch synchronisierte Einträge aus meinem Kalender löschen',
  'settings.privacy.cantUndo': 'Das lässt sich nicht rückgängig machen.',
  'settings.privacy.deleteAction': 'Löschen',
  'settings.privacy.deleteMyData': 'Meine Daten löschen',

  // ── Screen tail (Preferences) ──────────────────────────────────────
  'settings.tail.photoCredits': 'Bildnachweise',
  'settings.status.underHourAgo': 'vor weniger als einer Stunde',
  'settings.status.hoursAgo': 'vor {n}h',
  'settings.status.daysAgo': 'vor {n}d',
  'settings.status.deviceNotSynced': 'Dieses Gerät: noch nicht synchronisiert',
  'settings.status.deviceSynced':
    'Dieses Gerät wurde zuletzt {when} synchronisiert',
  'settings.status.nothingFollowed': 'Spielplan-Quellen: noch keine Follows',
  'settings.status.freshnessUnknown':
    'Spielplan-Quellen: Aktualität unbekannt',
  'settings.status.sourcesConfirmed':
    'Spielplan-Quellen zuletzt {when} bestätigt',

  // ── CalendarTargetScreen ───────────────────────────────────────────
  'settings.target.connectFirst':
    'Verbinde zuerst deinen Kalender — KickOffCal wählt dann automatisch den besten Ort für deine Spiele. Danach kannst du ihn hier ändern.',
  'settings.target.putGames': 'Hol dir deine Spiele in den Kalender',
  'settings.target.connectA11y': 'Deinen Kalender verbinden',
  'settings.target.goTo': 'Spiele landen in',
  'settings.target.moving_one': '{n} Spiel wird verschoben… {moved}/{n}',
  'settings.target.moving_other': '{n} Spiele werden verschoben… {moved}/{n}',
  'settings.target.reading': 'Deine Kalender werden gelesen…',
  'settings.target.ownCalendarHeader': 'Ein eigener Kalender',
  'settings.target.newInSource': 'Neuer KickOffCal-Kalender in {source}',
  'settings.target.newOnDevice': 'Neuer KickOffCal-Kalender auf diesem Gerät',
  'settings.target.keepsSeparate':
    'Hält Spiele getrennt von deinen eigenen Terminen',
  'settings.target.writeToA11y': 'Spiele in {calendar} speichern',
  'settings.target.moved_one': '{n} Spiel zu {calendar} verschoben',
  'settings.target.moved_other': '{n} Spiele zu {calendar} verschoben',
  'settings.target.nowGoTo': 'Spiele landen jetzt in {calendar}',
  'settings.target.scopePromise':
    'Egal, was du wählst — KickOffCal fügt nur Spiele hinzu, ändert oder entfernt nur Spiele, die es selbst dort angelegt hat. Ein Wechsel zwischen diesen Kalendern nimmt diese Spiele mit.',

  // ── CreditsScreen ──────────────────────────────────────────────────
  'settings.credits.intro':
    'Die Fotos stammen von Wikimedia Commons unter Lizenzen, die eine Weiterverwendung erlauben. Jedes ist unten der Person zugeschrieben, die es fotografiert hat.',
  'settings.credits.openSportsDbA11y': 'TheSportsDB öffnen',
  'settings.credits.sportsDb':
    'Eventdaten für mehrere Sportarten stammen von TheSportsDB (thesportsdb.com).',
  'settings.credits.none': 'Noch keine Fotos geladen.',
  'settings.credits.openSourceA11y': 'Quellseite für {subject} öffnen',
  'settings.credits.source': 'Quelle',
  'settings.credits.openLicenceA11y':
    'Lizenzinformationen von Wikimedia Commons öffnen',
  'settings.credits.aboutLicences': 'Über diese Lizenzen',

  // ── Round 5 Stage 2: premium states, notification reminders, registry notice ──
  'premium.syncRow': 'Teil von Premium · 14 Tage gratis starten',
  'premium.lockA11y': 'Premium-Funktion',
  'notifications.off': 'Mitteilungen sind aus',
  'notifications.openSettings': 'Einstellungen öffnen',
  'reminders.notify': 'Vor Spielen benachrichtigen',
  'reminders.notification.body': 'Beginnt in {when}',
  'registry.ceiling': 'Hintergrund-Updates pausiert: zu viele Follows',
};
