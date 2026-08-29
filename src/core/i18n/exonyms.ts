// Competition EXONYMS — only where genuinely used (Round 3 Phase C,
// owner ruling). A small curated per-language table keyed by FOLLOW
// KEY: the handful of competitions whose name a fan genuinely says
// differently in their language. Premier League stays Premier League
// in every language; Wimbledon is Wimbledon; the four slams and the
// clubs are untouched. PERSON names never (ruled); TEAM names never
// (provider truth); fixture TITLES never (v1 ruling — titles are
// provider truth end to end).

import { currentLanguage } from './index';
import { Language } from './locale';

const EXONYMS: Partial<
  Record<Language, Readonly<Record<string, string>>>
> = {
  es: {
    'fdorg-comp-CL': 'Liga de Campeones',
    'fdorg-comp-WC': 'Copa del Mundo',
    'fdorg-comp-EC': 'Eurocopa',
    'tsdb-league-4481': 'Liga Europa',
    'tsdb-league-4714': 'Seis Naciones',
    'tsdb-league-4574': 'Mundial de Rugby',
  },
  de: {
    'fdorg-comp-WC': 'Weltmeisterschaft',
    'fdorg-comp-EC': 'Europameisterschaft',
    'tsdb-league-4574': 'Rugby-Weltmeisterschaft',
  },
  fr: {
    'fdorg-comp-CL': 'Ligue des champions',
    'fdorg-comp-WC': 'Coupe du monde',
    'fdorg-comp-EC': 'Euro',
    'tsdb-league-4481': 'Ligue Europa',
    'tsdb-league-4714': 'Tournoi des Six Nations',
    'tsdb-league-4574': 'Coupe du monde de rugby',
  },
  it: {
    'fdorg-comp-WC': 'Coppa del Mondo',
    'fdorg-comp-EC': 'Campionato Europeo',
    'tsdb-league-4714': 'Sei Nazioni',
    'tsdb-league-4574': 'Coppa del Mondo di rugby',
  },
  pt: {
    'fdorg-comp-CL': 'Liga dos Campeões',
    'fdorg-comp-WC': 'Copa do Mundo',
    'fdorg-comp-EC': 'Eurocopa',
    'tsdb-league-4481': 'Liga Europa',
    'tsdb-league-4714': 'Seis Nações',
    'tsdb-league-4574': 'Copa do Mundo de Rugby',
  },
};

// The display name for a competition row: the exonym where the active
// language genuinely has one, the provider/config name otherwise.
export function competitionDisplayName(
  name: string,
  followKey: string | undefined,
): string {
  if (!followKey) return name;
  return EXONYMS[currentLanguage()]?.[followKey] ?? name;
}
