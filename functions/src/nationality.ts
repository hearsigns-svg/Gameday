// Demonym → country code. PURE.
//
// The server's half of the nationality work (Prompt 16 B). It needs
// exactly one direction: providers that publish a nationality as an
// ADJECTIVE — Jolpica's "Thai", "Monegasque" — have to be turned into
// the 3-letter code the rest of the roster stores. The client owns the
// other direction (code → flag + country name, src/core/nationality.ts)
// and never needs this table.
//
// Deliberately not a general language resource: it covers the
// nationalities an F1 grid has actually carried, and anything else
// returns null and simply stores no country. A guessed nationality is
// worse than none — it puts the wrong flag on a real person.

const DEMONYMS: Readonly<Record<string, string>> = {
  american: 'USA',
  argentine: 'ARG',
  argentinian: 'ARG',
  australian: 'AUS',
  austrian: 'AUT',
  belgian: 'BEL',
  brazilian: 'BRA',
  british: 'GBR',
  canadian: 'CAN',
  chinese: 'CHN',
  colombian: 'COL',
  czech: 'CZE',
  danish: 'DEN',
  dutch: 'NED',
  'east german': 'GER',
  english: 'ENG',
  finnish: 'FIN',
  french: 'FRA',
  german: 'GER',
  hungarian: 'HUN',
  indian: 'IND',
  indonesian: 'INA',
  irish: 'IRL',
  israeli: 'ISR',
  italian: 'ITA',
  japanese: 'JPN',
  liechtensteiner: 'LIE',
  malaysian: 'MAS',
  mexican: 'MEX',
  monegasque: 'MON',
  'new zealander': 'NZL',
  polish: 'POL',
  portuguese: 'POR',
  rhodesian: 'ZIM',
  russian: 'RUS',
  'south african': 'RSA',
  spanish: 'ESP',
  swedish: 'SWE',
  swiss: 'SUI',
  thai: 'THA',
  turkish: 'TUR',
  uruguayan: 'URU',
  venezuelan: 'VEN',
};

export function codeFromDemonym(
  demonym: string | null | undefined,
): string | null {
  if (!demonym) return null;
  return DEMONYMS[demonym.trim().toLowerCase()] ?? null;
}
