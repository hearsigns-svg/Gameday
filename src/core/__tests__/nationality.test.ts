// Nationality as identity (Prompt 16 B). The athlete equivalent of a
// crest: free to use, factually correct, and — in boxing — the thing the
// fighter walks out behind.

import {
  codeFromDemonym,
  codeFromTeamName,
  flagEmojiOf,
  nationLabelOf,
  nationOf,
} from '../nationality';

// EVERY country code present in the production athletes collection,
// measured 2026-08-04 (2,273 docs, 78 distinct values). The store mixes
// two standards — IBF publishes ISO-3166 alpha-3, the tennis feeds
// publish IOC — so a renderer that knows only one blanks the other
// sport. This list is the regression guard for that.
const IN_PRODUCTION = [
  'USA', 'JPN', 'GBR', 'MEX', 'AUS', 'RUS', 'ITA', 'PHL', 'FRA', 'ESP',
  'ARG', 'CZE', 'CAN', 'GER', 'PRI', 'ENG', 'UKR', 'CHN', 'ZAF', 'IRL',
  'POL', 'DOM', 'KAZ', 'BEL', 'CUB', 'UZB', 'SUI', 'NZL', 'SRB', 'COL',
  'TUR', 'AUT', 'BRA', 'NGA', 'ARM', 'KOR', 'DNK', 'HUN', 'CRO', 'ROU',
  'THA', 'BLR', 'SLO', 'NED', 'NIC', 'SVK', 'LAT', 'GRE', 'GHA', 'VEN',
  'SWE', 'URY', 'CRI', 'INA', 'AND', 'PHI', 'DEN', 'EGY', 'GEO', 'BUL',
  'TPE', 'HRV', 'ALB', 'KGZ', 'NLD', 'LBY', 'LVA', 'MAR', 'MNG', 'ZMB',
  'COG', 'KEN', 'SGP', 'BIH', 'IND', 'CHE', 'MON', 'NOR',
];

// Every code the NEW server pass produces for the ATP directory,
// measured against the live graph on 2026-08-04 (1,282 of 1,513 men
// resolve; 85 distinct codes). Missing one of these renders a bare
// 3-letter code where the identity mark should be.
const FROM_THE_ATP_PASS = [
  'ANT', 'ARG', 'AUS', 'AUT', 'BAH', 'BAR', 'BEL', 'BEN', 'BIH', 'BLR',
  'BOL', 'BRA', 'BUL', 'CAN', 'CHI', 'CHN', 'CIV', 'COL', 'CRO', 'CYP',
  'CZE', 'DOM', 'ECU', 'EGY', 'ESA', 'ESP', 'EST', 'FIN', 'FRA', 'GBR',
  'GEO', 'GER', 'GHA', 'GRE', 'GUA', 'HUN', 'INA', 'IND', 'IRI', 'IRL',
  'ISR', 'ITA', 'JOR', 'JPN', 'KAZ', 'KOR', 'KUW', 'LAT', 'LTU', 'LUX',
  'MAD', 'MAR', 'MDA', 'MEX', 'MNE', 'NAM', 'NOR', 'NZL', 'PAK', 'PAR',
  'PER', 'PHI', 'POL', 'POR', 'QAT', 'ROU', 'RSA', 'RUS', 'SLO', 'SRB',
  'SUI', 'SVK', 'SWE', 'THA', 'TPE', 'TUN', 'TUR', 'UAE', 'UKR', 'URU',
  'USA', 'UZB', 'VEN', 'VIE', 'ZIM',
];

describe('nationOf', () => {
  it('resolves every code the ATP nationality pass produces', () => {
    expect(FROM_THE_ATP_PASS.filter((c) => nationOf(c) === null)).toEqual([]);
  });

  it('resolves every country code production actually holds', () => {
    const missed = IN_PRODUCTION.filter((c) => nationOf(c) === null);
    expect(missed).toEqual([]);
  });

  it('reads IOC and ISO spellings of one country as the same nation', () => {
    // Both forms are in the store, on different sports' athletes.
    for (const [ioc, iso] of [
      ['GER', 'DEU'],
      ['SUI', 'CHE'],
      ['NED', 'NLD'],
      ['DEN', 'DNK'],
      ['CRO', 'HRV'],
      ['PHI', 'PHL'],
      ['LAT', 'LVA'],
      ['RSA', 'ZAF'],
      ['URU', 'URY'],
    ]) {
      expect(nationOf(ioc)).toEqual(nationOf(iso));
      expect(nationOf(ioc)?.code2).toHaveLength(2);
    }
  });

  it('is case- and whitespace-insensitive, and refuses what it cannot name', () => {
    expect(nationOf(' gbr ')?.name).toBe('United Kingdom');
    expect(nationOf('XYZ')).toBeNull();
    expect(nationOf('')).toBeNull();
    expect(nationOf(undefined)).toBeNull();
  });

  it('keeps IOC meanings where the two standards collide', () => {
    // IOC BRN is Bahrain; ISO BRN is Brunei. Our sources are sporting
    // bodies, so IOC wins — and it is recorded, not silently decided.
    expect(nationOf('BRN')?.name).toBe('Bahrain');
    expect(nationOf('BRU')?.name).toBe('Brunei');
  });
});

