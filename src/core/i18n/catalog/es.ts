// Spanish catalog — complete, typed against the English KEY AUTHORITY
// (the Catalog type makes a missing key a compile error; the i18n
// parity test pins every {placeholder} verbatim).
//
// Register: informal, modern consumer-app Spanish (tú), vocabulary kept
// neutral so es-ES and es-419 both read naturally. Brand names,
// competition proper nouns, {placeholders}, '·' separators and emoji
// stay untranslated. Section comments mirror the English modules.

import type { Catalog } from '../index';

export const es: Catalog = {
  // ════════════════════════════════════════════════════════════════════
  // core (mirrors en/core.ts)
  // ════════════════════════════════════════════════════════════════════

  // ── Sport schedule vocabulary (sportTerms.fixturesWordFor +
  // CompetitionCard's expansion pair) ────────────────────────────────
  'core.fixtures': 'Partidos',
  'core.teams': 'Equipos',
  'core.fights': 'Peleas',
  'core.matches': 'Partidos',
  'core.tournaments': 'Torneos',
  'core.events': 'Eventos',

  // ── Sport NAMES (Phase C language layer) ───────────────────────────
  'core.sport.soccer': 'Fútbol',
  'core.sport.cricket': 'Críquet',
  'core.sport.ice-hockey': 'Hockey sobre hielo',
  'core.sport.tennis': 'Tenis',
  'core.sport.athletics': 'Atletismo',
  'core.sport.basketball': 'Baloncesto',
  'core.sport.baseball': 'Béisbol',
  'core.sport.nfl': 'Fútbol americano',
  'core.sport.rugby': 'Rugby',
  'core.sport.golf': 'Golf',
  'core.sport.f1': 'Fórmula 1',
  'core.sport.boxing': 'Boxeo',
  'core.sport.ufc': 'MMA',
  'core.sport.motorsport': 'Automovilismo',
  'core.sport.olympics': 'Juegos Olímpicos',

  // ── Screen titles (App.tsx headers — the BrandTitle voice) ─────────
  'core.followType.team': 'equipo',
  'core.followType.competition': 'competición',
  'core.followType.athlete': 'atleta',
  'core.followType.series': 'serie',
  'core.title.home': 'Inicio',
  'core.title.following': 'Siguiendo',
  'core.title.schedule': 'Agenda',
  'core.title.yourCalendar': 'Tu calendario',
  'core.title.search': 'Buscar',
  'core.title.sports': 'Deportes',
  'core.title.competitions': 'Competiciones',
  'core.title.athletes': 'Atletas',
  'core.title.preferences': 'Preferencias',
  'core.title.region': 'Región',
  'core.title.calendar': 'Calendario',
  'core.title.photoCredits': 'Créditos de fotos',

  // ── when.ts: the hardcoded English words ───────────────────────────
  'core.when.today': 'Hoy',
  'core.when.tomorrow': 'Mañana',
  'core.when.todayHeading': 'Hoy · {date}',
  'core.when.tomorrowHeading': 'Mañana · {date}',
  'core.when.postponed': 'Aplazado',
  'core.when.timeTbc': 'Por confirmar',
  // Countdown chips stay urgency-caps, with proper Spanish accents.
  'core.when.countdownToday': 'HOY',
  'core.when.countdownTomorrow': 'MAÑANA',
  'core.when.countdownInDays': 'EN {n} DÍAS',

  // ── Shared components (components.tsx / cardExpansion.tsx) ────────
  'core.rail.openA11y': '{label}, {caption}. Ver sus partidos',
  'core.a11y.openEvent': '{label}. Abrir evento',
  'core.hero.nextUpA11y': 'Próximo: {title}, {when}',
  'core.row.removedFromCalendar': 'quitado del calendario',
  'core.row.removedCaption': 'Quitado — no está en tu calendario',
  'core.row.addToCalendarA11y': 'Añadir {title} a tu calendario',
  'core.row.removeFromCalendarA11y': 'Quitar {title} de tu calendario',
  'core.row.restoreToCalendarA11y': 'Restaurar {title} en tu calendario',
  'core.actions.add': 'Añadir',
  'core.actions.added': 'Añadido',
  'core.actions.remove': 'Quitar',
  'core.actions.removed': 'Quitado',
  'core.actions.cancel': 'Cancelar',
  'core.follow.follow': 'Seguir',
  'core.follow.following': 'Siguiendo',
  'core.follow.followA11y': 'Seguir a {subject}',
  'core.follow.unfollowA11y': 'Dejar de seguir a {subject}',
  'core.expansion.closeA11y': 'Cerrar',

  // ── Sync status chip + its relative times ──────────────────────────
  'core.status.justNow': 'ahora mismo',
  'core.status.minsAgo': 'hace {n} min',
  'core.status.hoursAgo_one': 'hace 1 hora',
  'core.status.hoursAgo_other': 'hace {n} horas',
  'core.status.daysAgo_one': 'ayer',
  'core.status.daysAgo_other': 'hace {n} días',
  'core.status.checking': 'Buscando partidos…',
  'core.status.updating': 'Actualizando tu calendario…',
  'core.status.sourcesQuiet':
    'Fuentes de partidos sin novedades desde hace {n}d — los datos pueden ir atrasados',
  'core.status.calendarOff': 'Sincronización de calendario desactivada',
  'core.status.upToDateCalendarOff': 'Partidos al día · calendario desactivado',
  'core.status.notSynced': 'Aún sin sincronizar',
  'core.status.updated': 'Calendario actualizado · {changes} · {when}',
  'core.status.changes_one': '{n} cambio',
  'core.status.changes_other': '{n} cambios',
  'core.status.upToDate': 'Calendario al día · comprobado {when}',

  // ── Calendar-off banner ────────────────────────────────────────────
  'core.banner.fixturesReady_one': '{n} partido listo para añadir',
  'core.banner.fixturesReady_other': '{n} partidos listos para añadir',
  'core.banner.fixturesWhenConnected':
    'Los partidos se añadirán cuando conectes tu calendario',
  'core.banner.addA11y': 'Añadir partidos a mi calendario',

  // ── Coverage note disclosure ───────────────────────────────────────
  'core.coverage.showA11y': 'Qué cubre esto',
  'core.coverage.hideA11y': 'Ocultar qué cubre esto',
  'core.coverage.closedLabel': 'ⓘ  Qué cubre esto',
  'core.coverage.openLabel': 'ⓘ  Qué cubre esto ▲',

  // ════════════════════════════════════════════════════════════════════
  // follows (mirrors en/follows.ts)
  // ════════════════════════════════════════════════════════════════════

  // ── Search entry (Home's bar + the Search screen share these) ─────
  'follows.search.a11y': 'Buscar equipos, atletas, competiciones y deportes',
  'follows.search.placeholder': 'Equipo, atleta, competición o deporte',

  // ── Home ──────────────────────────────────────────────────────────
  'follows.home.emptyHeadline': 'Aún no hay nada programado',
  'follows.home.emptyBody':
    'Los partidos llegan aquí — y a tu calendario — en cuanto se anuncian las fechas.',
  'follows.home.welcomeHeadline': 'No te pierdas ni un partido',
  'follows.home.welcomeBody':
    'Sigue equipos, competiciones y series. Sus partidos aparecen en tu calendario y se mantienen al día por sí solos.',
  'follows.home.nothingScheduled': 'Nada programado',
  'follows.home.addSports': 'Añadir deportes',
  'follows.home.chooseSport': 'Elige un deporte',
  'follows.home.oneFollow': 'Un solo seguimiento',
  'follows.home.browse': 'Explorar',
  'follows.following': 'Siguiendo',
  'follows.sports.a11yComingSoon': '{name}, próximamente',

  // ── Sport picker ──────────────────────────────────────────────────
  'follows.sportPicker.allEventsOneFollow':
    'Todos los eventos · un solo seguimiento',
  'follows.sportPicker.comingSoon': 'Próximamente',

  // ── Following (manage) ────────────────────────────────────────────
  'follows.following.captionNoUpcoming': '{sport} · aún sin próximos partidos',
  'follows.following.captionUpcoming_one': '{sport} · {n} próximo',
  'follows.following.captionUpcoming_other': '{sport} · {n} próximos',
  'follows.following.a11yUndo': 'Deshacer dejar de seguir a {name}',
  'follows.following.emptyHeadline': 'Aún no sigues nada',
  'follows.following.emptyBody':
    'Elige un deporte en Inicio o explora todo aquí.',
  'follows.following.browseSports': 'Explorar deportes',
  'follows.following.a11yRow': '{name}, {type} que sigues. Ver sus partidos',
  'follows.following.a11yAddMore': 'Añadir más deportes',
  'follows.following.addMore': '+ Añadir más',
  'follows.undo': 'Deshacer',

  // ── Cards (CompetitionCard + tile rows across browse/search) ──────
  'follows.card.a11ySummary': '{name}, {caption}',
  'follows.card.a11yViewFixtures': '{name}, ver partidos',
  'follows.card.a11yDestination': '{name} {label}',

  // ── Competition browse (LeagueList) ───────────────────────────────
  'follows.league.teamCount_one': '{country} · {n} equipo',
  'follows.league.teamCount_other': '{country} · {n} equipos',
  'follows.league.tapTournaments': 'Toca para seguir torneos',
  'follows.league.tapTournamentsCount': 'Toca para seguir torneos ({count})',
  'follows.league.tapTeams': '{country} · Toca para seguir equipos · {fixtures}',
  'follows.league.tapTeamsCount':
    '{country} · Toca para seguir equipos ({count}) · {fixtures}',
  'follows.league.searchCompsTeams': 'Buscar competiciones y equipos',
  'follows.league.searchComps': 'Buscar competiciones',
  'follows.league.noMatches': 'Nada aquí coincide con “{query}”.',
  'follows.league.allEvents': 'Todos los eventos',
  'follows.league.everyEventOnTour': 'Todos los eventos del circuito',
  'follows.tournaments.navTitle': 'Torneos {tour}',

  // ── Athlete browse ────────────────────────────────────────────────
  'follows.athletes.fighters': 'Peleadores',
  'follows.athletes.players': 'Jugadores',
  'follows.athletes.drivers': 'Pilotos',
  'follows.athletes.athletes': 'Atletas',
  'follows.athletes.caption': 'Rankings, campeones y quién compite',
  'follows.athletes.a11yBrowse': 'Explorar {athletes}',
  'follows.athletes.a11yBrowseTourPlayers': 'Explorar jugadores {tour}',
  'follows.athletes.champion': 'Campeón · {orgs}',
  'follows.athletes.rank': '#{rank}',
  'follows.athletes.competes': 'Compite {date}',
  'follows.athletes.competingSoon': 'Compite pronto',
  'follows.athletes.mens': 'Masculino',
  'follows.athletes.womens': 'Femenino',
  'follows.boxing.sectionMens': 'Boxeo — Masculino',
  'follows.boxing.sectionWomens': 'Boxeo — Femenino',
  'follows.boxing.mensTitle': 'Boxeo masculino',
  'follows.boxing.womensTitle': 'Boxeo femenino',
  'follows.athletes.searchPlaceholder': 'Buscar atletas de {sport}',
  'follows.athletes.noneMatch': 'Ningún atleta coincide con ese nombre.',
  'follows.athletes.noneYet':
    'Aún no hay atletas aquí — llegan a medida que se publican los rankings y las inscripciones.',
  'follows.athletes.a11yShowFewer': 'Mostrar menos en {section}',
  'follows.athletes.a11yShowAll': 'Mostrar los {n} de {section}',
  'follows.athletes.showFewer': 'Mostrar menos',
  'follows.athletes.showAll': 'Mostrar los {n}',
  'follows.athletes.a11yOpenPage': '{name}, abrir página del atleta',

  // ── Tennis browse (domain/tennisBrowse.ts + LeagueList sections) ──
  'follows.tennis.atpTitle': 'ATP — Masculino',
  'follows.tennis.wtaTitle': 'WTA — Femenino',
  'follows.tennis.noteAtp':
    'Las fechas de los torneos salen del calendario del circuito, y los ' +
    'horarios de los partidos llegan cuando se publica cada cuadro — ' +
    'todo se construye a partir de un feed de rankings y se revisa a ' +
    'mano, así que de vez en cuando un partido llega tarde en lugar de ' +
    'llegar mal. Los 50 primeros aparecen por ranking, el resto de la A ' +
    'a la Z; hay 500 buscables.',
  'follows.tennis.noteWta':
    'La cobertura más completa que tenemos: torneos, cuadros y orden de ' +
    'juego del feed de la propia WTA, así que cada partido aparece con ' +
    'la rival en cuanto se sortea el cuadro y se ajusta a la hora ' +
    'exacta cuando se publica el horario.',
  'follows.tennis.allFourMajors': 'Los cuatro Grand Slam',
  // Mid-sentence form (the Follow control's subject).
  'follows.tennis.allFourMajorsSubject': 'los cuatro Grand Slam',
  'follows.tennis.otherTournaments': 'Otros torneos',
  'follows.tennis.tournamentCount_one': '{n} torneo',
  'follows.tennis.tournamentCount_other': '{n} torneos',
  'follows.tennis.dateRange': '{start} – {end}',

  // ── Olympics browse ───────────────────────────────────────────────
  'follows.olympics.summer': 'Verano',
  'follows.olympics.winter': 'Invierno',
  'follows.olympics.seasonOlympics': 'Juegos Olímpicos de {season}',
  'follows.olympics.tapForSports': '{edition} · Toca para ver deportes · pruebas',
  'follows.olympics.seasonSports': 'Deportes de {season}',
  'follows.olympics.seasonGames': 'Juegos de {season}',
  'follows.olympics.games': 'Juegos',
  'follows.browse.sports': 'Deportes',

  // ── Search screen ─────────────────────────────────────────────────
  'follows.search.sport': 'Deporte',
  'follows.search.athlete': 'Atleta',
  'follows.search.captionCompetition': '{country} · {sport}',
  'follows.search.captionTeam': '{league} · {sport}',
  'follows.search.captionTournament': 'Torneo · {sport}',
  'follows.search.noMatches':
    'Nada que puedas seguir coincide con “{query}” — la búsqueda cubre los deportes y ligas que KickOffCal ofrece hoy.',
  'follows.search.searching': 'Buscando…',
  'follows.search.results': 'Resultados',
  'follows.search.competitions': 'Competiciones',

  // ── Team browse (TeamList) ────────────────────────────────────────
  'follows.teams.a11ySearchIn': 'Buscar equipos en {league}',
  'follows.teams.searchPlaceholder': 'Buscar equipos',

  // ── Entity page (TeamScreen) ──────────────────────────────────────
  'follows.team.upcoming_one': '{n} próximo',
  'follows.team.upcoming_other': '{n} próximos',
  'follows.team.calendarEvents': 'EVENTOS DEL CALENDARIO',
  'follows.team.a11ySelected': '{label}, seleccionado',
  'follows.team.athleteEmpty':
    'No hay eventos programados. Los añadiremos cuando se anuncien — toca Seguir ahora y llegarán a tu calendario.',
  'follows.team.teamEmpty':
    'Aún no hay próximos partidos — las fechas llegan aquí en cuanto se anuncian.',
  'follows.team.removed': 'Quitado de tu calendario',
  'follows.team.added': 'Se añadió {title} a tu calendario',
  'follows.team.restored': 'Restaurado en tu calendario',
  'follows.team.upcomingHeader': 'Próximos',
  'follows.team.footer':
    'Toca Añadir para un solo partido, o Seguir para todos — después puedes quitar partidos sueltos.',
  'follows.team.whenCompetition': '{when} · {competition}',

  // ── Fixture hero (photo credit) ───────────────────────────────────
  'follows.hero.photoBy': 'Foto: {artist}',
  'follows.hero.photoCommons': 'Foto: Wikimedia Commons',

  // ── Follow feedback (toasts) ──────────────────────────────────────
  'follows.feedback.followingUpdating': 'Siguiendo a {name} — actualizando…',
  'follows.feedback.unfollowedUpdating':
    'Dejaste de seguir a {name} — actualizando…',
  'follows.feedback.unfollowed': 'Dejaste de seguir a {name}',
  'follows.feedback.calendarOff':
    'Siguiendo a {name} — el calendario está desactivado',
  'follows.feedback.enable': 'Activar',
  'follows.feedback.added_one': 'Se añadió {n} partido a tu calendario',
  'follows.feedback.added_other': 'Se añadieron {n} partidos a tu calendario',
  'follows.feedback.noUpcoming':
    'Siguiendo a {name} — aún sin próximos partidos',

  // ── Coverage notes (verbatim from sportsConfig) ───────────────────
  'follows.coverage.cricket':
    'Internacionales de pelota blanca y las principales ligas; no se cubren las series de Test más allá del County Championship.',
  'follows.coverage.tennis':
    'Los rankings y jugadores masculinos vienen de un feed externo en vivo, y los horarios de los partidos masculinos llegan torneo a torneo según se juega cada uno. Los rankings, cuadros y orden de juego femeninos vienen de la API de la propia WTA. La cobertura varía — donde aún no tenemos los partidos, mantenemos las fechas del torneo.',
  'follows.coverage.athletics':
    'Cobertura a nivel de meeting. Aún no se puede seguir a atletas individuales — World Athletics publica sus rankings solo como páginas web, y las listas de salida llegan cuando las federaciones las publican.',
  'follows.coverage.golf':
    'Eventos a nivel de ronda; no se siguen los horarios de salida.',
  'follows.coverage.boxing':
    'Los horarios de cada cartelera son el inicio de la transmisión, no las caminatas al ring. El directorio de peleadores cubre a los campeones del mundo y a los aspirantes del ranking IBF, más los peleadores de carteleras anunciadas.',
  'follows.coverage.ufc':
    'Cobertura solo a nivel de cartelera. No se puede seguir a peleadores individuales: ningún organismo de MMA publica un plantel utilizable, así que un directorio de peleadores sería pura conjetura — preferimos ser honestos antes que equivocarnos.',
  'follows.coverage.olympics':
    'Los próximos Juegos son Los Ángeles 2028 (14–30 de julio) y los Juegos de invierno de Milano-Cortina en 2030. Todas las disciplinas ya están listadas y se pueden seguir, pero aún no se ha publicado ningún horario — el COI publica los horarios de las sesiones cuando se acercan los Juegos, así que un seguimiento hecho hoy entrega sus eventos en el momento en que existen. No se muestran emblemas olímpicos: esas marcas están protegidas por legislación específica, así que la app nombra los eventos y genera sus propias ilustraciones.',

  // ════════════════════════════════════════════════════════════════════
  // calendar (mirrors en/calendar.ts)
  // ════════════════════════════════════════════════════════════════════

  // The language-switch rewrite notice.
  'calendar.language.rewrite':
    'Actualizando los eventos de tu calendario a {language}',
  // ── Offset vocabulary (prefs.ts — offsetLabel / short / picker) ────
  'calendar.offset.off': 'No',
  'calendar.offset.minBefore': '{n} min antes',
  'calendar.offset.daysBefore_one': '{n} día antes',
  'calendar.offset.daysBefore_other': '{n} días antes',
  'calendar.offset.hoursBefore_one': '{n} hora antes',
  'calendar.offset.hoursBefore_other': '{n} horas antes',
  'calendar.offset.shortMinutes': '{n}m',
  'calendar.offset.shortDays': '{n}d',
  'calendar.offset.shortHours': '{n}h',
  'calendar.offset.pickerMinutes': '{n} m',
  'calendar.offset.pickerDays_one': '{n} día',
  'calendar.offset.pickerDays_other': '{n} días',
  'calendar.offset.pickerHours_one': '{n} h',
  'calendar.offset.pickerHours_other': '{n} h',

  // ── Reminder options (prefs.ts) ────────────────────────────────────
  'calendar.reminder.none': 'Ninguno',
  'calendar.allDayReminder.eveningBefore': 'La víspera, 18:00',
  'calendar.allDayReminder.eveningBeforeShort': 'Víspera',
  'calendar.allDayReminder.morningOf': 'Esa misma mañana, 9:00',
  'calendar.allDayReminder.morningOfShort': 'Esa mañana',

  // ── Written INTO calendar events (tournamentTiers.ts / syncPlan.ts) ─
  'calendar.tournament.begins': '{title} comienza',
  'calendar.tournament.finalDay': '{title} — último día',
  'calendar.tournament.pointer':
    'Los partidos individuales se pueden añadir desde la ficha del torneo en la app.',
  'calendar.event.timeTbc': 'hora por confirmar',
  'calendar.event.postponed': 'aplazado',
  'calendar.event.nominalTimeNote':
    'La hora de inicio aún no está confirmada — se actualizará automáticamente.',

  // ── Timing explanations (fixtures/domain/timingExplanation.ts) ─────
  'calendar.timing.momentsAgo': 'hace un momento',
  'calendar.timing.minutesAgo': 'hace {n} minutos',
  'calendar.timing.hoursAgo_one': 'hace {n} hora',
  'calendar.timing.hoursAgo_other': 'hace {n} horas',
  'calendar.timing.daysAgo_one': 'ayer',
  'calendar.timing.daysAgo_other': 'hace {n} días',
  'calendar.timing.confirmOrganiser':
    '{source} aún no ha confirmado la hora definitiva.',
  'calendar.timing.confirmGeneric':
    'La hora definitiva aún no se ha confirmado.',
  'calendar.timing.slotNotAnnounced':
    '{source} aún no ha anunciado el orden de juego.',
  'calendar.timing.timeNotAnnounced':
    '{source} aún no ha anunciado la hora de inicio.',
  'calendar.timing.slotNotPublished':
    'El orden de juego aún no se ha publicado.',
  'calendar.timing.timeNotPublished':
    'La hora de inicio aún no se ha publicado.',
  'calendar.timing.checked': 'Comprobado {ago}',
  'calendar.timing.cancelled': 'Cancelado — ya no tendrá lugar.',
  'calendar.timing.postponed':
    'Aplazado — aún no se ha publicado una nueva fecha.',
  'calendar.timing.runsOverDays':
    'Dura {n} días, así que aparece en tu calendario como un evento de {n} días.',
  'calendar.timing.exactTimeNotSet':
    'La hora exacta aún no está fijada, así que esto cubre el evento completo — {n} días.',
  'calendar.timing.dayOnlyAppearance':
    'Solo se conoce el día — se queda en ese día hasta que se publique el orden de juego.',
  'calendar.timing.dayOnly':
    'Solo se conoce el día, así que esto es una entrada de todo el día en vez de una hora inventada.',
  'calendar.timing.nominal':
    'La hora que se muestra es el inicio publicado, pero todavía no es la definitiva.',
  'calendar.timing.provisional':
    'Esta hora está confirmada por ahora, pero aún puede moverse.',
  'calendar.timing.willUpdate':
    'Tu calendario se actualiza solo cuando cambia.',
  'calendar.timing.shortCancelled': 'Cancelado',
  'calendar.timing.shortPostponed': 'Aplazado — aún sin nueva fecha',
  'calendar.timing.runsDays': 'Dura {n} días',
  'calendar.timing.noOrderOfPlay': 'Sin orden de juego',
  'calendar.timing.noConfirmedTime': 'Sin hora confirmada',
  'calendar.timing.noStartTime': 'Sin hora de inicio',
  'calendar.timing.subjectFromYet': '{subject} de {source} todavía',
  'calendar.timing.subjectChecked': '{subject} todavía · comprobado {ago}',
  'calendar.timing.subjectPublishedYet': '{subject} todavía',
  'calendar.timing.shortProvisional': 'Confirmada por ahora, puede moverse',

  // ── The full card's vocabulary (fixtures/domain/card.ts) ───────────
  'calendar.cardList.fullCard': 'Cartelera completa',
  'calendar.cardList.matches': 'Partidos',
  'calendar.cardList.events': 'Eventos',
  'calendar.cardList.alsoOn': 'También en el programa',
  'calendar.cardList.timeWithinEvent': 'Hora dentro del evento sin publicar',

  // ── The expanded fixture card (FixtureCard.tsx) ────────────────────
  'calendar.card.loadFailed': 'No se pudo cargar este evento',
  'calendar.card.titleClose': '{title}. Cerrar',
  'calendar.card.removeFromCalendar': 'Quitar del calendario',
  'calendar.card.addToCalendar': 'Añadir al calendario',
  'calendar.card.removeTitleA11y': 'Quitar {title} de tu calendario',
  'calendar.card.addTitleA11y': 'Añadir {title} a tu calendario',
  'calendar.card.alreadyInCalendar': '{title} ya está en tu calendario',
  'calendar.card.mens': 'Masculino',
  'calendar.card.womens': 'Femenino',
  'calendar.card.sexChipShown': '{label}: partidos visibles',
  'calendar.card.sexChipHidden': '{label}: partidos ocultos',
  'calendar.card.removeAllA11y':
    'Quitar todos los partidos listados de tu calendario',
  'calendar.card.addAllA11y':
    'Añadir todos los partidos listados a tu calendario',
  'calendar.card.removeAll': 'Quitar todos',
  'calendar.card.addAll': 'Añadir todos',
  'calendar.card.reminder': 'Recordatorio',
  'calendar.card.optionSelected': '{label}, seleccionado',
  'calendar.card.useDefaultReminder': 'Usar mi recordatorio predeterminado',
  'calendar.card.colour': 'Color',
  'calendar.card.colourValue': 'Color {value}',
  'calendar.card.mainEvent': 'Evento estelar',
  'calendar.card.added': 'Añadido',
  'calendar.card.add': 'Añadir',
  'calendar.card.close': 'Cerrar',

  // ── Toasts (FixtureCard / ScheduleScreen) ──────────────────────────
  'calendar.toast.removed': 'Quitado de tu calendario',
  'calendar.toast.added': 'Añadido a tu calendario',
  'calendar.toast.restored': 'Restaurado en tu calendario',
  'calendar.toast.undo': 'Deshacer',

  // ── Schedule (ScheduleScreen.tsx) ──────────────────────────────────
  'calendar.schedule.emptyHeadline': 'Nada en la agenda',
  'calendar.schedule.emptyNoFollows':
    'Sigue a un equipo o una competición y sus partidos aparecerán aquí — y en tu calendario.',
  'calendar.schedule.emptyWaiting':
    'Los partidos aparecen aquí en cuanto se anuncian las fechas.',
  'calendar.schedule.hideCalendar': 'Ocultar el calendario',
  'calendar.schedule.showCalendar': 'Mostrar el calendario',
  'calendar.schedule.footerOff':
    'Estos partidos se añadirán al calendario de tu teléfono cuando lo conectes.',
  'calendar.schedule.footerOn':
    'Todo lo que ves aquí está en el calendario de tu teléfono y se actualiza solo — las horas se confirman, los aplazamientos se mueven, las cancelaciones desaparecen.',

  // ── Month grid (MonthGrid.tsx) ─────────────────────────────────────
  'calendar.month.previous': 'Mes anterior',
  'calendar.month.next': 'Mes siguiente',
  'calendar.month.day': '{day} de {month}',
  'calendar.month.dayFixtures_one': '{day} de {month}, {n} partido',
  'calendar.month.dayFixtures_other': '{day} de {month}, {n} partidos',
  'calendar.month.dayRemovedOnly': '{day} de {month}, solo partidos quitados',
  // Monday-start weekday initials (L M M J V S D — the duplicated M is
  // the es convention, like English's duplicated T/S).
  'calendar.month.mon': 'L',
  'calendar.month.tue': 'M',
  'calendar.month.wed': 'M',
  'calendar.month.thu': 'J',
  'calendar.month.fri': 'V',
  'calendar.month.sat': 'S',
  'calendar.month.sun': 'D',

  // ── Calendar priming (CalendarPrimingScreen.tsx) ───────────────────
  'calendar.priming.title': 'Pon tus partidos en tu calendario',
  'calendar.priming.ready_one': '{count} partido listo para añadir.',
  'calendar.priming.ready_other': '{count} partidos listos para añadir.',
  'calendar.priming.readyMonth_one':
    '{count} partido listo para añadir — unos {month} en el próximo mes.',
  'calendar.priming.readyMonth_other':
    '{count} partidos listos para añadir — unos {month} en el próximo mes.',
  'calendar.priming.explainTarget':
    'Los partidos van a un calendario que tú eliges — solo tocamos los eventos que añadimos nosotros',
  'calendar.priming.explainUpdates':
    'Los eventos se actualizan solos cuando cambian las horas o se mueven los partidos',
  'calendar.priming.explainUnfollow':
    'Deja de seguir y sus partidos desaparecen de nuevo',
  'calendar.priming.denied':
    'El acceso al calendario está desactivado para KickOffCal. Permítelo en Ajustes y vuelve — tus partidos te esperan.',
  'calendar.priming.tryAgain': '{message} Vuelve a intentarlo en un momento.',
  'calendar.priming.googleNote':
    'La sincronización del calendario necesita iniciar sesión con Google en Android. Sin eso, tus partidos viven en la app.',
  'calendar.priming.openSettings': 'Abrir Ajustes',
  'calendar.priming.connecting': 'Conectando…',
  'calendar.priming.connectGoogle': 'Conectar Google Calendar',
  'calendar.priming.addToMyCalendar': 'Añadir a mi calendario',
  'calendar.priming.connectMyCalendar': 'Conectar mi calendario',
  'calendar.priming.notNow': 'Ahora no',
  'calendar.priming.addedFixtures_one':
    'Se añadió {n} partido a tu calendario',
  'calendar.priming.addedFixtures_other':
    'Se añadieron {n} partidos a tu calendario',
  'calendar.priming.connected': 'Calendario conectado',
  'calendar.priming.connectedTitle': 'Tu calendario está conectado',
  'calendar.priming.connectedBody':
    'Sigue a un equipo y sus partidos aparecerán ahí solos — las horas se confirman, los aplazamientos se mueven, las cancelaciones desaparecen. No hay nada más que configurar.',
  'calendar.priming.chooseSports': 'Elige tus deportes',
  'calendar.priming.differentCalendar': 'Usar otro calendario',

  // ── First-run welcome (onboarding/WelcomeScreen.tsx) ───────────────
  'calendar.welcome.tagline': 'No te pierdas ni un partido.',
  'calendar.welcome.promiseCalendar':
    'Los partidos llegan al calendario de tu teléfono, automáticamente',
  'calendar.welcome.promiseCorrect':
    'Las horas cambian, los partidos se mueven — tu calendario se mantiene al día',
  'calendar.welcome.promiseNoAccount':
    'No necesitas cuenta — sigue y listo.',
  'calendar.welcome.getStarted': 'Empezar',

  // ════════════════════════════════════════════════════════════════════
  // settings (mirrors en/settings.ts)
  // ════════════════════════════════════════════════════════════════════

  // ── PreferencesScreen: the accordion's section titles ──────────────
  'settings.sections.calendar': 'Calendario',
  'settings.sections.events': 'Eventos',
  'settings.sections.app': 'App',
  'settings.sections.pastGames': 'Partidos pasados',
  'settings.sections.dataPrivacy': 'Datos y privacidad',
  'settings.sections.a11y': 'Ajustes de {title}',

  // ── Calendar section ───────────────────────────────────────────────
  'settings.calendar.googleReconnectCaption':
    'En tu Google Calendar — toca para reconectar la sesión',
  'settings.calendar.googleReconnectA11y':
    'KickOffCal en Google Calendar. Reconectar la sesión de Google',
  'settings.calendar.googleReconnected': 'Google Calendar reconectado',
  'settings.calendar.disconnectGoogle': 'Desconectar Google Calendar',
  'settings.calendar.disconnectCaption':
    'Tu calendario y sus eventos quedan intactos',
  'settings.calendar.googleDisconnected': 'Google Calendar desconectado',
  'settings.calendar.connectGoogle': 'Conectar Google Calendar',
  'settings.calendar.connectCaption':
    'Hasta entonces, tus partidos viven en la app',
  'settings.calendar.choose': 'Elegir un calendario',
  'settings.calendar.autoPickedCaption':
    'Se elige automáticamente al conectar tu calendario',
  'settings.calendar.targetA11y':
    'Calendario: {label}. {account}. Cambiar dónde se escriben los partidos',
  'settings.calendar.chooseA11y': 'Elegir dónde se escriben los partidos',
  'settings.calendar.colour': 'Color',
  'settings.calendar.colourA11y': 'Color del calendario {name}',
  'settings.calendar.colourCaption':
    'Cómo se ven los eventos de KickOffCal en la app de calendario de tu teléfono.',
  'settings.calendar.inheritedColour':
    'Tus partidos toman el color de {calendar}, que puedes cambiar en tu app de calendario.',
  'settings.calendar.colourApplied': 'El color del calendario ahora es {colour}',
  'settings.calendar.colourSaved':
    'Color guardado — se aplicará al conectar tu calendario',
  // The calendar-name fallback when no target is stored yet.
  'settings.words.yourCalendar': 'tu calendario',

  // Colour names — read out and toasted, so they are copy, not config.
  'settings.colours.kickoffcalBlue': 'Azul KickOffCal',
  'settings.colours.red': 'Rojo',
  'settings.colours.orange': 'Naranja',
  'settings.colours.green': 'Verde',
  'settings.colours.teal': 'Verde azulado',
  'settings.colours.purple': 'Morado',
  'settings.colours.pink': 'Rosa',
  'settings.colours.graphite': 'Grafito',

  // ── Events section ─────────────────────────────────────────────────
  'settings.events.footnote':
    'Los eventos con hora van del inicio al final del partido. Los cambios se aplican a todos los partidos sincronizados en la próxima sincronización.',
  'settings.events.style': 'Estilo de evento',
  'settings.events.timed': 'Con hora',
  'settings.events.allDay': 'Todo el día',
  'settings.events.raceWeekends': 'Fines de semana de carrera',
  'settings.events.allSessions': 'Todas las sesiones',
  'settings.events.raceOnly': 'Solo la carrera',
  'settings.events.block': 'En bloque',
  'settings.events.keyRounds': 'Rondas clave',
  'settings.events.allMatches': 'Todos los partidos',

  // ── Reminders section ──────────────────────────────────────────────
  'settings.reminders.title': 'Recordatorios',
  'settings.reminders.footnote':
    'Los cambios de recordatorio se aplican a todos los partidos sincronizados en la próxima sincronización.',
  'settings.reminders.daysWithoutDates': 'Días sin hora',
  'settings.reminders.slotA11y': 'Recordatorio {n}, {value}',
  'settings.reminders.slotValueA11y': 'Valor del recordatorio {n}',
  'settings.reminders.slotUnitA11y': 'Unidad del recordatorio {n}',
  'settings.reminders.off': 'No',
  'settings.reminders.minutes': 'Minutos',
  'settings.reminders.hours': 'Horas',

  // ── App section ────────────────────────────────────────────────────
  'settings.app.appearance': 'Apariencia',
  'settings.app.auto': 'Auto',
  'settings.app.light': 'Claro',
  'settings.app.dark': 'Oscuro',
  'settings.app.region': 'Región',
  'settings.app.regionA11y': 'Región: {value}. Cambiar región',

  // ── Region (Preferences value row + RegionScreen) ──────────────────
  'settings.region.matchDevice': 'Como mi dispositivo ({region})',
  'settings.region.default': 'Predeterminada',
  'settings.region.note':
    'La región cambia el orden en que aparecen los deportes y competiciones, y cómo se llaman algunas — nunca lo que puedes seguir. No se usa tu ubicación.',

  // ── Past games section ─────────────────────────────────────────────
  'settings.past.footnote':
    'Solo se quitan partidos que KickOffCal añadió, y solo los que aún tiene registrados. Volver a cambiar detiene futuras eliminaciones — no recupera nada ya borrado.',
  'settings.past.keep': 'Conservar los partidos pasados en mi calendario',
  'settings.past.remove': 'Quitarlos {days} días después de que terminen',

  // ── Data & privacy rows ────────────────────────────────────────────
  'settings.privacy.erase': 'Borrar eventos sincronizados',
  'settings.privacy.eraseOwnTarget':
    'Quita los eventos que KickOffCal añadió a {calendar}, incluidos los pasados. No se toca nada más.',
  'settings.privacy.eraseOurs':
    'Quita el calendario KickOffCal y todos sus eventos — incluidos los pasados. No se toca nada más de tu calendario.',
  'settings.privacy.eraseResync':
    'Si la sincronización sigue conectada, los eventos futuros se añadirán de nuevo.',
  'settings.privacy.eraseAction': 'Borrar',
  'settings.privacy.eraseFailed_one':
    'No se pudo quitar {n} evento — inténtalo de nuevo',
  'settings.privacy.eraseFailed_other':
    'No se pudieron quitar {n} eventos — inténtalo de nuevo',
  'settings.privacy.nothingToErase': 'No hay nada sincronizado que borrar',
  'settings.privacy.erased': 'Eventos sincronizados borrados',
  'settings.privacy.deleteTitle': 'Eliminar mis datos y restablecer',
  'settings.privacy.deleteA11y': 'Eliminar mis datos y restablecer',
  'settings.privacy.deleteBody':
    'Elimina todo lo que esta app guarda sobre ti — seguimientos, ajustes y el registro en el servidor — y empieza de cero.',
  'settings.privacy.alsoErase':
    'Borrar también los eventos sincronizados de mi calendario',
  'settings.privacy.cantUndo': 'Esto no se puede deshacer.',
  'settings.privacy.deleteAction': 'Eliminar',
  'settings.privacy.deleteMyData': 'Eliminar mis datos',

  // ── Screen tail (Preferences) ──────────────────────────────────────
  'settings.tail.photoCredits': 'Créditos de fotos',
  'settings.status.underHourAgo': 'hace menos de una hora',
  'settings.status.hoursAgo': 'hace {n}h',
  'settings.status.daysAgo': 'hace {n}d',
  'settings.status.deviceNotSynced': 'Este dispositivo: aún sin sincronizar',
  'settings.status.deviceSynced':
    'Este dispositivo se sincronizó por última vez {when}',
  'settings.status.nothingFollowed':
    'Fuentes de partidos: aún no sigues nada',
  'settings.status.freshnessUnknown':
    'Fuentes de partidos: actualización desconocida',
  'settings.status.sourcesConfirmed':
    'Fuentes de partidos confirmadas por última vez {when}',

  // ── CalendarTargetScreen ───────────────────────────────────────────
  'settings.target.connectFirst':
    'Conecta primero tu calendario y KickOffCal elegirá automáticamente el mejor lugar para tus partidos. Después puedes cambiarlo aquí.',
  'settings.target.putGames': 'Pon tus partidos en tu calendario',
  'settings.target.connectA11y': 'Conectar tu calendario',
  'settings.target.goTo': 'Los partidos van a',
  'settings.target.moving_one': 'Moviendo {n} partido… {moved}/{n}',
  'settings.target.moving_other': 'Moviendo {n} partidos… {moved}/{n}',
  'settings.target.reading': 'Leyendo tus calendarios…',
  'settings.target.ownCalendarHeader': 'Su propio calendario',
  'settings.target.newInSource': 'Nuevo calendario KickOffCal en {source}',
  'settings.target.newOnDevice':
    'Nuevo calendario KickOffCal en este dispositivo',
  'settings.target.keepsSeparate':
    'Mantiene los partidos separados de tus propios eventos',
  'settings.target.writeToA11y': 'Escribir los partidos en {calendar}',
  'settings.target.moved_one': 'Se movió {n} partido a {calendar}',
  'settings.target.moved_other': 'Se movieron {n} partidos a {calendar}',
  'settings.target.nowGoTo': 'Los partidos ahora van a {calendar}',
  'settings.target.scopePromise':
    'Elijas lo que elijas, KickOffCal solo añade, cambia o quita los partidos que puso ahí. Al cambiar se mueve todo — no queda nada atrás.',

  // ── CreditsScreen ──────────────────────────────────────────────────
  'settings.credits.intro':
    'Las fotografías provienen de Wikimedia Commons bajo licencias que permiten su reutilización. Abajo se acredita a cada fotógrafo.',
  'settings.credits.openSportsDbA11y': 'Abrir TheSportsDB',
  'settings.credits.sportsDb':
    'Los datos de eventos de varios deportes provienen de TheSportsDB (thesportsdb.com).',
  'settings.credits.none': 'Aún no se han cargado fotografías.',
  'settings.credits.openSourceA11y': 'Abrir la página de la fuente de {subject}',
  'settings.credits.source': 'fuente',
  'settings.credits.openLicenceA11y':
    'Abrir la información de licencias de Wikimedia Commons',
  'settings.credits.aboutLicences': 'Acerca de estas licencias',
};
