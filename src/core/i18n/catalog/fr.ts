// French catalog — complete translation of the English key set.
// Typed as Catalog, so a missing or extra key is a compile error; the
// parity test additionally pins `{placeholder}` preservation verbatim.
//
// Register: consumer-app French, « vous » throughout. Established
// sports vocabulary over anglicisms (matchs, combats, épreuves, ordre
// de jeu); brand and competition proper nouns untouched. Typography:
// U+2019 apostrophes, no space before ?!;: (modern app norm), and the
// reminder numeric shorts ({n}m/{n}h/{n}d) stay byte-identical to en
// for cross-language consistency of the chips.

import type { Catalog } from '../index';

export const fr: Catalog = {
  // ════════ core ════════
  // ── Sport schedule vocabulary (sportTerms.fixturesWordFor +
  // CompetitionCard's expansion pair) ────────────────────────────────
  'core.fixtures': 'Matchs',
  'core.teams': 'Équipes',
  'core.fights': 'Combats',
  'core.matches': 'Matchs',
  'core.tournaments': 'Tournois',
  // Serves f1/motorsport/athletics/olympics — « épreuves » is the one
  // French word all four genuinely use.
  'core.events': 'Épreuves',

  // ── Sport NAMES (Phase C language layer) ───────────────────────────
  'core.sport.soccer': 'Football',
  'core.sport.cricket': 'Cricket',
  'core.sport.ice-hockey': 'Hockey sur glace',
  'core.sport.tennis': 'Tennis',
  'core.sport.athletics': 'Athlétisme',
  'core.sport.basketball': 'Basket',
  'core.sport.baseball': 'Baseball',
  'core.sport.nfl': 'Football américain',
  'core.sport.rugby': 'Rugby',
  'core.sport.golf': 'Golf',
  'core.sport.f1': 'Formule 1',
  'core.sport.boxing': 'Boxe',
  'core.sport.ufc': 'MMA',
  'core.sport.motorsport': 'Sport automobile',
  'core.sport.olympics': 'Jeux olympiques',

  // ── Screen titles (App.tsx headers — the BrandTitle voice) ─────────
  'core.followType.team': 'équipe',
  'core.followType.competition': 'compétition',
  'core.followType.athlete': 'athlète',
  'core.followType.series': 'série',
  'core.title.home': 'Accueil',
  'core.title.following': 'Suivis',
  'core.title.schedule': 'Programme',
  'core.title.yourCalendar': 'Votre calendrier',
  'core.title.search': 'Recherche',
  'core.title.sports': 'Sports',
  'core.title.competitions': 'Compétitions',
  'core.title.athletes': 'Athlètes',
  'core.title.preferences': 'Préférences',
  'core.title.region': 'Région',
  'core.title.calendar': 'Calendrier',
  'core.title.photoCredits': 'Crédits photo',

  // ── when.ts: the hardcoded English words. Weekday/date forms stay
  // locale-driven (toLocaleDateString) and never pass through here. ──
  'core.when.today': 'Aujourd’hui',
  'core.when.tomorrow': 'Demain',
  'core.when.todayHeading': 'Aujourd’hui · {date}',
  'core.when.tomorrowHeading': 'Demain · {date}',
  'core.when.postponed': 'Reporté',
  'core.when.timeTbc': 'Heure à confirmer',
  // The countdown chip is set in caps AS COPY (caps keep accents).
  'core.when.countdownToday': 'AUJOURD’HUI',
  'core.when.countdownTomorrow': 'DEMAIN',
  'core.when.countdownInDays': 'DANS {n} JOURS',

  // ── Shared components (components.tsx / cardExpansion.tsx) ────────
  'core.rail.openA11y': '{label}, {caption}. Voir ses matchs',
  'core.a11y.openEvent': '{label}. Ouvrir l’événement',
  'core.hero.nextUpA11y': 'À venir: {title}, {when}',
  'core.row.removedFromCalendar': 'retiré du calendrier',
  'core.row.removedCaption': 'Retiré — absent de votre calendrier',
  'core.row.addToCalendarA11y': 'Ajouter {title} à votre calendrier',
  'core.row.removeFromCalendarA11y': 'Retirer {title} de votre calendrier',
  'core.row.restoreToCalendarA11y': 'Remettre {title} dans votre calendrier',
  'core.actions.add': 'Ajouter',
  'core.actions.added': 'Ajouté',
  'core.actions.remove': 'Retirer',
  'core.actions.removed': 'Retiré',
  'core.actions.cancel': 'Annuler',
  'core.follow.follow': 'Suivre',
  'core.follow.following': 'Suivi',
  'core.follow.followA11y': 'Suivre {subject}',
  'core.follow.unfollowA11y': 'Ne plus suivre {subject}',
  'core.expansion.closeA11y': 'Fermer',

  // ── Sync status chip + its relative times ──────────────────────────
  'core.status.justNow': 'à l’instant',
  // "min" is the abbreviation in every working-set language — no pair.
  'core.status.minsAgo': 'il y a {n} min',
  'core.status.hoursAgo_one': 'il y a 1 heure',
  'core.status.hoursAgo_other': 'il y a {n} heures',
  'core.status.daysAgo_one': 'hier',
  'core.status.daysAgo_other': 'il y a {n} jours',
  'core.status.checking': 'Vérification des matchs…',
  'core.status.updating': 'Mise à jour de votre calendrier…',
  'core.status.sourcesQuiet':
    'Aucune nouvelle des sources depuis {n}j — données peut-être en retard',
  'core.status.calendarOff': 'Synchronisation du calendrier désactivée',
  'core.status.upToDateCalendarOff': 'Matchs à jour · calendrier désactivé',
  'core.status.notSynced': 'Pas encore synchronisé',
  'core.status.updated': 'Calendrier mis à jour · {changes} · {when}',
  'core.status.changes_one': '{n} modification',
  'core.status.changes_other': '{n} modifications',
  'core.status.upToDate': 'Calendrier à jour · vérifié {when}',

  // ── Calendar-off banner ────────────────────────────────────────────
  'core.banner.fixturesReady_one': '{n} match prêt à ajouter',
  'core.banner.fixturesReady_other': '{n} matchs prêts à ajouter',
  'core.banner.fixturesWhenConnected':
    'Les matchs seront ajoutés une fois votre calendrier connecté',
  'core.banner.addA11y': 'Ajouter les matchs à mon calendrier',

  // ── Coverage note disclosure ───────────────────────────────────────
  'core.coverage.showA11y': 'Ce que cela couvre',
  'core.coverage.hideA11y': 'Masquer ce que cela couvre',
  'core.coverage.closedLabel': 'ⓘ  Ce que cela couvre',
  'core.coverage.openLabel': 'ⓘ  Ce que cela couvre ▲',

  // ════════ follows ════════
  // ── Search entry (Home's bar + the Search screen share these) ─────
  'follows.search.a11y':
    'Rechercher des équipes, athlètes, compétitions et sports',
  'follows.search.placeholder': 'Équipe, athlète, compétition ou sport',

  // ── Home ──────────────────────────────────────────────────────────
  'follows.home.emptyHeadline': 'Rien de programmé pour l’instant',
  'follows.home.emptyBody':
    'Les matchs arrivent ici — et dans votre calendrier — dès que les dates sont annoncées.',
  'follows.home.welcomeHeadline': 'Ne manquez plus aucun match',
  'follows.home.welcomeBody':
    'Suivez des équipes, des compétitions et des séries. Leurs matchs apparaissent dans votre calendrier et restent à jour tout seuls.',
  'follows.home.nothingScheduled': 'Rien de programmé',
  'follows.home.addSports': 'Ajouter des sports',
  'follows.home.chooseSport': 'Choisir un sport',
  'follows.home.browse': 'Parcourir',
  // The word: Home's section header, Home's sport-card caption and the
  // sport picker's caption (one key — same string on every surface).
  'follows.following': 'Suivi',
  'follows.sports.a11yComingSoon': '{name}, bientôt disponible',

  // ── Sport picker ──────────────────────────────────────────────────
  'follows.sportPicker.comingSoon': 'Prochainement',
  'follows.scope.tennisKeyNote':
    'Finales, demi-finales et quarts, lorsque les données nomment les tours. Le tableau WTA les nomme\u00a0; la plupart des matchs masculins n\u2019ont pas encore de tour indiqué, un tournoi masculin peut donc ne livrer que ses notes de début et de fin.',

  // ── Following (manage) ────────────────────────────────────────────
  'follows.following.captionNoUpcoming':
    '{sport} · pas encore de matchs à venir',
  'follows.following.captionUpcoming_one': '{sport} · {n} à venir',
  'follows.following.captionUpcoming_other': '{sport} · {n} à venir',
  'follows.following.a11yUndo': 'Rétablir le suivi de {name}',
  'follows.following.emptyHeadline': 'Vous ne suivez rien pour l’instant',
  'follows.following.emptyBody':
    'Choisissez un sport depuis l’accueil, ou parcourez tout ici.',
  'follows.following.browseSports': 'Parcourir les sports',
  'follows.following.a11yRow':
    '{name}, {type} que vous suivez. Voir ses matchs',
  'follows.following.a11yAddMore': 'Ajouter d’autres sports',
  'follows.following.addMore': '+ Ajouter',
  'follows.undo': 'Annuler',

  // ── Cards (CompetitionCard + tile rows across browse/search) ──────
  'follows.card.a11ySummary': '{name}, {caption}',
  'follows.card.a11yViewFixtures': '{name}, voir les matchs',
  'follows.card.a11yDestination': '{name} {label}',

  // ── Competition browse (LeagueList) ───────────────────────────────
  'follows.league.teamCount_one': '{country} · {n} équipe',
  'follows.league.teamCount_other': '{country} · {n} équipes',
  'follows.league.tapTournaments': 'Touchez pour suivre les tournois',
  'follows.league.tapTournamentsCount':
    'Touchez pour suivre les tournois ({count})',
  'follows.league.tapTeams':
    '{country} · Touchez pour suivre les équipes · {fixtures}',
  'follows.league.tapTeamsCount':
    '{country} · Touchez pour suivre les équipes ({count}) · {fixtures}',
  'follows.league.searchCompsTeams':
    'Rechercher des compétitions et des équipes',
  'follows.league.searchComps': 'Rechercher des compétitions',
  'follows.league.noMatches': 'Rien ici ne correspond à « {query} ».',
  'follows.league.allEvents': 'Toutes les épreuves',
  'follows.league.everyEventOnTour': 'Tous les tournois du circuit',
  'follows.tournaments.navTitle': 'Tournois {tour}',

  // ── Athlete browse ────────────────────────────────────────────────
  'follows.athletes.fighters': 'Combattants',
  'follows.athletes.players': 'Joueurs',
  'follows.athletes.drivers': 'Pilotes',
  'follows.athletes.athletes': 'Athlètes',
  'follows.athletes.caption': 'Classements, champions, qui est en lice',
  'follows.athletes.a11yBrowse': 'Parcourir les {athletes}',
  'follows.athletes.a11yBrowseTourPlayers': 'Parcourir les joueurs {tour}',
  'follows.athletes.champion': 'Champion · {orgs}',
  'follows.athletes.rank': 'N°{rank}',
  'follows.athletes.competes': 'En lice le {date}',
  'follows.athletes.competingSoon': 'Bientôt en lice',
  'follows.athletes.mens': 'Messieurs',
  'follows.athletes.womens': 'Dames',
  'follows.boxing.sectionMens': 'Boxe — Hommes',
  'follows.boxing.sectionWomens': 'Boxe — Femmes',
  'follows.boxing.mensTitle': 'Boxe masculine',
  'follows.boxing.womensTitle': 'Boxe féminine',
  'follows.athletes.searchPlaceholder': 'Rechercher des athlètes ({sport})',
  'follows.athletes.noneMatch': 'Aucun athlète ne correspond à ce nom.',
  'follows.athletes.noneYet':
    'Pas encore d’athlètes ici — ils arrivent à mesure que les classements et les listes d’engagés sont publiés.',
  'follows.athletes.a11yShowFewer': 'En voir moins dans {section}',
  'follows.athletes.a11yShowAll': 'Voir les {n} dans {section}',
  'follows.athletes.showFewer': 'Voir moins',
  'follows.athletes.showAll': 'Voir les {n}',
  'follows.athletes.a11yOpenPage': '{name}, ouvrir la fiche de l’athlète',

  // ── Tennis browse (domain/tennisBrowse.ts + LeagueList sections) ──
  'follows.tennis.atpTitle': 'ATP — Messieurs',
  'follows.tennis.wtaTitle': 'WTA — Dames',
  'follows.tennis.noteAtp':
    'Les dates de tournoi viennent du calendrier du circuit, et les ' +
    'horaires de match une fois le tableau publié — le tout assemblé à ' +
    'partir d’un flux de classement et relu à la main, si bien qu’un ' +
    'match arrive parfois en retard plutôt que faux. Le top 50 est ' +
    'classé par rang, le reste de A à Z; la recherche couvre 500 joueurs.',
  'follows.tennis.noteWta':
    'Notre couverture la plus complète: tournois, tableaux et ordre de ' +
    'jeu viennent du flux de la WTA elle-même — un match apparaît donc ' +
    'avec son adversaire dès que le tableau est tiré, puis s’affine à ' +
    'l’heure exacte une fois le programme publié.',
  'follows.tennis.allFourMajors': 'Les quatre tournois du Grand Chelem',
  // Mid-sentence form (the Follow control's subject) — its own key, not
  // a code-side lowercase: case rules differ per language.
  'follows.tennis.allFourMajorsSubject': 'les quatre tournois du Grand Chelem',
  'follows.tennis.otherTournaments': 'Autres tournois',
  'follows.tennis.tournamentCount_one': '{n} tournoi',
  'follows.tennis.tournamentCount_other': '{n} tournois',
  'follows.tennis.dateRange': '{start} – {end}',

  // ── Olympics browse ───────────────────────────────────────────────
  'follows.olympics.summer': 'Été',
  'follows.olympics.winter': 'Hiver',
  'follows.olympics.seasonOlympics': 'Jeux olympiques d’{season}',
  'follows.olympics.tapForSports': '{edition} · Touchez pour les sports · jeux',
  'follows.olympics.seasonSports': 'Sports d’{season}',
  'follows.olympics.seasonGames': 'Jeux d’{season}',
  'follows.olympics.games': 'Jeux',
  // 'Sports' as a standalone label: the Olympics card's destination and
  // the Search screen's section header (one key — same string).
  'follows.browse.sports': 'Sports',

  // ── Search screen ─────────────────────────────────────────────────
  'follows.search.sport': 'Sport',
  'follows.search.athlete': 'Athlète',
  'follows.search.captionCompetition': '{country} · {sport}',
  'follows.search.captionTeam': '{league} · {sport}',
  'follows.search.captionTournament': 'Tournoi · {sport}',
  'follows.search.noMatches':
    'Rien à suivre ne correspond à « {query} » — la recherche couvre les sports et les ligues que KickOffCal propose aujourd’hui.',
  'follows.search.searching': 'Recherche…',
  'follows.search.results': 'Résultats',
  'follows.search.competitions': 'Compétitions',

  // ── Team browse (TeamList) ────────────────────────────────────────
  'follows.teams.a11ySearchIn': 'Rechercher des équipes dans {league}',
  'follows.teams.searchPlaceholder': 'Rechercher des équipes',

  // ── Entity page (TeamScreen) ──────────────────────────────────────
  'follows.team.upcoming_one': '{n} à venir',
  'follows.team.upcoming_other': '{n} à venir',
  'follows.team.calendarEvents': 'ÉVÉNEMENTS DU CALENDRIER',
  'follows.team.a11ySelected': '{label}, sélectionné',
  'follows.team.athleteEmpty':
    'Aucun événement programmé. Nous les ajouterons dès qu’ils seront annoncés — suivez dès maintenant et ils rejoindront votre calendrier.',
  'follows.team.teamEmpty':
    'Pas encore de matchs à venir — ils arrivent ici dès que le calendrier est annoncé.',
  'follows.team.removed': 'Retiré de votre calendrier',
  'follows.team.added': '{title} ajouté à votre calendrier',
  'follows.team.restored': 'Remis dans votre calendrier',
  'follows.team.upcomingHeader': 'À venir',
  'follows.team.footer':
    'Touchez Ajouter pour un seul match, ou Suivre pour les avoir tous — vous pourrez ensuite retirer des matchs un par un.',
  'follows.team.whenCompetition': '{when} · {competition}',

  // ── Fixture hero (photo credit) ───────────────────────────────────
  'follows.hero.photoBy': 'Photo: {artist}',
  'follows.hero.photoCommons': 'Photo: Wikimedia Commons',

  // ── Follow feedback (toasts) ──────────────────────────────────────
  'follows.feedback.followingUpdating': 'Vous suivez {name} — mise à jour…',
  'follows.feedback.unfollowedUpdating':
    'Vous ne suivez plus {name} — mise à jour…',
  'follows.feedback.unfollowed': 'Vous ne suivez plus {name}',
  'follows.feedback.calendarOff': 'Vous suivez {name} — calendrier désactivé',
  'follows.feedback.enable': 'Activer',
  'follows.feedback.added_one': '{n} match ajouté à votre calendrier',
  'follows.feedback.added_other': '{n} matchs ajoutés à votre calendrier',
  'follows.feedback.noUpcoming':
    'Vous suivez {name} — pas encore de matchs à venir',

  // ── Coverage notes (verbatim from sportsConfig; read via
  //    domain/coverageNotes.ts — the config field is no longer read by
  //    the follows screens) ───────────────────────────────────────────
  'follows.coverage.cricket':
    'Internationaux à balle blanche et grandes ligues; les séries de Tests au-delà du County Championship ne sont pas couvertes.',
  'follows.coverage.tennis':
    'Chez les messieurs, les classements et les joueurs viennent d’un flux tiers en direct, et les horaires de match arrivent tournoi par tournoi, à mesure que chacun se joue. Chez les dames, classements, tableaux et ordre de jeu viennent de l’API de la WTA elle-même. La couverture varie — là où les matchs nous manquent encore, nous conservons les dates du tournoi.',
  'follows.coverage.athletics':
    'Couverture au niveau des meetings. Les athlètes ne peuvent pas encore être suivis individuellement — World Athletics ne publie ses classements que sous forme de pages web, et les listes de départ arrivent quand les fédérations les publient.',
  'follows.coverage.golf':
    'Couverture au niveau des tours; les heures de départ ne sont pas prises en compte.',
  'follows.coverage.boxing':
    'Les horaires des cartes correspondent au début de la diffusion, pas aux montées sur le ring. Le répertoire des boxeurs couvre les champions du monde et les prétendants classés par l’IBF, plus les boxeurs des cartes annoncées.',
  'follows.coverage.ufc':
    'Couverture au niveau des cartes uniquement. Impossible de suivre un combattant en particulier: aucune organisation de MMA ne publie d’effectif exploitable, et un répertoire de combattants relèverait de la devinette — nous préférons l’honnêteté à l’erreur.',
  'follows.coverage.olympics':
    'Les prochains Jeux sont Los Angeles 2028 (14–30 juillet) et les Jeux d’hiver de Milano-Cortina en 2030. Toutes les disciplines sont listées et peuvent être suivies dès maintenant, mais aucun programme n’a encore été publié — le CIO dévoile les horaires des sessions à l’approche des Jeux, donc un suivi créé aujourd’hui livre ses épreuves dès qu’elles existent. Aucun emblème olympique n’est affiché: ces marques sont protégées par une législation dédiée, l’application nomme donc les épreuves et génère ses propres visuels.',

  // ════════ calendar ════════
  // The language-switch rewrite notice (Phase C ruling: the rewrite is
  // deliberate and announces itself in-UI when it runs).
  'calendar.language.rewrite':
    'Mise à jour des événements de votre calendrier en {language}',
  // ── Offset vocabulary (prefs.ts — offsetLabel / short / picker) ────
  'calendar.offset.off': 'Désactivé',
  'calendar.offset.minBefore': '{n} min avant',
  'calendar.offset.daysBefore_one': '{n} jour avant',
  'calendar.offset.daysBefore_other': '{n} jours avant',
  'calendar.offset.hoursBefore_one': '{n} heure avant',
  'calendar.offset.hoursBefore_other': '{n} heures avant',
  // The numeric shorts stay byte-identical to en across languages.
  'calendar.offset.shortMinutes': '{n}m',
  'calendar.offset.shortDays': '{n}d',
  'calendar.offset.shortHours': '{n}h',
  'calendar.offset.pickerMinutes': '{n} min',
  'calendar.offset.pickerDays_one': '{n} jour',
  'calendar.offset.pickerDays_other': '{n} jours',
  'calendar.offset.pickerHours_one': '{n} h',
  'calendar.offset.pickerHours_other': '{n} h',

  // ── Reminder options (prefs.ts) ────────────────────────────────────
  'calendar.reminder.none': 'Aucun',
  'calendar.allDayReminder.eveningBefore': 'La veille au soir, 18h',
  'calendar.allDayReminder.eveningBeforeShort': 'La veille',
  'calendar.allDayReminder.morningOf': 'Le matin même, 9h',
  'calendar.allDayReminder.morningOfShort': 'Matin',

  // ── Written INTO calendar events (tournamentTiers.ts / syncPlan.ts) ─
  'calendar.tournament.begins': '{title} commence',
  'calendar.tournament.finalDay': '{title} — dernier jour',
  'calendar.tournament.pointer':
    'Les matchs individuels peuvent être ajoutés depuis la fiche du tournoi dans l’application.',
  'calendar.event.timeTbc': 'heure à confirmer',
  'calendar.event.postponed': 'reporté',
  'calendar.event.nominalTimeNote':
    'L’heure de début n’est pas encore confirmée — elle se mettra à jour automatiquement.',

  // ── Timing explanations (fixtures/domain/timingExplanation.ts) ─────
  'calendar.timing.momentsAgo': 'il y a un instant',
  'calendar.timing.minutesAgo': 'il y a {n} minutes',
  'calendar.timing.hoursAgo_one': 'il y a {n} heure',
  'calendar.timing.hoursAgo_other': 'il y a {n} heures',
  'calendar.timing.daysAgo_one': 'hier',
  'calendar.timing.daysAgo_other': 'il y a {n} jours',
  'calendar.timing.confirmOrganiser':
    '{source} n’a pas encore confirmé l’heure définitive.',
  'calendar.timing.confirmGeneric':
    'L’heure définitive n’a pas encore été confirmée.',
  'calendar.timing.slotNotAnnounced':
    'L’ordre de jeu n’a pas encore été annoncé par {source}.',
  'calendar.timing.timeNotAnnounced':
    'Aucune heure de début n’a encore été annoncée par {source}.',
  'calendar.timing.slotNotPublished':
    'L’ordre de jeu n’a pas encore été publié.',
  'calendar.timing.timeNotPublished':
    'Aucune heure de début n’a encore été publiée.',
  'calendar.timing.checked': 'Vérifié {ago}',
  'calendar.timing.cancelled': 'Annulé — cela n’aura plus lieu.',
  'calendar.timing.postponed':
    'Reporté — aucune nouvelle date n’a été publiée.',
  'calendar.timing.runsOverDays':
    'S’étale sur {n} jours, et figure donc dans votre calendrier comme un événement de {n} jours.',
  'calendar.timing.exactTimeNotSet':
    'L’heure exacte n’est pas encore fixée, ceci couvre donc tout l’événement — {n} jours.',
  'calendar.timing.dayOnlyAppearance':
    'Seul le jour est connu — ceci reste posé sur la journée jusqu’à la publication de l’ordre de jeu.',
  'calendar.timing.dayOnly':
    'Seul le jour est connu, c’est donc une entrée sur la journée plutôt qu’une heure inventée.',
  'calendar.timing.nominal':
    'L’heure affichée est le départ publié, mais elle n’est pas encore définitive.',
  'calendar.timing.provisional':
    'Cet horaire est confirmé pour l’instant, mais il peut encore bouger.',
  'calendar.timing.willUpdate':
    'Votre calendrier se met à jour tout seul en cas de changement.',
  'calendar.timing.shortCancelled': 'Annulé',
  'calendar.timing.shortPostponed': 'Reporté — pas de nouvelle date',
  'calendar.timing.runsDays': 'Sur {n} jours',
  'calendar.timing.noOrderOfPlay': 'Pas d’ordre de jeu',
  'calendar.timing.noConfirmedTime': 'Pas d’heure confirmée',
  'calendar.timing.noStartTime': 'Pas d’heure de début',
  'calendar.timing.subjectFromYet': '{subject} côté {source} pour le moment',
  'calendar.timing.subjectChecked':
    '{subject} pour le moment · vérifié {ago}',
  'calendar.timing.subjectPublishedYet': '{subject} pour le moment',
  'calendar.timing.shortProvisional': 'Confirmé pour l’instant, peut bouger',

  // ── The full card's vocabulary (fixtures/domain/card.ts) ───────────
  'calendar.cardList.fullCard': 'Carte complète',
  'calendar.cardList.matches': 'Matchs',
  'calendar.cardList.events': 'Épreuves',
  'calendar.cardList.alsoOn': 'Également au programme',
  'calendar.cardList.timeWithinEvent':
    'Horaire au sein de l’événement non publié',

  // ── The expanded fixture card (FixtureCard.tsx) ────────────────────
  'calendar.card.loadFailed': 'Impossible de charger cet événement',
  'calendar.card.titleClose': '{title}. Fermer',
  'calendar.card.removeFromCalendar': 'Retirer du calendrier',
  'calendar.card.addToCalendar': 'Ajouter au calendrier',
  'calendar.card.removeTitleA11y': 'Retirer {title} de votre calendrier',
  'calendar.card.addTitleA11y': 'Ajouter {title} à votre calendrier',
  'calendar.card.alreadyInCalendar': '{title} est déjà dans votre calendrier',
  'calendar.card.mens': 'Messieurs',
  'calendar.card.womens': 'Dames',
  'calendar.card.sexChipShown': 'Matchs {label}, affichés',
  'calendar.card.sexChipHidden': 'Matchs {label}, masqués',
  'calendar.card.removeAllA11y':
    'Retirer tous les matchs listés de votre calendrier',
  'calendar.card.addAllA11y':
    'Ajouter tous les matchs listés à votre calendrier',
  'calendar.card.removeAll': 'Tout retirer',
  'calendar.card.addAll': 'Tout ajouter',
  'calendar.card.reminder': 'Rappel',
  'calendar.card.optionSelected': '{label}, sélectionné',
  'calendar.card.useDefaultReminder': 'Utiliser mon rappel par défaut',
  'calendar.card.colour': 'Couleur',
  'calendar.card.colourValue': 'Couleur {value}',
  'calendar.card.mainEvent': 'Combat principal',
  'calendar.card.added': 'Ajouté',
  'calendar.card.add': 'Ajouter',
  'calendar.card.close': 'Fermer',

  // ── Toasts (FixtureCard / ScheduleScreen) ──────────────────────────
  'calendar.toast.removed': 'Retiré de votre calendrier',
  'calendar.toast.added': 'Ajouté à votre calendrier',
  'calendar.toast.restored': 'Remis dans votre calendrier',
  'calendar.toast.undo': 'Annuler',

  // ── Schedule (ScheduleScreen.tsx) ──────────────────────────────────
  'calendar.schedule.emptyHeadline': 'Rien au programme',
  'calendar.schedule.emptyNoFollows':
    'Suivez une équipe ou une compétition et ses matchs apparaissent ici — et dans votre calendrier.',
  'calendar.schedule.emptyWaiting':
    'Les matchs apparaissent ici dès que les dates sont annoncées.',
  'calendar.schedule.hideCalendar': 'Masquer le calendrier',
  'calendar.schedule.showCalendar': 'Afficher le calendrier',
  'calendar.schedule.footerOff':
    'Ces matchs seront ajoutés au calendrier de votre téléphone une fois celui-ci connecté.',
  'calendar.schedule.footerOn':
    'Tout ce qui est ici figure dans le calendrier de votre téléphone et se met à jour tout seul — les horaires se précisent, les reports se déplacent, les annulations disparaissent.',
  'calendar.schedule.showMore': 'Afficher plus',

  // ── Month grid (MonthGrid.tsx) ─────────────────────────────────────
  'calendar.month.previous': 'Mois précédent',
  'calendar.month.next': 'Mois suivant',
  'calendar.month.day': '{day} {month}',
  'calendar.month.dayFixtures_one': '{day} {month}, {n} match',
  'calendar.month.dayFixtures_other': '{day} {month}, {n} matchs',
  'calendar.month.dayRemovedOnly': '{day} {month}, matchs retirés uniquement',
  // Monday-start weekday initials, one key each — several languages
  // do not share English's duplicated T/S letters.
  'calendar.month.mon': 'L',
  'calendar.month.tue': 'M',
  'calendar.month.wed': 'M',
  'calendar.month.thu': 'J',
  'calendar.month.fri': 'V',
  'calendar.month.sat': 'S',
  'calendar.month.sun': 'D',

  // ── Calendar priming (CalendarPrimingScreen.tsx) ───────────────────
  'calendar.priming.title': 'Mettez vos matchs dans votre calendrier',
  'calendar.priming.ready_one': '{count} match prêt à ajouter.',
  'calendar.priming.ready_other': '{count} matchs prêts à ajouter.',
  'calendar.priming.readyMonth_one':
    '{count} match prêt à ajouter — environ {month} dans le mois à venir.',
  'calendar.priming.readyMonth_other':
    '{count} matchs prêts à ajouter — environ {month} dans le mois à venir.',
  'calendar.priming.explainTarget':
    'Les matchs vont dans le calendrier de votre choix — nous ne touchons qu’aux événements que nous avons ajoutés',
  'calendar.priming.explainUpdates':
    'Les événements se mettent à jour d’eux-mêmes quand les horaires changent ou que les matchs bougent',
  'calendar.priming.explainUnfollow':
    'Arrêtez un suivi et ses matchs disparaissent',
  'calendar.priming.denied':
    'L’accès au calendrier est désactivé pour KickOffCal. Autorisez-le dans les Réglages, puis revenez — vos matchs vous attendent.',
  'calendar.priming.tryAgain': '{message} Réessayez dans un instant.',
  'calendar.priming.googleNote':
    'La synchronisation du calendrier nécessite une connexion Google sur Android. Sans cela, vos matchs restent dans l’application.',
  'calendar.priming.openSettings': 'Ouvrir les Réglages',
  'calendar.priming.connecting': 'Connexion…',
  'calendar.priming.connectGoogle': 'Connecter Google Agenda',
  'calendar.priming.addToMyCalendar': 'Ajouter à mon calendrier',
  'calendar.priming.connectMyCalendar': 'Connecter mon calendrier',
  'calendar.priming.notNow': 'Plus tard',
  'calendar.priming.addedFixtures_one': '{n} match ajouté à votre calendrier',
  'calendar.priming.addedFixtures_other':
    '{n} matchs ajoutés à votre calendrier',
  'calendar.priming.connected': 'Calendrier connecté',
  'calendar.priming.connectedTitle': 'Votre calendrier est connecté',
  'calendar.priming.connectedBody':
    'Suivez une équipe et ses matchs y apparaissent tout seuls — les horaires se précisent, les reports se déplacent, les annulations disparaissent. Rien d’autre à configurer.',
  'calendar.priming.chooseSports': 'Choisissez vos sports',
  'calendar.priming.differentCalendar': 'Utiliser un autre calendrier',

  // ── First-run welcome (onboarding/WelcomeScreen.tsx) ───────────────
  'calendar.welcome.tagline': 'Ne manquez plus aucun match.',
  'calendar.welcome.promiseCalendar':
    'Les matchs arrivent dans le calendrier de votre téléphone, automatiquement',
  'calendar.welcome.promiseCorrect':
    'Les horaires changent, les matchs bougent — votre calendrier reste exact',
  'calendar.welcome.promiseNoAccount':
    'Aucun compte requis — suivez, c’est tout.',
  'calendar.welcome.getStarted': 'Commencer',

  // ════════ settings ════════
  // ── PreferencesScreen: the accordion's section titles ──────────────
  'settings.sections.calendar': 'Calendrier',
  'settings.sections.events': 'Événements',
  'settings.sections.app': 'Application',
  'settings.sections.pastGames': 'Matchs passés',
  'settings.sections.dataPrivacy': 'Données et confidentialité',
  'settings.sections.a11y': 'Réglages {title}',

  // ── Calendar section ───────────────────────────────────────────────
  'settings.calendar.googleReconnectCaption':
    'Dans votre Google Agenda — touchez pour vous reconnecter',
  'settings.calendar.googleReconnectA11y':
    'KickOffCal dans Google Agenda. Se reconnecter à Google',
  'settings.calendar.googleReconnected': 'Google Agenda reconnecté',
  'settings.calendar.googleConnectedCaption': 'Dans votre Google Agenda',
  'settings.calendar.googleConnectedA11y': 'KickOffCal dans Google Agenda',
  'settings.calendar.disconnectGoogle': 'Déconnecter Google Agenda',
  'settings.calendar.disconnectCaption':
    'Votre calendrier et ses événements restent intacts',
  'settings.calendar.googleDisconnected': 'Google Agenda déconnecté',
  'settings.calendar.connectGoogle': 'Connecter Google Agenda',
  'settings.calendar.connectCaption':
    'Les matchs restent dans l’application d’ici là',
  'settings.calendar.connectLegacyCaption':
    'Les matchs déjà dans votre calendrier restent où ils sont',
  'settings.calendar.choose': 'Choisir un calendrier',
  'settings.calendar.autoPickedCaption':
    'Choisi automatiquement à la connexion de votre calendrier',
  'settings.calendar.targetA11y':
    'Calendrier: {label}. {account}. Changer où les matchs sont écrits',
  'settings.calendar.chooseA11y': 'Choisir où les matchs sont écrits',
  'settings.calendar.colour': 'Couleur',
  'settings.calendar.colourA11y': 'Couleur du calendrier {name}',
  'settings.calendar.colourCaption':
    'L’apparence des événements KickOffCal dans l’app calendrier de votre téléphone.',
  'settings.calendar.inheritedColour':
    'Vos matchs prennent la couleur de {calendar}, que vous pouvez régler dans votre app calendrier.',
  'settings.calendar.colourApplied':
    'La couleur du calendrier est maintenant {colour}',
  'settings.calendar.colourSaved':
    'Couleur enregistrée — appliquée à la connexion de votre calendrier',
  'settings.calendar.colourRefused':
    'Google Agenda n’a pas accepté la couleur — vous pouvez la régler dans l’app Google Agenda',
  // The calendar-name fallback when no target is stored yet.
  'settings.words.yourCalendar': 'votre calendrier',

  // Colour names — read out and toasted, so they are copy, not config.
  'settings.colours.kickoffcalBlue': 'Bleu KickOffCal',
  'settings.colours.red': 'Rouge',
  'settings.colours.orange': 'Orange',
  'settings.colours.green': 'Vert',
  'settings.colours.teal': 'Bleu canard',
  'settings.colours.purple': 'Violet',
  'settings.colours.pink': 'Rose',
  'settings.colours.graphite': 'Graphite',

  // ── Events section ─────────────────────────────────────────────────
  'settings.events.footnote':
    'Les événements avec horaire vont du coup d’envoi au coup de sifflet final. Les changements s’appliquent à tous les matchs synchronisés à la prochaine synchronisation.',
  'settings.events.style': 'Format des événements',
  'settings.events.timed': 'Avec horaire',
  'settings.events.allDay': 'Jour entier',
  'settings.events.raceWeekends': 'Week-ends de course',
  'settings.events.allSessions': 'Toutes les séances',
  'settings.events.raceOnly': 'Course seule',
  'settings.events.block': 'Dates seulement',
  'settings.events.keyRounds': 'Tours décisifs',
  'settings.events.allMatches': 'Tous les matchs',

  // ── Reminders section ──────────────────────────────────────────────
  'settings.reminders.title': 'Rappels',
  'settings.reminders.footnote': 'Les modifications s’appliquent à la prochaine synchronisation.',
  'settings.reminders.daysWithoutDates': 'Jours sans horaire',
  'settings.reminders.slotA11y': 'Rappel {n}, {value}',
  'settings.reminders.slotValueA11y': 'Valeur du rappel {n}',
  'settings.reminders.slotUnitA11y': 'Unité du rappel {n}',
  'settings.reminders.off': 'Désactivé',
  'settings.reminders.on': 'Activé',
  'settings.reminders.minutes': 'Minutes',
  'settings.reminders.hours': 'Heures',

  // ── App section ────────────────────────────────────────────────────
  'settings.app.appearance': 'Apparence',
  'settings.app.auto': 'Auto',
  'settings.app.light': 'Clair',
  'settings.app.dark': 'Sombre',
  'settings.app.region': 'Région',
  'settings.app.regionA11y': 'Région: {value}. Changer de région',

  // ── Region (Preferences value row + RegionScreen) ──────────────────
  'settings.region.matchDevice': 'Comme mon appareil ({region})',
  'settings.region.default': 'Par défaut',
  'settings.region.note':
    'La région change l’ordre dans lequel sports et compétitions apparaissent, et le nom de quelques-uns — jamais ce que vous pouvez suivre. Aucune localisation n’est utilisée.',

  // ── Past games section ─────────────────────────────────────────────
  'settings.past.footnote':
    'Seuls les matchs ajoutés par KickOffCal sont supprimés, et uniquement ceux dont il garde une trace. Revenir en arrière arrête les suppressions — cela ne restaure pas ce qui a déjà été supprimé.',
  'settings.past.keep': 'Garder les matchs passés dans mon calendrier',
  'settings.past.remove': 'Les retirer {days} jours après leur fin',

  // ── Data & privacy rows ────────────────────────────────────────────
  'settings.privacy.erase': 'Effacer les événements synchronisés',
  'settings.privacy.eraseOwnTarget':
    'Retire les événements que KickOffCal a ajoutés à {calendar}, y compris les passés. Rien d’autre n’y est touché.',
  'settings.privacy.eraseOurs':
    'Supprime le calendrier KickOffCal et tous ses événements — y compris les passés. Rien d’autre dans votre calendrier n’est touché.',
  'settings.privacy.eraseResync':
    'Si la synchronisation reste connectée, les événements à venir seront ajoutés de nouveau.',
  'settings.privacy.eraseAction': 'Effacer',
  'settings.privacy.eraseFailed_one':
    '{n} événement n’a pas pu être retiré — réessayez',
  'settings.privacy.eraseFailed_other':
    '{n} événements n’ont pas pu être retirés — réessayez',
  'settings.privacy.nothingToErase': 'Rien de synchronisé à effacer',
  'settings.privacy.erased': 'Événements synchronisés effacés',
  'settings.privacy.deleteTitle': 'Supprimer mes données et réinitialiser',
  'settings.privacy.deleteA11y': 'Supprimer mes données et réinitialiser',
  'settings.privacy.deleteBody':
    'Supprime tout ce que cette application détient sur vous — suivis, réglages et enregistrement côté serveur — et repart de zéro.',
  'settings.privacy.alsoErase':
    'Effacer aussi les événements synchronisés de mon calendrier',
  'settings.privacy.cantUndo': 'Cette action est irréversible.',
  'settings.privacy.deleteAction': 'Supprimer',
  'settings.privacy.deleteMyData': 'Supprimer mes données',

  // ── Screen tail (Preferences) ──────────────────────────────────────
  'settings.tail.photoCredits': 'Crédits photo',
  'settings.status.underHourAgo': 'il y a moins d’une heure',
  'settings.status.hoursAgo': 'il y a {n}h',
  'settings.status.daysAgo': 'il y a {n}j',
  'settings.status.deviceNotSynced': 'Cet appareil: pas encore synchronisé',
  'settings.status.deviceSynced':
    'Cet appareil: dernière synchronisation {when}',
  'settings.status.nothingFollowed':
    'Sources de matchs: rien de suivi pour l’instant',
  'settings.status.freshnessUnknown': 'Sources de matchs: fraîcheur inconnue',
  'settings.status.sourcesConfirmed':
    'Sources de matchs: dernière confirmation {when}',

  // ── CalendarTargetScreen ───────────────────────────────────────────
  'settings.target.connectFirst':
    'Connectez d’abord votre calendrier et KickOffCal choisira automatiquement le meilleur endroit pour vos matchs. Vous pourrez ensuite le changer ici.',
  'settings.target.putGames': 'Mettez vos matchs dans votre calendrier',
  'settings.target.connectA11y': 'Connecter votre calendrier',
  'settings.target.goTo': 'Les matchs vont dans',
  'settings.target.moving_one': 'Déplacement de {n} match… {moved}/{n}',
  'settings.target.moving_other': 'Déplacement de {n} matchs… {moved}/{n}',
  'settings.target.reading': 'Lecture de vos calendriers…',
  'settings.target.ownCalendarHeader': 'Un calendrier dédié',
  'settings.target.newInSource': 'Nouveau calendrier KickOffCal dans {source}',
  'settings.target.newOnDevice':
    'Nouveau calendrier KickOffCal sur cet appareil',
  'settings.target.keepsSeparate':
    'Garde les matchs séparés de vos propres événements',
  'settings.target.writeToA11y': 'Écrire les matchs dans {calendar}',
  'settings.target.moved_one': '{n} match déplacé vers {calendar}',
  'settings.target.moved_other': '{n} matchs déplacés vers {calendar}',
  'settings.target.nowGoTo': 'Les matchs vont désormais dans {calendar}',
  'settings.target.scopePromise':
    'Quel que soit votre choix, KickOffCal se contente d’ajouter, modifier ou retirer les matchs qu’il y a placés. Passer d’un de ces calendriers à l’autre déplace ces matchs avec vous.',

  // ── CreditsScreen ──────────────────────────────────────────────────
  'settings.credits.intro':
    'Les photographies proviennent de Wikimedia Commons sous des licences autorisant la réutilisation. Chacune est créditée à son photographe ci-dessous.',
  'settings.credits.openSportsDbA11y': 'Ouvrir TheSportsDB',
  'settings.credits.sportsDb':
    'Les données d’événements de plusieurs sports proviennent de TheSportsDB (thesportsdb.com).',
  'settings.credits.none': 'Aucune photographie chargée pour l’instant.',
  'settings.credits.openSourceA11y': 'Ouvrir la page source de {subject}',
  'settings.credits.source': 'source',
  'settings.credits.openLicenceA11y':
    'Ouvrir les informations de licence Wikimedia Commons',
  'settings.credits.aboutLicences': 'À propos de ces licences',

  // ── Round 5 Stage 2: premium states, notification reminders, registry notice ──
  'premium.syncRow': 'Inclus dans Premium · 14 jours gratuits',
  'premium.lockA11y': 'Fonction Premium',
  'notifications.off': 'Les notifications sont désactivées',
  'notifications.openSettings': 'Ouvrir les Réglages',
  'reminders.notify': 'Me prévenir avant les matchs',
  'reminders.notification.body': 'Commence dans {when}',
  'registry.ceiling': 'Mises à jour en arrière-plan en pause : trop de suivis',

  // ── Round 5 Stage 3: paywall, purchase outcomes, subscription state ──
  'paywall.headline': 'Synchronise ton calendrier',
  'paywall.lockSync': 'Tous les matchs dans ton calendrier, toujours à jour',
  'paywall.lockReminders': 'Trois rappels',
  'paywall.lockColour': 'Couleur du calendrier',
  'paywall.trialBadge': '14 jours gratuits',
  'paywall.monthly': 'Mensuel',
  'paywall.annual': 'Annuel',
  'paywall.pricePerMonth': '{price} / mois',
  'paywall.pricePerYear': '{price} / an',
  'paywall.annualSaving': 'Économise {percent}%',
  'paywall.startTrial': 'Commencer l’essai gratuit',
  'paywall.subscribe': 'S’abonner',
  'paywall.restore': 'Restaurer l’achat',
  'paywall.notNow': 'Continuer avec Free',
  'paywall.renewal': 'Renouvellement automatique. Annulable à tout moment.',
  'paywall.trialRenewal': 'Gratuit 14 jours, puis {price} / an. Renouvellement automatique. Annulable à tout moment.',
  'paywall.terms': 'Conditions',
  'paywall.privacy': 'Confidentialité',
  'paywall.unavailable': 'Boutique indisponible pour le moment',
  'purchase.pending': 'En attente d’approbation',
  'purchase.failed': 'Achat non finalisé',
  'restore.found': 'Abonnement restauré',
  'restore.none': 'Aucun abonnement à restaurer',
  'entitlement.trialDaysLeft': '{n} jours restants',
  'entitlement.trialDaysLeft.one': '1 jour restant',
  'entitlement.manage': 'Gérer l’abonnement',
  'entitlement.premium': 'Premium',
  'deleteData.subscriptionNote': 'Supprimer tes données n’annule pas un abonnement.',
};