describe('flagEmojiOf', () => {
  it('builds a flag from regional indicators', () => {
    expect(flagEmojiOf('MEX')).toBe('🇲🇽');
    expect(flagEmojiOf('JPN')).toBe('🇯🇵');
    expect(flagEmojiOf('CHE')).toBe(flagEmojiOf('SUI'));
  });

  it('handles the UK nations boxing bills fighters under', () => {
    expect(flagEmojiOf('ENG')).toBe('🏴󠁧󠁢󠁥󠁮󠁧󠁿');
    expect(flagEmojiOf('SCO')).toBe('🏴󠁧󠁢󠁳󠁣󠁴󠁿');
    expect(flagEmojiOf('WAL')).toBe('🏴󠁧󠁢󠁷󠁬󠁳󠁿');
    // Northern Ireland has NO Unicode flag. It gets a name and no
    // emoji rather than the Union flag it does not fly.
    expect(flagEmojiOf('NIR')).toBeNull();
    expect(nationOf('NIR')?.name).toBe('Northern Ireland');
  });

  it('gives nothing for a code it does not know', () => {
    expect(flagEmojiOf('XYZ')).toBeNull();
    expect(flagEmojiOf(null)).toBeNull();
  });
});

describe('nationLabelOf', () => {
  it('pairs the flag with the country, and copes without one', () => {
    expect(nationLabelOf('MEX')).toBe('🇲🇽 Mexico');
    expect(nationLabelOf('NIR')).toBe('Northern Ireland');
    expect(nationLabelOf('XYZ')).toBeNull();
  });
});

describe('codeFromDemonym', () => {
  it('maps the nationalities the F1 grid publishes', () => {
    // Jolpica gives a demonym, not a code: 22 of 31 drivers carry one,
    // 15 distinct strings on the 2026 grid.
    expect(codeFromDemonym('Thai')).toBe('THA');
    expect(codeFromDemonym('British')).toBe('GBR');
    expect(codeFromDemonym('dutch')).toBe('NED');
    expect(codeFromDemonym('Monegasque')).toBe('MON');
    expect(codeFromDemonym('New Zealander')).toBe('NZL');
    expect(nationOf(codeFromDemonym('Monegasque'))?.name).toBe('Monaco');
  });

  it('returns nothing rather than a guess', () => {
    expect(codeFromDemonym('Martian')).toBeNull();
    expect(codeFromDemonym('')).toBeNull();
    expect(codeFromDemonym(undefined)).toBeNull();
  });
});

// Alpha-2 joined the mixture with the boxing-data enrichment (Prompt 25).
describe('alpha-2 codes resolve', () => {
  it('renders the same flag for GB and GBR, AU and AUS', () => {
    expect(flagEmojiOf('GB')).toBe(flagEmojiOf('GBR'));
    expect(flagEmojiOf('AU')).toBe(flagEmojiOf('AUS'));
    expect(flagEmojiOf('US')).toBe(flagEmojiOf('USA'));
    expect(flagEmojiOf('GB')).not.toBeNull();
  });
  it('still refuses what no scheme contains', () => {
    // 'EN' is not ISO, not IOC, not a UK nation code — the backfill
    // normalises it to ENG rather than teaching the lookup a wrong code.
    expect(flagEmojiOf('EN')).toBeNull();
  });
});

describe('codeFromTeamName (Round 5 — national-team flags)', () => {
  it('maps provider national-team labels through the sport tail', () => {
    expect(codeFromTeamName('South Africa Rugby')).toBe('RSA');
    expect(codeFromTeamName('England Cricket')).toBe('ENG');
    expect(codeFromTeamName('Argentina Basketball')).toBe('ARG');
    expect(codeFromTeamName('Wales Rugby')).toBe('WAL');
    expect(codeFromTeamName('England Rugby League')).toBe('ENG');
  });
  it('maps a bare country name (soccer national sides)', () => {
    expect(codeFromTeamName('France')).toBe('FRA');
    expect(codeFromTeamName('Antigua and Barbuda')).toBe('ANT');
  });
  it('accepts a code-shaped remainder — "USA Rugby" is the code USA', () => {
    expect(codeFromTeamName('USA Rugby')).toBe('USA');
  });
  it('refuses clubs, counties and invitational sides — the miss IS the gate', () => {
    expect(codeFromTeamName('Somerset')).toBeNull();
    expect(codeFromTeamName('AUNZ Invitational XV')).toBeNull();
    expect(codeFromTeamName('All Blacks XV')).toBeNull();
    expect(codeFromTeamName('River Plate')).toBeNull();
    expect(codeFromTeamName(undefined)).toBeNull();
  });
  it('every mapped code renders a real flag', () => {
    for (const label of [
      'South Africa Rugby', 'USA Rugby', 'Wales Rugby', 'France',
      'England Cricket', 'Antigua and Barbuda',
    ]) {
      expect(flagEmojiOf(codeFromTeamName(label))).not.toBeNull();
    }
  });
});
