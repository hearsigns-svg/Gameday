// The Italian catalog. Every key of the English authority, translated
// into modern consumer-app Italian (informal register, fan
// vocabulary). Brand names, competition proper nouns and `{param}`
// placeholders pass through untouched; plural pairs follow Italian
// one/other rules.

import type { Catalog } from '../index';

export const it: Catalog = {
  // ── Sport schedule vocabulary (sportTerms.fixturesWordFor +
  // CompetitionCard's expansion pair) ────────────────────────────────
  'core.fixtures': 'Partite',
  'core.teams': 'Squadre',
  'core.fights': 'Incontri',
  'core.matches': 'Partite',
  'core.tournaments': 'Tornei',
  'core.events': 'Eventi',

  // ── Sport NAMES (Phase C language layer) ──────────────────────────
  'core.sport.soccer': 'Calcio',
  'core.sport.cricket': 'Cricket',
  'core.sport.ice-hockey': 'Hockey su ghiaccio',
  'core.sport.tennis': 'Tennis',
  'core.sport.athletics': 'Atletica',
  'core.sport.basketball': 'Basket',
  'core.sport.baseball': 'Baseball',
  'core.sport.nfl': 'Football americano',
  'core.sport.rugby': 'Rugby',
  'core.sport.golf': 'Golf',
  'core.sport.f1': 'Formula 1',
  'core.sport.boxing': 'Boxe',
  'core.sport.ufc': 'MMA',
  'core.sport.motorsport': 'Motori',
  'core.sport.olympics': 'Olimpiadi',

  // ── Screen titles (App.tsx headers — the BrandTitle voice) ────────
  'core.followType.team': 'squadra',
  'core.followType.competition': 'competizione',
  'core.followType.athlete': 'atleta',
  'core.followType.series': 'serie',
  'core.title.home': 'Home',
  'core.title.following': 'Seguiti',
  'core.title.schedule': 'Programma',
  'core.title.yourCalendar': 'Il tuo calendario',
  'core.title.search': 'Cerca',
  'core.title.sports': 'Sport',
  'core.title.competitions': 'Competizioni',
  'core.title.athletes': 'Atleti',
  'core.title.preferences': 'Preferenze',
  'core.title.region': 'Area geografica',
  'core.title.calendar': 'Calendario',
  'core.title.photoCredits': 'Crediti fotografici',

  // ── when.ts: the hardcoded English words ───────────────────────────
  'core.when.today': 'Oggi',
  'core.when.tomorrow': 'Domani',
  'core.when.todayHeading': 'Oggi · {date}',
  'core.when.tomorrowHeading': 'Domani · {date}',
  'core.when.postponed': 'Rinviato',
  'core.when.timeTbc': 'Orario da confermare',
  // The countdown chip is set in caps AS COPY.
  'core.when.countdownToday': 'OGGI',
  'core.when.countdownTomorrow': 'DOMANI',
  'core.when.countdownInDays': 'TRA {n} GIORNI',

  // ── Shared components (components.tsx / cardExpansion.tsx) ────────
  'core.rail.openA11y': '{label}, {caption}. Vedi le sue partite',
  'core.a11y.openEvent': '{label}. Apri l’evento',
  'core.hero.nextUpA11y': 'Prossimo: {title}, {when}',
  'core.row.removedFromCalendar': 'rimosso dal calendario',
  'core.row.removedCaption': 'Rimosso — non è nel tuo calendario',
  'core.row.addToCalendarA11y': 'Aggiungi {title} al tuo calendario',
  'core.row.removeFromCalendarA11y': 'Rimuovi {title} dal tuo calendario',
  'core.row.restoreToCalendarA11y': 'Ripristina {title} nel tuo calendario',
  'core.actions.add': 'Aggiungi',
  'core.actions.added': 'Aggiunto',
  'core.actions.remove': 'Rimuovi',
  'core.actions.removed': 'Rimosso',
  'core.actions.cancel': 'Annulla',
  'core.follow.follow': 'Segui',
  'core.follow.following': 'Segui già',
  'core.follow.followA11y': 'Segui {subject}',
  'core.follow.unfollowA11y': 'Smetti di seguire {subject}',
  'core.expansion.closeA11y': 'Chiudi',

  // ── Sync status chip + its relative times ──────────────────────────
  'core.status.justNow': 'proprio ora',
  'core.status.minsAgo': '{n} min fa',
  'core.status.hoursAgo_one': 'un’ora fa',
  'core.status.hoursAgo_other': '{n} ore fa',
  'core.status.daysAgo_one': 'ieri',
  'core.status.daysAgo_other': '{n} giorni fa',
  'core.status.checking': 'Controllo nuove partite…',
  'core.status.updating': 'Aggiornamento del tuo calendario…',
  'core.status.sourcesQuiet':
    'Fonti partite ferme da {n}g — dati forse non aggiornati',
  'core.status.calendarOff': 'Calendario non collegato',
  'core.status.upToDateCalendarOff':
    'Partite aggiornate · calendario non collegato',
  'core.status.notSynced': 'Non ancora sincronizzato',
  'core.status.updated': 'Calendario aggiornato · {changes} · {when}',
  'core.status.changes_one': '{n} modifica',
  'core.status.changes_other': '{n} modifiche',
  'core.status.upToDate': 'Calendario aggiornato · controllato {when}',

  // ── Calendar-off banner ────────────────────────────────────────────
  'core.banner.fixturesReady_one': '{n} partita pronta da aggiungere',
  'core.banner.fixturesReady_other': '{n} partite pronte da aggiungere',
  'core.banner.fixturesWhenConnected':
    'Le partite verranno aggiunte appena colleghi il tuo calendario',
  'core.banner.addA11y': 'Aggiungi le partite al mio calendario',

  // ── Coverage note disclosure ───────────────────────────────────────
  'core.coverage.showA11y': 'Cosa include',
  'core.coverage.hideA11y': 'Nascondi cosa include',
  'core.coverage.closedLabel': 'ⓘ  Cosa include',
  'core.coverage.openLabel': 'ⓘ  Cosa include ▲',

  // ── Search entry (Home's bar + the Search screen share these) ─────
  'follows.search.a11y': 'Cerca squadre, atleti, competizioni e sport',
  'follows.search.placeholder': 'Squadra, atleta, competizione o sport',

  // ── Home ──────────────────────────────────────────────────────────
  'follows.home.emptyHeadline': 'Ancora niente in programma',
  'follows.home.emptyBody':
    'Le partite arrivano qui — e nel tuo calendario — appena vengono annunciate.',
  'follows.home.welcomeHeadline': 'Non perderti neanche una partita',
  'follows.home.welcomeBody':
    'Segui squadre, competizioni e serie. Le partite compaiono nel tuo calendario e si aggiornano da sole.',
  'follows.home.nothingScheduled': 'Niente in programma',
  'follows.home.addSports': 'Aggiungi sport',
  'follows.home.chooseSport': 'Scegli uno sport',
  'follows.home.browse': 'Esplora',
  'follows.following': 'Seguiti',
  'follows.sports.a11yComingSoon': '{name}, in arrivo',

  // ── Sport picker ──────────────────────────────────────────────────
  'follows.sportPicker.comingSoon': 'In arrivo',
  'follows.scope.tennisKeyNote':
    'Finali, semifinali e quarti, dove i dati indicano il turno. Il tabellone WTA lo indica; la maggior parte dei match maschili non riporta ancora il turno, quindi un torneo solo maschile può fornire soltanto le note di inizio e fine.',

  // ── Following (manage) ────────────────────────────────────────────
  'follows.following.captionNoUpcoming':
    '{sport} · ancora nessuna partita in programma',
  'follows.following.captionUpcoming_one': '{sport} · {n} in programma',
  'follows.following.captionUpcoming_other': '{sport} · {n} in programma',
  'follows.following.a11yUndo': 'Torna a seguire {name}',
  'follows.following.emptyHeadline': 'Non segui ancora niente',
  'follows.following.emptyBody':
    'Scegli uno sport nella Home o esplora tutto da qui.',
  'follows.following.browseSports': 'Esplora gli sport',
  'follows.following.a11yRow': '{name}, {type} che segui. Vedi le sue partite',
  'follows.following.a11yAddMore': 'Aggiungi altri sport',
  'follows.following.addMore': '+ Aggiungi altri',
  'follows.undo': 'Annulla',

  // ── Cards (CompetitionCard + tile rows across browse/search) ──────
  'follows.card.a11ySummary': '{name}, {caption}',
  'follows.card.a11yViewFixtures': '{name}, vedi le partite',
  'follows.card.a11yDestination': '{name} {label}',

  // ── Competition browse (LeagueList) ───────────────────────────────
  'follows.league.teamCount_one': '{country} · {n} squadra',
  'follows.league.teamCount_other': '{country} · {n} squadre',
  'follows.league.tapTournaments': 'Tocca per seguire i tornei',
  'follows.league.tapTournamentsCount': 'Tocca per seguire i tornei ({count})',
  'follows.league.tapTeams':
    '{country} · Tocca per seguire le squadre · {fixtures}',
  'follows.league.tapTeamsCount':
    '{country} · Tocca per seguire le squadre ({count}) · {fixtures}',
  'follows.league.searchCompsTeams': 'Cerca competizioni e squadre',
  'follows.league.searchComps': 'Cerca competizioni',
  'follows.league.noMatches': 'Nessun risultato qui per “{query}”.',
  'follows.league.allEvents': 'Tutti gli eventi',
  'follows.league.everyEventOnTour': 'Ogni evento del tour',
  'follows.tournaments.navTitle': 'Tornei {tour}',

  // ── Athlete browse ────────────────────────────────────────────────
  'follows.athletes.fighters': 'Fighter',
  'follows.athletes.players': 'Giocatori',
  'follows.athletes.drivers': 'Piloti',
  'follows.athletes.athletes': 'Atleti',
  'follows.athletes.caption': 'Ranking, campioni, chi gareggia',
  'follows.athletes.a11yBrowse': 'Esplora {athletes}',
  'follows.athletes.a11yBrowseTourPlayers': 'Esplora i giocatori {tour}',
  'follows.athletes.champion': 'Campione · {orgs}',
  'follows.athletes.rank': '#{rank}',
  'follows.athletes.competes': 'In gara {date}',
  'follows.athletes.competingSoon': 'Presto in gara',
  'follows.athletes.mens': 'Maschile',
  'follows.athletes.womens': 'Femminile',
  'follows.boxing.sectionMens': 'Boxe — Uomini',
  'follows.boxing.sectionWomens': 'Boxe — Donne',
  'follows.boxing.mensTitle': 'Boxe maschile',
  'follows.boxing.womensTitle': 'Boxe femminile',
  'follows.athletes.searchPlaceholder': 'Cerca atleti di {sport}',
  'follows.athletes.noneMatch': 'Nessun atleta con questo nome.',
  'follows.athletes.noneYet':
    'Ancora nessun atleta qui — arrivano man mano che ranking e iscrizioni vengono pubblicati.',
  'follows.athletes.a11yShowFewer': 'Mostra meno in {section}',
  'follows.athletes.a11yShowAll': 'Mostra tutti e {n} in {section}',
  'follows.athletes.showFewer': 'Mostra meno',
  'follows.athletes.showAll': 'Mostra tutti e {n}',
  'follows.athletes.a11yOpenPage': '{name}, apri la pagina dell’atleta',

  // ── Tennis browse (domain/tennisBrowse.ts + LeagueList sections) ──
  'follows.tennis.atpTitle': 'ATP — Maschile',
  'follows.tennis.wtaTitle': 'WTA — Femminile',
  'follows.tennis.noteAtp':
    'Le date dei tornei arrivano dal calendario del tour, gli orari ' +
    'delle partite quando esce il tabellone — il tutto costruito da un ' +
    'feed di ranking e rivisto a mano, così ogni tanto una partita ' +
    'arriva in ritardo, ma non sbagliata. I primi 50 sono in ordine di ' +
    'ranking, gli altri dalla A alla Z; con la ricerca ne trovi 500.',
  'follows.tennis.noteWta':
    'La copertura più completa che abbiamo: tornei, tabelloni e ordine ' +
    'di gioco arrivano dal feed della WTA, così una partita compare ' +
    'con l’avversaria appena viene fatto il tabellone e si affina ' +
    'all’orario esatto quando esce il programma.',
  'follows.tennis.allFourMajors': 'Tutti e quattro gli Slam',
  // Mid-sentence form (the Follow control's subject).
  'follows.tennis.allFourMajorsSubject': 'tutti e quattro gli Slam',
  'follows.tennis.otherTournaments': 'Altri tornei',
  'follows.tennis.tournamentCount_one': '{n} torneo',
  'follows.tennis.tournamentCount_other': '{n} tornei',
  'follows.tennis.dateRange': '{start} – {end}',

  // ── Olympics browse ───────────────────────────────────────────────
  // {season} composes into masculine-plural heads (Giochi olimpici /
  // Sport / Giochi), so one adjective form agrees everywhere.
  'follows.olympics.summer': 'estivi',
  'follows.olympics.winter': 'invernali',
  'follows.olympics.seasonOlympics': 'Giochi olimpici {season}',
  'follows.olympics.tapForSports': '{edition} · Tocca per sport · Giochi',
  'follows.olympics.seasonSports': 'Sport {season}',
  'follows.olympics.seasonGames': 'Giochi {season}',
  'follows.olympics.games': 'Giochi',
  'follows.browse.sports': 'Sport',

  // ── Search screen ─────────────────────────────────────────────────
  'follows.search.sport': 'Sport',
  'follows.search.athlete': 'Atleta',
  'follows.search.captionCompetition': '{country} · {sport}',
  'follows.search.captionTeam': '{league} · {sport}',
  'follows.search.captionTournament': 'Torneo · {sport}',
  'follows.search.noMatches':
    'Niente da seguire per “{query}” — la ricerca copre gli sport e i campionati che KickOffCal offre oggi.',
  'follows.search.searching': 'Ricerca in corso…',
  'follows.search.results': 'Risultati',
  'follows.search.competitions': 'Competizioni',

  // ── Team browse (TeamList) ────────────────────────────────────────
  'follows.teams.a11ySearchIn': 'Cerca squadre in {league}',
  'follows.teams.searchPlaceholder': 'Cerca squadre',

  // ── Entity page (TeamScreen) ──────────────────────────────────────
  'follows.team.upcoming_one': '{n} in programma',
  'follows.team.upcoming_other': '{n} in programma',
  'follows.team.calendarEvents': 'EVENTI IN CALENDARIO',
  'follows.team.a11ySelected': '{label}, selezionato',
  'follows.team.athleteEmpty':
    'Nessun evento in programma. Li aggiungeremo appena annunciati — segui ora e arriveranno nel tuo calendario.',
  'follows.team.teamEmpty':
    'Ancora nessuna partita in programma — le date arrivano qui appena vengono annunciate.',
  'follows.team.removed': 'Rimosso dal tuo calendario',
  'follows.team.added': '{title} aggiunto al tuo calendario',
  'follows.team.restored': 'Ripristinato nel tuo calendario',
  'follows.team.upcomingHeader': 'In programma',
  'follows.team.footer':
    'Tocca Aggiungi per una singola partita, o Segui per averle tutte — puoi rimuovere le singole partite anche dopo.',
  'follows.team.whenCompetition': '{when} · {competition}',

  // ── Fixture hero (photo credit) ───────────────────────────────────
  'follows.hero.photoBy': 'Foto: {artist}',
  'follows.hero.photoCommons': 'Foto: Wikimedia Commons',

  // ── Follow feedback (toasts) ──────────────────────────────────────
  'follows.feedback.followingUpdating':
    'Ora segui {name} — aggiornamento in corso…',
  'follows.feedback.unfollowedUpdating':
    'Hai smesso di seguire {name} — aggiornamento in corso…',
  'follows.feedback.unfollowed': 'Hai smesso di seguire {name}',
  'follows.feedback.calendarOff': 'Ora segui {name} — calendario non collegato',
  'follows.feedback.enable': 'Attiva',
  'follows.feedback.added_one': '{n} partita aggiunta al tuo calendario',
  'follows.feedback.added_other': '{n} partite aggiunte al tuo calendario',
  'follows.feedback.noUpcoming':
    'Ora segui {name} — ancora nessuna partita in programma',

  // ── Coverage notes ─────────────────────────────────────────────────
  'follows.coverage.cricket':
    'Internazionali white-ball e i principali campionati; le serie di Test oltre il County Championship non sono coperte.',
  'follows.coverage.tennis':
    'Il ranking e i giocatori maschili arrivano da un feed di terze parti in tempo reale, e gli orari delle partite maschili arrivano torneo per torneo man mano che si gioca. Ranking, tabelloni e ordine di gioco femminili arrivano direttamente dall’API della WTA. La copertura varia — dove non abbiamo ancora le partite, teniamo le date del torneo.',
  'follows.coverage.athletics':
    'Copertura a livello di meeting. I singoli atleti non si possono ancora seguire — World Athletics pubblica i ranking solo come pagine web, e le start list arrivano quando le federazioni le pubblicano.',
  'follows.coverage.golf':
    'Eventi a livello di round; i tee time non sono tracciati.',
  'follows.coverage.boxing':
    'Gli orari delle card sono l’inizio della trasmissione, non le ring walk. L’elenco dei pugili copre i campioni del mondo e gli sfidanti classificati IBF, più i pugili delle card annunciate.',
  'follows.coverage.ufc':
    'Copertura solo a livello di card. I singoli fighter non si possono seguire: nessuna organizzazione MMA pubblica un roster utilizzabile, quindi un elenco di fighter sarebbe tirare a indovinare — preferiamo essere onesti che sbagliare.',
  'follows.coverage.olympics':
    'I prossimi Giochi sono Los Angeles 2028 (14–30 luglio) e i Giochi invernali di Milano-Cortina nel 2030. Ogni disciplina è già elencata e si può seguire, ma nessun calendario è stato ancora pubblicato — il CIO comunica gli orari delle sessioni a ridosso dei Giochi, quindi un follow fatto oggi consegna i suoi eventi nel momento in cui esistono. Nessun emblema olimpico viene mostrato: i simboli sono protetti da una legislazione dedicata, quindi l’app nomina gli eventi e genera la propria grafica.',

  // The language-switch rewrite notice.
  'calendar.language.rewrite':
    'Aggiornamento degli eventi del calendario in {language}',
  // ── Offset vocabulary (prefs.ts — offsetLabel / short / picker) ────
  'calendar.offset.off': 'Off',
  'calendar.offset.minBefore': '{n} min prima',
  'calendar.offset.daysBefore_one': '{n} giorno prima',
  'calendar.offset.daysBefore_other': '{n} giorni prima',
  'calendar.offset.hoursBefore_one': '{n} ora prima',
  'calendar.offset.hoursBefore_other': '{n} ore prima',
  'calendar.offset.shortMinutes': '{n}m',
  'calendar.offset.shortDays': '{n}d',
  'calendar.offset.shortHours': '{n}h',
  'calendar.offset.pickerMinutes': '{n} min',
  'calendar.offset.pickerDays_one': '{n} giorno',
  'calendar.offset.pickerDays_other': '{n} giorni',
  'calendar.offset.pickerHours_one': '{n} ora',
  'calendar.offset.pickerHours_other': '{n} ore',

  // ── Reminder options (prefs.ts) ────────────────────────────────────
  'calendar.reminder.none': 'Nessuno',
  'calendar.allDayReminder.eveningBefore': 'La sera prima, alle 18',
  'calendar.allDayReminder.eveningBeforeShort': 'Sera prima',
  'calendar.allDayReminder.morningOf': 'La mattina stessa, alle 9',
  'calendar.allDayReminder.morningOfShort': 'Mattina',

  // ── Written INTO calendar events (tournamentTiers.ts / syncPlan.ts) ─
  'calendar.tournament.begins': '{title} inizia',
  'calendar.tournament.finalDay': '{title} — ultimo giorno',
  'calendar.tournament.pointer':
    'Le singole partite si possono aggiungere dalla scheda del torneo nell’app.',
  'calendar.event.timeTbc': 'orario da confermare',
  'calendar.event.postponed': 'rinviato',
  'calendar.event.nominalTimeNote':
    'L’orario di inizio non è ancora confermato — si aggiornerà da solo.',

  // ── Timing explanations (fixtures/domain/timingExplanation.ts) ─────
  'calendar.timing.momentsAgo': 'pochi istanti fa',
  'calendar.timing.minutesAgo': '{n} minuti fa',
  'calendar.timing.hoursAgo_one': '{n} ora fa',
  'calendar.timing.hoursAgo_other': '{n} ore fa',
  'calendar.timing.daysAgo_one': 'ieri',
  'calendar.timing.daysAgo_other': '{n} giorni fa',
  'calendar.timing.confirmOrganiser':
    '{source} non ha ancora confermato l’orario definitivo.',
  'calendar.timing.confirmGeneric':
    'L’orario definitivo non è ancora stato confermato.',
  'calendar.timing.slotNotAnnounced':
    'L’ordine di gioco non è ancora stato annunciato da {source}.',
  'calendar.timing.timeNotAnnounced':
    'L’orario di inizio non è ancora stato annunciato da {source}.',
  'calendar.timing.slotNotPublished':
    'L’ordine di gioco non è ancora stato pubblicato.',
  'calendar.timing.timeNotPublished':
    'L’orario di inizio non è ancora stato pubblicato.',
  'calendar.timing.checked': 'Controllato {ago}',
  'calendar.timing.cancelled': 'Annullato — non si terrà più.',
  'calendar.timing.postponed':
    'Rinviato — nessuna nuova data è stata pubblicata.',
  'calendar.timing.runsOverDays':
    'Dura {n} giorni, quindi nel tuo calendario compare come evento di {n} giorni.',
  'calendar.timing.exactTimeNotSet':
    'L’orario esatto non è ancora fissato, quindi questo copre l’intero evento — {n} giorni.',
  'calendar.timing.dayOnlyAppearance':
    'Si conosce solo il giorno — l’evento resta sulla giornata finché non esce l’ordine di gioco.',
  'calendar.timing.dayOnly':
    'Si conosce solo il giorno, quindi è un evento tutto il giorno e non un orario inventato da noi.',
  'calendar.timing.nominal':
    'L’orario mostrato è quello pubblicato, ma non è ancora quello definitivo.',
  'calendar.timing.provisional':
    'Questo orario è confermato per ora, ma può ancora cambiare.',
  'calendar.timing.willUpdate':
    'Il tuo calendario si aggiorna da solo quando cambia.',
  'calendar.timing.shortCancelled': 'Annullato',
  'calendar.timing.shortPostponed': 'Rinviato — ancora nessuna nuova data',
  'calendar.timing.runsDays': 'Dura {n} giorni',
  'calendar.timing.noOrderOfPlay': 'Nessun ordine di gioco',
  'calendar.timing.noConfirmedTime': 'Nessun orario confermato',
  'calendar.timing.noStartTime': 'Nessun orario di inizio',
  'calendar.timing.subjectFromYet': '{subject} ancora arrivato da {source}',
  'calendar.timing.subjectChecked': '{subject} pubblicato · controllato {ago}',
  'calendar.timing.subjectPublishedYet': '{subject} ancora pubblicato',
  'calendar.timing.shortProvisional': 'Confermato per ora, può ancora cambiare',

  // ── The full card's vocabulary (fixtures/domain/card.ts) ───────────
  'calendar.cardList.fullCard': 'Card completa',
  'calendar.cardList.matches': 'Partite',
  'calendar.cardList.events': 'Eventi',
  'calendar.cardList.alsoOn': 'In programma anche',
  'calendar.cardList.timeWithinEvent':
    'Orario all’interno dell’evento non pubblicato',

  // ── The expanded fixture card (FixtureCard.tsx) ────────────────────
  'calendar.card.loadFailed': 'Impossibile caricare questo evento',
  'calendar.card.titleClose': '{title}. Chiudi',
  'calendar.card.removeFromCalendar': 'Rimuovi dal calendario',
  'calendar.card.addToCalendar': 'Aggiungi al calendario',
  'calendar.card.removeTitleA11y': 'Rimuovi {title} dal tuo calendario',
  'calendar.card.addTitleA11y': 'Aggiungi {title} al tuo calendario',
  'calendar.card.alreadyInCalendar': '{title} è già nel tuo calendario',
  'calendar.card.mens': 'Maschile',
  'calendar.card.womens': 'Femminile',
  'calendar.card.sexChipShown': '{label}: partite mostrate',
  'calendar.card.sexChipHidden': '{label}: partite nascoste',
  'calendar.card.removeAllA11y':
    'Rimuovi tutte le partite elencate dal tuo calendario',
  'calendar.card.addAllA11y':
    'Aggiungi tutte le partite elencate al tuo calendario',
  'calendar.card.removeAll': 'Rimuovi tutte',
  'calendar.card.addAll': 'Aggiungi tutte',
  'calendar.card.reminder': 'Promemoria',
  'calendar.card.optionSelected': '{label}, selezionato',
  'calendar.card.useDefaultReminder': 'Usa il mio promemoria predefinito',
  'calendar.card.colour': 'Colore',
  'calendar.card.colourValue': 'Colore {value}',
  'calendar.card.mainEvent': 'Main event',
  'calendar.card.added': 'Aggiunto',
  'calendar.card.add': 'Aggiungi',
  'calendar.card.close': 'Chiudi',

  // ── Toasts (FixtureCard / ScheduleScreen) ──────────────────────────
  'calendar.toast.removed': 'Rimosso dal tuo calendario',
  'calendar.toast.added': 'Aggiunto al tuo calendario',
  'calendar.toast.restored': 'Ripristinato nel tuo calendario',
  'calendar.toast.undo': 'Annulla',

  // ── Schedule (ScheduleScreen.tsx) ──────────────────────────────────
  'calendar.schedule.emptyHeadline': 'Niente in programma',
  'calendar.schedule.emptyNoFollows':
    'Segui una squadra o una competizione e le sue partite compaiono qui — e nel tuo calendario.',
  'calendar.schedule.emptyWaiting':
    'Le partite compaiono qui appena le date vengono annunciate.',
  'calendar.schedule.hideCalendar': 'Nascondi il calendario',
  'calendar.schedule.showCalendar': 'Mostra il calendario',
  'calendar.schedule.footerOff':
    'Queste partite verranno aggiunte al calendario del telefono appena lo colleghi.',
  'calendar.schedule.footerOn':
    'Tutto questo è nel calendario del tuo telefono e si aggiorna da solo — gli orari si confermano, i rinvii si spostano, gli annullamenti spariscono.',
  'calendar.schedule.showMore': 'Mostra altro',

  // ── Month grid (MonthGrid.tsx) ─────────────────────────────────────
  'calendar.month.previous': 'Mese precedente',
  'calendar.month.next': 'Mese successivo',
  'calendar.month.day': '{day} {month}',
  'calendar.month.dayFixtures_one': '{day} {month}, {n} partita',
  'calendar.month.dayFixtures_other': '{day} {month}, {n} partite',
  'calendar.month.dayRemovedOnly': '{day} {month}, solo partite rimosse',
  // Monday-start weekday initials (lun mar mer gio ven sab dom).
  'calendar.month.mon': 'L',
  'calendar.month.tue': 'M',
  'calendar.month.wed': 'M',
  'calendar.month.thu': 'G',
  'calendar.month.fri': 'V',
  'calendar.month.sat': 'S',
  'calendar.month.sun': 'D',

  // ── Calendar priming (CalendarPrimingScreen.tsx) ───────────────────
  'calendar.priming.title': 'Metti le tue partite nel calendario',
  'calendar.priming.ready_one': '{count} partita pronta da aggiungere.',
  'calendar.priming.ready_other': '{count} partite pronte da aggiungere.',
  'calendar.priming.readyMonth_one':
    '{count} partita pronta da aggiungere — circa {month} nel prossimo mese.',
  'calendar.priming.readyMonth_other':
    '{count} partite pronte da aggiungere — circa {month} nel prossimo mese.',
  'calendar.priming.explainTarget':
    'Le partite vanno in un calendario che scegli tu — tocchiamo solo gli eventi aggiunti da noi',
  'calendar.priming.explainUpdates':
    'Gli eventi si aggiornano da soli quando cambiano gli orari o le partite si spostano',
  'calendar.priming.explainUnfollow':
    'Smetti di seguire e le sue partite spariscono',
  'calendar.priming.denied':
    'L’accesso al calendario è disattivato per KickOffCal. Consentilo in Impostazioni e poi torna qui — le tue partite ti aspettano.',
  'calendar.priming.tryAgain': '{message} Riprova tra un momento.',
  'calendar.priming.googleNote':
    'Su Android la sincronizzazione del calendario richiede l’accesso con Google. Senza, le tue partite vivono nell’app.',
  'calendar.priming.openSettings': 'Apri Impostazioni',
  'calendar.priming.connecting': 'Connessione…',
  'calendar.priming.connectGoogle': 'Collega Google Calendar',
  'calendar.priming.addToMyCalendar': 'Aggiungi al mio calendario',
  'calendar.priming.connectMyCalendar': 'Collega il mio calendario',
  'calendar.priming.notNow': 'Non ora',
  'calendar.priming.addedFixtures_one': '{n} partita aggiunta al tuo calendario',
  'calendar.priming.addedFixtures_other':
    '{n} partite aggiunte al tuo calendario',
  'calendar.priming.connected': 'Calendario collegato',
  'calendar.priming.connectedTitle': 'Il tuo calendario è collegato',
  'calendar.priming.connectedBody':
    'Segui una squadra e le sue partite compaiono lì da sole — gli orari si confermano, i rinvii si spostano, gli annullamenti spariscono. Nient’altro da configurare.',
  'calendar.priming.chooseSports': 'Scegli i tuoi sport',
  'calendar.priming.differentCalendar': 'Usa un altro calendario',

  // ── First-run welcome (onboarding/WelcomeScreen.tsx) ───────────────
  'calendar.welcome.tagline': 'Non perderti neanche una partita.',
  'calendar.welcome.promiseCalendar':
    'Le partite arrivano nel calendario del tuo telefono, in automatico',
  'calendar.welcome.promiseCorrect':
    'Gli orari cambiano, le partite si spostano — il tuo calendario resta corretto',
  'calendar.welcome.promiseNoAccount':
    'Nessun account richiesto — segui e via.',
  'calendar.welcome.getStarted': 'Inizia',

  // ── PreferencesScreen: the accordion's section titles ──────────────
  'settings.sections.calendar': 'Calendario',
  'settings.sections.events': 'Eventi',
  'settings.sections.app': 'App',
  'settings.sections.pastGames': 'Partite passate',
  'settings.sections.dataPrivacy': 'Dati e privacy',
  'settings.sections.a11y': 'Impostazioni {title}',

  // ── Calendar section ───────────────────────────────────────────────
  'settings.calendar.googleReconnectCaption':
    'Nel tuo Google Calendar — tocca per ricollegare l’accesso',
  'settings.calendar.googleReconnectA11y':
    'KickOffCal in Google Calendar. Ricollega l’accesso Google',
  'settings.calendar.googleReconnected': 'Google Calendar ricollegato',
  'settings.calendar.googleConnectedCaption': 'Nel tuo Google Calendar',
  'settings.calendar.googleConnectedA11y': 'KickOffCal in Google Calendar',
  'settings.calendar.disconnectGoogle': 'Scollega Google Calendar',
  'settings.calendar.disconnectCaption':
    'Il tuo calendario e i suoi eventi restano intatti',
  'settings.calendar.googleDisconnected': 'Google Calendar scollegato',
  'settings.calendar.connectGoogle': 'Collega Google Calendar',
  'settings.calendar.connectCaption':
    'Fino ad allora le partite vivono nell’app',
  'settings.calendar.connectLegacyCaption':
    'Le partite già nel tuo calendario restano dove sono',
  'settings.calendar.choose': 'Scegli un calendario',
  'settings.calendar.autoPickedCaption':
    'Scelto in automatico quando colleghi il calendario',
  'settings.calendar.targetA11y':
    'Calendario: {label}. {account}. Cambia dove vengono scritte le partite',
  'settings.calendar.chooseA11y': 'Scegli dove vengono scritte le partite',
  'settings.calendar.colour': 'Colore',
  'settings.calendar.colourA11y': 'Colore del calendario {name}',
  'settings.calendar.colourCaption':
    'Come appaiono gli eventi KickOffCal nell’app calendario del telefono.',
  'settings.calendar.inheritedColour':
    'Le tue partite prendono il colore impostato per {calendar}, che puoi cambiare dalla tua app calendario.',
  'settings.calendar.colourApplied': 'Il colore del calendario ora è {colour}',
  'settings.calendar.colourSaved':
    'Colore salvato — si applica quando colleghi il calendario',
  'settings.calendar.colourRefused':
    'Google Calendar non ha accettato il colore — puoi impostarlo nell’app Google Calendar',
  // The calendar-name fallback when no target is stored yet.
  'settings.words.yourCalendar': 'il tuo calendario',

  // Colour names — read out and toasted, so they are copy, not config.
  'settings.colours.kickoffcalBlue': 'Blu KickOffCal',
  'settings.colours.red': 'Rosso',
  'settings.colours.orange': 'Arancione',
  'settings.colours.green': 'Verde',
  'settings.colours.teal': 'Verde acqua',
  'settings.colours.purple': 'Viola',
  'settings.colours.pink': 'Rosa',
  'settings.colours.graphite': 'Grafite',

  // ── Events section ─────────────────────────────────────────────────
  'settings.events.footnote':
    'Gli eventi con orario vanno dal calcio d’inizio al fischio finale. Le modifiche si applicano a ogni partita sincronizzata alla prossima sincronizzazione.',
  'settings.events.style': 'Formato eventi',
  'settings.events.timed': 'Con orario',
  'settings.events.allDay': 'Tutto il giorno',
  'settings.events.raceWeekends': 'Weekend di gara',
  'settings.events.allSessions': 'Tutte le sessioni',
  'settings.events.raceOnly': 'Solo gara',
  'settings.events.block': 'Solo date',
  'settings.events.keyRounds': 'Turni chiave',
  'settings.events.allMatches': 'Tutte le partite',

  // ── Reminders section ──────────────────────────────────────────────
  'settings.reminders.title': 'Promemoria',
  'settings.reminders.footnote': 'Le modifiche si applicano alla prossima sincronizzazione.',
  'settings.reminders.daysWithoutDates': 'Giorni senza orario',
  'settings.reminders.slotA11y': 'Promemoria {n}, {value}',
  'settings.reminders.slotValueA11y': 'Valore del promemoria {n}',
  'settings.reminders.slotUnitA11y': 'Unità del promemoria {n}',
  'settings.reminders.off': 'Off',
  'settings.reminders.on': 'Attivo',
  'settings.reminders.minutes': 'Minuti',
  'settings.reminders.hours': 'Ore',

  // ── App section ────────────────────────────────────────────────────
  'settings.app.appearance': 'Aspetto',
  'settings.app.auto': 'Auto',
  'settings.app.light': 'Chiaro',
  'settings.app.dark': 'Scuro',
  'settings.app.region': 'Area geografica',
  'settings.app.regionA11y':
    'Area geografica: {value}. Cambia area geografica',

  // ── Region (Preferences value row + RegionScreen) ──────────────────
  'settings.region.matchDevice': 'Come il mio dispositivo ({region})',
  'settings.region.default': 'Predefinita',
  'settings.region.note':
    'L’area geografica cambia l’ordine in cui compaiono sport e competizioni, e il nome di alcune di esse — mai quello che puoi seguire. La posizione non viene usata.',

  // ── Past games section ─────────────────────────────────────────────
  'settings.past.footnote':
    'Vengono rimosse solo le partite aggiunte da KickOffCal, e solo quelle di cui ha ancora traccia. Tornare indietro ferma le rimozioni future — non riporta ciò che è già stato eliminato.',
  'settings.past.keep': 'Tieni le partite passate nel mio calendario',
  'settings.past.remove': 'Rimuovile {days} giorni dopo la fine',

  // ── Data & privacy rows ────────────────────────────────────────────
  'settings.privacy.erase': 'Cancella gli eventi sincronizzati',
  'settings.privacy.eraseOwnTarget':
    'Rimuove gli eventi che KickOffCal ha aggiunto dentro {calendar}, compresi quelli passati. Il resto non viene toccato.',
  'settings.privacy.eraseOurs':
    'Rimuove il calendario KickOffCal e tutti i suoi eventi — compresi quelli passati. Il resto del tuo calendario non viene toccato.',
  'settings.privacy.eraseResync':
    'Se la sincronizzazione resta attiva, gli eventi futuri verranno aggiunti di nuovo.',
  'settings.privacy.eraseAction': 'Cancella',
  'settings.privacy.eraseFailed_one':
    'Impossibile rimuovere {n} evento — riprova',
  'settings.privacy.eraseFailed_other':
    'Impossibile rimuovere {n} eventi — riprova',
  'settings.privacy.nothingToErase': 'Niente di sincronizzato da cancellare',
  'settings.privacy.erased': 'Eventi sincronizzati cancellati',
  'settings.privacy.deleteTitle': 'Elimina i miei dati e resetta',
  'settings.privacy.deleteA11y': 'Elimina i miei dati e resetta',
  'settings.privacy.deleteBody':
    'Rimuove tutto ciò che questa app sa di te — follow, impostazioni e la registrazione sul server — e riparte da zero.',
  'settings.privacy.alsoErase':
    'Cancella anche gli eventi sincronizzati dal mio calendario',
  'settings.privacy.cantUndo': 'Questa azione non si può annullare.',
  'settings.privacy.deleteAction': 'Elimina',
  'settings.privacy.deleteMyData': 'Elimina i miei dati',

  // ── Screen tail (Preferences) ──────────────────────────────────────
  'settings.tail.photoCredits': 'Crediti fotografici',
  'settings.status.underHourAgo': 'meno di un’ora fa',
  'settings.status.hoursAgo': '{n}h fa',
  'settings.status.daysAgo': '{n}g fa',
  'settings.status.deviceNotSynced':
    'Questo dispositivo: ancora nessuna sincronizzazione',
  'settings.status.deviceSynced':
    'Ultima sincronizzazione di questo dispositivo: {when}',
  'settings.status.nothingFollowed':
    'Fonti partite: non segui ancora niente',
  'settings.status.freshnessUnknown':
    'Fonti partite: stato di aggiornamento sconosciuto',
  'settings.status.sourcesConfirmed':
    'Ultima conferma delle fonti partite: {when}',

  // ── CalendarTargetScreen ───────────────────────────────────────────
  'settings.target.connectFirst':
    'Collega prima il tuo calendario e KickOffCal sceglierà da solo il posto migliore per le tue partite. Poi potrai cambiarlo qui.',
  'settings.target.putGames': 'Metti le tue partite nel calendario',
  'settings.target.connectA11y': 'Collega il tuo calendario',
  'settings.target.goTo': 'Dove vanno le partite',
  'settings.target.moving_one': 'Spostamento di {n} partita… {moved}/{n}',
  'settings.target.moving_other': 'Spostamento di {n} partite… {moved}/{n}',
  'settings.target.reading': 'Lettura dei tuoi calendari…',
  'settings.target.ownCalendarHeader': 'Calendario dedicato',
  'settings.target.newInSource': 'Nuovo calendario KickOffCal in {source}',
  'settings.target.newOnDevice':
    'Nuovo calendario KickOffCal su questo dispositivo',
  'settings.target.keepsSeparate':
    'Tiene le partite separate dai tuoi eventi',
  'settings.target.writeToA11y': 'Usa {calendar} per le partite',
  'settings.target.moved_one': '{n} partita spostata in {calendar}',
  'settings.target.moved_other': '{n} partite spostate in {calendar}',
  'settings.target.nowGoTo': 'Le partite ora vanno in {calendar}',
  'settings.target.scopePromise':
    'Qualunque tu scelga, KickOffCal aggiunge, modifica o rimuove solo le partite che ha messo lì. Passando da uno di questi calendari all’altro, quelle partite si spostano con te.',

  // ── CreditsScreen ──────────────────────────────────────────────────
  'settings.credits.intro':
    'Le fotografie vengono da Wikimedia Commons con licenze che ne permettono il riuso. Qui sotto ognuna è attribuita al suo fotografo.',
  'settings.credits.openSportsDbA11y': 'Apri TheSportsDB',
  'settings.credits.sportsDb':
    'I dati degli eventi di diversi sport vengono da TheSportsDB (thesportsdb.com).',
  'settings.credits.none': 'Ancora nessuna fotografia caricata.',
  'settings.credits.openSourceA11y': 'Apri la pagina della fonte di {subject}',
  'settings.credits.source': 'fonte',
  'settings.credits.openLicenceA11y':
    'Apri le informazioni sulle licenze di Wikimedia Commons',
  'settings.credits.aboutLicences': 'Informazioni su queste licenze',

  // ── Round 5 Stage 2: premium states, notification reminders, registry notice ──
  'premium.syncRow': 'Parte di Premium · Inizia 14 giorni gratis',
  'premium.lockA11y': 'Funzione Premium',
  'notifications.off': 'Le notifiche sono disattivate',
  'notifications.openSettings': 'Apri Impostazioni',
  'reminders.notify': 'Avvisami prima delle partite',
  'reminders.notification.body': 'Inizia tra {when}',
  'registry.ceiling': 'Aggiornamenti in background in pausa: troppi seguiti',

  // ── Round 5 Stage 3: paywall, purchase outcomes, subscription state ──
  'paywall.headline': 'Sincronizza con il tuo calendario',
  'paywall.lockSync': 'Ogni partita nel tuo calendario, sempre aggiornata',
  'paywall.lockReminders': 'Tre promemoria',
  'paywall.lockColour': 'Colore del calendario',
  'paywall.trialBadge': '14 giorni gratis',
  'paywall.monthly': 'Mensile',
  'paywall.annual': 'Annuale',
  'paywall.pricePerMonth': '{price} / mese',
  'paywall.pricePerYear': '{price} / anno',
  'paywall.annualSaving': 'Risparmia il {percent}%',
  'paywall.startTrial': 'Inizia la prova gratuita',
  'paywall.subscribe': 'Abbonati',
  'paywall.restore': 'Ripristina acquisto',
  'paywall.notNow': 'Continua con Free',
  'paywall.renewal': 'Si rinnova automaticamente. Annulla quando vuoi.',
  'paywall.trialRenewal': 'Gratis per 14 giorni, poi {price} / anno. Si rinnova automaticamente. Annulla quando vuoi.',
  'paywall.terms': 'Termini',
  'paywall.privacy': 'Privacy',
  'paywall.unavailable': 'Store non disponibile al momento',
  'purchase.pending': 'In attesa di approvazione',
  'purchase.failed': 'Acquisto non completato',
  'restore.found': 'Abbonamento ripristinato',
  'restore.none': 'Nessun abbonamento da ripristinare',
  'entitlement.trialDaysLeft': '{n} giorni rimasti',
  'entitlement.trialDaysLeft.one': '1 giorno rimasto',
  'entitlement.manage': 'Gestisci abbonamento',
  'entitlement.premium': 'Premium',
  'deleteData.subscriptionNote': 'Eliminare i tuoi dati non annulla un abbonamento.',

  // ── Round 6 item 2: people rows advertise the tap ──
  'follows.athletes.tapToFollow': 'Tocca per seguire {people} ({n})',
  'follows.athletes.tapToFollowNoCount': 'Tocca per seguire {people}',
};
