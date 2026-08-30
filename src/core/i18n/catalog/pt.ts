// Portuguese (pt-BR) catalog — the complete translation of the English
// key authority (catalog/en). Completeness is compile-enforced by the
// Catalog type; placeholder parity is pinned by the i18n test.
//
// Register: Brazilian Portuguese, modern consumer-app tone ("você"
// implicit, imperatives welcome). Brand names, competition proper
// nouns, person names, `{placeholders}`, '·' and emoji stay verbatim.
// Google Calendar appears as "Google Agenda" — Google's own pt-BR
// product name, the one on every Brazilian phone.

import type { Catalog } from '../index';

export const pt: Catalog = {
  // ── Sport schedule vocabulary (sportTerms.fixturesWordFor +
  // CompetitionCard's expansion pair) ────────────────────────────────
  'core.fixtures': 'Jogos',
  'core.teams': 'Times',
  'core.fights': 'Lutas',
  'core.matches': 'Partidas',
  'core.tournaments': 'Torneios',
  'core.events': 'Eventos',

  // ── Sport NAMES (Phase C language layer) ───────────────────────────
  'core.sport.soccer': 'Futebol',
  'core.sport.cricket': 'Críquete',
  'core.sport.ice-hockey': 'Hóquei no gelo',
  'core.sport.tennis': 'Tênis',
  'core.sport.athletics': 'Atletismo',
  'core.sport.basketball': 'Basquete',
  'core.sport.baseball': 'Beisebol',
  'core.sport.nfl': 'Futebol americano',
  'core.sport.rugby': 'Rugby',
  'core.sport.golf': 'Golfe',
  'core.sport.f1': 'Fórmula 1',
  'core.sport.boxing': 'Boxe',
  'core.sport.ufc': 'MMA',
  'core.sport.motorsport': 'Automobilismo',
  'core.sport.olympics': 'Olimpíadas',

  // ── Screen titles (App.tsx headers — the BrandTitle voice) ─────────
  'core.followType.team': 'time',
  'core.followType.competition': 'competição',
  'core.followType.athlete': 'atleta',
  'core.followType.series': 'série',
  'core.title.home': 'Início',
  'core.title.following': 'Seguindo',
  'core.title.schedule': 'Agenda',
  'core.title.yourCalendar': 'Seu calendário',
  'core.title.search': 'Buscar',
  'core.title.sports': 'Esportes',
  'core.title.competitions': 'Competições',
  'core.title.athletes': 'Atletas',
  'core.title.preferences': 'Preferências',
  'core.title.region': 'Região',
  'core.title.calendar': 'Calendário',
  'core.title.photoCredits': 'Créditos das fotos',

  // ── when.ts: the hardcoded English words ───────────────────────────
  'core.when.today': 'Hoje',
  'core.when.tomorrow': 'Amanhã',
  'core.when.todayHeading': 'Hoje · {date}',
  'core.when.tomorrowHeading': 'Amanhã · {date}',
  'core.when.postponed': 'Adiado',
  'core.when.timeTbc': 'Horário a confirmar',
  // The countdown chip is set in caps AS COPY.
  'core.when.countdownToday': 'HOJE',
  'core.when.countdownTomorrow': 'AMANHÃ',
  'core.when.countdownInDays': 'EM {n} DIAS',

  // ── Shared components (components.tsx / cardExpansion.tsx) ────────
  'core.rail.openA11y': '{label}, {caption}. Ver os jogos',
  'core.a11y.openEvent': '{label}. Abrir evento',
  'core.hero.nextUpA11y': 'A seguir: {title}, {when}',
  'core.row.removedFromCalendar': 'removido do calendário',
  'core.row.removedCaption': 'Removido — fora do seu calendário',
  'core.row.addToCalendarA11y': 'Adicionar {title} ao seu calendário',
  'core.row.removeFromCalendarA11y': 'Remover {title} do seu calendário',
  'core.row.restoreToCalendarA11y': 'Restaurar {title} no seu calendário',
  'core.actions.add': 'Adicionar',
  'core.actions.added': 'Adicionado',
  'core.actions.remove': 'Remover',
  'core.actions.removed': 'Removido',
  'core.actions.cancel': 'Cancelar',
  'core.follow.follow': 'Seguir',
  'core.follow.following': 'Seguindo',
  'core.follow.followA11y': 'Seguir {subject}',
  'core.follow.unfollowA11y': 'Deixar de seguir {subject}',
  'core.expansion.closeA11y': 'Fechar',

  // ── Sync status chip + its relative times ──────────────────────────
  'core.status.justNow': 'agora mesmo',
  'core.status.minsAgo': 'há {n} min',
  'core.status.hoursAgo_one': 'há 1 hora',
  'core.status.hoursAgo_other': 'há {n} horas',
  'core.status.daysAgo_one': 'ontem',
  'core.status.daysAgo_other': 'há {n} dias',
  'core.status.checking': 'Buscando jogos…',
  'core.status.updating': 'Atualizando seu calendário…',
  'core.status.sourcesQuiet':
    'Fontes de jogos sem atualização há {n}d — os dados podem estar defasados',
  'core.status.calendarOff': 'Sincronização do calendário desativada',
  'core.status.upToDateCalendarOff': 'Jogos em dia · calendário desativado',
  'core.status.notSynced': 'Ainda não sincronizado',
  'core.status.updated': 'Calendário atualizado · {changes} · {when}',
  'core.status.changes_one': '{n} alteração',
  'core.status.changes_other': '{n} alterações',
  'core.status.upToDate': 'Calendário em dia · verificado {when}',

  // ── Calendar-off banner ────────────────────────────────────────────
  'core.banner.fixturesReady_one': '{n} jogo pronto para adicionar',
  'core.banner.fixturesReady_other': '{n} jogos prontos para adicionar',
  'core.banner.fixturesWhenConnected':
    'Os jogos serão adicionados assim que você conectar seu calendário',
  'core.banner.addA11y': 'Adicionar jogos ao meu calendário',

  // ── Coverage note disclosure ───────────────────────────────────────
  'core.coverage.showA11y': 'O que isso cobre',
  'core.coverage.hideA11y': 'Ocultar o que isso cobre',
  'core.coverage.closedLabel': 'ⓘ  O que isso cobre',
  'core.coverage.openLabel': 'ⓘ  O que isso cobre ▲',

  // ── Search entry (Home's bar + the Search screen share these) ─────
  'follows.search.a11y': 'Buscar times, atletas, competições e esportes',
  'follows.search.placeholder': 'Time, atleta, competição ou esporte',

  // ── Home ──────────────────────────────────────────────────────────
  'follows.home.emptyHeadline': 'Nada agendado por enquanto',
  'follows.home.emptyBody':
    'Os jogos chegam aqui — e ao seu calendário — assim que a programação é divulgada.',
  'follows.home.welcomeHeadline': 'Nunca perca um jogo',
  'follows.home.welcomeBody':
    'Siga times, competições e séries. Os jogos aparecem no seu calendário e se mantêm atualizados sozinhos.',
  'follows.home.nothingScheduled': 'Nada agendado',
  'follows.home.addSports': 'Adicionar esportes',
  'follows.home.chooseSport': 'Escolha um esporte',
  'follows.home.oneFollow': 'Siga uma vez',
  'follows.home.browse': 'Explorar',
  // The word: Home's section header, Home's sport-card caption and the
  // sport picker's caption (one key — same string on every surface).
  'follows.following': 'Seguindo',
  'follows.sports.a11yFollowing': '{name}, seguindo',
  'follows.sports.a11yComingSoon': '{name}, em breve',

  // ── Sport picker ──────────────────────────────────────────────────
  'follows.sportPicker.allEventsOneFollow': 'Todos os eventos · siga uma vez',
  'follows.sportPicker.comingSoon': 'Em breve',

  // ── Following (manage) ────────────────────────────────────────────
  'follows.following.captionNoUpcoming': '{sport} · ainda sem próximos jogos',
  'follows.following.captionUpcoming_one': '{sport} · {n} próximo',
  'follows.following.captionUpcoming_other': '{sport} · {n} próximos',
  'follows.following.a11yUndo': 'Desfazer e voltar a seguir {name}',
  'follows.following.emptyHeadline': 'Você ainda não segue nada',
  'follows.following.emptyBody':
    'Escolha um esporte no Início ou explore tudo por aqui.',
  'follows.following.browseSports': 'Explorar esportes',
  'follows.following.a11yRow': '{name}, {type} que você segue. Ver os jogos',
  'follows.following.a11yAddMore': 'Adicionar mais esportes',
  'follows.following.addMore': '+ Adicionar mais',
  'follows.undo': 'Desfazer',

  // ── Cards (CompetitionCard + tile rows across browse/search) ──────
  'follows.card.a11ySummary': '{name}, {caption}',
  'follows.card.a11yViewFixtures': '{name}, ver jogos',
  'follows.card.a11yDestination': '{name} {label}',

  // ── Competition browse (LeagueList) ───────────────────────────────
  'follows.league.teamCount_one': '{country} · {n} time',
  'follows.league.teamCount_other': '{country} · {n} times',
  'follows.league.tapTournaments': 'Toque para seguir torneios',
  'follows.league.tapTournamentsCount': 'Toque para seguir torneios ({count})',
  'follows.league.tapTeams': '{country} · Toque para seguir times · {fixtures}',
  'follows.league.tapTeamsCount':
    '{country} · Toque para seguir times ({count}) · {fixtures}',
  'follows.league.searchCompsTeams': 'Buscar competições e times',
  'follows.league.searchComps': 'Buscar competições',
  'follows.league.noMatches': 'Nada aqui corresponde a “{query}”.',
  'follows.league.allEvents': 'Todos os eventos',
  'follows.league.everyEventOnTour': 'Todos os eventos do circuito',
  'follows.tournaments.navTitle': 'Torneios {tour}',

  // ── Athlete browse ────────────────────────────────────────────────
  'follows.athletes.fighters': 'Lutadores',
  'follows.athletes.players': 'Jogadores',
  'follows.athletes.drivers': 'Pilotos',
  'follows.athletes.athletes': 'Atletas',
  'follows.athletes.caption': 'Rankings, campeões, quem vai competir',
  'follows.athletes.a11yBrowse': 'Explorar {athletes}',
  'follows.athletes.a11yBrowseTourPlayers':
    'Explorar jogadores do circuito {tour}',
  'follows.athletes.champion': 'Campeão · {orgs}',
  'follows.athletes.rank': '#{rank}',
  'follows.athletes.competes': 'Compete em {date}',
  'follows.athletes.competingSoon': 'Compete em breve',
  'follows.athletes.mens': 'Masculino',
  'follows.athletes.womens': 'Feminino',
  'follows.boxing.mensFighters': 'Boxeadores',
  'follows.boxing.womensFighters': 'Boxeadoras',
  'follows.boxing.mensTitle': 'Boxe masculino',
  'follows.boxing.womensTitle': 'Boxe feminino',
  'follows.athletes.searchPlaceholder': 'Buscar atletas de {sport}',
  'follows.athletes.noneMatch': 'Nenhum atleta corresponde a esse nome.',
  'follows.athletes.noneYet':
    'Ainda não há atletas aqui — eles chegam conforme rankings e inscrições são publicados.',
  'follows.athletes.a11yShowFewer': 'Mostrar menos em {section}',
  'follows.athletes.a11yShowAll': 'Mostrar todos os {n} em {section}',
  'follows.athletes.showFewer': 'Mostrar menos',
  'follows.athletes.showAll': 'Mostrar todos os {n}',
  'follows.athletes.a11yOpenPage': '{name}, abrir página do atleta',

  // ── Tennis browse (domain/tennisBrowse.ts + LeagueList sections) ──
  'follows.tennis.atpTitle': 'ATP — Masculino',
  'follows.tennis.wtaTitle': 'WTA — Feminino',
  'follows.tennis.noteAtp':
    'As datas dos torneios vêm do calendário do circuito, e os horários ' +
    'das partidas chegam quando a chave é publicada — tudo montado a ' +
    'partir de um feed ranqueado e revisado à mão, então uma partida ou ' +
    'outra chega atrasada em vez de errada. Os 50 primeiros aparecem por ' +
    'ranking, o resto de A a Z; 500 são pesquisáveis.',
  'follows.tennis.noteWta':
    'A cobertura mais completa que temos: torneios, chaves e ordem de ' +
    'jogo do feed da própria WTA — a partida aparece com a adversária ' +
    'assim que a chave sai e ganha horário exato quando a programação é ' +
    'publicada.',
  'follows.tennis.allFourMajors': 'Os quatro Grand Slams',
  // Mid-sentence form (the Follow control's subject) — its own key, not
  // a code-side lowercase: case rules differ per language.
  'follows.tennis.allFourMajorsSubject': 'os quatro Grand Slams',
  'follows.tennis.otherTournaments': 'Outros torneios',
  'follows.tennis.tournamentCount_one': '{n} torneio',
  'follows.tennis.tournamentCount_other': '{n} torneios',
  'follows.tennis.dateRange': '{start} – {end}',

  // ── Olympics browse ───────────────────────────────────────────────
  'follows.olympics.summer': 'Verão',
  'follows.olympics.winter': 'Inverno',
  'follows.olympics.seasonOlympics': 'Olimpíadas de {season}',
  'follows.olympics.tapForSports': '{edition} · Toque para ver esportes · jogos',
  'follows.olympics.seasonSports': 'Esportes de {season}',
  'follows.olympics.seasonGames': 'Jogos de {season}',
  'follows.olympics.games': 'Jogos',
  // 'Sports' as a standalone label: the Olympics card's destination and
  // the Search screen's section header (one key — same string).
  'follows.browse.sports': 'Esportes',

  // ── Search screen ─────────────────────────────────────────────────
  'follows.search.sport': 'Esporte',
  'follows.search.athlete': 'Atleta',
  'follows.search.captionCompetition': '{country} · {sport}',
  'follows.search.captionTeam': '{league} · {sport}',
  'follows.search.captionTournament': 'Torneio · {sport}',
  'follows.search.noMatches':
    'Nada que você possa seguir corresponde a “{query}” — a busca cobre os esportes e ligas que o KickOffCal atende hoje.',
  'follows.search.searching': 'Buscando…',
  'follows.search.results': 'Resultados',
  'follows.search.competitions': 'Competições',

  // ── Team browse (TeamList) ────────────────────────────────────────
  'follows.teams.a11ySearchIn': 'Buscar times em {league}',
  'follows.teams.searchPlaceholder': 'Buscar times',

  // ── Entity page (TeamScreen) ──────────────────────────────────────
  'follows.team.upcoming_one': '{n} próximo',
  'follows.team.upcoming_other': '{n} próximos',
  'follows.team.calendarEvents': 'EVENTOS NO CALENDÁRIO',
  'follows.team.a11ySelected': '{label}, selecionado',
  'follows.team.athleteEmpty':
    'Nenhum evento agendado. Vamos adicioná-los quando forem anunciados — siga agora e eles chegam ao seu calendário.',
  'follows.team.teamEmpty':
    'Ainda sem próximos jogos — a tabela chega aqui assim que for divulgada.',
  'follows.team.removed': 'Removido do seu calendário',
  'follows.team.added': '{title} adicionado ao seu calendário',
  'follows.team.restored': 'De volta ao seu calendário',
  'follows.team.upcomingHeader': 'A seguir',
  'follows.team.footer':
    'Toque em Adicionar para uma única partida, ou em Seguir para todas — depois você pode remover partidas uma a uma.',
  'follows.team.whenCompetition': '{when} · {competition}',

  // ── Fixture hero (photo credit) ───────────────────────────────────
  'follows.hero.photoBy': 'Foto: {artist}',
  'follows.hero.photoCommons': 'Foto: Wikimedia Commons',

  // ── Follow feedback (toasts) ──────────────────────────────────────
  'follows.feedback.followingUpdating': 'Seguindo {name} — atualizando…',
  'follows.feedback.unfollowedUpdating':
    'Deixou de seguir {name} — atualizando…',
  'follows.feedback.unfollowed': 'Deixou de seguir {name}',
  'follows.feedback.calendarOff': 'Seguindo {name} — calendário desativado',
  'follows.feedback.enable': 'Ativar',
  'follows.feedback.added_one': '{n} jogo adicionado ao seu calendário',
  'follows.feedback.added_other': '{n} jogos adicionados ao seu calendário',
  'follows.feedback.noUpcoming': 'Seguindo {name} — ainda sem próximos jogos',

  // ── Coverage notes (verbatim from sportsConfig; read via
  //    domain/coverageNotes.ts) ───────────────────────────────────────
  'follows.coverage.cricket':
    'Internacionais de bola branca e as principais ligas; séries de Test além do County Championship não são cobertas.',
  'follows.coverage.tennis':
    'O ranking e os jogadores do masculino vêm de um feed externo ao vivo, e os horários das partidas masculinas chegam torneio a torneio, conforme são disputados. Ranking, chaves e ordem de jogo do feminino vêm da API da própria WTA. A cobertura varia — onde ainda não temos as partidas, mantemos as datas do torneio.',
  'follows.coverage.athletics':
    'Cobertura por meeting. Ainda não dá para seguir atletas individuais — a World Athletics publica rankings apenas como páginas web, e as listas de largada chegam quando as federações as publicam.',
  'follows.coverage.golf':
    'Eventos por rodada; os tee times não são acompanhados.',
  'follows.coverage.boxing':
    'Os horários dos cards são o início da transmissão, não a subida ao ringue. O diretório de lutadores cobre campeões mundiais e desafiantes ranqueados pela IBF, além de lutadores em cards já anunciados.',
  'follows.coverage.ufc':
    'Cobertura apenas por card. Lutadores individuais não podem ser seguidos: nenhuma organização de MMA publica um elenco utilizável, então um diretório de lutadores seria chute — preferimos ser honestos a errar.',
  'follows.coverage.olympics':
    'Os próximos Jogos são Los Angeles 2028 (14–30 de julho) e os Jogos de Inverno de Milano-Cortina em 2030. Todas as modalidades já estão listadas e podem ser seguidas, mas nenhuma programação foi publicada ainda — o COI divulga os horários das sessões mais perto dos Jogos, então quem segue hoje recebe os eventos no momento em que existirem. Nenhum emblema olímpico é exibido: as marcas são protegidas por legislação própria, então o app nomeia os eventos e cria a própria arte.',

  // The language-switch rewrite notice (Phase C ruling: the rewrite is
  // deliberate and announces itself in-UI when it runs).
  'calendar.language.rewrite':
    'Atualizando os eventos do seu calendário para {language}',
  // ── Offset vocabulary (prefs.ts — offsetLabel / short / picker) ────
  'calendar.offset.off': 'Desativado',
  'calendar.offset.minBefore': '{n} min antes',
  'calendar.offset.daysBefore_one': '{n} dia antes',
  'calendar.offset.daysBefore_other': '{n} dias antes',
  'calendar.offset.hoursBefore_one': '{n} hora antes',
  'calendar.offset.hoursBefore_other': '{n} horas antes',
  'calendar.offset.shortMinutes': '{n}m',
  'calendar.offset.shortDays': '{n}d',
  'calendar.offset.shortHours': '{n}h',
  'calendar.offset.pickerMinutes': '{n} m',
  'calendar.offset.pickerDays_one': '{n} dia',
  'calendar.offset.pickerDays_other': '{n} dias',
  'calendar.offset.pickerHours_one': '{n} h',
  'calendar.offset.pickerHours_other': '{n} h',

  // ── Reminder options (prefs.ts) ────────────────────────────────────
  'calendar.reminder.none': 'Nenhum',
  'calendar.allDayReminder.eveningBefore': 'Na véspera, às 18h',
  'calendar.allDayReminder.eveningBeforeShort': 'Véspera',
  'calendar.allDayReminder.morningOf': 'Na manhã do dia, às 9h',
  'calendar.allDayReminder.morningOfShort': 'Manhã',

  // ── Written INTO calendar events (tournamentTiers.ts / syncPlan.ts) ─
  'calendar.tournament.begins': '{title} começa',
  'calendar.tournament.finalDay': '{title} — último dia',
  'calendar.tournament.pointer':
    'Partidas individuais podem ser adicionadas pelo card do torneio no app.',
  'calendar.event.timeTbc': 'horário a confirmar',
  'calendar.event.postponed': 'adiado',
  'calendar.event.nominalTimeNote':
    'O horário de início ainda não está confirmado — isto será atualizado automaticamente.',

  // ── Timing explanations (fixtures/domain/timingExplanation.ts) ─────
  'calendar.timing.momentsAgo': 'agora há pouco',
  'calendar.timing.minutesAgo': 'há {n} minutos',
  'calendar.timing.hoursAgo_one': 'há {n} hora',
  'calendar.timing.hoursAgo_other': 'há {n} horas',
  'calendar.timing.daysAgo_one': 'ontem',
  'calendar.timing.daysAgo_other': 'há {n} dias',
  'calendar.timing.confirmOrganiser':
    '{source} ainda não confirmou o horário final.',
  'calendar.timing.confirmGeneric':
    'O horário final ainda não foi confirmado.',
  'calendar.timing.slotNotAnnounced':
    'A ordem de jogo ainda não foi anunciada por {source}.',
  'calendar.timing.timeNotAnnounced':
    'O horário de início ainda não foi anunciado por {source}.',
  'calendar.timing.slotNotPublished':
    'A ordem de jogo ainda não foi publicada.',
  'calendar.timing.timeNotPublished':
    'O horário de início ainda não foi publicado.',
  'calendar.timing.checked': 'Verificado {ago}',
  'calendar.timing.cancelled': 'Cancelado — não vai mais acontecer.',
  'calendar.timing.postponed': 'Adiado — nenhuma nova data foi publicada.',
  'calendar.timing.runsOverDays':
    'Dura {n} dias, então fica no seu calendário como um evento de {n} dias.',
  'calendar.timing.exactTimeNotSet':
    'O horário exato ainda não foi definido, então isto cobre o evento inteiro — {n} dias.',
  'calendar.timing.dayOnlyAppearance':
    'Só o dia é conhecido — isto fica marcado no dia até a ordem de jogo ser publicada.',
  'calendar.timing.dayOnly':
    'Só o dia é conhecido, então isto é um evento de dia inteiro, não um horário inventado por nós.',
  'calendar.timing.nominal':
    'O horário exibido é o início publicado, mas ainda não é o definitivo.',
  'calendar.timing.provisional':
    'Este horário está confirmado por enquanto, mas ainda pode mudar.',
  'calendar.timing.willUpdate':
    'Seu calendário se atualiza sozinho quando isso mudar.',
  'calendar.timing.shortCancelled': 'Cancelado',
  'calendar.timing.shortPostponed': 'Adiado — ainda sem nova data',
  'calendar.timing.runsDays': 'Dura {n} dias',
  'calendar.timing.noOrderOfPlay': 'Sem ordem de jogo',
  'calendar.timing.noConfirmedTime': 'Sem horário confirmado',
  'calendar.timing.noStartTime': 'Sem horário de início',
  'calendar.timing.subjectFromYet': '{subject} — {source} ainda não divulgou',
  'calendar.timing.subjectChecked': '{subject} até agora · verificado {ago}',
  'calendar.timing.subjectPublishedYet': '{subject} até agora',
  'calendar.timing.shortProvisional': 'Confirmado por enquanto, pode mudar',

  // ── The full card's vocabulary (fixtures/domain/card.ts) ───────────
  'calendar.cardList.fullCard': 'Card completo',
  'calendar.cardList.matches': 'Partidas',
  'calendar.cardList.events': 'Provas',
  'calendar.cardList.alsoOn': 'Também neste evento',
  'calendar.cardList.timeWithinEvent':
    'Horário dentro do evento não publicado',

  // ── The expanded fixture card (FixtureCard.tsx) ────────────────────
  'calendar.card.loadFailed': 'Não foi possível carregar este evento',
  'calendar.card.titleClose': '{title}. Fechar',
  'calendar.card.removeFromCalendar': 'Remover do calendário',
  'calendar.card.addToCalendar': 'Adicionar ao calendário',
  'calendar.card.removeTitleA11y': 'Remover {title} do seu calendário',
  'calendar.card.addTitleA11y': 'Adicionar {title} ao seu calendário',
  'calendar.card.alreadyInCalendar': '{title} já está no seu calendário',
  'calendar.card.mens': 'Masculino',
  'calendar.card.womens': 'Feminino',
  'calendar.card.sexChipShown': '{label}: partidas exibidas',
  'calendar.card.sexChipHidden': '{label}: partidas ocultas',
  'calendar.card.removeAllA11y':
    'Remover todas as partidas listadas do seu calendário',
  'calendar.card.addAllA11y':
    'Adicionar todas as partidas listadas ao seu calendário',
  'calendar.card.removeAll': 'Remover tudo',
  'calendar.card.addAll': 'Adicionar tudo',
  'calendar.card.reminder': 'Lembrete',
  'calendar.card.optionSelected': '{label}, selecionado',
  'calendar.card.useDefaultReminder': 'Usar meu lembrete padrão',
  'calendar.card.colour': 'Cor',
  'calendar.card.colourValue': 'Cor {value}',
  'calendar.card.mainEvent': 'Luta principal',
  'calendar.card.added': 'Adicionado',
  'calendar.card.add': 'Adicionar',
  'calendar.card.close': 'Fechar',

  // ── Toasts (FixtureCard / ScheduleScreen) ──────────────────────────
  'calendar.toast.removed': 'Removido do seu calendário',
  'calendar.toast.added': 'Adicionado ao seu calendário',
  'calendar.toast.restored': 'De volta ao seu calendário',
  'calendar.toast.undo': 'Desfazer',

  // ── Schedule (ScheduleScreen.tsx) ──────────────────────────────────
  'calendar.schedule.emptyHeadline': 'Nada na agenda',
  'calendar.schedule.emptyNoFollows':
    'Siga um time ou uma competição e os jogos aparecem aqui — e no seu calendário.',
  'calendar.schedule.emptyWaiting':
    'Os jogos aparecem aqui assim que a programação é divulgada.',
  'calendar.schedule.hideCalendar': 'Ocultar o calendário',
  'calendar.schedule.showCalendar': 'Mostrar o calendário',
  'calendar.schedule.footerOff':
    'Estes jogos serão adicionados ao calendário do seu celular assim que você conectá-lo.',
  'calendar.schedule.footerOn':
    'Tudo aqui está no calendário do seu celular e se atualiza sozinho — horários se confirmam, adiamentos se movem, cancelamentos somem.',

  // ── Month grid (MonthGrid.tsx) ─────────────────────────────────────
  'calendar.month.previous': 'Mês anterior',
  'calendar.month.next': 'Próximo mês',
  'calendar.month.day': '{day} de {month}',
  'calendar.month.dayFixtures_one': '{day} de {month}, {n} jogo',
  'calendar.month.dayFixtures_other': '{day} de {month}, {n} jogos',
  'calendar.month.dayRemovedOnly': '{day} de {month}, apenas jogos removidos',
  // Monday-start weekday initials, one key each — several languages
  // do not share English's duplicated T/S letters.
  'calendar.month.mon': 'S',
  'calendar.month.tue': 'T',
  'calendar.month.wed': 'Q',
  'calendar.month.thu': 'Q',
  'calendar.month.fri': 'S',
  'calendar.month.sat': 'S',
  'calendar.month.sun': 'D',

  // ── Calendar priming (CalendarPrimingScreen.tsx) ───────────────────
  'calendar.priming.title': 'Coloque seus jogos no seu calendário',
  'calendar.priming.ready_one': '{count} jogo pronto para adicionar.',
  'calendar.priming.ready_other': '{count} jogos prontos para adicionar.',
  'calendar.priming.readyMonth_one':
    '{count} jogo pronto para adicionar — cerca de {month} no próximo mês.',
  'calendar.priming.readyMonth_other':
    '{count} jogos prontos para adicionar — cerca de {month} no próximo mês.',
  'calendar.priming.explainTarget':
    'Os jogos vão para um calendário que você escolhe — só mexemos em eventos que nós mesmos adicionamos',
  'calendar.priming.explainUpdates':
    'Os eventos se atualizam sozinhos quando horários mudam ou jogos são remarcados',
  'calendar.priming.explainUnfollow':
    'Deixe de seguir e os jogos somem de novo',
  'calendar.priming.denied':
    'O acesso ao calendário está desativado para o KickOffCal. Permita nas configurações do aparelho e volte — seus jogos estão esperando.',
  'calendar.priming.tryAgain': '{message} Tente de novo em instantes.',
  'calendar.priming.googleNote':
    'A sincronização do calendário precisa de um login do Google no Android. Sem ele, seus jogos ficam no app.',
  'calendar.priming.openSettings': 'Abrir configurações',
  'calendar.priming.connecting': 'Conectando…',
  'calendar.priming.connectGoogle': 'Conectar Google Agenda',
  'calendar.priming.addToMyCalendar': 'Adicionar ao meu calendário',
  'calendar.priming.connectMyCalendar': 'Conectar meu calendário',
  'calendar.priming.notNow': 'Agora não',
  'calendar.priming.addedFixtures_one':
    '{n} jogo adicionado ao seu calendário',
  'calendar.priming.addedFixtures_other':
    '{n} jogos adicionados ao seu calendário',
  'calendar.priming.connected': 'Calendário conectado',
  'calendar.priming.connectedTitle': 'Seu calendário está conectado',
  'calendar.priming.connectedBody':
    'Siga um time e os jogos aparecem lá sozinhos — horários se confirmam, adiamentos se movem, cancelamentos somem. Nada mais para configurar.',
  'calendar.priming.chooseSports': 'Escolha seus esportes',
  'calendar.priming.differentCalendar': 'Usar outro calendário',

  // ── First-run welcome (onboarding/WelcomeScreen.tsx) ───────────────
  'calendar.welcome.tagline': 'Nunca perca um jogo.',
  'calendar.welcome.promiseCalendar':
    'Os jogos entram no calendário do seu celular, automaticamente',
  'calendar.welcome.promiseCorrect':
    'Horários mudam, jogos são remarcados — seu calendário continua certo',
  'calendar.welcome.promiseNoAccount':
    'Sem precisar de conta — é só seguir e pronto.',
  'calendar.welcome.getStarted': 'Começar',

  // ── PreferencesScreen: the accordion's section titles ──────────────
  'settings.sections.calendar': 'Calendário',
  'settings.sections.events': 'Eventos',
  'settings.sections.app': 'App',
  'settings.sections.pastGames': 'Jogos passados',
  'settings.sections.dataPrivacy': 'Dados e privacidade',
  'settings.sections.a11y': 'Configurações de {title}',

  // ── Calendar section ───────────────────────────────────────────────
  'settings.calendar.googleReconnectCaption':
    'No seu Google Agenda — toque para reconectar o login',
  'settings.calendar.googleReconnectA11y':
    'KickOffCal no Google Agenda. Reconectar login do Google',
  'settings.calendar.googleReconnected': 'Google Agenda reconectado',
  'settings.calendar.disconnectGoogle': 'Desconectar Google Agenda',
  'settings.calendar.disconnectCaption':
    'Seu calendário e os eventos dele ficam intactos',
  'settings.calendar.googleDisconnected': 'Google Agenda desconectado',
  'settings.calendar.connectGoogle': 'Conectar Google Agenda',
  'settings.calendar.connectCaption':
    'Os jogos ficam no app até você conectar',
  'settings.calendar.choose': 'Escolher um calendário',
  'settings.calendar.autoPickedCaption':
    'Escolhido automaticamente quando seu calendário conectar',
  'settings.calendar.targetA11y':
    'Calendário: {label}. {account}. Mudar onde os jogos são gravados',
  'settings.calendar.chooseA11y': 'Escolher onde os jogos são gravados',
  'settings.calendar.colour': 'Cor',
  'settings.calendar.colourA11y': 'Cor do calendário {name}',
  'settings.calendar.colourCaption':
    'Como os eventos do KickOffCal aparecem no app de calendário do seu celular.',
  'settings.calendar.inheritedColour':
    'Seus jogos usam a cor de {calendar}, que você define no seu app de calendário.',
  'settings.calendar.colourApplied': 'A cor do calendário agora é {colour}',
  'settings.calendar.colourSaved':
    'Cor salva — vale quando seu calendário conectar',
  // The calendar-name fallback when no target is stored yet.
  'settings.words.yourCalendar': 'seu calendário',

  // Colour names — read out and toasted, so they are copy, not config.
  'settings.colours.kickoffcalBlue': 'Azul KickOffCal',
  'settings.colours.red': 'Vermelho',
  'settings.colours.orange': 'Laranja',
  'settings.colours.green': 'Verde',
  'settings.colours.teal': 'Verde-azulado',
  'settings.colours.purple': 'Roxo',
  'settings.colours.pink': 'Rosa',
  'settings.colours.graphite': 'Grafite',

  // ── Events section ─────────────────────────────────────────────────
  'settings.events.footnote':
    'Eventos com horário vão do pontapé inicial ao apito final. As mudanças valem para todos os jogos sincronizados na próxima sincronização.',
  'settings.events.style': 'Estilo do evento',
  'settings.events.timed': 'Com horário',
  'settings.events.allDay': 'Dia inteiro',
  'settings.events.raceWeekends': 'Fins de semana de corrida',
  'settings.events.allSessions': 'Todas as sessões',
  'settings.events.raceOnly': 'Só a corrida',
  'settings.events.block': 'Bloco',
  'settings.events.keyRounds': 'Fases decisivas',
  'settings.events.allMatches': 'Todas as partidas',

  // ── Reminders section ──────────────────────────────────────────────
  'settings.reminders.title': 'Lembretes',
  'settings.reminders.footnote':
    'Mudanças de lembrete valem para todos os jogos sincronizados na próxima sincronização.',
  'settings.reminders.daysWithoutDates': 'Dias sem horário',
  'settings.reminders.slotA11y': 'Lembrete {n}, {value}',
  'settings.reminders.slotValueA11y': 'Valor do lembrete {n}',
  'settings.reminders.slotUnitA11y': 'Unidade do lembrete {n}',
  'settings.reminders.off': 'Desativado',
  'settings.reminders.minutes': 'Minutos',
  'settings.reminders.hours': 'Horas',

  // ── App section ────────────────────────────────────────────────────
  'settings.app.appearance': 'Aparência',
  'settings.app.auto': 'Automático',
  'settings.app.light': 'Claro',
  'settings.app.dark': 'Escuro',
  'settings.app.region': 'Região',
  'settings.app.regionA11y': 'Região: {value}. Mudar região',

  // ── Region (Preferences value row + RegionScreen) ──────────────────
  'settings.region.matchDevice': 'Igual ao meu aparelho ({region})',
  'settings.region.default': 'Padrão',
  'settings.region.note':
    'A região muda a ordem em que esportes e competições aparecem e o nome de alguns deles — nunca o que você pode seguir. Nenhuma localização é usada.',

  // ── Past games section ─────────────────────────────────────────────
  'settings.past.footnote':
    'Só jogos adicionados pelo KickOffCal são removidos, e apenas os que ele ainda tem no registro. Voltar atrás interrompe novas remoções — não traz de volta o que já foi apagado.',
  'settings.past.keep': 'Manter jogos passados no meu calendário',
  'settings.past.remove': 'Removê-los {days} dias depois de terminarem',

  // ── Data & privacy rows ────────────────────────────────────────────
  'settings.privacy.erase': 'Apagar eventos sincronizados',
  'settings.privacy.eraseOwnTarget':
    'Remove os eventos que o KickOffCal adicionou a {calendar}, incluindo os passados. Nada mais nele é alterado.',
  'settings.privacy.eraseOurs':
    'Remove o calendário KickOffCal e todos os eventos dele — incluindo os passados. Nada mais no seu calendário é alterado.',
  'settings.privacy.eraseResync':
    'Se a sincronização continuar conectada, eventos futuros serão adicionados de novo.',
  'settings.privacy.eraseAction': 'Apagar',
  'settings.privacy.eraseFailed_one':
    '{n} evento não pôde ser removido — tente de novo',
  'settings.privacy.eraseFailed_other':
    '{n} eventos não puderam ser removidos — tente de novo',
  'settings.privacy.nothingToErase': 'Nada sincronizado para apagar',
  'settings.privacy.erased': 'Eventos sincronizados apagados',
  'settings.privacy.deleteTitle': 'Excluir meus dados e redefinir',
  'settings.privacy.deleteA11y': 'Excluir meus dados e redefinir',
  'settings.privacy.deleteBody':
    'Remove tudo o que este app guarda sobre você — o que você segue, as configurações e o cadastro no servidor — e começa do zero.',
  'settings.privacy.alsoErase':
    'Apagar também os eventos sincronizados do meu calendário',
  'settings.privacy.cantUndo': 'Isso não pode ser desfeito.',
  'settings.privacy.deleteAction': 'Excluir',
  'settings.privacy.deleteMyData': 'Excluir meus dados',

  // ── Screen tail (Preferences) ──────────────────────────────────────
  'settings.tail.photoCredits': 'Créditos das fotos',
  'settings.status.underHourAgo': 'há menos de uma hora',
  'settings.status.hoursAgo': 'há {n}h',
  'settings.status.daysAgo': 'há {n}d',
  'settings.status.deviceNotSynced': 'Este aparelho: ainda não sincronizado',
  'settings.status.deviceSynced':
    'Última sincronização deste aparelho: {when}',
  'settings.status.nothingFollowed': 'Fontes de jogos: nada seguido ainda',
  'settings.status.freshnessUnknown':
    'Fontes de jogos: atualização desconhecida',
  'settings.status.sourcesConfirmed':
    'Fontes de jogos confirmadas pela última vez {when}',

  // ── CalendarTargetScreen ───────────────────────────────────────────
  'settings.target.connectFirst':
    'Conecte seu calendário primeiro e o KickOffCal escolhe automaticamente o melhor lugar para os seus jogos. Depois você pode mudar aqui.',
  'settings.target.putGames': 'Coloque seus jogos no seu calendário',
  'settings.target.connectA11y': 'Conectar seu calendário',
  'settings.target.goTo': 'Os jogos vão para',
  'settings.target.moving_one': 'Movendo {n} jogo… {moved}/{n}',
  'settings.target.moving_other': 'Movendo {n} jogos… {moved}/{n}',
  'settings.target.reading': 'Lendo seus calendários…',
  'settings.target.ownCalendarHeader': 'Calendário próprio',
  'settings.target.newInSource': 'Novo calendário KickOffCal no {source}',
  'settings.target.newOnDevice': 'Novo calendário KickOffCal neste aparelho',
  'settings.target.keepsSeparate':
    'Mantém os jogos separados dos seus próprios eventos',
  'settings.target.writeToA11y': 'Gravar jogos em {calendar}',
  'settings.target.moved_one': '{n} jogo movido para {calendar}',
  'settings.target.moved_other': '{n} jogos movidos para {calendar}',
  'settings.target.nowGoTo': 'Os jogos agora vão para {calendar}',
  'settings.target.scopePromise':
    'Seja qual for a escolha, o KickOffCal só adiciona, altera ou remove os jogos que ele mesmo colocou lá. Trocar move tudo junto — nada fica para trás.',

  // ── CreditsScreen ──────────────────────────────────────────────────
  'settings.credits.intro':
    'As fotografias vêm do Wikimedia Commons sob licenças que permitem reutilização. Cada uma é creditada ao seu fotógrafo abaixo.',
  'settings.credits.openSportsDbA11y': 'Abrir TheSportsDB',
  'settings.credits.sportsDb':
    'Os dados de eventos de vários esportes vêm do TheSportsDB (thesportsdb.com).',
  'settings.credits.none': 'Nenhuma fotografia carregada ainda.',
  'settings.credits.openSourceA11y': 'Abrir página da fonte de {subject}',
  'settings.credits.source': 'fonte',
  'settings.credits.openLicenceA11y':
    'Abrir informações de licença do Wikimedia Commons',
  'settings.credits.aboutLicences': 'Sobre estas licenças',
};
